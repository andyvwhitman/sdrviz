"""Application runtime: the long-lived objects the routers and the replay engine share."""

import asyncio
import contextlib
import logging

from sqlalchemy.engine import Engine
from sqlmodel import col, delete

from .audio.cache import AudioStore
from .audio.prefetch import Prefetcher
from .audio.synth import missing_tools
from .config import Settings
from .db import create_schema, make_engine, open_session, seed_if_empty
from .live import protocol
from .live.hub import Client, Hub
from .live.listen import Listening
from .models import FeedAck, Prefs, Receiver
from .nodes.schemas import ChannelsIn
from .nodes.service import ASSIGNED_PRESET, NodeOffline, NodeRegistry, node_feed_id
from .nodes.session import NodeConnections
from .radio.receiver import load_receiver, save_receiver
from .radio.source import RadioSource
from .recordings import retention
from .recordings.recorder import Recorder
from .recordings.transcription import Transcription, make_transcriber, vocabulary_prompt
from .sim import live_state
from .sim.clock import SimClock, WallClock, local_time_of_day
from .sim.data import SimData, load_health, load_sim_data
from .sim.engine import ReplayEngine
from .sim.health import Health
from .sim.live_state import SimInputs
from .sim.scenarios import SCENARIOS, ScenarioSpec
from .sim.timefmt import hms, parse_clock
from .sim.world import World, load_world
from .transit import TransitService
from .transit.service import load_places
from .transit.source_store import SourceStore
from .transit.stations import StationGroups, load_groups

log = logging.getLogger(__name__)


class Runtime:
    """Database, replay clock, world, health and the live hub, wired together once at startup."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.db: Engine = make_engine(settings.database_file)
        create_schema(self.db)
        if seed_if_empty(self.db, settings):
            log.info("seeded %s", settings.database_file)

        self.nodes = NodeRegistry(self.db, settings.public_url)  # remote receiver nodes (docs/node-protocol.md)
        self.nodes.migrate()
        self.nodes.on_feeds_changed = self.reload_node_feeds
        self.loop: asyncio.AbstractEventLoop | None = None  # set by start(); frequency edits arrive on worker threads
        self._node_channels = self._wanted_channels()  # the list each node on the assigned preset last got
        self._tasks: set[asyncio.Task] = set()
        self._retention: asyncio.Task | None = None
        self._sweeper: asyncio.Task | None = None
        self._ticker: asyncio.Task | None = None
        self.data: SimData = load_sim_data(self.db, settings)
        self.receiver: Receiver = load_receiver(self.db, settings)
        self.world: World = load_world(self.db, settings, self.receiver, self.nodes)
        self.health: Health = self._load_health()
        self.prefs: Prefs = self._load_prefs()
        self.scenario: ScenarioSpec | None = None

        start = parse_clock(settings.sim_start) if settings.sim_start else local_time_of_day()
        # Without the replay (a server) the clock is simply the Eastern time of day.
        wall = not settings.sim and not settings.sim_start
        self.clock = WallClock() if wall else SimClock(start, settings.sim_speed)
        self.hub = Hub()
        self.listening = Listening(self)  # channels clients hold to listen to
        self.nodes.held_channels = self.listening.channels
        self.audio = AudioStore(settings.audio_path)
        self.transcription = Transcription(self, make_transcriber(settings, lambda: vocabulary_prompt(self)))
        self.recorder = Recorder(self)
        self.engine = ReplayEngine(self)
        self.prefetcher: Prefetcher | None = None
        # Real audio from the rtl_tcp receiver, once it has a host; the replay's synthetic audio then stays quiet.
        self.radio = RadioSource(self, workers=settings.dsp_workers)
        self.node_connections = NodeConnections(self)  # live /ws/node sessions
        # Real train positions and station boards; sources that are down only show up in /api/transit/sources.
        self.transit: TransitService | None = None
        if settings.transit_sources is None or settings.transit_sources:
            store = SourceStore(self.db)
            store.migrate()
            store.seed_defaults()
            places = load_places(settings.seed_dir)
            groups = load_groups(self.db)
            self.transit = TransitService(
                store.load(),
                settings.transit_dir,
                places,
                store,
                groups=groups,
                curated=StationGroups.from_file(),
                engine=self.db,
                merge_radius_m=settings.transit_merge_radius_m,
            )

    # --- lifecycle ---------------------------------------------------------

    def start(self) -> None:
        self.loop = asyncio.get_running_loop()
        self.hub.bind(self.loop)
        if self.settings.sim:
            self.engine.start(self.hub)
        self.radio.start()
        self.transcription.start()
        self._retention = asyncio.create_task(retention.run_forever(self), name="retention")
        self._sweeper = asyncio.create_task(self._sweep_holds(), name="listen-holds")
        if not self.settings.sim:  # the replay engine sends the ticks otherwise
            self._ticker = asyncio.create_task(self._tick_loop(), name="clock-tick")
        if self.transit:
            self.transit.start()
        if missing := missing_tools():
            log.warning("fake audio disabled, missing: %s", ", ".join(missing))
        elif self.settings.sim and self.settings.prerender_audio:
            self.prefetcher = Prefetcher(self.audio, self.data.day, self.clock.now)
            self.prefetcher.start()

    async def _sweep_holds(self) -> None:
        while True:
            await asyncio.sleep(1.0)
            self.listening.sweep()

    async def _tick_loop(self) -> None:
        while True:
            self.send_tick()
            await asyncio.sleep(1.0)

    def send_tick(self) -> None:
        """The server clock, once a second: clients re-anchor their key-up timers on it (see docs/sprint-6)."""
        t = self.clock.now()
        self.hub.broadcast(
            protocol.message("tick", t=t, clock=hms(t), clock_tenths=hms(t, tenths=True), speed=self.clock.speed)
        )

    async def stop(self) -> None:
        if self._ticker:
            self._ticker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._ticker
        if self._sweeper:
            self._sweeper.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._sweeper
        if self._retention:
            self._retention.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._retention
        if self.prefetcher:
            self.prefetcher.stop()
        await self.engine.stop()
        await self.radio.stop()
        await asyncio.to_thread(self.recorder.stop)
        await asyncio.to_thread(self.transcription.stop)
        if self.transit:
            await self.transit.stop()
        self.hub.close_all()
        self.db.dispose()

    # --- state ---------------------------------------------------------------

    @property
    def inputs(self) -> SimInputs:
        return SimInputs(self.world, self.data, self.health, self.nodes)

    def resolve_listen(self, wanted: str | None) -> str | None:
        """The node a client listens to: the one it chose, else the first online node, else the first feed."""
        feeds = self.world.feeds
        if wanted in feeds:
            return wanted
        online = [feed_id for feed_id in self.nodes.online_feed_ids() if feed_id in feeds]
        return (online or list(feeds) or [None])[0]

    def live_state(self, listen_feed: str | None = None) -> dict:
        """The LiveState for a client that chose `listen_feed` (None: the default)."""
        return live_state.build(
            self.inputs,
            self.clock.now(),
            self.resolve_listen(listen_feed),
            live=self.radio.events,
            scenario=self.scenario,
            speed=self.clock.speed,
        )

    def publish_snapshot(self) -> None:
        """A fresh snapshot to every client, built once per node being listened to (each client has its own)."""
        by_feed: dict[str | None, list[Client]] = {}
        for client in list(self.hub.clients):
            by_feed.setdefault(self.resolve_listen(client.listen_feed), []).append(client)
        for feed_id, clients in by_feed.items():
            text = protocol.message("snapshot", state=self.live_state(feed_id))
            for client in clients:
                self.hub.send_to(client, text)

    # --- changes -----------------------------------------------------------------

    def reload_world(self) -> None:
        """Re-read frequencies, assignments and feeds after a CRUD change and tell the clients."""
        self.world = load_world(self.db, self.settings, self.receiver, self.nodes)
        self.engine.resync()
        self.push_node_channels()

    def _wanted_channels(self) -> dict[str, list[int]]:
        """Node id -> the AAR channels it should decode, for the nodes on the assigned preset."""
        return {n.id: self.nodes.channels_for(n) for n in self.nodes.list() if n.preset == ASSIGNED_PRESET}

    def push_node_channels(self) -> None:
        """Assignments, frequencies or held listens changed: each online node whose list changed gets the new one."""
        wanted, before = self._wanted_channels(), self._node_channels
        self._node_channels = wanted
        online = {n.id for n in self.nodes.list() if n.status == "ONLINE"}
        # A node cannot be told to decode nothing; it keeps its last list.
        changed = {node_id: channels for node_id, channels in wanted.items() if channels and node_id in online}
        changed = {node_id: channels for node_id, channels in changed.items() if before.get(node_id) != channels}
        if not changed or self.loop is None:
            return
        log.info("node channels changed: telling %d node(s)", len(changed))
        coro = self._send_channels(changed)
        try:
            on_loop = asyncio.get_running_loop() is self.loop
        except RuntimeError:
            on_loop = False
        if on_loop:
            task = self.loop.create_task(coro)
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
        else:  # a sync route handler, on a worker thread
            asyncio.run_coroutine_threadsafe(coro, self.loop)

    async def _send_channels(self, lists: dict[str, list[int]]) -> None:
        for node_id, channels in lists.items():  # one failing node must not stop the others
            failure: str | None = "node offline"
            try:
                result = await self.nodes.send_command(node_id, ChannelsIn(type="channels", channels=channels))
                failure = None if result.status == "acked" else f"node {result.status}"
            except NodeOffline:
                pass
            except Exception:
                failure = "could not tell the node"
                log.exception("could not send the channels to node %s", node_id)
            self.listening.node_replied(node_feed_id(self.nodes.get(node_id).number), channels, failure)

    def reload_node_feeds(self) -> None:
        """A node was enrolled, changed or revoked: its feed row appears, changes or goes."""
        self.reload_world()
        self.publish_snapshot()

    async def set_receiver(self, receiver: Receiver) -> None:
        """Save new receiver settings and apply them live: the feed row, the radio connection, the clients."""
        save_receiver(self.db, receiver)
        self.receiver = receiver
        self.reload_world()
        await self.radio.reconfigure(receiver)
        self.publish_snapshot()

    def reload_health(self) -> None:
        self.health = self._load_health()

    def _load_health(self) -> Health:
        return load_health(self.db) if self.settings.sim else Health({}, [])

    def _load_prefs(self) -> Prefs:
        with open_session(self.db) as session:
            return session.get(Prefs, 1) or Prefs()

    def save_prefs(self, prefs: Prefs) -> Prefs:
        with open_session(self.db) as session:
            session.merge(prefs)
            session.commit()
        self.prefs = self._load_prefs()
        return self.prefs

    def jump(self, scenario: str | None = None, clock: str | None = None, speed: float | None = None) -> None:
        """Move the sim clock. A scenario clears user acknowledgements (its node is the caller's to listen to)."""
        if scenario:
            spec = SCENARIOS[scenario]
            self.scenario = spec
            with open_session(self.db) as session:
                session.exec(delete(FeedAck).where(col(FeedAck.source) == "user"))
                session.commit()
            self.reload_health()
            self.clock.jump(spec.t, self._speed_or_default(speed))
        elif clock:
            self.scenario = None
            self.clock.jump(parse_clock(clock), self._speed_or_default(speed))
        else:
            self.clock.jump(None, speed)
        self.engine.resync()

    def _speed_or_default(self, speed: float | None) -> float:
        """A jump to a new moment plays at the configured speed unless told otherwise."""
        return self.settings.sim_speed if speed is None else speed

    def acknowledge(self, feed_id: str, reason: str) -> bool:
        """Acknowledge the feed's open fault at the current sim time. False if there is no unacked fault."""
        t = self.clock.now()
        state = self.health.state(feed_id, t)
        if state["state"] != "fault" or state["acked"]:
            return False
        with open_session(self.db) as session:
            session.add(FeedAck(feed_id=feed_id, t=t, label=state["label"], reason=reason, source="user"))
            session.commit()
        self.health.acks.append((feed_id, t, state["label"]))
        return True

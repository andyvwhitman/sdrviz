"""Application runtime: the long-lived objects the routers and the replay engine share."""

import asyncio
import logging

from sqlalchemy.engine import Engine
from sqlmodel import col, delete

from .audio.cache import AudioStore
from .audio.prefetch import Prefetcher
from .audio.synth import missing_tools
from .config import Settings
from .db import create_schema, make_engine, open_session, seed_if_empty
from .live import protocol
from .live.hub import Hub
from .models import Bank, FeedAck, Prefs, Receiver
from .radio.receiver import load_receiver, save_receiver
from .radio.source import RadioSource
from .sim import live_state
from .sim.clock import SimClock, local_time_of_day
from .sim.data import SimData, load_health, load_sim_data
from .sim.engine import ReplayEngine
from .sim.health import Health
from .sim.live_state import SimInputs
from .sim.scenarios import SCENARIOS, ScenarioSpec
from .sim.timefmt import parse_clock
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

        self.data: SimData = load_sim_data(self.db, settings)
        self.receiver: Receiver = load_receiver(self.db, settings)
        self.world: World = load_world(self.db, settings, self.receiver)
        self.health: Health = self._load_health()
        self.prefs: Prefs = self._load_prefs()
        self.scenario: ScenarioSpec | None = None

        start = parse_clock(settings.sim_start) if settings.sim_start else local_time_of_day()
        self.clock = SimClock(start, settings.sim_speed)
        self.hub = Hub()
        self.audio = AudioStore(settings.audio_path)
        self.engine = ReplayEngine(self)
        self.prefetcher: Prefetcher | None = None
        # Real audio from the rtl_tcp receiver, once it has a host; the replay's synthetic audio then stays quiet.
        self.radio = RadioSource(self)
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
        self.hub.bind(asyncio.get_running_loop())
        if self.settings.sim:
            self.engine.start(self.hub)
        self.radio.start()
        if self.transit:
            self.transit.start()
        if missing := missing_tools():
            log.warning("fake audio disabled, missing: %s", ", ".join(missing))
        elif self.settings.sim and self.settings.prerender_audio:
            self.prefetcher = Prefetcher(self.audio, self.data.day, self.clock.now)
            self.prefetcher.start()

    async def stop(self) -> None:
        if self.prefetcher:
            self.prefetcher.stop()
        await self.engine.stop()
        await self.radio.stop()
        if self.transit:
            await self.transit.stop()
        self.hub.close_all()
        self.db.dispose()

    # --- state ---------------------------------------------------------------

    @property
    def inputs(self) -> SimInputs:
        return SimInputs(self.world, self.data, self.health)

    @property
    def active_bank(self) -> Bank:
        """The active bank; falls back to the first one if the chosen bank was deleted."""
        if self.world.has_bank(self.prefs.active_bank):
            return self.world.bank(self.prefs.active_bank)
        return self.world.banks[0]

    def live_state(self) -> dict:
        return live_state.build(
            self.inputs,
            self.clock.now(),
            self.active_bank.id,
            displayed_feed=self.prefs.displayed_feed if self.prefs.displayed_feed in self.world.feeds else None,
            scenario=self.scenario,
            speed=self.clock.speed,
        )

    def publish_snapshot(self) -> None:
        self.hub.broadcast(protocol.message("snapshot", state=self.live_state()))

    # --- changes -----------------------------------------------------------------

    def reload_world(self) -> None:
        """Re-read frequencies, banks and feeds after a CRUD change and tell the clients."""
        self.world = load_world(self.db, self.settings, self.receiver)
        self.engine.resync()

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
        """Move the sim clock. A scenario also selects its bank and clears user acknowledgements."""
        if scenario:
            spec = SCENARIOS[scenario]
            self.scenario = spec
            with open_session(self.db) as session:
                session.exec(delete(FeedAck).where(col(FeedAck.source) == "user"))
                session.commit()
            self.reload_health()
            self.save_prefs(self.prefs.model_copy(update={"active_bank": spec.bank, "displayed_feed": None}))
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

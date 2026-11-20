"""Connected nodes: one NodeSession per /ws/node socket, feeding the live hub like the LAN receiver does.

NodeConnections is the set of live sessions. A session authenticates the hello (see service.py), then
runs the heartbeat, tracks link quality, sends commands and waits for their acks, and turns the node's
messages and binary frames into the same LiveEvents calls and PCM audio frames the LAN receiver makes.
Protocol: docs/node-protocol.md.
"""

import asyncio
import contextlib
import itertools
import logging
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from ..live import node_protocol as wire
from ..live import protocol
from ..live.opus import OpusDecoder
from ..recordings.recorder import ActiveRecording
from .gain_guard import OVERLOAD_DBFS, GainGuard
from .ghosts import WINDOW_S as GHOST_HOLD_S
from .ghosts import GhostFilter, Start
from .link import LinkStats
from .schemas import ChannelsIn, CommandError, CommandIn, CommandResult, GainIn
from .service import BANKS_PRESET, AuthError, NodeLive, node_feed_id

if TYPE_CHECKING:
    from ..runtime import Runtime

log = logging.getLogger(__name__)

HELLO_TIMEOUT_S = 10.0
DEAD_AFTER_S = 3 * wire.HEARTBEAT_S  # nothing received for this long: the node is gone
ACK_TIMEOUT_S = 10.0
SLOW_ACK_TIMEOUT_S = 30.0  # restart and set_server
REMOTE_SEQ_BASE = 2_000_000_000  # tx_seq of node transmissions on /ws/live: above the replay's and the LAN receiver's
CHUNK_BYTES = protocol.CHUNK_BYTES
NO_SAMPLES_AFTER_S = 20.0  # no spectrum or audio frame for this long (they come ~5 times a second): the dongle is dead
NO_SAMPLES = "no samples"  # shown as the node's rtl_tcp state while that is so


def now_ms() -> int:
    return int(time.time() * 1000)


@dataclass
class HeldKeyUp:
    """A weak key-up waiting GHOST_HOLD_S for a stronger neighbour to rule it out; its audio waits with it."""

    message: wire.KeyUp
    start: Start
    timer: asyncio.TimerHandle
    frames: list[wire.AudioFrame] = field(default_factory=list)


@dataclass
class Transmission:
    """One node transmission being relayed: Opus packets in, 100 ms PCM chunks out."""

    channel_id: str
    aar_channel: int
    seq: int  # the server's number for it on /ws/live
    decoder: OpusDecoder = field(default_factory=OpusDecoder)
    pcm: bytearray = field(default_factory=bytearray)
    sent_ms: int = 0
    started: bool = False  # whether the first chunk has gone out
    recording: ActiveRecording | None = None  # what is being saved of it (D-1)


class NodeSession:
    def __init__(self, rt: "Runtime", connections: "NodeConnections", websocket: WebSocket, node_id: str):
        self.rt = rt
        self.connections = connections
        self.websocket = websocket
        self.node_id = node_id
        self.number = 0
        self.feed_id = ""
        self.link = LinkStats()
        self.gain_guard = GainGuard()
        self._tasks: set[asyncio.Task] = set()  # fire-and-forget work, cancelled with the session
        self.live = NodeLive(online=True)
        self.pending: dict[str, asyncio.Future[wire.Ack]] = {}
        self.transmissions: dict[int, Transmission] = {}  # by AAR channel
        self.ghosts = GhostFilter()
        self.held: dict[int, HeldKeyUp] = {}  # weak key-ups not yet judged, by AAR channel
        self.ghost_channels: set[int] = set()  # channels whose current transmission was dropped as a ghost
        self.refused: set[int] = set()  # AAR channels whose key-up lost to another receiver
        self._last_rx = time.monotonic()
        self._last_frame = time.monotonic()  # the last binary frame (spectrum or audio): proof the node gets samples
        self.no_samples = False
        self._node_rtl_tcp = "down"  # what the node itself last reported
        self._awaiting_pong: int | None = None
        self._send_lock = asyncio.Lock()
        self._ids = itertools.count(1)

    @property
    def events(self):
        return self.rt.radio.events

    # --- one connection -------------------------------------------------------------------------------------------

    async def run(self, auth, hello: wire.Hello) -> None:
        node = auth.node
        self.number, self.feed_id = node.number, node_feed_id(node.number)
        await self.connections.attach(self)
        welcome = wire.Welcome(
            node=wire.WelcomeNode(id=node.id, number=node.number, name=node.name),
            server_time=now_ms(),
            config=wire.NodeConfig(channels=auth.channels),
            node_secret=auth.node_secret,
        )
        await self.send(welcome)
        registry = self.rt.nodes
        registry.mark_seen(node.id, hello.agent_version)
        self.live.feed_id = self.feed_id
        registry.live[node.id] = self.live
        if self.connections.seen_before(node.id):
            self.link.reconnected()
            registry.add_event(node.id, "reconnect", "node reconnected")
        registry.add_event(node.id, "online", f"connected, agent {hello.agent_version}")
        background = [asyncio.create_task(self._heartbeat()), asyncio.create_task(self._watchdog())]
        if node.preset == BANKS_PRESET and auth.channels:
            # Also as a command: a node keeps the last `channels` command over the welcome's list, so a bank edit
            # made while it was offline would otherwise never reach it.
            channels = ChannelsIn(type="channels", channels=auth.channels)
            background.append(asyncio.create_task(self.command(channels)))
        try:
            while True:
                message = await self.websocket.receive()
                if message["type"] == "websocket.disconnect":
                    break
                self._last_rx = time.monotonic()
                if message.get("text") is not None:
                    await self._on_text(message["text"])
                elif message.get("bytes") is not None:
                    self._on_frame(message["bytes"])
        except WebSocketDisconnect:
            pass
        except _Protocol as error:
            await self.close(wire.CLOSE_BAD_MESSAGE, str(error))
        finally:
            for task in [*background, *self._tasks]:
                task.cancel()
            for held in self.held.values():
                held.timer.cancel()
            self._end_all_transmissions()
            for future in self.pending.values():
                future.cancel()
            await self.connections.detach(self)

    async def send(self, message: wire.Message) -> None:
        async with self._send_lock:
            await self.websocket.send_text(wire.dump(message))

    async def close(self, code: int, reason: str = "") -> None:
        with contextlib.suppress(RuntimeError, WebSocketDisconnect):
            await self.websocket.close(code=code, reason=reason[:100])

    # --- heartbeat --------------------------------------------------------------------------------------------------

    async def _heartbeat(self) -> None:
        while True:
            if self._awaiting_pong is not None:  # the last ping got no answer
                self.link.beat(None)
            t = now_ms()
            self._awaiting_pong = t
            await self.send(wire.Ping(t=t))
            self._refresh_live()
            await asyncio.sleep(wire.HEARTBEAT_S)

    async def _watchdog(self) -> None:
        while True:
            await asyncio.sleep(min(1.0, DEAD_AFTER_S / 3))
            if time.monotonic() - self._last_rx > DEAD_AFTER_S:
                log.info("node %s: no message for %.0f s, closing", self.node_id, DEAD_AFTER_S)
                await self.close(wire.CLOSE_SERVER_ERROR, "heartbeat lost")
                return

    def _refresh_live(self) -> None:
        self.live.link_quality = self.link.quality()
        self.live.lag_ms = self.link.lag_ms()
        self._check_samples()
        self._publish_peak()

    def _check_samples(self) -> None:
        """A dongle that re-enumerated on USB leaves rtl_tcp with a dead handle: the agent reports it connected and
        idle, but no samples arrive. The node's own health cannot say so, the missing frames can (A-4)."""
        silent_s = time.monotonic() - self._last_frame
        if (silent_s > NO_SAMPLES_AFTER_S) != self.no_samples:
            self.no_samples = not self.no_samples
            if self.no_samples:
                detail = f"no samples for {silent_s:.0f} s: the dongle may have dropped off USB"
                log.warning("node %s: %s", self.node_id, detail)
            else:
                detail = "samples are arriving again"
            self.rt.nodes.add_event(self.node_id, "fault", detail)
        if self.live.health is not None and (self.no_samples or self.live.health["rtl_tcp"] == NO_SAMPLES):
            self.live.health["rtl_tcp"] = NO_SAMPLES if self.no_samples else self._node_rtl_tcp

    def _publish_peak(self) -> None:
        if self.live.health is not None:
            self.live.health["peak_dbfs"] = self.gain_guard.peak_dbfs()
            self.live.health["ghosts"] = {str(ch): n for ch, n in sorted(self.ghosts.counts.items())}

    # --- messages from the node -------------------------------------------------------------------------------------

    async def _on_text(self, text: str) -> None:
        try:
            message = wire.parse_up(text)
        except ValidationError as error:
            log.debug("node %s: bad message %r: %s", self.node_id, text[:80], error)
            raise _Protocol("malformed message") from error
        match message:
            case wire.Ping():
                await self.send(wire.Pong(t=message.t, peer_t=now_ms()))
            case wire.Pong():
                if message.t == self._awaiting_pong:
                    self._awaiting_pong = None
                    self.link.beat(float(now_ms() - message.t))
                    self._refresh_live()
            case wire.EnrolledAck():
                self.rt.nodes.acknowledge_enrollment(self.node_id)
            case wire.KeyUp():
                self._on_key_up(message)
            case wire.KeyDown():
                self._on_key_down(message.ch)
            case wire.Levels():
                self._on_levels(message)
            case wire.Health():
                self.link.audio_age_ms = message.audio_age_ms
                self.live.health = message.model_dump(exclude={"type"})
                self.gain_guard.gain_db = message.tune.gain_db
                self._node_rtl_tcp = message.rtl_tcp
                self._refresh_live()
            case wire.Ack():
                if (future := self.pending.get(message.id)) and not future.done():
                    future.set_result(message)
            case wire.Hello():
                raise _Protocol("hello after the handshake")

    def _channel_id(self, aar_channel: int) -> str | None:
        return next((cid for cid, freq in self.rt.world.freqs.items() if freq.aar_channel == aar_channel), None)

    def _on_key_up(self, message: wire.KeyUp) -> None:
        self._guard_gain(message.power_db)
        self._release(message.ch)  # an earlier key-up on this channel that is still held
        self.ghost_channels.discard(message.ch)
        start = self.ghosts.note(message.ch, message.freq_hz, message.power_db, time.monotonic())
        if not self.ghosts.may_be_ghost(message.power_db):
            self._start_transmission(message)
            return
        timer = asyncio.get_running_loop().call_later(GHOST_HOLD_S, self._release, message.ch)
        self.held[message.ch] = HeldKeyUp(message, start, timer)

    def _release(self, aar_channel: int) -> None:
        """Judge a held key-up: drop it as a ghost, or let it start with the audio that waited."""
        if (held := self.held.pop(aar_channel, None)) is None:
            return
        held.timer.cancel()
        if self.ghosts.is_ghost(held.start):
            self.ghost_channels.add(aar_channel)
            log.info("node %s: CH%02d key-up at %.0f dBFS is a ghost of a stronger neighbour (%d so far)",
                     self.node_id, aar_channel, held.message.power_db, self.ghosts.counts[aar_channel])  # fmt: skip
            self._publish_peak()
            return
        self._start_transmission(held.message)
        for frame in held.frames:
            self._on_audio(frame)

    def _start_transmission(self, message: wire.KeyUp) -> None:
        self._end_transmission(message.ch)  # a key-up without a key-down first: close the old one
        self.refused.discard(message.ch)
        channel_id = self._channel_id(message.ch)
        if channel_id is None:
            log.debug("node %s: key-up on unknown AAR channel %s", self.node_id, message.ch)
            return
        seq = REMOTE_SEQ_BASE + self.connections.next_seq()
        if not self.events.key_up(channel_id, seq, message.snr_db, message.power_db, self.feed_id):
            self.refused.add(message.ch)  # another receiver has the channel: ignore this transmission
            return
        tx = Transmission(channel_id, message.ch, seq)
        tx.recording = self.rt.recorder.begin(channel_id, seq, message.ch, self.feed_id)
        self.transmissions[message.ch] = tx

    def _on_key_down(self, aar_channel: int) -> None:
        self._release(aar_channel)  # a short transmission is judged now
        self.ghost_channels.discard(aar_channel)
        self.refused.discard(aar_channel)
        self._end_transmission(aar_channel)

    def _end_transmission(self, aar_channel: int) -> None:
        if tx := self.transmissions.pop(aar_channel, None):
            if tx.recording:
                self.rt.recorder.finish(tx.recording)
            self.events.key_down(tx.channel_id, self.feed_id)

    def _end_all_transmissions(self) -> None:
        for aar_channel in list(self.transmissions):
            self._end_transmission(aar_channel)

    def _on_levels(self, message: wire.Levels) -> None:
        readings = {}
        if message.open:
            self._guard_gain(max(level.power_db for level in message.open))
        for level in message.open:
            if tx := self.transmissions.get(level.ch):
                readings[tx.channel_id] = (level.power_db, level.snr_db)
        self.events.levels(readings, self.feed_id)

    # --- gain guard ---------------------------------------------------------------------------------------------------

    def _guard_gain(self, power_db: float) -> None:
        """Step the node's gain down when its input is close to full scale (see gain_guard.py)."""
        old = self.gain_guard.gain_db
        target = self.gain_guard.observe(power_db)
        self._publish_peak()
        if target is None:
            return
        detail = f"input at {power_db:.1f} dBFS (limit {OVERLOAD_DBFS:.0f}): gain {old:.1f} -> {target:.1f} dB"
        log.info("node %s: %s", self.node_id, detail)
        self.rt.nodes.add_event(self.node_id, "gain", detail)
        task = asyncio.create_task(self._step_gain(target))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _step_gain(self, target: float) -> None:
        result = await self.command(GainIn(type="gain", gain_db=target))
        if result.status == "acked":
            self.gain_guard.gain_db = target

    # --- binary frames ----------------------------------------------------------------------------------------------

    def _on_frame(self, data: bytes) -> None:
        try:
            number, inner = wire.unpack_frame(data)
            frame = wire.parse_frame(inner)
        except ValueError as error:
            raise _Protocol(str(error)) from error
        if number != self.number:
            return  # not this node's number: dropped
        self._last_frame = time.monotonic()
        if isinstance(frame, wire.SpectrumFrame):
            if self.feed_id in self.rt.hub.watched_feeds():
                self.rt.hub.send_spectrum(self.feed_id, inner)
        elif frame.codec == protocol.CODEC_OPUS:
            self._on_audio(frame)

    def _on_audio(self, frame: wire.AudioFrame) -> None:
        if frame.ch in self.ghost_channels:
            return
        if held := self.held.get(frame.ch):
            held.frames.append(frame)
            return
        tx = self.transmissions.get(frame.ch)
        if tx is None or not self.events.owns(tx.channel_id, self.feed_id):
            return  # refused, unknown or already ended
        if frame.first:
            tx.decoder.reset()
        try:
            tx.pcm += tx.decoder.decode(frame.payload)
        except Exception as error:  # a damaged packet costs 20 ms, not the connection
            log.debug("node %s: opus decode failed: %s", self.node_id, error)
            return
        if tx.recording:
            self.rt.recorder.add(tx.recording, frame.payload)
        cut = len(tx.pcm) if frame.last else len(tx.pcm) // CHUNK_BYTES * CHUNK_BYTES
        data, tx.pcm = bytes(tx.pcm[:cut]), tx.pcm[cut:]
        for start in range(0, len(data), CHUNK_BYTES):
            piece = data[start : start + CHUNK_BYTES]
            last = frame.last and start + CHUNK_BYTES >= len(data)
            flags = (0 if tx.started else protocol.FLAG_FIRST) | (protocol.FLAG_LAST if last else 0)
            tx.started = True
            self.rt.hub.send_audio(
                tx.channel_id, protocol.audio_frame(tx.aar_channel, tx.seq, tx.sent_ms, flags, piece)
            )
            tx.sent_ms += protocol.CHUNK_MS

    # --- commands -----------------------------------------------------------------------------------------------------

    async def command(self, body: CommandIn) -> CommandResult:
        command_id = f"c{next(self._ids)}"
        message = _COMMANDS[body.type](id=command_id, **body.model_dump(exclude={"type"}))
        future: asyncio.Future[wire.Ack] = asyncio.get_running_loop().create_future()
        self.pending[command_id] = future
        timeout = SLOW_ACK_TIMEOUT_S if body.type in ("restart", "set_server") else ACK_TIMEOUT_S
        try:
            await self.send(message)
            ack = await asyncio.wait_for(future, timeout)
        except (TimeoutError, asyncio.CancelledError):
            result = CommandResult(id=command_id, type=body.type, status="timeout")
        else:
            error = CommandError(**ack.error.model_dump()) if ack.error else None
            result = CommandResult(id=command_id, type=body.type, status="acked" if ack.ok else "failed", error=error)
        finally:
            self.pending.pop(command_id, None)
        self.rt.nodes.add_event(self.node_id, "command", f"{body.type}: {result.status}")
        return result


class _Protocol(Exception):
    """The node broke the protocol; the connection is closed with 4400."""


_COMMANDS = {
    "tune": wire.TuneCommand,
    "gain": wire.GainCommand,
    "squelch": wire.SquelchCommand,
    "channels": wire.ChannelsCommand,
    "restart": wire.RestartCommand,
    "set_server": wire.SetServerCommand,
}


class NodeConnections:
    """The live sessions by node id; at most one per node."""

    def __init__(self, rt: "Runtime"):
        self.rt = rt
        self.sessions: dict[str, NodeSession] = {}
        self._seen: set[str] = set()
        self._seq = itertools.count(1)
        rt.nodes.command_sender = self.send_command

    def next_seq(self) -> int:
        return next(self._seq)

    def seen_before(self, node_id: str) -> bool:
        return node_id in self._seen

    async def attach(self, session: NodeSession) -> None:
        old = self.sessions.get(session.node_id)
        self.sessions[session.node_id] = session
        if old:
            await old.close(wire.CLOSE_REPLACED, "replaced by a newer connection")

    async def detach(self, session: NodeSession) -> None:
        self._seen.add(session.node_id)
        if self.sessions.get(session.node_id) is session:  # not replaced meanwhile
            del self.sessions[session.node_id]
            self.rt.nodes.live.pop(session.node_id, None)
            self.rt.nodes.add_event(session.node_id, "offline", "disconnected")

    async def close(self, node_id: str, code: int, reason: str = "") -> None:
        if session := self.sessions.get(node_id):
            await session.close(code, reason)

    async def send_command(self, node_id: str, body: CommandIn) -> CommandResult:
        return await self.sessions[node_id].command(body)

    async def handle(self, websocket: WebSocket) -> None:
        """The /ws/node endpoint."""
        await websocket.accept()
        try:
            text = await asyncio.wait_for(websocket.receive_text(), HELLO_TIMEOUT_S)
        except TimeoutError:
            await websocket.close(code=wire.CLOSE_HANDSHAKE_TIMEOUT)
            return
        except WebSocketDisconnect:
            return
        try:
            hello = wire.parse_up(text)
            if not isinstance(hello, wire.Hello):
                raise ValueError("first message must be hello")
        except (ValidationError, ValueError):
            await websocket.close(code=wire.CLOSE_BAD_MESSAGE)
            return
        client = websocket.client.host if websocket.client else "unknown"
        try:
            auth = await asyncio.to_thread(self.rt.nodes.authenticate, hello, client)
        except AuthError as error:
            await websocket.close(code=error.close_code, reason=error.reason)
            return
        await NodeSession(self.rt, self, websocket, auth.node.id).run(auth, hello)

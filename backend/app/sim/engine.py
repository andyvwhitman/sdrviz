"""The replay engine: turns the recorded day into live WebSocket events (implements `EventSource`).

Every 100 ms it reads the sim clock and compares it with the previous tick:

* key-ups that started in between      -> `keyup` (+ audio frames while the clip plays)
* key-ups that ended                   -> `keydown`
* decoded transcripts                  -> `words` (draft, then final)
* once per second                      -> `tick`, `trains`, and `channel` / `feed` / `faults` on change
* every LOFAR row period               -> `lofar_row`
* every 250 ms, per watched feed       -> binary spectrum frame

A jump of the clock (scenario, `speed`, seek) is a resync: tracked key-ups are rebuilt without events
and clients get a fresh `snapshot`.
"""

import asyncio
import logging
import random
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from ..audio.cache import job_for
from ..live import audio_stream, protocol
from ..live.audio_stream import AudioStream
from ..live.hub import Hub
from . import live_state, spectrum
from .live_state import LOFAR_ROW_S, row_view
from .timefmt import DAY, hms
from .types import ROLE_TAGS, Tx

if TYPE_CHECKING:
    from ..runtime import Runtime

log = logging.getLogger(__name__)

TICK_S = 0.1
SPECTRUM_PERIOD_S = 0.25
KEYFRAME_PERIOD_S = 30.0
DRAFT_HOLD_S = 0.8  # how long the draft transcript shows before it is final
FORGET_AFTER_S = 120.0  # a tracked key-up older than this (on the sim clock) is dropped
SPEECH_SWING_DB = 8.0  # peak-to-gap swing of a voiced word in the level stream
WORD_TAIL_S = 0.45  # a word's burst when it is the last one


def speech_level(tx: Tx, elapsed: float) -> float:
    """0 in a gap, 0.35 to 1 inside a word: the burst pattern of a voiced key-up (carrier-only key-ups stay at 1)."""
    if not tx.words:
        return 1.0
    for i, word in enumerate(tx.words):
        start = word.get("t", 0.0)
        end = tx.words[i + 1].get("t", start) - 0.06 if i + 1 < len(tx.words) else start + WORD_TAIL_S
        if start <= elapsed <= end:
            return random.uniform(0.35, 1.0)
    return 0.0


@dataclass
class Tracked:
    """A key-up in flight: on the air, decoding, or its audio still playing."""

    tx: Tx
    stream: AudioStream
    keyed: bool = True
    decode_stage: int = 0  # 0 waiting for the decoder, 1 draft shown, 2 final shown


@dataclass
class _Signatures:
    """What was last announced, so only changes are sent."""

    channels: dict[str, tuple] = field(default_factory=dict)
    feeds: dict[str, tuple] = field(default_factory=dict)
    faults: tuple = ()


class ReplayEngine:
    def __init__(self, rt: "Runtime"):
        self.rt = rt
        self.hub: Hub = rt.hub
        self._task: asyncio.Task | None = None
        self._tracked: dict[str, Tracked] = {}
        self._peaks: dict[str, float] = {}
        self._sent = _Signatures()
        self._rng = random.Random(1919)
        self._seq = 0
        self._epoch = rt.clock.epoch
        self._last_t = rt.clock.now()
        self._last_lofar_bucket = int(self._last_t // LOFAR_ROW_S)
        self.set_wall_clock(time.monotonic)
        self._rendering: set[str] = set()

    def set_wall_clock(self, wall_clock: Callable[[], float]) -> None:
        """The source of real time for the 1 Hz / 4 Hz / keyframe schedules (tests pass a fake)."""
        self._wall_clock = wall_clock
        now = wall_clock()
        self._due = {"second": now, "spectrum": now, "keyframe": now + KEYFRAME_PERIOD_S}

    # --- EventSource -----------------------------------------------------

    def start(self, hub: Hub) -> None:
        self.hub = hub
        self.resync(publish=False)
        self._task = asyncio.get_running_loop().create_task(self._run(), name="replay-engine")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)

    # --- loop ------------------------------------------------------------

    async def _run(self) -> None:
        while True:
            started = time.monotonic()
            try:
                self.step()
            except Exception:
                log.exception("replay tick failed")
            await asyncio.sleep(max(0.0, TICK_S - (time.monotonic() - started)))

    def step(self) -> None:
        rt = self.rt
        if rt.clock.epoch != self._epoch:
            self.resync()
            return
        wall, t = self._wall_clock(), rt.clock.now()
        for tx in rt.data.day.starting_between(self._last_t, t):
            if tx.channel in rt.world.freqs:
                self._key_up(tx, t)
        self._last_t = t
        self._advance(t)
        self._send_levels()
        if self._is_due("second", wall, 1.0):
            self._each_second(t)
        if self._is_due("spectrum", wall, SPECTRUM_PERIOD_S):
            self._send_spectrum(t)
        if self._is_due("keyframe", wall, KEYFRAME_PERIOD_S):
            self.rt.publish_snapshot()

    def _is_due(self, name: str, wall: float, period: float) -> bool:
        """True once per `period` of wall time, on a fixed schedule (so a 250 ms job averages 4 Hz on 100 ms ticks)."""
        if wall < self._due[name]:
            return False
        self._due[name] = wall if wall - self._due[name] > period else self._due[name] + period
        return True

    def resync(self, publish: bool = True) -> None:
        """Rebuild the tracked key-ups for the current time without emitting their events."""
        rt = self.rt
        t = rt.clock.now()
        self._epoch = rt.clock.epoch
        self._last_t = t
        self._last_lofar_bucket = int(t // LOFAR_ROW_S)
        self._tracked.clear()
        self._peaks.clear()
        for tx in rt.data.day.window(t - FORGET_AFTER_S, t + 0.001):
            if tx.t <= t and tx.channel in rt.world.freqs:
                tracked = self._track(tx)
                age = t - tx.t
                tracked.keyed = age < tx.duration
                tracked.decode_stage = self._stage_at(tx, age)
                tracked.stream.sent = int(age * 1000 // protocol.CHUNK_MS)
        self._remember_state(t)
        if publish:
            rt.publish_snapshot()

    def _remember_state(self, t: float) -> None:
        inputs = self.rt.inputs
        channels = live_state.channel_views(inputs, t)
        feeds = [live_state.feed_view(inputs, fid, t) for fid in inputs.world.feeds]
        self._sent = _Signatures(
            channels={c["id"]: self._channel_signature(c) for c in channels},
            feeds={f["id"]: self._feed_signature(f) for f in feeds},
            faults=self._fault_signature(feeds),
        )

    # --- key-up lifecycle --------------------------------------------------

    def _track(self, tx: Tx) -> Tracked:
        self._seq += 1
        freq = self.rt.world.freqs[tx.channel]
        stream = AudioStream(tx.id, tx.channel, freq.aar_channel, self._seq)
        tracked = self._tracked[tx.id] = Tracked(tx, stream)
        return tracked

    @staticmethod
    def _stage_at(tx: Tx, age: float) -> int:
        decoded = age - tx.duration - tx.latency
        if tx.state != "final":
            return 2 if decoded >= 0 else 0
        return 2 if decoded >= DRAFT_HOLD_S else 1 if decoded >= 0 else 0

    def _key_up(self, tx: Tx, t: float) -> None:
        tracked = self._track(tx)
        self._ensure_clip(tx)
        world = self.rt.world
        freq = world.freqs[tx.channel]
        bank_ids = set(self.rt.active_bank.frequency_ids)
        self.hub.broadcast(
            protocol.message(
                "keyup",
                tx_id=tx.id,
                tx_seq=tracked.stream.seq,
                channel_id=tx.channel,
                aar=f"CH{freq.aar_channel:02d}",
                feed_id=tx.feed,
                receptions=list(tx.receptions),
                role=tx.role,
                role_tag=ROLE_TAGS.get(tx.role, "UNK"),
                speaker=tx.speaker,
                train_id=tx.train_id,
                place_id=tx.place_id,
                off_bank=tx.channel not in bank_ids,
                t=tx.t,
                clock_tenths=hms(tx.t, tenths=True),
                row=row_view(world, tx, tx.t, bank_ids) | {"elapsed_s": 0.0, "receptions": list(tx.receptions)},
            )
        )
        self._send_channel(tx.channel, t)

    def _ensure_clip(self, tx: Tx) -> None:
        """Render a missing clip in the background when someone is listening for it."""
        audio = self.rt.audio
        if tx.id in self._rendering or audio.is_ready(tx.id) or not self.hub.audio_subscribed(tx.channel):
            return
        self._rendering.add(tx.id)
        loop = asyncio.get_running_loop()
        future = loop.run_in_executor(None, audio.ensure, job_for(tx))
        future.add_done_callback(lambda f: self._render_finished(tx.id, f))

    def _render_finished(self, tx_id: str, future: "asyncio.Future") -> None:
        self._rendering.discard(tx_id)
        if error := future.exception():
            log.warning("could not render %s: %s", tx_id, error)

    def _advance(self, t: float) -> None:
        for tracked in list(self._tracked.values()):
            tx = tracked.tx
            age = (t - tx.t) % DAY
            if age > FORGET_AFTER_S:
                del self._tracked[tx.id]
                continue
            if tracked.keyed and age >= tx.duration:
                tracked.keyed = False
                self.hub.broadcast(
                    protocol.message(
                        "keydown",
                        tx_id=tx.id,
                        channel_id=tx.channel,
                        duration_s=tx.duration,
                        t=tx.t + tx.duration,
                    )
                )
                self._send_channel(tx.channel, t)
            self._decode(tracked, age)
            audio_stream.advance(tracked.stream, age, self.rt.audio, self.hub)

    def _decode(self, tracked: Tracked, age: float) -> None:
        """Announce decoder progress: a draft, then the final words (other outcomes are announced once)."""
        tx = tracked.tx
        target = self._stage_at(tx, age)
        if tracked.decode_stage >= target:
            return
        if tx.state != "final":
            self._send_words(tx, tx.state, with_confidence=True)
        else:
            if tracked.decode_stage < 1:
                self._send_words(tx, "draft", with_confidence=False)
            if target == 2:
                self._send_words(tx, "final", with_confidence=True)
        tracked.decode_stage = target

    def _send_words(self, tx: Tx, state: str, with_confidence: bool) -> None:
        self.hub.broadcast(
            protocol.message(
                "words",
                tx_id=tx.id,
                state=state,
                words=list(tx.words),
                transcript=tx.text,
                confidence=tx.confidence if with_confidence else None,
                detector=tx.detector,
            )
        )

    def _send_levels(self) -> None:
        levels = {}
        for tracked in self._tracked.values():
            if not tracked.keyed:
                continue
            cid = tracked.tx.channel
            strongest = max((r["rssi_dbfs"] for r in tracked.tx.receptions), default=-60.0)
            elapsed = (self._last_t - tracked.tx.t) % DAY
            swing = SPEECH_SWING_DB * (speech_level(tracked.tx, elapsed) - 0.55)
            db = round(strongest + swing + self._rng.uniform(-1.0, 1.0), 1)
            self._peaks[cid] = max(db, self._peaks.get(cid, -127.0) - 1.5)
            levels[cid] = {"db": db, "peak": round(self._peaks[cid], 1)}
        if levels:
            self.hub.broadcast(protocol.message("level", t=self._last_t, levels=levels))

    # --- once a second -----------------------------------------------------

    def _each_second(self, t: float) -> None:
        rt = self.rt
        inputs = rt.inputs
        self.hub.broadcast(
            protocol.message("tick", t=t, clock=hms(t), clock_tenths=hms(t, tenths=True), speed=rt.clock.speed)
        )
        positions, ctc = live_state.trains_block(inputs, t, inputs.data.day.active_at(t))
        self.hub.broadcast(protocol.message("trains", positions=positions, ctc=ctc))
        self._send_feed_changes(t)
        self._send_channel_changes(t)
        bucket = int(t // LOFAR_ROW_S)
        if bucket != self._last_lofar_bucket:
            self._last_lofar_bucket = bucket
            end = bucket * LOFAR_ROW_S
            cells = live_state.lofar_row(inputs, end - LOFAR_ROW_S, end)
            self.hub.broadcast(protocol.message("lofar_row", t=end, cells=cells))

    @staticmethod
    def _feed_signature(feed: dict) -> tuple:
        """What a `feed` delta must carry: the state, plus the readouts that move (the age of a feed that is not ok)."""
        measured = (feed["sample_rate_measured_msps"], feed["snr_db"], feed["noise_floor_dbfs"])
        return feed["state"], feed["label"], feed["acked"], feed["enabled"], feed["in_state_label"], *measured

    @staticmethod
    def _fault_signature(feeds: list[dict]) -> tuple:
        return tuple((f["id"], f["state"], f["label"], f["acked"]) for f in feeds if f["state"] != "ok")

    @staticmethod
    def _channel_signature(channel: dict) -> tuple:
        cov, tx, last = channel["coverage"], channel["tx"], channel["last_heard"]
        readout = channel["status_readout"]
        if readout and readout.startswith("LAST"):
            readout = "LAST"  # the client counts the age itself from last_heard.end_t
        return (
            channel["state"],
            readout,
            cov["state"],
            cov["healthy"],
            tx["tx_id"] if tx else None,
            last["tx_id"] if last else None,
        )

    def _send_feed_changes(self, t: float) -> None:
        inputs = self.rt.inputs
        feeds = [live_state.feed_view(inputs, fid, t) for fid in inputs.world.feeds]
        for feed in feeds:
            signature = self._feed_signature(feed)
            if self._sent.feeds.get(feed["id"]) != signature:
                self._sent.feeds[feed["id"]] = signature
                self.hub.broadcast(
                    protocol.message("feed", feed_id=feed["id"], **{k: v for k, v in feed.items() if k != "id"})
                )
        faults = self._fault_signature(feeds)
        if faults != self._sent.faults:
            self._sent.faults = faults
            self.hub.broadcast(protocol.message("faults", **live_state.health_summary(feeds)))

    def _send_channel_changes(self, t: float) -> None:
        for channel in live_state.channel_views(self.rt.inputs, t):
            signature = self._channel_signature(channel)
            if self._sent.channels.get(channel["id"]) != signature:
                self._sent.channels[channel["id"]] = signature
                self._publish_channel(channel)

    def _send_channel(self, channel_id: str, t: float) -> None:
        """Announce one channel right away (key-up and key-down change it between the 1 Hz sweeps)."""
        channel = live_state.channel_view(self.rt.inputs, channel_id, t)
        self._sent.channels[channel_id] = self._channel_signature(channel)
        self._publish_channel(channel)

    def _publish_channel(self, channel: dict) -> None:
        keys = ("state", "tx", "last_heard", "coverage", "channel_fault", "status_readout")
        self.hub.broadcast(protocol.message("channel", id=channel["id"], **{k: channel[k] for k in keys}))

    # --- spectrum ------------------------------------------------------------

    def _send_spectrum(self, t: float) -> None:
        inputs = self.rt.inputs
        for fid in self.hub.watched_feeds():
            feed = inputs.world.feeds.get(fid)
            if not feed or not inputs.health.receiving(fid, t):
                continue
            signals = spectrum.signals_at(inputs, fid, t)
            row = spectrum.spectrum_row(
                feed.noise_floor_dbfs, feed.center_mhz, feed.sample_rate_msps, signals, self._rng
            )
            frame = protocol.spectrum_frame(feed.center_mhz, feed.sample_rate_msps, int(t * 1000), row)
            self.hub.send_spectrum(fid, frame)

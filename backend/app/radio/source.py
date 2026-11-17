"""Live radio: rtl_tcp IQ → per-channel NFM audio and squelch → /ws/live.

Every channel inside the tuned window is demodulated all the time, so tiles light up whether or not
anyone is listening. Each squelch opening is one transmission: a `keyup` for the UI (see events.py)
and audio frames with FLAG_FIRST / FLAG_LAST and a fresh tx_seq, exactly as the replay sends its
synthetic clips. Audio only goes to browsers that asked for that channel (the `audio` op).
"""

import asyncio
import contextlib
import logging
import os
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import numpy as np

from ..live import protocol
from ..models import Frequency, Receiver
from ..sim.world import LIVE_FEED_ID
from .dsp import Channelizer, FmDemod, Reception, Squelch, iq_from_u8, receive, spectrum_dbfs
from .events import LiveEvents
from .receiver import is_active, retunes
from .rtltcp import RtlTcpClient

if TYPE_CHECKING:
    from ..runtime import Runtime

log = logging.getLogger(__name__)

BLOCK_S = 0.1  # one 100 ms audio chunk per IQ block
RECONNECT_S = (1, 2, 5, 10)
READ_TIMEOUT_S = 15  # Wi-Fi can stall for seconds; rtl_tcp buffers and catches up
SPECTRUM_EVERY = 2  # blocks between waterfall rows (5 rows a second)


@dataclass
class ChannelRx:
    freq: Frequency
    squelch: Squelch
    demod: FmDemod = field(default_factory=FmDemod)
    seq: int = 0
    offset_ms: int = 0
    power_db: float = -127.0


@dataclass
class BlockResult:
    frames: list[tuple[str, bytes]] = field(default_factory=list)
    opened: list[str] = field(default_factory=list)
    closed: list[str] = field(default_factory=list)
    spectrum: np.ndarray | None = None


class RadioSource:
    """Owns the rtl_tcp connection and the receiver chain; runs as one asyncio task."""

    def __init__(self, rt: "Runtime", seq_base: int = 1_000_000, workers: int | None = None):
        self.rt = rt
        self.config: Receiver = rt.receiver
        self.hub = rt.hub
        self.events = LiveEvents(rt)
        self.client = RtlTcpClient(self.config.host, self.config.port)
        self.channels: dict[str, ChannelRx] = {}
        self._seq = seq_base  # well above the replay engine's tx_seq values
        self._task: asyncio.Task | None = None
        self._arrivals: deque[tuple[float, int]] = deque(maxlen=50)
        self._blocks = 0
        self._next_second = 0.0
        self.status: dict = {}
        self.pool = ThreadPoolExecutor(workers or os.cpu_count() or 1, thread_name_prefix="channel")

    @property
    def active(self) -> bool:
        """Whether real audio is on its way (the replay's synthetic clips then stay quiet)."""
        return is_active(self.config)

    # --- lifecycle ---------------------------------------------------------

    def start(self) -> None:
        """Connect when the receiver is enabled and has a host; otherwise just report why not."""
        self.status = {"host": f"{self.config.host}:{self.config.port}"}
        if not self.active:
            self.status["state"] = "disabled" if self.config.host else "off"
            return
        self.client = RtlTcpClient(self.config.host, self.config.port)
        self.status["state"] = "starting"
        self._arrivals.clear()
        self._task = asyncio.create_task(self._run(), name="radio")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
            self._close_all()
        await self.client.close()

    async def reconfigure(self, config: Receiver) -> None:
        """Apply new settings without restarting the server: reconnect and retune if the tuner
        settings changed, otherwise (squelch only) adjust the running channels."""
        needs_session = retunes(self.config, config)
        self.config = config
        if needs_session:
            await self.stop()
            self.start()
        else:
            for rx in self.channels.values():
                rx.squelch.open_db = config.squelch_db
                rx.squelch.close_db = max(0.0, config.squelch_db - 3)

    # --- main loop ---------------------------------------------------------

    async def _run(self) -> None:
        attempt = 0
        while True:
            try:
                await self._session()
                attempt = 0
            except asyncio.CancelledError:
                raise
            except (TimeoutError, OSError, asyncio.IncompleteReadError, ConnectionError) as error:
                wait = RECONNECT_S[min(attempt, len(RECONNECT_S) - 1)]
                self.status.update(state="reconnecting", error=str(error) or type(error).__name__)
                log.warning("radio %s: %s; retrying in %ss", self.status["host"], self.status["error"], wait)
                attempt += 1
                self._close_all()
                await self.client.close()
                await asyncio.sleep(wait)

    async def _session(self) -> None:
        cfg = self.config
        info = await self.client.connect()
        await self.client.tune(cfg.freq_hz, cfg.rate, cfg.gain_db)
        channelizer = Channelizer(cfg.rate, cfg.freq_hz)
        self.channels.clear()
        self.status.update(
            state="streaming", tuner=info.tuner, center_hz=cfg.freq_hz, rate=cfg.rate, gain_db=cfg.gain_db, error=None
        )
        log.info(
            "radio %s: %s tuner, %.4f MHz at %.2f MS/s",
            self.status["host"],
            info.tuner,
            cfg.freq_hz / 1e6,
            cfg.rate / 1e6,
        )

        block_bytes = int(cfg.rate * BLOCK_S) * 2
        while True:
            raw = await self.client.read_block(block_bytes, timeout_s=READ_TIMEOUT_S)
            self._arrivals.append((time.monotonic(), len(raw)))
            self._blocks += 1
            wanted = self._in_band(channelizer)
            want_spectrum = self._blocks % SPECTRUM_EVERY == 0 and LIVE_FEED_ID in self.hub.watched_feeds()
            result = await asyncio.to_thread(self._process, channelizer, raw, wanted, want_spectrum)
            self._publish(result)
            self._update_status()

    # --- per block -----------------------------------------------------------

    def _in_band(self, channelizer: Channelizer) -> list[str]:
        """Every known channel inside the tuned window; state is kept per channel across blocks."""
        freqs = self.rt.world.freqs
        wanted = [cid for cid in sorted(freqs) if channelizer.in_band(_hz(freqs[cid]))]
        for cid in list(self.channels):
            if cid not in wanted and self.channels.pop(cid).squelch.is_open:  # deleted while on air
                self.events.key_down(cid)
        for cid in wanted:
            if cid not in self.channels:
                sq = Squelch(open_db=self.config.squelch_db, close_db=max(0.0, self.config.squelch_db - 3))
                self.channels[cid] = ChannelRx(freqs[cid], sq)
        return wanted

    def _process(self, channelizer: Channelizer, raw: bytes, wanted: list[str], want_spectrum: bool) -> BlockResult:
        """Runs in a worker thread (numpy releases the GIL); the channels are spread over `self.pool`."""
        iq = iq_from_u8(raw)
        result = BlockResult(spectrum=spectrum_dbfs(iq) if want_spectrum else None)
        block = channelizer.begin(iq)

        def receive_channel(cid: str) -> Reception:
            rx = self.channels[cid]
            return receive(rx.squelch, rx.demod, channelizer.extract(block, _hz(rx.freq)))

        for cid, heard in zip(wanted, self.pool.map(receive_channel, wanted), strict=True):
            rx = self.channels[cid]
            rx.power_db = heard.power_db
            if heard.pcm is None:
                continue
            if heard.is_open and not heard.was_open:
                self._seq += 1
                rx.seq, rx.offset_ms = self._seq, 0
                result.opened.append(cid)
            elif heard.was_open and not heard.is_open:
                result.closed.append(cid)
            flags = (0 if heard.was_open else protocol.FLAG_FIRST) | (0 if heard.is_open else protocol.FLAG_LAST)
            frame = protocol.audio_frame(rx.freq.aar_channel or 0, rx.seq, rx.offset_ms, flags, heard.pcm)
            result.frames.append((cid, frame))
            rx.offset_ms += protocol.CHUNK_MS
        return result

    def _publish(self, result: BlockResult) -> None:
        for cid in result.opened:
            rx = self.channels[cid]
            self.events.key_up(cid, rx.seq, rx.squelch.snr_db, rx.power_db)
        for cid, frame in result.frames:
            self.hub.send_audio(cid, frame)
        for cid in result.closed:
            self.events.key_down(cid)
        on_air = {cid: (rx.power_db, rx.squelch.snr_db) for cid, rx in self.channels.items() if rx.squelch.is_open}
        self.events.levels(on_air)
        if result.spectrum is not None:
            self._send_spectrum(result.spectrum)
        if time.monotonic() >= self._next_second:
            self._next_second = time.monotonic() + 1.0
            self.events.each_second()

    def _send_spectrum(self, dbfs: np.ndarray) -> None:
        cfg = self.config
        bins = np.clip(np.round(dbfs), -127, 0).astype(np.int8).tobytes()
        t_ms = int(self.rt.clock.now() * 1000)
        frame = protocol.spectrum_frame(cfg.freq_hz / 1e6, cfg.rate / 1e6, t_ms, bins)
        self.hub.send_spectrum(LIVE_FEED_ID, frame)

    def _close_all(self) -> None:
        """The link dropped: end any transmission still on air."""
        for cid, rx in self.channels.items():
            if rx.squelch.is_open:
                self.events.key_down(cid)

    def _update_status(self) -> None:
        if len(self._arrivals) > 1:
            span = self._arrivals[-1][0] - self._arrivals[0][0]
            received = sum(n for _, n in list(self._arrivals)[1:])
            expected = self.config.rate * 2
            self.status["throughput"] = round(received / span / expected, 3) if span > 0 else None
        self.status["channels"] = {
            cid: {"open": rx.squelch.is_open, "snr_db": round(rx.squelch.snr_db, 1), "hiss": round(rx.demod.hiss, 2)}
            for cid, rx in self.channels.items()
        }


def _hz(freq: Frequency) -> int:
    return round(freq.freq_mhz * 1_000_000)

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
from typing import TYPE_CHECKING

import numpy as np

from ..live import protocol
from ..models import Frequency, Receiver
from ..node.pipeline import BlockResult, ChannelRx, Pipeline
from ..node.rtltcp import RtlTcpClient
from ..sim.world import LIVE_FEED_ID
from .events import LiveEvents
from .receiver import is_active, retunes

if TYPE_CHECKING:
    from ..runtime import Runtime

log = logging.getLogger(__name__)

RECONNECT_S = (1, 2, 5, 10)
READ_TIMEOUT_S = 15  # Wi-Fi can stall for seconds; rtl_tcp buffers and catches up
SPECTRUM_EVERY = 2  # blocks between waterfall rows (5 rows a second)


class RadioSource:
    """Owns the rtl_tcp connection and the receiver chain; runs as one asyncio task."""

    def __init__(self, rt: "Runtime", seq_base: int = 1_000_000, workers: int | None = None):
        self.rt = rt
        self.config: Receiver = rt.receiver
        self.hub = rt.hub
        self.events = LiveEvents(rt)
        self.client = RtlTcpClient(self.config.host, self.config.port)
        self._next_seq = seq_base + 1  # well above the replay engine's tx_seq values
        self._task: asyncio.Task | None = None
        self._arrivals: deque[tuple[float, int]] = deque(maxlen=50)
        self._blocks = 0
        self._next_second = 0.0
        self.status: dict = {}
        self.pool = ThreadPoolExecutor(workers or os.cpu_count() or 1, thread_name_prefix="channel")
        self.pipeline = self._new_pipeline()

    def _new_pipeline(self) -> Pipeline:
        cfg = self.config
        return Pipeline(cfg.rate, cfg.freq_hz, cfg.squelch_db, self.pool, first_seq=self._next_seq)

    @property
    def channels(self) -> dict[str, ChannelRx]:
        return self.pipeline.channels

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
            self.pipeline.set_squelch(config.squelch_db)

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
        self._next_seq = self.pipeline.seq + 1  # transmission numbers go on across reconnects
        self.pipeline = self._new_pipeline()
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

        while True:
            raw = await self.client.read_block(self.pipeline.block_bytes, timeout_s=READ_TIMEOUT_S)
            self._arrivals.append((time.monotonic(), len(raw)))
            self._blocks += 1
            # every known channel inside the tuned window; the pipeline keeps state per channel across blocks
            freqs = {cid: _hz(freq) for cid, freq in self.rt.world.freqs.items()}
            for cid in self.pipeline.set_channels(freqs):  # deleted while on air
                self.rt.recorder.end_pcm(cid)
                self.events.key_down(cid)
            want_spectrum = self._blocks % SPECTRUM_EVERY == 0 and LIVE_FEED_ID in self.hub.watched_feeds()
            result = await asyncio.to_thread(self.pipeline.process, raw, want_spectrum)
            self._publish(result)
            self._update_status()

    # --- per block -----------------------------------------------------------

    def _publish(self, result: BlockResult) -> None:
        world_freqs = self.rt.world.freqs
        for up in result.key_ups:
            self.events.key_up(up.key, up.tx_seq, up.snr_db, up.power_db)  # refused when a node got there first
        for chunk in result.chunks:
            if not self.events.owns(chunk.key, LIVE_FEED_ID):
                continue
            flags = (protocol.FLAG_FIRST if chunk.first else 0) | (protocol.FLAG_LAST if chunk.last else 0)
            aar_channel = world_freqs[chunk.key].aar_channel or 0
            self.rt.recorder.add_pcm(chunk.key, chunk.tx_seq, aar_channel, LIVE_FEED_ID, chunk.pcm, chunk.first)
            if chunk.last:
                self.rt.recorder.end_pcm(chunk.key)
            self.hub.send_audio(
                chunk.key, protocol.audio_frame(aar_channel, chunk.tx_seq, chunk.offset_ms, flags, chunk.pcm)
            )
        for cid in result.key_downs:
            self.rt.recorder.end_pcm(cid)
            self.events.key_down(cid)
        self.events.levels(result.levels)
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
                self.rt.recorder.end_pcm(cid)
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

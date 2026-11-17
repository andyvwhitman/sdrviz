"""The agent: rtl_tcp (or a replay file) → receiver chain → Opus, key-ups and spectrum → uplink.

The receiver runs whether or not the server is reachable; with no connection its output is dropped.
"""

import asyncio
import contextlib
import logging
import os
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace

import numpy as np

from ...live import node_protocol as wire
from ...live import protocol
from ...live.opus import FRAME_MS, FRAME_SAMPLES, OpusEncoder
from ..pipeline import BLOCK_S, BlockResult, Pipeline
from . import AGENT_VERSION
from .config import ConfigDir, Settings
from .enroll import EnrollError, enroll
from .sources import RtlTcpSource
from .telemetry import CpuMeter, temperature_c
from .uplink import Uplink, now_ms

log = logging.getLogger(__name__)

READ_TIMEOUT_S = 15.0
RECONNECT_S = (1, 2, 5, 10)  # waits after rtl_tcp failures
SPECTRUM_EVERY = 2  # blocks between spectrum rows: 5 a second
STATUS_EVERY_S = 5.0
PACKET_BYTES = FRAME_SAMPLES * 2  # one 20 ms Opus packet of s16 PCM
PACKETS_PER_CHUNK = protocol.CHUNK_MS // FRAME_MS


def aar_freq_hz(channel: int) -> int:
    """AAR channel number → frequency: channel 7 is 160.215 MHz, 15 kHz apart."""
    return 160_215_000 + (channel - 7) * 15_000


class Agent:
    def __init__(self, config: ConfigDir, source_factory: Callable[[Settings], object] | None = None):
        self.config = config
        self.settings = config.settings()
        self.source_factory = source_factory or (lambda s: RtlTcpSource(s.rtl_host, s.rtl_port))
        self.uplink = Uplink(config, self)
        self.pool = ThreadPoolExecutor(self.settings.workers or os.cpu_count() or 1, thread_name_prefix="channel")
        self.pipeline: Pipeline | None = None
        self.number = 0  # this node's number on the server, from the welcome
        self.server_channels: list[int] = []  # the preset the server sent
        self.rtl_state = "connecting"
        self.dropped_blocks = 0
        self.restart_requested = asyncio.Event()
        self._retune = asyncio.Event()
        self._announced: set[int] = set()  # channels whose key-up went out on this connection
        self._encoders: dict[int, OpusEncoder] = {}
        self._cpu = CpuMeter()
        self._started = time.monotonic()
        self._next_seq = 1
        self._blocks = 0

    # --- running ------------------------------

    async def run(self) -> None:
        """Until a `restart` command; the caller then exits and systemd starts the agent again."""
        await self.enroll_key_files()
        tasks = [
            asyncio.create_task(self.uplink.run(), name="uplink"),
            asyncio.create_task(self._receive(), name="receiver"),
            asyncio.create_task(self._write_status(), name="status"),
        ]
        waiter = asyncio.create_task(self.restart_requested.wait())
        try:
            done, _ = await asyncio.wait([waiter, *tasks], return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()  # a crashed task ends the agent loudly; systemd restarts it
            await self.uplink.drain()  # the restart's ack goes out first
        finally:
            for task in [waiter, *tasks]:
                task.cancel()
            await asyncio.gather(waiter, *tasks, return_exceptions=True)
            self.pool.shutdown(wait=False)

    async def enroll_key_files(self) -> None:
        """A key dropped into the config directory is enrolled, then deleted (or renamed .failed)."""
        for path in self.config.key_files():
            try:
                await enroll(path.read_text(), self.config)
            except EnrollError as error:
                log.error("%s: %s", path.name, error)
                path.rename(path.with_suffix(".key.failed"))
            else:
                log.info("enrolled with %s", path.name)
                path.unlink()

    # --- the receiver ------------------------------

    async def _receive(self) -> None:
        failures = 0
        while True:
            settings = self.settings
            source = self.source_factory(settings)
            self.rtl_state = "connecting"
            try:
                tuner = await source.connect()
                await source.tune(settings.center_hz, settings.rate, settings.gain_db)
                self.pipeline = Pipeline(
                    settings.rate, settings.center_hz, settings.squelch_db, self.pool, first_seq=self._next_seq
                )
                self._apply_channels()
                self._retune.clear()
                self.rtl_state, failures = "connected", 0
                log.info("receiving %.4f MHz at %.3f MS/s (%s)", settings.center_hz / 1e6, settings.rate / 1e6, tuner)
                await self._stream(source)
            except (TimeoutError, OSError, asyncio.IncompleteReadError, ConnectionError) as error:
                self.rtl_state = "down"
                wait = RECONNECT_S[min(failures, len(RECONNECT_S) - 1)]
                failures += 1
                log.warning("rtl_tcp: %s; retrying in %ss", str(error) or type(error).__name__, wait)
                await asyncio.sleep(wait)
            finally:
                if self.pipeline:
                    self._next_seq = self.pipeline.seq + 1
                    self._end_transmissions()
                await source.close()

    async def _stream(self, source) -> None:
        pipeline = self.pipeline
        while not self._retune.is_set():
            raw = await source.read_block(pipeline.block_bytes, READ_TIMEOUT_S)
            captured = time.monotonic()
            self._blocks += 1
            want_spectrum = self._blocks % SPECTRUM_EVERY == 0
            result = await asyncio.to_thread(pipeline.process, raw, want_spectrum)
            if time.monotonic() - captured > BLOCK_S:
                self.dropped_blocks += 1  # took longer than the IQ it covers: the radio side falls behind
            self._publish(result, captured)

    def _apply_channels(self) -> None:
        if self.pipeline is None:
            return
        wanted = self.settings.channels or self.server_channels
        for key in self.pipeline.set_channels({str(ch): aar_freq_hz(ch) for ch in wanted}):
            self._send_key_down(int(key))  # dropped while on air

    # --- what goes up ------------------------------

    def _publish(self, result: BlockResult, captured: float) -> None:
        up = self.uplink
        if not up.connected:
            return
        settings = self.settings
        for key_up in result.key_ups:
            channel = int(key_up.key)
            self._announced.add(channel)
            self._encoders[channel] = OpusEncoder()
            up.send(
                wire.KeyUp(
                    ch=channel,
                    freq_hz=aar_freq_hz(channel),
                    tx_seq=key_up.tx_seq,
                    t=now_ms(),
                    snr_db=round(key_up.snr_db, 1),
                    power_db=round(key_up.power_db, 1),
                )
            )
        for chunk in result.chunks:
            if int(chunk.key) in self._announced:
                self._send_audio(chunk, captured)
        for key in result.key_downs:
            self._send_key_down(int(key))
        if result.levels:
            levels = [
                wire.ChannelLevel(ch=int(key), power_db=round(power, 1), snr_db=round(snr, 1))
                for key, (power, snr) in result.levels.items()
            ]
            up.send(wire.Levels(t=now_ms(), open=levels))
        if result.spectrum is not None:
            bins = np.clip(np.round(result.spectrum), -127, 0).astype(np.int8).tobytes()
            frame = protocol.spectrum_frame(settings.center_hz / 1e6, settings.rate / 1e6, now_ms(), bins)
            up.send_frame(wire.pack_frame(self.number, frame))

    def _send_audio(self, chunk, captured: float) -> None:
        channel = int(chunk.key)
        encoder = self._encoders.setdefault(channel, OpusEncoder())
        pcm = chunk.pcm.ljust(PACKETS_PER_CHUNK * PACKET_BYTES, b"\x00")
        for index in range(PACKETS_PER_CHUNK):
            packet = encoder.encode(pcm[index * PACKET_BYTES : (index + 1) * PACKET_BYTES])
            flags = (protocol.FLAG_FIRST if chunk.first and index == 0 else 0) | (
                protocol.FLAG_LAST if chunk.last and index == PACKETS_PER_CHUNK - 1 else 0
            )
            offset = chunk.offset_ms + index * FRAME_MS
            frame = protocol.audio_frame(channel, chunk.tx_seq, offset, flags, packet, protocol.CODEC_OPUS)
            self.uplink.send_frame(wire.pack_frame(self.number, frame), audio=True)

    def _send_key_down(self, channel: int) -> None:
        if channel in self._announced:
            self._announced.discard(channel)
            self._encoders.pop(channel, None)
            tx_seq = (
                self.pipeline.channels[str(channel)].seq
                if self.pipeline and str(channel) in self.pipeline.channels
                else 0
            )
            self.uplink.send(wire.KeyDown(ch=channel, tx_seq=tx_seq, t=now_ms()))

    def _end_transmissions(self) -> None:
        for channel in list(self._announced):
            self._send_key_down(channel)

    # --- uplink callbacks ------------------------------

    def on_online(self, welcome: wire.Welcome) -> None:
        self.number = welcome.node.number
        self.server_channels = welcome.config.channels
        self._announced.clear()
        self._encoders.clear()
        self._apply_channels()

    def on_offline(self) -> None:
        self._announced.clear()  # whatever is on air now has no key-up on the next connection
        self._encoders.clear()

    def health(self) -> wire.Health:
        settings = self.settings
        return wire.Health(
            t=now_ms(),
            cpu_pct=self._cpu.percent(),
            temp_c=temperature_c(),
            rtl_tcp=self.rtl_state,
            dropped_blocks=self.dropped_blocks,
            audio_age_ms=round(self.uplink.take_audio_age_ms(), 1),
            uptime_s=int(time.monotonic() - self._started),
            channels=len(self.pipeline.channels) if self.pipeline else 0,
            tune=wire.Tune(
                center_hz=settings.center_hz,
                rate=settings.rate,
                gain_db=settings.gain_db,
                squelch_db=settings.squelch_db,
            ),
        )

    # --- commands ------------------------------

    async def on_command(self, command: wire.Command) -> wire.Ack:
        log.info("command %s %s", command.type, command.model_dump(exclude={"type", "id"}))
        try:
            await self._apply(command)
        except ValueError as error:
            return wire.Ack(id=command.id, ok=False, error=wire.CommandError(code="bad_value", message=str(error)))
        except OSError as error:
            return wire.Ack(id=command.id, ok=False, error=wire.CommandError(code="failed", message=str(error)))
        return wire.Ack(id=command.id, ok=True)

    async def _apply(self, command: wire.Command) -> None:
        match command:
            case wire.TuneCommand():
                if command.rate <= 0 or command.rate % 48_000:
                    raise ValueError("rate must be a positive multiple of 48000")
                if not 24_000_000 <= command.center_hz <= 1_766_000_000:
                    raise ValueError("center_hz is outside the tuner's range")
                self._change(center_hz=command.center_hz, rate=command.rate, retune=True)
            case wire.GainCommand():
                if command.gain_db is not None and not 0 <= command.gain_db <= 50:
                    raise ValueError("gain_db must be 0-50, or null for automatic")
                self._change(gain_db=command.gain_db, retune=True)
            case wire.SquelchCommand():
                if not 0 <= command.squelch_db <= 40:
                    raise ValueError("squelch_db must be 0-40")
                self._change(squelch_db=command.squelch_db)
                if self.pipeline:
                    self.pipeline.set_squelch(command.squelch_db)
            case wire.ChannelsCommand():
                if not command.channels or not all(1 <= ch <= 255 for ch in command.channels):
                    raise ValueError("channels must be AAR channel numbers (1-255), at least one")
                self._change(channels=sorted(set(command.channels)))
                self._apply_channels()
            case wire.RestartCommand():
                self.restart_requested.set()
            case wire.SetServerCommand():
                credentials = self.config.credentials()
                if credentials is None:
                    raise ValueError("this node is not enrolled")
                try:
                    await self.uplink.try_server(command.url, credentials)
                except Exception as error:  # nothing is saved: the old address stays
                    raise OSError(f"could not use {command.url}: {str(error) or type(error).__name__}") from error
                self.config.save_credentials(replace(credentials, url=command.url.rstrip("/")))
                asyncio.get_running_loop().call_later(0.5, self.uplink.reconnect)  # after this ack is sent

    def _change(self, retune: bool = False, **values) -> None:
        for key, value in values.items():
            setattr(self.settings, key, value)
        self.config.save_state(self.settings)
        if retune:
            self._retune.set()

    # --- status file ------------------------------

    async def _write_status(self) -> None:
        while True:
            credentials = self.config.credentials()
            status = self.uplink.status
            with contextlib.suppress(OSError):
                self.config.write_status(
                    {
                        "version": AGENT_VERSION,
                        "node": credentials.node if credentials else None,
                        "server": credentials.url if credentials else None,
                        "uplink": status.state,
                        "detail": status.detail,
                        "rtt_ms": status.rtt_ms,
                        "reconnects": status.reconnects,
                        "dropped_messages": status.dropped_messages,
                        "rtl_tcp": self.rtl_state,
                        "channels": len(self.pipeline.channels) if self.pipeline else 0,
                        "dropped_blocks": self.dropped_blocks,
                        "uptime_s": int(time.monotonic() - self._started),
                        "updated": time.time(),
                    }
                )
            await asyncio.sleep(STATUS_EVERY_S)

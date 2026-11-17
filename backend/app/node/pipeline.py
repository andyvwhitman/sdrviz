"""IQ in, audio and events out: the whole receiver chain for one tuned window, with no I/O.

    raw rtl_tcp bytes → Pipeline.process → per-channel PCM chunks, key-up / key-down edges, levels, spectrum

Used by the backend's LAN receiver (app/radio/source.py) and by the node agent.
"""

from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from typing import Protocol

import numpy as np

from .dsp import Channelizer, FmDemod, Reception, Squelch, iq_from_u8, receive, spectrum_dbfs

BLOCK_S = 0.1  # one chunk of audio per 100 ms of IQ
CHUNK_MS = 100


class Pool(Protocol):
    """Anything with an executor's `map` (a ThreadPoolExecutor), used to spread channels over cores."""

    def map(self, fn: Callable, *iterables: Iterable): ...


@dataclass
class ChannelRx:
    key: str
    freq_hz: int
    squelch: Squelch
    demod: FmDemod = field(default_factory=FmDemod)
    seq: int = 0  # tx_seq of the current (or last) transmission
    offset_ms: int = 0
    power_db: float = -127.0


@dataclass(frozen=True)
class Chunk:
    """100 ms of audio from a channel with its squelch open (or closing)."""

    key: str
    tx_seq: int
    offset_ms: int
    first: bool  # first chunk of a transmission
    last: bool  # the squelch closed in this block
    pcm: bytes  # s16le, 8 kHz, mono


@dataclass(frozen=True)
class KeyUp:
    key: str
    tx_seq: int
    snr_db: float
    power_db: float


@dataclass
class BlockResult:
    chunks: list[Chunk] = field(default_factory=list)
    key_ups: list[KeyUp] = field(default_factory=list)
    key_downs: list[str] = field(default_factory=list)
    levels: dict[str, tuple[float, float]] = field(default_factory=dict)  # open channels: key → (power_db, snr_db)
    spectrum: np.ndarray | None = None  # dBFS per bin, lowest frequency first


class Pipeline:
    def __init__(
        self,
        rate: int,
        center_hz: int,
        squelch_db: float = 8.0,
        pool: Pool | None = None,
        first_seq: int = 1,
    ):
        self.channelizer = Channelizer(rate, center_hz)
        self.rate, self.center_hz = rate, center_hz
        self.squelch_db = squelch_db
        self.pool = pool
        self.channels: dict[str, ChannelRx] = {}
        self.seq = first_seq - 1  # tx_seq of the latest key-up
        self.block_bytes = int(rate * BLOCK_S) * 2

    def set_channels(self, freqs_hz: dict[str, int]) -> list[str]:
        """Receive these channels (key → frequency); those outside the tuned window are left out. State is kept
        for channels that stay. Returns the keys that were on air and just went away (the caller ends them)."""
        wanted = {key for key, freq in freqs_hz.items() if self.channelizer.in_band(freq)}
        dropped = [key for key in list(self.channels) if key not in wanted]
        on_air = [key for key in dropped if self.channels.pop(key).squelch.is_open]
        for key in sorted(wanted):
            if key not in self.channels:
                self.channels[key] = ChannelRx(key, freqs_hz[key], self._new_squelch())
        return on_air

    def _new_squelch(self) -> Squelch:
        return Squelch(open_db=self.squelch_db, close_db=max(0.0, self.squelch_db - 3))

    def set_squelch(self, squelch_db: float) -> None:
        self.squelch_db = squelch_db
        for rx in self.channels.values():
            rx.squelch.open_db = squelch_db
            rx.squelch.close_db = max(0.0, squelch_db - 3)

    def open_channels(self) -> list[str]:
        return [key for key, rx in self.channels.items() if rx.squelch.is_open]

    def process(self, raw: bytes, want_spectrum: bool = False) -> BlockResult:
        """One block of rtl_tcp bytes (`block_bytes` long). Blocking numpy work: call it from a worker thread."""
        iq = iq_from_u8(raw)
        result = BlockResult(spectrum=spectrum_dbfs(iq) if want_spectrum else None)
        block = self.channelizer.begin(iq)
        keys = list(self.channels)  # the order of the results below

        def receive_channel(key: str) -> Reception:
            rx = self.channels[key]
            return receive(rx.squelch, rx.demod, self.channelizer.extract(block, rx.freq_hz))

        heard_all = (self.pool.map if self.pool else map)(receive_channel, keys)
        for key, heard in zip(keys, heard_all, strict=True):
            rx = self.channels[key]
            rx.power_db = heard.power_db
            if heard.is_open:
                result.levels[key] = (rx.power_db, rx.squelch.snr_db)
            if heard.pcm is None:
                continue
            if heard.is_open and not heard.was_open:
                self.seq += 1
                rx.seq, rx.offset_ms = self.seq, 0
                result.key_ups.append(KeyUp(key, rx.seq, rx.squelch.snr_db, rx.power_db))
            elif heard.was_open and not heard.is_open:
                result.key_downs.append(key)
            chunk = Chunk(key, rx.seq, rx.offset_ms, not heard.was_open, not heard.is_open, heard.pcm)
            result.chunks.append(chunk)
            rx.offset_ms += CHUNK_MS
        return result

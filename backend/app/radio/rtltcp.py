"""Async client for an rtl_tcp server (e.g. the Pi set up by receiver/pi/setup.sh)."""

import asyncio
import contextlib
import struct
from dataclasses import dataclass

TUNERS = {0: "unknown", 1: "E4000", 2: "FC0012", 3: "FC0013", 4: "FC2580", 5: "R820T", 6: "R828D"}

# rtl_tcp commands: one byte opcode + big-endian u32 argument.
SET_FREQ = 0x01
SET_SAMPLE_RATE = 0x02
SET_GAIN_MODE = 0x03  # 0 = automatic, 1 = manual
SET_GAIN = 0x04  # tenths of a dB
SET_FREQ_CORRECTION = 0x05  # ppm


@dataclass(frozen=True)
class TunerInfo:
    tuner: str
    gain_steps: int


class RtlTcpClient:
    """Connect, tune, then read fixed-size blocks of interleaved uint8 I/Q."""

    def __init__(self, host: str, port: int = 1234):
        self.host = host
        self.port = port
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None

    async def connect(self, timeout_s: float = 5.0) -> TunerInfo:
        self._reader, self._writer = await asyncio.wait_for(asyncio.open_connection(self.host, self.port), timeout_s)
        magic, tuner, gains = struct.unpack(">4sII", await asyncio.wait_for(self._reader.readexactly(12), timeout_s))
        if magic != b"RTL0":
            await self.close()
            raise ConnectionError(f"{self.host}:{self.port} is not an rtl_tcp server")
        return TunerInfo(TUNERS.get(tuner, f"type {tuner}"), gains)

    async def tune(self, freq_hz: int, sample_rate: int, gain_db: float | None, ppm: int = 0) -> None:
        """gain_db None = automatic gain."""
        await self._command(SET_SAMPLE_RATE, sample_rate)
        await self._command(SET_FREQ, freq_hz)
        if ppm:
            await self._command(SET_FREQ_CORRECTION, ppm & 0xFFFFFFFF)
        if gain_db is None:
            await self._command(SET_GAIN_MODE, 0)
        else:
            await self._command(SET_GAIN_MODE, 1)
            await self._command(SET_GAIN, round(gain_db * 10))

    async def read_block(self, num_bytes: int, timeout_s: float = 5.0) -> bytes:
        assert self._reader is not None, "connect() first"
        return await asyncio.wait_for(self._reader.readexactly(num_bytes), timeout_s)

    async def close(self) -> None:
        if self._writer:
            self._writer.close()
            with contextlib.suppress(OSError):
                await self._writer.wait_closed()
        self._reader = self._writer = None

    async def _command(self, opcode: int, value: int) -> None:
        assert self._writer is not None, "connect() first"
        self._writer.write(struct.pack(">BI", opcode, value))
        await self._writer.drain()

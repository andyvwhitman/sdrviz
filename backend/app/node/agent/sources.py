"""Where the agent's IQ comes from: the local rtl_tcp server, or a recorded file for tests and demos."""

import asyncio
from pathlib import Path

from ..rtltcp import RtlTcpClient


class RtlTcpSource:
    """The rtl_tcp server on this machine (127.0.0.1)."""

    def __init__(self, host: str, port: int):
        self.client = RtlTcpClient(host, port)

    async def connect(self) -> str:
        return (await self.client.connect()).tuner

    async def tune(self, freq_hz: int, rate: int, gain_db: float | None) -> None:
        await self.client.tune(freq_hz, rate, gain_db)

    async def read_block(self, num_bytes: int, timeout_s: float = 15.0) -> bytes:
        return await self.client.read_block(num_bytes, timeout_s)

    async def close(self) -> None:
        await self.client.close()


class ReplaySource:
    """Interleaved uint8 I/Q from a file, looped, delivered at the speed the radio would (times `pace`:
    0 delivers as fast as it is asked for)."""

    def __init__(self, path: Path, pace: float = 1.0):
        self.path = Path(path)
        self.pace = pace
        self._data = b""
        self._position = 0
        self._rate = 0

    async def connect(self) -> str:
        self._data = self.path.read_bytes()
        if len(self._data) < 2:
            raise OSError(f"{self.path} has no IQ in it")
        self._position = 0
        return "replay"

    async def tune(self, freq_hz: int, rate: int, gain_db: float | None) -> None:
        self._rate = rate

    async def read_block(self, num_bytes: int, timeout_s: float = 15.0) -> bytes:
        if self.pace:
            await asyncio.sleep(num_bytes / 2 / self._rate * self.pace)
        else:
            await asyncio.sleep(0)
        out = bytearray()
        while len(out) < num_bytes:
            piece = self._data[self._position : self._position + num_bytes - len(out)]
            out += piece
            self._position = (self._position + len(piece)) % len(self._data)
        return bytes(out)

    async def close(self) -> None:
        pass

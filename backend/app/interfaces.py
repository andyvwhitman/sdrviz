"""The seams the real pipeline plugs into. The fake backend implements `EventSource` only.

Replacing the fake means swapping `sim.engine.ReplayEngine` for an `EventSource` fed by real
`SourceDriver`s and a `Transcriber`; the REST and WebSocket contract does not change.
"""

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Protocol

from .live.hub import Hub


class EventSource(Protocol):
    """Publishes live events (key-up, key-down, words, level, feed, ...) to a Hub."""

    def start(self, hub: Hub) -> None: ...

    async def stop(self) -> None: ...


class SourceDriver(Protocol):
    """One IQ source: an rtl_tcp server, an sdrviz agent or a recorded file."""

    def start(self) -> None: ...

    def stop(self) -> None: ...

    def iq_blocks(self) -> Iterator[bytes]:
        """Raw complex-u8 IQ blocks at the feed's sample rate."""
        ...

    def telemetry(self) -> dict[str, float | None]:
        """Device temperature, host CPU, dropped samples; None where the driver cannot report one."""
        ...


@dataclass(frozen=True)
class TranscriptResult:
    text: str
    words: list[dict]  # [{"w": str, "conf": float, "t": float}]
    confidence: float | None
    latency_s: float


class Transcriber(Protocol):
    """Speech to text for one clip. `hints` biases decoding toward place names and train numbers."""

    hints: list[str]

    def transcribe(self, clip: bytes) -> TranscriptResult: ...

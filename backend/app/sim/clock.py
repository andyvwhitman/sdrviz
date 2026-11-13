"""The replay clock: seconds after midnight on the recorded day, running at `speed` x real time."""

import time
from collections.abc import Callable
from datetime import datetime

from .timefmt import DAY


def local_time_of_day() -> float:
    now = datetime.now()
    return now.hour * 3600 + now.minute * 60 + now.second + now.microsecond / 1e6


class SimClock:
    """`now() = base + (monotonic - anchor) * speed`, wrapping at 24 h.

    `jump()` re-anchors the clock and bumps `epoch`, so consumers can tell that time was
    discontinuous rather than merely advancing.
    """

    def __init__(self, start_s: float, speed: float = 1.0, monotonic: Callable[[], float] = time.monotonic):
        self._monotonic = monotonic
        self._base = start_s % DAY
        self._anchor = monotonic()
        self.speed = speed
        self.epoch = 0

    def now(self) -> float:
        return (self._base + (self._monotonic() - self._anchor) * self.speed) % DAY

    def jump(self, t: float | None = None, speed: float | None = None) -> None:
        """Move to `t` (default: stay where it is) and optionally change the speed."""
        self._base = (self.now() if t is None else t) % DAY
        self._anchor = self._monotonic()
        if speed is not None:
            self.speed = speed
        self.epoch += 1

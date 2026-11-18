"""The replay clock: seconds after midnight on the recorded day, running at `speed` x real time."""

import time
from collections.abc import Callable

from .timefmt import DAY, eastern_now, seconds_since_midnight


def local_time_of_day() -> float:
    """Seconds after midnight in Eastern time, whatever time zone the server runs in."""
    return seconds_since_midnight(eastern_now())


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


class WallClock(SimClock):
    """The real Eastern time of day at 1x (a server without the replay). Read from the system clock each time,
    so it follows daylight saving changes and never drifts."""

    def __init__(self) -> None:
        super().__init__(0.0)

    def now(self) -> float:
        return local_time_of_day()

    def jump(self, t: float | None = None, speed: float | None = None) -> None:
        """The real time cannot be moved."""

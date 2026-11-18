"""Adjacent-channel ghosts (A-5).

A strong transmitter leaks sideband energy into its neighbours: K Tower on CH12 at -9 dBFS made CH14, 30 kHz away,
key up at the same instant at -36 dBFS. The node's channel filter cannot remove that, because the energy is in the
transmitter's own signal. A key-up that starts within WINDOW_S of a key-up on a channel within NEIGHBOUR_HZ that
is at least MARGIN_DB stronger, on the same node, is therefore a ghost and is dropped.
"""

from collections import Counter, deque
from dataclasses import dataclass

NEIGHBOUR_HZ = 60_000
WINDOW_S = 0.5  # how close in time two key-ups must be; also how long a weak key-up is held back
MARGIN_DB = 20.0
MAX_POWER_DBFS = 0.0  # nothing is stronger than full scale, so a key-up above -MARGIN_DB can never be a ghost
KEEP_S = 2.0


@dataclass(frozen=True)
class Start:
    t: float
    ch: int
    freq_hz: int
    power_db: float


class GhostFilter:
    def __init__(self) -> None:
        self._starts: deque[Start] = deque()
        self.counts: Counter[int] = Counter()  # ghosts dropped, per channel

    def note(self, ch: int, freq_hz: int, power_db: float, now: float) -> Start:
        """Record a key-up as it arrives."""
        start = Start(now, ch, freq_hz, power_db)
        self._starts.append(start)
        while self._starts and now - self._starts[0].t > KEEP_S:
            self._starts.popleft()
        return start

    @staticmethod
    def may_be_ghost(power_db: float) -> bool:
        """Whether a key-up this strong could be a ghost at all; a stronger one is forwarded without waiting."""
        return power_db <= MAX_POWER_DBFS - MARGIN_DB

    def is_ghost(self, start: Start) -> bool:
        """Judge a key-up (once WINDOW_S has passed since it arrived, so a stronger neighbour keying just after it
        is known). Counts it when it is a ghost."""
        ghost = any(
            other is not start
            and other.ch != start.ch
            and abs(other.freq_hz - start.freq_hz) <= NEIGHBOUR_HZ
            and abs(other.t - start.t) <= WINDOW_S
            and other.power_db >= start.power_db + MARGIN_DB
            for other in self._starts
        )
        if ghost:
            self.counts[start.ch] += 1
        return ghost

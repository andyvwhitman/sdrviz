"""Link quality and lag of one node, from its heartbeats (formulas in docs/node-protocol.md)."""

import statistics
import time
from collections import deque

BEATS = 12  # the window: 12 beats of 5 s, one minute
RECONNECT_WINDOW_S = 3600.0
FINE_RTT_MS, BAD_RTT_MS = 100.0, 2000.0


class LinkStats:
    def __init__(self) -> None:
        self._rtts: deque[float] = deque(maxlen=BEATS)  # answered beats
        self._answered: deque[bool] = deque(maxlen=BEATS)  # every beat
        self._reconnects: deque[float] = deque()  # monotonic times
        self.audio_age_ms = 0.0  # from the latest health message

    def beat(self, rtt_ms: float | None) -> None:
        """One heartbeat: its round trip, or None when no pong came back in time."""
        self._answered.append(rtt_ms is not None)
        if rtt_ms is not None:
            self._rtts.append(rtt_ms)

    def reconnected(self, now: float | None = None) -> None:
        self._reconnects.append(time.monotonic() if now is None else now)

    def median_rtt_ms(self) -> float | None:
        return statistics.median(self._rtts) if self._rtts else None

    def quality(self, now: float | None = None) -> int:
        """0-100: 40% round trip, 40% beats answered, 20% few reconnects in the last hour."""
        now = time.monotonic() if now is None else now
        while self._reconnects and now - self._reconnects[0] > RECONNECT_WINDOW_S:
            self._reconnects.popleft()
        rtt = self.median_rtt_ms()
        rtt_score = 0.0 if rtt is None else _clamp(100 * (BAD_RTT_MS - rtt) / (BAD_RTT_MS - FINE_RTT_MS))
        miss_score = 100.0 * sum(self._answered) / len(self._answered) if self._answered else 100.0
        reconnect_score = max(0.0, 100.0 - 20.0 * len(self._reconnects))
        if not self._answered:  # nothing measured yet: a fresh connection starts out fine
            rtt_score = 100.0
        return round(0.4 * rtt_score + 0.4 * miss_score + 0.2 * reconnect_score)

    def lag_ms(self) -> int:
        """Half the median round trip plus the age of the audio when the node sent it."""
        return round((self.median_rtt_ms() or 0.0) / 2 + self.audio_age_ms)


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, value))

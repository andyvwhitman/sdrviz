"""Gain guard: turn a node's gain down when its input is overloaded (A-2).

An 8-bit rtl-sdr ADC clips near full scale, which makes thumping audio and ghost key-ups on other channels.
The node agent cannot protect itself, so the server watches the levels it reports and steps the gain down one
R820T step at a time.
"""

import time

OVERLOAD_DBFS = -4.0  # a key-up or level above this means the ADC is close to clipping
GAIN_FLOOR_DB = 20.0
MIN_INTERVAL_S = 60.0  # between two steps
PEAK_WINDOW_S = 60.0  # how long a reading counts as the node's current peak

# The gains an R820T tuner offers (the rtl_tcp gain table); a gain command snaps to one of these.
R820T_GAINS_DB = (
    0.0, 0.9, 1.4, 2.7, 3.7, 7.7, 8.7, 12.5, 14.4, 15.7, 16.6, 19.7, 20.7, 22.9, 25.4, 28.0, 29.7, 32.8, 33.8,
    36.4, 37.2, 38.6, 40.2, 42.1, 43.4, 43.9, 44.5, 48.0, 49.6,
)  # fmt: skip


def lower_gain(current_db: float) -> float | None:
    """The next R820T step below `current_db`, or None when that would go under the floor."""
    lower = [gain for gain in R820T_GAINS_DB if GAIN_FLOOR_DB <= gain < current_db - 0.05]
    return max(lower) if lower else None


class GainGuard:
    def __init__(self) -> None:
        self.gain_db: float | None = None  # the node's gain from its latest health message; None: unknown or automatic
        self._peak_db: float | None = None
        self._peak_at = 0.0
        self._last_step_at: float | None = None

    def peak_dbfs(self, now: float | None = None) -> float | None:
        """The highest level seen in the last PEAK_WINDOW_S, or None when nothing was heard in that time."""
        now = time.monotonic() if now is None else now
        if self._peak_db is None or now - self._peak_at > PEAK_WINDOW_S:
            return None
        return self._peak_db

    def observe(self, power_db: float, now: float | None = None) -> float | None:
        """Note a key-up or level reading. Returns the gain to step down to, or None when nothing should change."""
        now = time.monotonic() if now is None else now
        if self.peak_dbfs(now) is None or power_db >= self._peak_db:
            self._peak_db, self._peak_at = power_db, now
        if power_db <= OVERLOAD_DBFS or self.gain_db is None:
            return None
        if self._last_step_at is not None and now - self._last_step_at < MIN_INTERVAL_S:
            return None
        target = lower_gain(self.gain_db)
        if target is not None:
            self._last_step_at = now
        return target

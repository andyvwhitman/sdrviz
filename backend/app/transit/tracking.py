"""Speed and heading worked out from successive positions, for feeds that report neither."""

from dataclasses import dataclass
from datetime import datetime

from .geometry import bearing
from .places import distance_m

MPS_TO_MPH = 2.236936
MIN_MOVE_M = 25  # less than this between reports is GPS noise, not movement
MAX_MPH = 160


@dataclass
class _Fix:
    lat: float
    lon: float
    at: datetime
    speed_mph: float | None = None
    bearing: float | None = None


class MotionTracker:
    def __init__(self) -> None:
        self._fixes: dict[str, _Fix] = {}

    def observe(self, key: str, lat: float, lon: float, at: datetime) -> None:
        prev = self._fixes.get(key)
        if prev is None:
            self._fixes[key] = _Fix(lat, lon, at)
            return
        dt = (at - prev.at).total_seconds()
        if dt <= 0:
            return  # the same report again: keep the last derived values
        moved = distance_m(prev.lat, prev.lon, lat, lon)
        if moved < MIN_MOVE_M:
            self._fixes[key] = _Fix(lat, lon, at, 0.0, prev.bearing)
            return
        speed = moved / dt * MPS_TO_MPH
        self._fixes[key] = _Fix(
            lat, lon, at, speed if speed <= MAX_MPH else prev.speed_mph, bearing(prev.lat, prev.lon, lat, lon)
        )

    def speed_mph(self, key: str) -> float | None:
        fix = self._fixes.get(key)
        return fix.speed_mph if fix else None

    def bearing(self, key: str) -> float | None:
        fix = self._fixes.get(key)
        return fix.bearing if fix else None

    def keep_only(self, keys: set[str]) -> None:
        self._fixes = {k: v for k, v in self._fixes.items() if k in keys}

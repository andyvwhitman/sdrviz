"""Non-stop passes (decision 17): stations a train runs through without stopping, and when.

A pass is found by laying the feed's stations on the trip's path: one that sits on the path between two consecutive
stops, but is not among the trip's stops, is passed (stations of other routes count: an Acela runs through New
Carrollton, which no Acela serves). Its time is interpolated along the path between the
two stops' times, so it is always approximate.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from .estimates import Leg
from .geometry import Path, bounds

PASS_OFF_M = 250  # a station farther than this from the path is not on it
BOX_DEG = 0.01  # about a kilometre
PASS_MARGIN_M = 300  # ...and one this close to a stop is that stop's own station, not a pass


@dataclass(frozen=True)
class PassPoint:
    station_id: str
    after: int  # index of the leg the train has just left
    frac: float  # how far to the next leg, by distance along the path (0 to 1)


@dataclass(frozen=True)
class PassTime:
    scheduled: datetime
    delay_s: int | None  # None: no realtime for the trip


def find_passes(
    path: Path, stops: list[tuple[float, float]], candidates: dict[str, tuple[float, float]]
) -> list[PassPoint]:
    """Candidate stations (id -> lat, lon) on the path between consecutive `stops` (lat, lon), in trip order."""
    if len(path.points) < 2 or len(stops) < 2:
        return []
    along = [path.project(lat, lon)[0] for lat, lon in stops]
    west, south, east, north = bounds(path.points)
    found = []
    for station_id, (lat, lon) in candidates.items():
        if not (south - BOX_DEG <= lat <= north + BOX_DEG and west - BOX_DEG <= lon <= east + BOX_DEG):
            continue  # nowhere near the path: skip the projection
        where, off = path.project(lat, lon)
        if off > PASS_OFF_M:
            continue
        for i, (lo, hi) in enumerate(zip(along, along[1:], strict=False)):
            if lo + PASS_MARGIN_M < where < hi - PASS_MARGIN_M:
                found.append(PassPoint(station_id, i, (where - lo) / (hi - lo)))
                break
    return sorted(found, key=lambda p: (p.after, p.frac, p.station_id))


def pass_time(legs: list[Leg], point: PassPoint) -> PassTime | None:
    """Scheduled time of a pass, and its delay: the two bracketing stops' delays blended the same way."""
    before, after = legs[point.after], legs[point.after + 1]
    leave, arrive = before.dep_s, after.arr_s
    if leave is None or arrive is None:
        return None
    scheduled = leave + (arrive - leave) * point.frac
    delay = before.delay
    if delay is not None and after.arr_d is not None:
        delay = round(delay + (after.arr_d - delay) * point.frac)
    return PassTime(scheduled.replace(microsecond=0), delay)


def pass_estimated(time: PassTime) -> datetime | None:
    return time.scheduled + timedelta(seconds=time.delay_s) if time.delay_s is not None else None

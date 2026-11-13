"""Estimated times and train progress, in one place so boards, trip pages and vehicles always agree.

A `Leg` is one stop of a trip on one service day. `Progress` says how far the train has got (from its position when
that is fresh, else from the clock) and `leg_states` turns it into the per-stop state everything displays.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

StateBasis = Literal["position", "clock"]


@dataclass
class Leg:
    """One stop of a trip on one service day: scheduled and estimated times."""

    stop_id: str
    seq: int
    arr_s: datetime | None
    dep_s: datetime | None
    arr_d: int | None = None  # delay seconds at arrival / departure
    dep_d: int | None = None
    skipped: bool = False

    @property
    def arr_e(self) -> datetime | None:
        return self.arr_s + timedelta(seconds=self.arr_d) if self.arr_s and self.arr_d is not None else None

    @property
    def dep_e(self) -> datetime | None:
        return self.dep_s + timedelta(seconds=self.dep_d) if self.dep_s and self.dep_d is not None else None

    @property
    def arrive(self) -> datetime | None:
        return self.arr_e or self.arr_s

    @property
    def leave(self) -> datetime | None:
        return self.dep_e or self.dep_s

    @property
    def delay(self) -> int | None:
        return self.dep_d if self.dep_d is not None else self.arr_d


def departure_delay(arr_d: int | None, dep_d: int | None, *, reported: bool, first: bool, last: bool) -> int | None:
    """Seconds late at departure, from the arrival delay and whatever departure the feed gave.

    Feeds often repeat the arrival estimate as the departure, which made a train sitting out a long layover look
    early (departure estimate before its scheduled departure). The estimate is
    max(scheduled departure, estimated arrival + scheduled dwell); since arrival + dwell is the scheduled departure
    plus the arrival delay, that is the arrival delay floored at zero. A departure the feed reports itself (`reported`)
    is trusted when later than scheduled and clamped to the schedule when earlier. The first stop has no arrival to
    derive from, and the last has no departure: it keeps the arrival delay.
    """
    if last:
        return arr_d
    if first:
        return dep_d if dep_d is not None else arr_d
    if reported and dep_d is not None:
        return max(dep_d, 0)
    if arr_d is None:
        return dep_d
    return max(arr_d, 0)


@dataclass(frozen=True)
class Progress:
    """How far a train has got along its legs: the first stop it has not left, and whether it stands there."""

    index: int  # len(legs) once it has left the last one
    at_stop: bool = False


def clock_progress(legs: list[Leg], now: datetime) -> Progress:
    """Progress from the estimated times alone (no usable position): the first stop whose departure is ahead."""
    for index, leg in enumerate(legs):
        if leg.skipped:
            continue
        leave = leg.leave or leg.arrive
        if leave is None or leave > now:
            return Progress(index, bool(leg.arrive and leg.arrive <= now))
    return Progress(len(legs))


def leg_states(legs: list[Leg], progress: Progress) -> list[str]:
    """passed, current (standing at the stop), next (the stop to come) or upcoming, per leg; never `passed` for a
    stop after the train's next one."""
    states, found_next = [], False
    for index, leg in enumerate(legs):
        if leg.skipped:
            states.append("skipped")
        elif index < progress.index:
            states.append("passed")
        elif index == progress.index and progress.at_stop:
            states.append("current")
            found_next = False
        elif not found_next:
            states.append("next")
            found_next = True
        else:
            states.append("upcoming")
    return states


def next_leg(legs: list[Leg], states: list[str]) -> Leg | None:
    """The first stop not yet passed: where the train is standing, or the one it is heading for."""
    return next((leg for leg, state in zip(legs, states, strict=True) if state in ("current", "next")), None)


def no_next_stop(legs: list[Leg]) -> str | None:
    """Why a train has no next stop: it has no stops to go by, or it has passed them all."""
    return "terminated" if legs else "no stop data"

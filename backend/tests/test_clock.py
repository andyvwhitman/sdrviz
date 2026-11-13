import pytest

from app.sim.clock import SimClock
from app.sim.day import SimDay
from app.sim.timefmt import DAY, hms, iso_from_offset, offset_from_iso, parse_clock
from app.sim.types import Tx


class FakeMonotonic:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def mono() -> FakeMonotonic:
    return FakeMonotonic()


def test_clock_runs_at_speed(mono):
    clock = SimClock(parse_clock("14:00:00"), speed=1.0, monotonic=mono)
    mono.now += 90
    assert hms(clock.now()) == "14:01:30"
    clock.jump(speed=10)
    mono.now += 6
    assert hms(clock.now()) == "14:02:30"


def test_clock_wraps_at_midnight(mono):
    clock = SimClock(parse_clock("23:59:50"), speed=1.0, monotonic=mono)
    mono.now += 20
    assert hms(clock.now()) == "00:00:10"


def test_frozen_clock_does_not_advance(mono):
    clock = SimClock(parse_clock("14:07:30"), speed=0.0, monotonic=mono)
    mono.now += 3600
    assert clock.now() == parse_clock("14:07:30")


def test_jump_moves_the_clock_and_bumps_the_epoch(mono):
    clock = SimClock(0.0, speed=1.0, monotonic=mono)
    mono.now += 5
    clock.jump(parse_clock("03:40:00"))
    assert clock.epoch == 1
    assert clock.now() == parse_clock("03:40:00")
    mono.now += 1
    assert clock.now() == parse_clock("03:40:00") + 1


def test_iso_conversion_round_trips_across_days():
    assert iso_from_offset(0) == "2026-11-10T00:00:00.000-05:00"
    assert iso_from_offset(-3600) == "2026-11-09T23:00:00.000-05:00"
    assert offset_from_iso("2026-11-09T23:00:00-05:00") == -3600
    assert offset_from_iso("2026-11-10T14:07:30") == parse_clock("14:07:30")  # naive means EST


def _tx(tx_id: str, t: float, duration: float = 2.0) -> Tx:
    return Tx(tx_id, t, duration, "ch", "crew", None, "", None, None, "final", True, (), (), None, 1.0)


def test_day_window_wraps_past_midnight():
    day = SimDay([_tx("late", DAY - 30), _tx("early", 20.0), _tx("noon", 43_200.0)])
    ids = [tx.id for tx in day.window(-60, 60)]
    assert ids == ["late", "early"]  # "late" appears shifted to -30 s
    assert day.window(-60, 60)[0].t == -30
    assert [tx.id for tx in day.starting_between(DAY - 40, 10 + DAY)] == ["late"]
    assert [tx.id for tx in day.starting_between(DAY - 40, 30 + DAY)] == ["late", "early"]
    assert day.starting_between(100.0, 100.0) == []


def test_active_at_includes_rows_started_before_midnight():
    day = SimDay([_tx("late", DAY - 1.0, duration=5.0)])
    assert [tx.id for tx in day.active_at(2.0)] == ["late"]
    assert day.active_at(10.0) == []

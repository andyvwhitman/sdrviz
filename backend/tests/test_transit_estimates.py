"""Estimated departures and per-stop state: one answer on the board, the trip page and the vehicle."""

from datetime import timedelta

import pytest
from google.transit import gtfs_realtime_pb2

from app.transit.amtraker import AmtrakerProvider
from app.transit.estimates import Leg, Progress, clock_progress, departure_delay, leg_states
from app.transit.gtfs_provider import GtfsProvider
from app.transit.gtfs_rt import VehiclePosition, parse_trip_updates
from app.transit.gtfs_static import GtfsStatic
from app.transit.lines import LineIndex
from app.transit.sources import SourceConfig

from .test_transit import FILES, NOW, make_zip

# BWI 07:30, WAS 08:30 arriving and 09:18 leaving (a 48 minute layover), NYP 11:00
LAYOVER_FILES = {
    "agency.txt": "agency_id,agency_name,agency_url,agency_timezone\n1,Test,http://x,America/New_York\n",
    "routes.txt": "route_id,route_short_name,route_long_name,route_type\nR9,,Northeast Regional,2\n",
    "stops.txt": (
        "stop_id,stop_name,stop_lat,stop_lon\n"
        "BWI,BWI Airport,39.1925,-76.6947\n"
        "WAS,Washington Union Station,38.8970,-77.0064\n"
        "NYP,New York Penn,40.75,-73.99\n"
    ),
    "calendar.txt": FILES["calendar.txt"],
    "trips.txt": "route_id,service_id,trip_id,trip_short_name,direction_id,trip_headsign\nR9,WK,g171,171,0,Boston\n",
    "stop_times.txt": (
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
        "g171,07:30:00,07:30:00,BWI,1\ng171,08:30:00,09:18:00,WAS,2\ng171,11:00:00,11:00:00,NYP,3\n"
    ),
}


def at(hour: int, minute: int = 0):
    return NOW.replace(hour=hour, minute=minute)


def live_stop(code, sch_arr, sch_dep, arr, dep, status):
    iso = lambda t: t.isoformat() if t else None  # noqa: E731
    return {
        "name": code,
        "code": code,
        "bus": False,
        "schArr": iso(sch_arr),
        "schDep": iso(sch_dep),
        "arr": iso(arr),
        "dep": iso(dep),
        "status": status,
        "platform": "",
    }


def live_train(*, wash_arr, wash_dep, statuses=("Departed", "Enroute", "Enroute"), updated=NOW):
    """Train 171: BWI, then WAS (layover), then NYP, with Amtraker's estimates at WAS as given."""
    bwi, was, nyp = statuses
    return {
        "trainID": "171-13",
        "trainNum": "171",
        "routeName": "Northeast Regional",
        "trainState": "Active",
        "lat": 39.0,
        "lon": -76.8,
        "origName": "BWI Airport",
        "destName": "New York Penn",
        "updatedAt": updated.isoformat(),
        "lastValTS": updated.isoformat(),
        "stations": [
            live_stop("BWI", None, at(7, 30), None, at(7, 30), bwi),
            live_stop("WAS", at(8, 30), at(9, 18), wash_arr, wash_dep, was),
            live_stop("NYP", at(11, 0), None, at(11, 7), None, nyp),
        ],
    }


@pytest.fixture
def amtrak(tmp_path) -> AmtrakerProvider:
    source = SourceConfig(id="amtrak", name="Amtrak", agency="Amtrak", kind="amtraker", route_types=[2])
    p = AmtrakerProvider(source, tmp_path)
    p.static = GtfsStatic.from_zip(make_zip(LAYOVER_FILES), route_types=[2])
    p.index = LineIndex.build(p.static)
    p.on_static_loaded()
    return p


def load(p: AmtrakerProvider, train: dict) -> None:
    p.trains = [train]
    p.match_trips(NOW)


def was_rows(p, now=NOW, ahead=6):
    board = p.station_board("WAS", now, timedelta(hours=1), timedelta(hours=ahead))
    return board.departures[0], board.arrivals[0]


# --- BE-1: departure estimate ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("arr_d", "dep_d", "reported", "first", "last", "expected"),
    [
        (
            420,
            -2400,
            False,
            False,
            False,
            420,
        ),  # layover: arrival repeated as departure; the delay carries, not -40 min
        (-300, -3000, False, False, False, 0),  # arrives early, still leaves on schedule
        (300, 300, False, False, False, 300),  # short dwell: departure follows arrival plus delay
        (100, 900, True, False, False, 900),  # the feed's own later departure is trusted
        (0, -600, True, False, False, 0),  # its earlier-than-scheduled departure is clamped to the schedule
        (None, 240, False, True, False, 240),  # origin: no arrival, its departure stands
        (None, -60, False, True, False, -60),  # (an origin may leave early; not clamped)
        (-120, 0, False, False, True, -120),  # terminal: the arrival delay, early included
        (None, 300, False, False, False, 300),  # nothing to derive from
    ],
)
def test_departure_delay(arr_d, dep_d, reported, first, last, expected):
    assert departure_delay(arr_d, dep_d, reported=reported, first=first, last=last) == expected


def test_amtrak_layover_departure_follows_the_arrival_delay(amtrak):
    """Amtraker repeats the 08:37 arrival as the departure; the 09:18 departure becomes 09:25, not 08:37."""
    load(amtrak, live_train(wash_arr=at(8, 37), wash_dep=at(8, 37)))
    departure, arrival = was_rows(amtrak)
    assert (arrival.delay_s, departure.delay_s) == (420, 420)
    assert departure.scheduled == at(9, 18) and departure.estimated == at(9, 25)
    live = amtrak.trip("171-13", NOW)
    assert live.stops[1].dep_estimated == at(9, 25) and live.stops[1].delay_s == 420
    static = amtrak.trip("g171", NOW, NOW.date())
    assert static.stops[1].dep_estimated == at(9, 25) and static.stops[1].delay_s == 420
    assert static.stops[-1].delay_s == 420  # the terminal keeps its arrival delay


def test_amtrak_reported_departure_is_trusted_when_later_and_clamped_when_earlier(amtrak):
    load(amtrak, live_train(wash_arr=at(8, 37), wash_dep=at(9, 40)))
    assert was_rows(amtrak)[0].estimated == at(9, 40)
    load(amtrak, live_train(wash_arr=at(8, 20), wash_dep=at(9, 0)))
    assert was_rows(amtrak)[0].estimated == at(9, 18)


def test_gtfs_rt_layover_departure_follows_the_arrival_delay(tmp_path):
    p = GtfsProvider(SourceConfig(id="t", name="Test", agency="Test"), tmp_path)
    p.static = GtfsStatic.from_zip(make_zip(LAYOVER_FILES))
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    e = feed.entity.add()
    e.id = "1"
    e.trip_update.trip.trip_id = "g171"
    u = e.trip_update.stop_time_update.add()
    u.stop_sequence = 2
    u.arrival.delay = 420  # no departure of its own
    p.trip_updates = parse_trip_updates(feed.SerializeToString())
    trip = p.trip("g171", NOW)
    assert (trip.stops[1].dep_estimated, trip.stops[1].delay_s) == (at(9, 25), 420)
    board = p.station_board("WAS", NOW, timedelta(hours=1), timedelta(hours=6))
    assert board.departures[0].estimated == at(9, 25) and board.departures[0].delay_s == 420


# --- BE-2: state from position ---------------------------------------------------------------


def test_position_says_upcoming_though_the_estimate_is_in_the_past(amtrak):
    """The estimate for Washington (08:37) has passed at 09:00, but Amtraker still has the train short of it."""
    now = at(9, 0)
    load(amtrak, live_train(wash_arr=at(8, 37), wash_dep=at(8, 37), updated=now))
    trip = amtrak.trip("171-13", now)
    assert [(s.state, s.state_basis) for s in trip.stops] == [
        ("passed", "position"),
        ("next", "position"),
        ("upcoming", "position"),
    ]
    departure, arrival = was_rows(amtrak, now)
    assert (arrival.state, departure.state, arrival.state_basis) == ("upcoming", "upcoming", "position")
    [vehicle] = amtrak.vehicles(now)
    assert vehicle.next_stop.stop_id == "amtrak:WAS"


def test_standing_at_a_stop_has_arrived_but_not_left(amtrak):
    load(amtrak, live_train(wash_arr=at(8, 37), wash_dep=at(8, 37), statuses=("Departed", "Station", "Enroute")))
    trip = amtrak.trip("171-13", NOW)
    assert [s.state for s in trip.stops] == ["passed", "current", "next"]
    departure, arrival = was_rows(amtrak)
    assert (arrival.state, departure.state) == ("passed", "upcoming")


def test_a_stale_position_falls_back_to_the_clock(amtrak):
    now = at(9, 0)
    stale = now - timedelta(seconds=amtrak.source.stale_after_s + 60)
    load(amtrak, live_train(wash_arr=at(8, 37), wash_dep=at(8, 37), updated=stale))
    trip = amtrak.trip("171-13", now)
    assert {s.state_basis for s in trip.stops} == {"clock"}
    assert trip.stops[1].state == "current"  # 08:37 arrival is past, the 09:25 departure is not
    assert was_rows(amtrak, now)[1].state_basis == "clock"


def test_vehicle_next_stop_is_the_first_stop_not_passed(amtrak):
    load(amtrak, live_train(wash_arr=at(8, 37), wash_dep=at(8, 37), statuses=("Departed", "Station", "Enroute")))
    [vehicle] = amtrak.vehicles(NOW)
    trip = amtrak.trip("171-13", NOW)
    first = next(s for s in trip.stops if s.state in ("current", "next"))
    assert vehicle.next_stop.stop_id == first.stop_id == "amtrak:WAS"


def test_gtfs_rt_position_with_a_stop_sets_the_state(tmp_path):
    p = GtfsProvider(SourceConfig(id="t", name="Test", agency="Test"), tmp_path)
    p.static = GtfsStatic.from_zip(make_zip(LAYOVER_FILES))
    now = at(9, 0)
    p.positions = [VehiclePosition("cab", "g171", "R9", 39.0, -76.8, None, None, now, stop_sequence=2)]
    trip = p.trip("g171", now)  # the schedule says it left BWI and is at Washington by now; the feed says heading there
    assert [(s.state, s.state_basis) for s in trip.stops][:2] == [("passed", "position"), ("next", "position")]
    [vehicle] = p.vehicles(now)
    assert vehicle.next_stop.stop_id == "t:WAS"
    row = p.station_board("WAS", now, timedelta(hours=1), timedelta(hours=6)).arrivals[0]
    assert (row.state, row.state_basis) == ("upcoming", "position")  # the board follows the position too
    p.positions = [
        VehiclePosition("cab", "g171", "R9", 39.0, -76.8, None, None, now - timedelta(hours=1), stop_sequence=2)
    ]
    assert p.trip("g171", now).stops[0].state_basis == "clock"  # a position an hour old says nothing


def test_clock_progress_never_passes_a_stop_after_the_next_one():
    """A later stop whose estimate is already in the past is not passed while an earlier one is still ahead."""
    legs = [Leg("a", 1, at(7), at(7)), Leg("b", 2, at(8), at(8), 3600, 3600), Leg("c", 3, at(8, 5), at(8, 5))]
    progress = clock_progress(legs, at(8, 30))
    assert progress == Progress(1, False)
    assert leg_states(legs, progress) == ["passed", "next", "upcoming"]

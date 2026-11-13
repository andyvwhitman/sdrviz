"""Non-stop passes: stations a train runs through without stopping, on trips and (BE-6) on station boards."""

import pytest
from google.transit import gtfs_realtime_pb2

from app.transit import SourceConfig
from app.transit.amtraker import AmtrakerProvider
from app.transit.gtfs_provider import GtfsProvider
from app.transit.gtfs_rt import parse_trip_updates
from app.transit.gtfs_static import GtfsStatic

from .test_transit import FILES, NOW, make_zip
from .test_transit_estimates import live_stop

# A, B, C, D on a straight north-south line 5.5 km apart; E is 4 km east of C, nowhere near the track.
STOPS = {"A": (39.00, -77.0), "B": (39.05, -77.0), "C": (39.10, -77.0), "D": (39.15, -77.0), "E": (39.10, -76.95)}
PASS_FILES = {
    "agency.txt": FILES["agency.txt"],
    "routes.txt": "route_id,route_short_name,route_long_name,route_type\nR1,,Line,2\n",
    "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\n"
    + "".join(f"{k},Stop {k},{y},{x}\n" for k, (y, x) in STOPS.items()),
    "calendar.txt": FILES["calendar.txt"],
    "trips.txt": (
        "route_id,service_id,trip_id,trip_short_name,direction_id,trip_headsign,shape_id\n"
        "R1,WK,local,100,0,D,S1\nR1,WK,express,171,0,D,S1\nR1,WK,other,200,0,E,S2\n"
    ),
    "stop_times.txt": (
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
        "local,08:00:00,08:00:00,A,1\nlocal,08:10:00,08:10:00,B,2\nlocal,08:20:00,08:20:00,C,3\nlocal,08:30:00,08:30:00,D,4\n"
        "express,08:00:00,08:00:00,A,1\nexpress,08:10:00,08:12:00,B,2\nexpress,08:40:00,08:40:00,D,3\n"
        "other,09:00:00,09:00:00,E,1\nother,09:10:00,09:10:00,D,2\n"
    ),
    "shapes.txt": "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n"
    + "".join(f"S1,{39.0 + 0.01 * i:.2f},-77.0,{i}\n" for i in range(16))
    + "S2,39.10,-76.95,1\nS2,39.15,-77.0,2\n",
}


@pytest.fixture
def provider(tmp_path) -> GtfsProvider:
    p = GtfsProvider(SourceConfig(id="t", name="Test", agency="Test"), tmp_path)
    p.static = GtfsStatic.from_zip(make_zip(PASS_FILES))
    return p


def at(hour: int, minute: int = 0):
    return NOW.replace(hour=hour, minute=minute)


def delayed(trip_id: str, **delays: int) -> bytes:
    """Trip updates with a departure/arrival delay at the stop sequences given (`seq2=300`)."""
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    e = feed.entity.add()
    e.id = "1"
    e.trip_update.trip.trip_id = trip_id
    for key, delay in delays.items():
        u = e.trip_update.stop_time_update.add()
        u.stop_sequence = int(key.removeprefix("seq"))
        u.arrival.delay = u.departure.delay = delay
    return feed.SerializeToString()


def test_a_skipped_station_is_a_pass_between_its_neighbours(provider):
    trip = provider.trip("express", at(7), passes=True)
    assert [(s.kind, s.name) for s in trip.stops] == [
        ("stop", "Stop A"),
        ("stop", "Stop B"),
        ("pass", "Stop C"),
        ("stop", "Stop D"),
    ]
    assert [s.seq for s in trip.stops] == [1, 2, 3, 4]  # renumbered
    c = trip.stops[2]
    assert c.pass_scheduled == at(8, 26)  # halfway along the track from B (08:12) to D (08:40)
    assert c.approx and c.arr_scheduled is None and c.dep_scheduled is None and c.track is None
    assert c.pass_estimated is None and c.delay_s is None  # no realtime: nothing to estimate from
    assert c.stop_id == "t:C" and c.state == "upcoming"


def test_passes_are_opt_in_and_a_local_has_none(provider):
    plain = provider.trip("express", at(7))
    assert [s.kind for s in plain.stops] == ["stop"] * 3 and [s.seq for s in plain.stops] == [1, 2, 3]
    assert all(s.kind == "stop" for s in provider.trip("local", at(7), passes=True).stops)


def test_a_station_off_the_track_is_not_a_pass(provider):
    names = [s.name for s in provider.trip("express", at(7), passes=True).stops]
    assert "Stop E" not in names


def test_a_delayed_trip_shifts_the_pass(provider):
    provider.trip_updates = parse_trip_updates(delayed("express", seq2=300, seq3=300))
    c = provider.trip("express", at(8), passes=True).stops[2]
    assert c.pass_scheduled == at(8, 26) and c.pass_estimated == at(8, 31) and c.delay_s == 300


def test_a_pass_the_train_has_gone_by_is_passed(provider):
    stops = provider.trip("express", at(8, 50), passes=True).stops
    assert [s.state for s in stops] == ["passed"] * 4  # the whole trip is over
    assert provider.trip("express", at(8, 20), passes=True).stops[2].state == "upcoming"
    assert provider.trip("express", at(8, 30), passes=True).stops[2].state == "passed"  # past its 08:26 by the clock


def test_a_live_amtrak_train_gets_the_passes_of_its_scheduled_trip(tmp_path):
    p = AmtrakerProvider(SourceConfig(id="amtrak", name="Amtrak", agency="Amtrak", kind="amtraker"), tmp_path)
    p.static = GtfsStatic.from_zip(make_zip(PASS_FILES))
    p.on_static_loaded()
    p.state.realtime_polled = True
    train = {
        "trainID": "171-13",
        "trainNum": "171",
        "routeName": "Line",
        "trainState": "Active",
        "lat": 39.07,
        "lon": -77.0,
        "updatedAt": NOW.isoformat(),
        "lastValTS": NOW.isoformat(),
        "stations": [
            live_stop("A", None, at(8, 0), None, at(8, 0), "Departed"),
            live_stop("B", at(8, 10), at(8, 12), at(8, 10), at(8, 12), "Departed"),
            live_stop("D", at(8, 40), None, at(8, 45), None, "Enroute"),
        ],
    }
    p.trains = [train]
    p.match_trips(NOW.replace(hour=8, minute=15))
    trip = p.trip("171-13", at(8, 15), passes=True)
    assert [(s.kind, s.stop_id) for s in trip.stops] == [
        ("stop", "amtrak:A"),
        ("stop", "amtrak:B"),
        ("pass", "amtrak:C"),
        ("stop", "amtrak:D"),
    ]
    assert trip.stops[2].pass_estimated is not None and trip.stops[2].state == "upcoming"
    assert all(s.kind == "stop" for s in p.trip("171-13", at(8, 15)).stops)
    p.trains = [{**train, "trainID": "999-13", "trainNum": "999"}]  # matches no scheduled trip: no passes
    p.match_trips(at(8, 15))
    assert all(s.kind == "stop" for s in p.trip("999-13", at(8, 15), passes=True).stops)


def test_pass_points_are_cached_per_stopping_pattern(provider):
    trip, legs = provider.static.trips["express"], provider.legs("express", NOW.date())
    first = provider.pass_points(trip, legs)
    assert provider.pass_points(trip, legs) is first and [p.station_id for p in first] == ["C"]

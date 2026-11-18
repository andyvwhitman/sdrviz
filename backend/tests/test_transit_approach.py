"""Trains passing a spot: the pure helpers, then the engine over a small straight line, then the API."""

from datetime import datetime, timedelta

import pytest
from google.transit import gtfs_realtime_pb2

from app.transit import SourceConfig, TransitService
from app.transit.amtraker import AmtrakerProvider
from app.transit.approach import (
    AT_SPOT_M,
    V_MAX_MS,
    Spot,
    bracket,
    compass,
    moving_speed_ms,
    reconcile,
    state_of,
)
from app.transit.gtfs_provider import GtfsProvider
from app.transit.gtfs_rt import parse_trip_updates, parse_vehicle_positions
from app.transit.gtfs_static import GtfsStatic
from app.transit.lines import LineIndex
from app.transit.models import Approaching
from app.transit.source_store import SourceStore

from .test_transit import NOW, PLACES, make_zip
from .test_transit_passes import PASS_FILES, delayed

NY = NOW.tzinfo
# On the line A-B-C-D (north-south, 5.5 km apart): 39.085 is 3.9 km north of B and 1.7 km south of C.
SPOT = (39.085, -77.0)


def at(hour: int, minute: int = 0, second: int = 0) -> datetime:
    return NOW.replace(hour=hour, minute=minute, second=second)


def spot_at(now=NOW, *, ahead=60, back=10, scheduled=True, radius_m=2000, near=SPOT) -> Spot:
    return Spot(*near, radius_m, now, now - timedelta(minutes=back), now + timedelta(minutes=ahead), scheduled)


# --- pure helpers ----------------------------------------------------------------------------


def test_bracket_finds_the_leg_and_the_share_of_it():
    assert bracket([0, 1000, 3000], 2000) == (1, 0.5)
    assert bracket([0, 1000, 3000], 1000) == (1, 0.0)
    assert bracket([0, 1000, 3000], 3000) == (1, 1.0)  # the last stop closes the last leg
    assert bracket([0, 1000, 3000], 3300) == (1, 1.0)  # just past the end: clamped to it
    assert bracket([0, 1000, 3000], 3500) is None  # the trip ends before the spot
    assert bracket([0, 1000, 3000], -500) is None
    assert bracket([500, 500], 500) == (0, 0.0)  # two stops at one place: no division by zero
    assert bracket([100], 100) is None


@pytest.mark.parametrize(
    ("bearing", "cardinal", "label"),
    [
        (0, "N", "NB"),
        (45, "NE", "NB"),  # the Northeast Corridor runs north-east and is still northbound
        (225, "SW", "SB"),
        (90, "E", "EB"),
        (280, "W", "WB"),
        (359, "N", "NB"),
        (None, None, None),
    ],
)
def test_compass_names(bearing, cardinal, label):
    assert compass(bearing) == (cardinal, label)


def test_state_follows_the_eta():
    assert [state_of(s) for s in (600, 61, 60, 0, -60, -61)] == [
        "approaching",
        "approaching",
        "at_spot",
        "at_spot",
        "at_spot",
        "passed",
    ]


def test_speed_is_the_trains_own_only_when_moving():
    assert moving_speed_ms(60, 40) == pytest.approx(60 * 0.44704)
    assert moving_speed_ms(0, 40) == pytest.approx(40 * 0.44704)  # standing: use the typical speed
    assert moving_speed_ms(None, 40) == pytest.approx(40 * 0.44704)
    assert moving_speed_ms(300, 40) == V_MAX_MS  # a bad reading is capped


def test_reconcile_leaves_a_possible_eta_alone():
    eta = NOW + timedelta(minutes=10)
    assert reconcile(eta, NOW, 10_000, 60, 40) == (eta, False)  # 10 km in 10 minutes
    assert reconcile(NOW - timedelta(minutes=5), NOW, -8_000, 60, 40)[1] is False


def test_reconcile_holds_an_eta_to_the_position():
    # the feed says it is here in a minute; the train is 20 km away: not before 20 km at the speed limit
    eta, moved = reconcile(NOW + timedelta(minutes=1), NOW, 20_000, 60, 40)
    assert moved and eta == NOW + timedelta(seconds=20_000 / moving_speed_ms(60, 40))
    assert eta >= NOW + timedelta(seconds=20_000 / V_MAX_MS)
    # a train crawling at the moment of the fix is not assumed to crawl the whole way: typical speed is the floor
    eta, _ = reconcile(NOW + timedelta(minutes=1), NOW, 20_000, 15, 40)
    assert eta == NOW + timedelta(seconds=20_000 / moving_speed_ms(0, 40))
    # the feed says it passed a minute ago; the train is 20 km before the spot
    eta, moved = reconcile(NOW - timedelta(minutes=1), NOW, 20_000, None, 40)
    assert moved and eta > NOW
    # it says due in ten minutes but the train stands at the spot
    assert reconcile(NOW + timedelta(minutes=10), NOW, AT_SPOT_M - 1, 0, 40) == (NOW, True)
    # it says it passed ten minutes ago, but the train is 10 km short of the spot... and one 10 km beyond it
    eta, moved = reconcile(NOW + timedelta(minutes=10), NOW, -10_000, 60, 40)
    assert moved and eta < NOW


# --- the engine over a straight line ------------------------------------------------------------


@pytest.fixture
def provider(tmp_path) -> GtfsProvider:
    p = GtfsProvider(SourceConfig(id="t", name="Test", agency="Test"), tmp_path)
    p.static = GtfsStatic.from_zip(make_zip(PASS_FILES))
    p.index = LineIndex.build(p.static)
    p.state.realtime_polled = True
    return p


def stations_for(provider, spot: Spot) -> Spot:
    from dataclasses import replace

    return replace(spot, stations=tuple(sorted(provider.stations_near(spot.lat, spot.lon, 25_000))))


def rows(provider, now=NOW, **kwargs):
    return provider.approaching(stations_for(provider, spot_at(now, **kwargs)))


def position(trip_id: str, lat: float, bearing=0.0, speed=20.0, age=10, now=NOW) -> bytes:
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    e = feed.entity.add()
    e.id = "v"
    v = e.vehicle
    if trip_id:
        v.trip.trip_id = trip_id
    v.vehicle.id = f"cab-{trip_id or 'x'}"
    v.position.latitude, v.position.longitude, v.position.speed = lat, -77.0, speed
    if bearing is not None:
        v.position.bearing = bearing
    v.timestamp = int((now - timedelta(seconds=age)).timestamp())
    return feed.SerializeToString()


def test_scheduled_trains_come_in_time_order_with_station_and_direction(provider):
    found = rows(provider)
    assert [r.train for r in found if r.train in ("100", "171")] == ["100", "171"]
    local, express = found[0], found[1]
    assert local.eta == at(8, 17)  # B 08:10, C 08:20: 3.9 of the 5.5 km from B
    # the express runs B 08:12 to D 08:40 without stopping at C: 35% of that leg is 9 minutes 48
    assert abs((express.eta - at(8, 21, 48)).total_seconds()) <= 2
    assert (local.state, local.basis, local.eta_basis) == ("approaching", "schedule", "schedule")
    assert local.scheduled == local.eta and local.delay_s is None and local.status == "unknown"
    assert local.vehicle is None and local.vehicle_id is None and local.to_go_km is None
    assert local.direction.model_dump() == {"bearing": 0, "cardinal": "N", "label": "NB", "toward": "Stop D"}
    assert (local.between.previous, local.between.next) == ("Stop B", "Stop C")
    assert local.pass_distance_m < 5 and local.trip_id == "t:local" and local.key == f"t:local@{NOW.date()}"
    # the nearest station to the spot is C; the local calls there, the express runs through
    assert (local.station.name, local.station.stops, local.station.eta) == ("Stop C", True, at(8, 20))
    assert (express.station.name, express.station.stops) == ("Stop C", False)
    assert abs((express.station.eta - at(8, 26)).total_seconds()) <= 2  # half the way from B to D


def test_window_and_radius_cut_the_list(provider):
    assert [r.train for r in rows(provider, ahead=20)] == ["100"]  # 08:17 is in, 08:22 is not
    assert rows(provider, ahead=5) == []
    assert rows(provider, radius_m=100, near=(39.085, -76.99)) == []  # 900 m off the line
    assert rows(provider, near=(39.085, -76.99))  # ...but inside the default 2 km
    assert rows(provider, near=(40.0, -77.0)) == []  # nowhere near


def test_trains_with_no_realtime_can_be_left_out(provider):
    assert rows(provider, scheduled=False) == []
    provider.trip_updates = parse_trip_updates(delayed("local", seq1=0))
    assert [r.train for r in rows(provider, scheduled=False)] == ["100"]


def test_a_passed_train_is_listed_for_the_back_window(provider):
    found = rows(provider, at(8, 20), back=10)
    local = next(r for r in found if r.train == "100")
    assert (local.state, local.eta_in_s) == ("passed", -3 * 60)  # 08:17, now 08:20
    assert "100" not in [r.train for r in rows(provider, at(8, 30), back=10)]


def test_a_delay_moves_the_eta_and_agrees_with_it(provider):
    provider.trip_updates = parse_trip_updates(delayed("local", seq2=300, seq3=300, seq4=300))
    local = next(r for r in rows(provider) if r.train == "100")
    assert local.eta == at(8, 22) and local.scheduled == at(8, 17)
    assert (local.delay_s, local.status, local.eta_basis) == (300, "late", "realtime")
    assert local.delay_s == (local.eta - local.scheduled).total_seconds()
    assert local.basis == "estimated" and local.vehicle.position == "estimated"  # a trip update, no GPS


def test_a_cancelled_trip_is_not_listed(provider):
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    e = feed.entity.add()
    e.id = "1"
    e.trip_update.trip.trip_id = "local"
    e.trip_update.trip.schedule_relationship = gtfs_realtime_pb2.TripDescriptor.CANCELED
    provider.trip_updates = parse_trip_updates(feed.SerializeToString())
    assert [r.train for r in rows(provider)] == ["171"]


def test_a_live_position_beats_a_delay_that_cannot_be_true(provider):
    # 28 minutes early at C puts the local at the spot at 07:57; its GPS says it is still at stop B, 3.9 km short
    provider.trip_updates = parse_trip_updates(delayed("local", seq1=0, seq2=0, seq3=-1700, seq4=-1700))
    provider.positions = parse_vehicle_positions(position("local", 39.05, speed=20))
    local = next(r for r in rows(provider) if r.train == "100")
    assert local.eta_basis == "position" and local.basis == "live"
    gap = local.to_go_km * 1000
    assert 3_800 < gap < 4_000
    assert abs((local.eta - NOW).total_seconds() - gap / 20) <= 4  # at its own 20 m/s
    assert local.delay_s == round((local.eta - local.scheduled).total_seconds())  # the delay follows the ETA
    assert local.vehicle.speed_mph == pytest.approx(44.7, abs=0.1) and local.vehicle.position == "realtime"


def test_a_delay_that_the_position_allows_is_kept(provider):
    provider.trip_updates = parse_trip_updates(delayed("local", seq1=0, seq2=0, seq3=0, seq4=0))
    provider.positions = parse_vehicle_positions(position("local", 39.05, speed=20))
    local = next(r for r in rows(provider) if r.train == "100")
    assert (local.eta_basis, local.delay_s, local.eta) == ("realtime", 0, at(8, 17))


def test_a_stale_position_is_flagged_and_does_not_move_the_eta(provider):
    provider.trip_updates = parse_trip_updates(delayed("local", seq1=0, seq2=0, seq3=-1700, seq4=-1700))
    provider.positions = parse_vehicle_positions(position("local", 39.05, age=700))
    [local] = [r for r in rows(provider, back=30) if r.train == "100"]
    assert (local.basis, local.vehicle.stale, local.eta_basis) == ("stale", True, "realtime")
    assert local.to_go_km is None


def test_a_train_behind_the_spot_by_position_is_passed(provider):
    provider.trip_updates = parse_trip_updates(delayed("local", seq1=0, seq2=0, seq3=0, seq4=0))
    provider.positions = parse_vehicle_positions(position("local", 39.12, speed=20, now=at(8, 17)))
    local = next(r for r in rows(provider, at(8, 17)) if r.train == "100")
    assert local.state == "passed" and local.eta_in_s < 0


def test_a_live_train_with_no_timetable_is_placed_by_position(provider):
    provider.positions = parse_vehicle_positions(position("", 39.04, bearing=0, speed=20))
    [ghost] = [r for r in rows(provider) if r.trip_id is None]
    assert (ghost.eta_basis, ghost.state, ghost.scheduled, ghost.delay_s) == ("position", "approaching", None, None)
    assert ghost.direction.label == "NB" and ghost.basis == "live"
    assert abs((ghost.eta - NOW).total_seconds() - ghost.to_go_km * 1000 / 20) <= 4  # to_go is rounded
    # heading south it has already left the spot behind it
    provider.positions = parse_vehicle_positions(position("", 39.04, bearing=180, speed=20))
    [ghost] = [r for r in rows(provider, back=30) if r.trip_id is None]
    assert ghost.state == "passed" and ghost.eta < NOW and ghost.direction.label == "SB"
    # standing still: no ETA, but it is listed because it is close
    provider.positions = parse_vehicle_positions(position("", 39.08, bearing=0, speed=0))
    [ghost] = [r for r in rows(provider) if r.trip_id is None]
    assert (ghost.eta, ghost.eta_in_s, ghost.state) == (None, None, "approaching")
    # no heading at all: its direction is not known
    provider.positions = parse_vehicle_positions(position("", 39.08, bearing=None, speed=20))
    [ghost] = [r for r in rows(provider) if r.trip_id is None]
    assert ghost.state == "unknown" and ghost.eta is None


def amtraker_train() -> dict:
    def stop(code, sch, est, status):
        iso = sch.isoformat()
        return {"name": code, "code": code, "bus": False, "schArr": iso, "schDep": iso, "arr": est.isoformat(),
                "dep": est.isoformat(), "status": status, "platform": ""}  # fmt: skip

    return {
        "trainID": "100-13",
        "trainNum": "100",
        "routeName": "Line",
        "trainState": "Active",
        "lat": 39.06,
        "lon": -77.0,
        "heading": "N",
        "velocity": 60.0,
        "origName": "Stop A",
        "destName": "Stop D",
        "updatedAt": NOW.isoformat(),
        "lastValTS": NOW.isoformat(),
        "stations": [
            stop("A", at(8, 0), at(8, 0), "Departed"),
            stop("B", at(8, 10), at(8, 10), "Departed"),
            stop("C", at(8, 20), at(8, 25), "Enroute"),
            stop("D", at(8, 30), at(8, 40), "Enroute"),
        ],
    }


def test_an_amtraker_train_is_matched_to_its_timetable_row(tmp_path):
    p = AmtrakerProvider(SourceConfig(id="amtrak", name="Amtrak", agency="Amtrak", kind="amtraker"), tmp_path)
    p.static = GtfsStatic.from_zip(make_zip(PASS_FILES), route_types=[2])
    p.index = LineIndex.build(p.static)
    p.on_static_loaded()
    p.state.realtime_polled = True
    p.trains = [amtraker_train()]
    p.match_trips(NOW)
    found = {r.train: r for r in rows(p)}
    live = found["100"]
    assert (live.vehicle_id, live.trip_id, live.basis) == ("amtrak:100-13", "amtrak:100-13", "live")
    assert live.key == f"amtrak:100-13@{NOW.date()}" and 0 < live.delay_s < 300
    assert live.delay_s == round((live.eta - live.scheduled).total_seconds())
    assert found["171"].vehicle is None  # the express is only on the timetable
    assert [r for r in p.vehicles(NOW) if not p.tracked(r)] == []


# --- the service and the API ---------------------------------------------------------------------


@pytest.fixture
def live(client, provider):
    rt = client.app.state.rt
    rt.transit = TransitService([], rt.settings.transit_dir, PLACES, SourceStore(rt.db))
    rt.transit.providers["t"] = provider
    rt.transit.configs["t"] = provider.source
    return rt.transit


@pytest.fixture
def frozen(monkeypatch):
    class Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return NOW.astimezone(tz) if tz else NOW

    monkeypatch.setattr("app.transit.service.datetime", Frozen)


def test_service_merges_sources_and_names_the_nearest_line(live, provider):
    result = live.approaching(*SPOT, now=NOW)
    assert [r.train for r in result.trains] == ["100", "171"]
    assert result.position.nearest_line.name == "Line" and result.position.nearest_line.distance_m < 5
    assert result.meta.sources[0].model_dump() == {
        "id": "t", "agency": "Test", "state": "ok", "rt_age_s": None, "trains": 2,
    }  # fmt: skip
    assert result.meta.window_to - result.meta.window_from == timedelta(minutes=70)
    assert [r.train for r in live.approaching(*SPOT, now=NOW, agency="nobody").trains] == []
    assert len(live.approaching(*SPOT, now=NOW, limit=1).trains) == 1
    assert live.approaching(*SPOT, now=NOW, limit=1).meta.truncated


def test_untimed_trains_follow_the_timed_ones(live, provider):
    provider.positions = parse_vehicle_positions(position("", 39.08, bearing=0, speed=0))
    result = live.approaching(*SPOT, now=NOW)
    assert [r.eta is None for r in result.trains] == [False, False, True]


def test_a_spot_far_from_every_line_still_names_the_nearest(live):
    result = live.approaching(39.085, -76.9, now=NOW, radius_m=2000)
    assert result.trains == [] and 4000 < result.position.nearest_line.distance_m < 5000
    assert live.approaching(45.0, -100.0, now=NOW).position.nearest_line is None


def test_warming_sources_are_skipped_and_say_so(live, provider):
    provider.source.rt_trip_updates_url = "http://t/tu"
    provider.state.realtime_polled = False
    result = live.approaching(*SPOT, now=NOW)
    assert result.trains == [] and result.meta.sources[0].state == "warming"


def test_the_endpoint_returns_the_documented_shape(client, live, frozen):
    reply = client.get("/api/transit/approaching?lat=39.085&lon=-77.0")
    assert reply.status_code == 200
    body = reply.json()
    Approaching.model_validate(body)
    assert set(body) == {"generated", "position", "trains", "meta"}
    assert set(body["position"]) == {"lat", "lon", "radius_km", "nearest_line"}
    assert {t["train"] for t in body["trains"]} == {"100", "171"}
    first = body["trains"][0]
    assert first["eta"] == "2026-11-13T08:17:00-05:00" and first["eta_in_s"] == 1020
    assert set(first) == {
        "key", "trip_id", "vehicle_id", "source", "agency", "train", "route_id", "route_name", "headsign", "origin",
        "destination", "state", "eta", "eta_in_s", "scheduled", "delay_s", "status", "delay_suspect", "basis",
        "eta_basis", "pass_distance_m", "to_go_km", "station", "between", "direction", "vehicle",
    }  # fmt: skip
    assert client.get("/api/transit/approaching?lat=39.085&lon=-77.0&agency=nobody").json()["trains"] == []


def test_the_endpoint_checks_its_parameters(client, live):
    for query in ("lat=91&lon=0", "lat=0&lon=181", "lat=0", "lat=0&lon=0&radius_km=0", "lat=0&lon=0&radius_km=26",
                  "lat=0&lon=0&ahead_min=0", "lat=0&lon=0&back_min=61", "lat=0&lon=0&limit=501"):  # fmt: skip
        assert client.get(f"/api/transit/approaching?{query}").status_code == 422, query


def test_the_endpoint_is_503_when_transit_is_off(client):
    assert client.get("/api/transit/approaching?lat=39&lon=-77").status_code == 503

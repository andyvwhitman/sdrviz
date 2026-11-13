"""Transit API: sources in the database, map layers, trips, stations, timetables. Fixture feeds, no network."""

import asyncio
import io
import zipfile
from datetime import timedelta

import httpx
import pytest
from google.transit import gtfs_realtime_pb2

from app.transit import SourceConfig, TransitService
from app.transit.amtraker import AmtrakerProvider
from app.transit.geometry import Path, simplify
from app.transit.gtfs_provider import GtfsProvider, merge_order
from app.transit.gtfs_rt import VehiclePosition, parse_trip_updates, parse_vehicle_positions
from app.transit.gtfs_static import GtfsStatic
from app.transit.lines import LineIndex, level_for
from app.transit.provider import Provider
from app.transit.service import group_stop, thin_stops
from app.transit.source_store import SourceStore
from app.transit.stations import StationGroup, StationGroups, name_key

from .test_transit import FILES, NOW, PLACES, make_positions, make_zip, transport

SHAPES = "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n" + "".join(
    f"S1,{38.90 + 0.30 * i / 10:.4f},{-77.0 + 0.3 * i / 10:.4f},{i}\n" for i in range(11)
)
SHAPED = {
    **FILES,
    "trips.txt": FILES["trips.txt"]
    .replace("trip_short_name\n", "trip_short_name,shape_id,direction_id\n")
    .replace("Train 100\n", "Train 100,S1,0\n")
    .replace("Train 101\n", "Train 101,S1,1\n")
    .replace("Train 102\n", "Train 102,S1,1\n")
    .replace("Train 9\n", "Train 9,S1,0\n"),
    "shapes.txt": SHAPES,
}


def gtfs(tmp_path, files=SHAPED, **source) -> GtfsProvider:
    p = GtfsProvider(SourceConfig(id="t", name="Test", agency="Test", **source), tmp_path)
    p.static = GtfsStatic.from_zip(make_zip(files))
    p.index = LineIndex.build(p.static)
    p.set_places(PLACES)
    return p


# --- geometry and lines -------------------------------------------------------------


def test_simplify_drops_points_on_a_straight_line():
    line = [(38.0 + i * 0.01, -77.0) for i in range(50)]
    assert simplify(line, 20) == [line[0], line[-1]]
    bent = line[:25] + [(38.24, -76.9)] + line[26:]
    assert len(simplify(bent, 20)) > 2


def test_path_locates_and_interpolates():
    path = Path([(38.0, -77.0), (38.1, -77.0), (38.2, -77.0)])
    mid = path.locate(38.1, -77.0)
    lat, lon, bearing = path.at(mid / 2)
    assert (round(lat, 3), round(bearing)) == (38.05, 0)


def test_shapes_become_one_line_per_route_and_stations_have_routes(tmp_path):
    p = gtfs(tmp_path)
    [line] = p.index.lines
    assert len(line.levels[0]) == 1  # four trips share one shape
    assert {s.name for s in p.index.stations} == {
        "UNION STATION MARC Washington",
        "BWI RAIL STATION MARC",
        "Union Station",
    }
    assert all(s.routes == ["R1"] for s in p.index.stations)


def test_route_without_shapes_falls_back_to_stop_sequence(tmp_path):
    p = gtfs(tmp_path, FILES)
    [line] = p.index.lines
    assert len(line.levels[0]) > 0 and all(len(pl) >= 2 for pl in line.levels[0])


def test_tolerance_comes_from_the_box_width():
    assert level_for((-77.2, 38.8, -76.9, 39.0)) == 0
    assert level_for((-79, 37, -75, 40)) == 1
    assert level_for((-125, 24, -66, 50)) == 3


def test_lines_are_clipped_to_the_box(tmp_path):
    p = gtfs(tmp_path)
    inside = p.lines((-77.05, 38.85, -76.95, 38.95))
    assert inside and inside[0].id == "t:R1" and inside[0].kind == "commuter"
    assert p.lines((10, 10, 11, 11)) == []


def test_lines_cache_is_reused(tmp_path):
    zip_path = tmp_path / "t-gtfs.zip"
    zip_path.write_bytes(make_zip())
    p = Provider(SourceConfig(id="t", name="T", agency="T", kind="lines"), tmp_path)
    static, index = p._build(zip_path)
    assert static is None and index.lines
    assert (tmp_path / "t-lines.json").exists()
    _, again = p._build(zip_path)
    assert [ln.route_id for ln in again.lines] == [ln.route_id for ln in index.lines]


def test_nested_zip_and_padded_csv_are_read(tmp_path):
    inner = make_zip(
        {**FILES, "routes.txt": "route_id, route_short_name, route_long_name, route_type\nR1, T, PENN, 2\n"}
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("google_bus.zip", b"junk")
        archive.writestr("google_rail.zip", inner)
    feed = GtfsStatic.from_zip(buffer.getvalue(), route_types=[2], full=False)
    assert feed.routes["R1"].name == "PENN" and feed.route_stops["R1"]


def test_route_type_filter_drops_other_routes():
    files = {**FILES, "routes.txt": FILES["routes.txt"] + "BUS,1,B,Bus,3\n"}
    assert set(GtfsStatic.from_zip(make_zip(files), route_types=[2]).routes) == {"R1"}


def test_excluded_routes_vanish_with_their_trips_and_stops():
    files = {
        **FILES,
        "routes.txt": FILES["routes.txt"] + "X1,1,X,MARC copy,2\n",
        "trips.txt": FILES["trips.txt"] + "XT,X1,WK,ELSEWHERE,Train 7\n",
        "stops.txt": FILES["stops.txt"] + "XS,Only Excluded,39.5,-77.5,0,\n",
        "stop_times.txt": FILES["stop_times.txt"] + "XT,09:00:00,09:00:00,XS,1\nXT,10:00:00,10:00:00,U,2\n",
    }
    both = GtfsStatic.from_zip(make_zip(files))
    feed = GtfsStatic.from_zip(make_zip(files), exclude_routes=["X1"])
    assert set(both.routes) == {"R1", "X1"} and "XT" in both.trips
    assert set(feed.routes) == {"R1"} and "XT" not in feed.trips and "XT" not in feed.stop_times
    assert "XS" not in feed.station_of and "XS" in both.station_of


def test_excluded_routes_are_ignored_in_realtime_positions(tmp_path):
    p = gtfs(tmp_path, exclude_routes=["X1"])
    p.positions = [
        VehiclePosition("a", "Train100", "R1", 39.0, -76.8, None, None, NOW),
        VehiclePosition("b", "XT", "X1", 39.0, -76.8, None, None, NOW),
    ]
    assert [v.id for v in p.vehicles(NOW) if v.position == "realtime"] == ["t:a"]


def test_source_exclude_routes_roundtrip_and_amtrak_default(client):
    store = SourceStore(client.app.state.rt.db)
    store.seed_defaults()
    assert {s.id: s.exclude_routes for s in store.load()}["amtrak"] == ["42985", "42948"]


def test_migration_adds_and_backfills_exclude_routes_once(tmp_path):
    from sqlalchemy import text

    from app.db import make_engine

    engine = make_engine(tmp_path / "old.sqlite")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE transit_source (id TEXT PRIMARY KEY, name TEXT)"))
        conn.execute(text("INSERT INTO transit_source VALUES ('amtrak', 'Amtrak'), ('marc', 'MARC')"))
    store = SourceStore(engine)
    store.migrate()
    store.migrate()  # second run changes nothing
    with engine.begin() as conn:
        rows = dict(conn.execute(text("SELECT id, exclude_routes FROM transit_source")).all())
        assert rows == {"amtrak": '["42985", "42948"]', "marc": None}
        conn.execute(text("UPDATE transit_source SET exclude_routes = NULL"))
    store.migrate()
    with engine.begin() as conn:
        assert conn.execute(text("SELECT exclude_routes FROM transit_source WHERE id = 'amtrak'")).scalar() is None


def test_stale_threshold_defaults_and_backfill(tmp_path):
    from sqlalchemy import text

    from app.db import make_engine

    other = SourceConfig(id="o", name="O", agency="O")
    assert other.stale_after_s == 120
    assert SourceConfig(id="o", name="O", agency="O", rt_poll_s=90).stale_after_s == 180
    assert SourceConfig(id="o", name="O", agency="O", stale_after_s=45).stale_after_s == 45
    engine = make_engine(tmp_path / "old.sqlite")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE transit_source (id TEXT PRIMARY KEY, name TEXT)"))
        conn.execute(text("INSERT INTO transit_source VALUES ('amtrak', 'A'), ('marc', 'M'), ('lirr', 'L')"))
    store = SourceStore(engine)
    store.migrate()
    with engine.begin() as conn:
        conn.execute(text("UPDATE transit_source SET stale_after_s = 77 WHERE id = 'marc'"))
    store.migrate()  # keeps the value a user set
    with engine.begin() as conn:
        rows = dict(conn.execute(text("SELECT id, stale_after_s FROM transit_source")).all())
    assert rows == {"amtrak": 360, "marc": 77, "lirr": None}


def test_wide_views_thin_the_stops():
    from app.transit.models import Stop

    stops = [
        Stop(id=f"a:{i}", source="a", name=str(i), lat=40 + i * 0.001, lon=-75, kind="commuter", routes=[])
        for i in range(30)
    ] + [Stop(id="b:1", source="b", name="Big", lat=40.0001, lon=-75, kind="intercity", routes=["x"])]
    kept = thin_stops(stops, (-125, 24, -66, 50))
    assert len(kept) == 1 and kept[0].id == "b:1"  # one per cell, intercity first
    assert len(thin_stops(stops, (-75.1, 39.9, -74.9, 40.1))) == 31


# --- trips, stations, timetables ------------------------------------------------------


def delayed_updates(late_s=300) -> bytes:
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    e = feed.entity.add()
    e.id = "1"
    e.trip_update.trip.trip_id = "Train101"
    for seq in (1, 2):
        u = e.trip_update.stop_time_update.add()
        u.stop_sequence = seq
        u.arrival.delay = u.departure.delay = late_s
    return feed.SerializeToString()


def test_trip_has_states_estimates_and_delay(tmp_path):
    p = gtfs(tmp_path)
    p.trip_updates = parse_trip_updates(delayed_updates())
    trip = p.trip("Train101", NOW)
    assert trip.id == "t:Train101" and trip.train == "101" and trip.service_date == "2026-11-13"
    first, last = trip.stops
    assert first.state == "passed" and last.state == "next"
    assert last.dep_scheduled == NOW.replace(hour=8, minute=40)
    assert last.arr_estimated == NOW.replace(hour=8, minute=45) and last.delay_s == 300
    assert first.track == "4"  # the platform stop is named for its track
    assert p.trip("nope", NOW) is None


def test_station_board_has_departures_arrivals_and_routes(tmp_path):
    p = gtfs(tmp_path)
    p.trip_updates = parse_trip_updates(delayed_updates())
    board = p.station_board("PARENT", NOW, timedelta(minutes=60), timedelta(hours=3))
    assert board.stop.id == "t:PARENT" and board.stop.routes == ["t:R1"]
    assert [r.id for r in board.routes] == ["t:R1"]
    assert [(r.train, r.state) for r in board.departures] == [("101", "passed")]  # 07:45; 102 left two hours ago
    assert board.departures[0].headsign == "BWI RAIL STATION MARC"
    union = p.station_board("U", NOW, timedelta(minutes=60), timedelta(hours=3))
    assert [(r.train, r.state, r.headsign) for r in union.arrivals] == [("100", "upcoming", "BWI RAIL STATION MARC")]
    # a child platform resolves to its parent station; unknown stops give None
    assert p.station_board("T4", NOW, timedelta(hours=1), timedelta(hours=1)).stop.id == "t:PARENT"
    assert p.station_board("zzz", NOW, timedelta(hours=1), timedelta(hours=1)) is None


def test_timetable_groups_trips_by_direction(tmp_path):
    p = gtfs(tmp_path)
    table = p.timetable("R1", NOW.date())
    assert {d.id for d in table.directions} == {0, 1}
    down = next(d for d in table.directions if d.id == 1)
    assert [t.train for t in down.trips] == ["102", "101"]  # by first departure
    assert "BWI RAIL STATION MARC" in [s.name for s in down.stops]
    assert NOW.replace(hour=6, minute=0) in down.trips[0].times
    assert p.timetable("nope", NOW.date()) is None


def test_merge_order_slots_extra_stops_after_their_neighbour():
    assert merge_order([["a", "b", "c", "d"], ["a", "x", "d"]]) == ["a", "x", "b", "c", "d"]


# --- vehicles: estimated positions and derived motion ----------------------------------


def test_trip_without_a_position_is_estimated_along_the_shape(tmp_path):
    p = gtfs(tmp_path, rt_trip_updates_url="http://t/tu")
    p.trip_updates = parse_trip_updates(delayed_updates(0))
    p.state.realtime_updated = NOW
    [v] = p.vehicles(NOW.replace(hour=8, minute=0, second=0))
    assert v.position == "estimated" and v.trip_id == "t:Train101" and v.id == "t:Train101"
    # Train101 leaves Union 07:45 and reaches BWI 08:40: at 08:00 it is a little way up the line
    assert 38.89 < v.lat < 39.2 and v.speed_mph > 0 and v.bearing is not None
    assert (v.origin, v.destination) == ("Union Station", "BWI RAIL STATION MARC")
    assert v.next_stop.name == "BWI RAIL STATION MARC" and v.status == "on_time" and v.age_s == 0
    assert p.vehicles(NOW.replace(hour=9)) == []  # arrived


def test_realtime_vehicle_gets_trip_link_next_stop_and_age(tmp_path):
    from app.transit.gtfs_rt import parse_vehicle_positions

    p = gtfs(tmp_path)
    p.trip_updates = parse_trip_updates(delayed_updates(0))
    p.positions = parse_vehicle_positions(make_positions(NOW - timedelta(seconds=30)))
    [v] = [v for v in p.vehicles(NOW) if v.position == "realtime"]
    assert v.position == "realtime" and v.trip_id == "t:Train100" and v.age_s == 30
    assert v.origin == "BWI RAIL STATION MARC" and v.destination == "UNION STATION MARC Washington"
    assert v.next_stop.name == "UNION STATION MARC Washington" and v.next_stop.stop_id == "t:U"


def test_speed_is_derived_from_successive_positions(tmp_path):
    p = gtfs(tmp_path)
    t0 = NOW - timedelta(minutes=2)
    p.motion.observe("cab", 39.0, -76.8, t0)
    p.motion.observe("cab", 39.0, -76.78, t0 + timedelta(minutes=1))  # ~1.7 km in a minute: ~64 mph
    assert 55 < p.motion.speed_mph("cab") < 75
    assert 85 < p.motion.bearing("cab") < 95
    p.motion.observe("cab", 39.0, -76.78, t0 + timedelta(minutes=2))
    assert p.motion.speed_mph("cab") == 0.0


# --- Amtraker matched to Amtrak's GTFS ---------------------------------------------------


AMTRAK_FILES = {
    "agency.txt": "agency_id,agency_name,agency_url,agency_timezone\n1,Amtrak,http://x,America/New_York\n",
    "routes.txt": "route_id,route_short_name,route_long_name,route_type\nR9,,Northeast Regional,2\nBUS,,Thruway,3\n",
    "stops.txt": (
        "stop_id,stop_name,stop_lat,stop_lon\n"
        "WAS,Washington Union Station,38.8970,-77.0064\nBWI,BWI Airport,39.1925,-76.6947\n"
    ),
    "calendar.txt": FILES["calendar.txt"],
    "trips.txt": "route_id,service_id,trip_id,trip_short_name,direction_id,trip_headsign\nR9,WK,g171,171,0,Boston\n",
    "stop_times.txt": (
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
        "g171,07:30:00,07:30:00,BWI,1\ng171,08:30:00,08:30:00,WAS,2\n"
    ),
}


def live_train():
    def stop(code, name, sch, est, status):
        return {
            "name": name,
            "code": code,
            "bus": False,
            "schArr": sch,
            "schDep": sch,
            "arr": est,
            "dep": est,
            "status": status,
            "platform": "9" if code == "WAS" else "",
        }

    return {
        "trainID": "171-13",
        "trainNum": "171",
        "routeName": "Northeast Regional",
        "trainState": "Active",
        "lat": 39.0,
        "lon": -76.8,
        "heading": "SW",
        "velocity": 80.0,
        "origName": "BWI Airport",
        "destName": "Boston",
        "updatedAt": NOW.isoformat(),
        "lastValTS": NOW.isoformat(),
        "stations": [
            stop("BWI", "BWI Airport", "2026-11-13T07:30:00-05:00", "2026-11-13T07:30:00-05:00", "Departed"),
            stop(
                "WAS", "Washington Union Station", "2026-11-13T08:30:00-05:00", "2026-11-13T08:45:00-05:00", "Enroute"
            ),
        ],
    }


@pytest.fixture
def amtrak_gtfs(tmp_path) -> AmtrakerProvider:
    source = SourceConfig(id="amtrak", name="Amtrak", agency="Amtrak", kind="amtraker", route_types=[2])
    p = AmtrakerProvider(source, tmp_path)
    p.static = GtfsStatic.from_zip(make_zip(AMTRAK_FILES), route_types=[2])
    p.index = LineIndex.build(p.static)
    p.on_static_loaded()
    p.trains = [live_train()]
    p.state.realtime_polled = True
    p.match_trips(NOW)
    return p


def test_amtrak_vehicle_links_trip_route_and_next_stop(amtrak_gtfs):
    [v] = amtrak_gtfs.vehicles(NOW)
    assert (v.trip_id, v.route_id, v.delay_s, v.status) == ("amtrak:171-13", "amtrak:R9", 900, "late")
    assert (v.origin, v.destination, v.next_stop.stop_id) == ("BWI Airport", "Boston", "amtrak:WAS")
    assert v.position == "realtime" and v.age_s == 0


def test_amtrak_live_trip_uses_amtrakers_stops(amtrak_gtfs):
    trip = amtrak_gtfs.trip("171-13", NOW)
    assert [s.state for s in trip.stops] == ["passed", "next"]
    assert trip.stops[1].delay_s == 900 and trip.stops[1].track == "9" and trip.vehicle.train == "171"


def test_amtrak_station_board_overlays_live_estimates(amtrak_gtfs):
    board = amtrak_gtfs.station_board("WAS", NOW, timedelta(hours=1), timedelta(hours=3))
    [row] = board.arrivals
    assert (row.trip_id, row.delay_s, row.track, row.headsign) == ("amtrak:171-13", 900, "9", "BWI Airport")
    assert [r.name for r in board.routes] == ["Northeast Regional"]


# --- sources: the database, live apply, refresh ---------------------------------------------


def test_defaults_are_seeded_once(client):
    rt = client.app.state.rt
    store = SourceStore(rt.db)
    assert store.seed_defaults() is True
    ids = {s.id: s for s in store.load()}
    assert ids["amtrak"].enabled and ids["amtrak"].static_url == "https://content.amtrak.com/content/gtfs/GTFS.zip"
    assert ids["amtrak"].route_types == [2] and ids["marc"].enabled and not ids["vre"].enabled
    assert ids["lirr"].kind == "lines" and ids["lirr"].enabled
    store.delete("lirr")
    assert store.seed_defaults() is False and "lirr" not in {s.id for s in store.load()}


@pytest.fixture
def live(client):
    rt = client.app.state.rt
    rt.transit = TransitService([], rt.settings.transit_dir, PLACES, SourceStore(rt.db))
    return rt.transit


def source_body(**over):
    return {"id": "x", "name": "X", "agency": "X Rail", "kind": "gtfs", "enabled": False, **over}


def test_source_crud_applies_live_and_persists(client, live):
    created = client.post("/api/transit/sources", json=source_body(api_key="secret"))
    assert created.status_code == 201
    body = created.json()
    assert body["api_key"] == "***" and body["status"]["state"] == "disabled"
    assert set(body["status"]) == {
        "state",
        "error",
        "static_loaded_at",
        "static_version",
        "rt_updated_at",
        "counts",
        "timings",
    }
    assert client.post("/api/transit/sources", json=source_body()).status_code == 409

    # the masked key keeps the stored one; null clears it
    client.put("/api/transit/sources/x", json=source_body(api_key="***", name="Renamed"))
    assert live.configs["x"].api_key == "secret" and live.configs["x"].name == "Renamed"
    client.put("/api/transit/sources/x", json=source_body(api_key=None))
    assert live.configs["x"].api_key is None
    assert SourceStore(client.app.state.rt.db).load()[0].name == "X"

    # enabling creates a provider without a restart; disabling removes it
    assert client.put("/api/transit/sources/x", json=source_body(enabled=True)).status_code == 200
    assert "x" in live.providers
    client.put("/api/transit/sources/x", json=source_body(enabled=False))
    assert "x" not in live.providers

    assert client.put("/api/transit/sources/nope", json=source_body(id="nope")).status_code == 404
    assert client.delete("/api/transit/sources/x").status_code == 204
    assert client.delete("/api/transit/sources/x").status_code == 404
    assert client.get("/api/transit/sources").json() == []


def test_source_id_must_be_a_slug(client, live):
    assert client.post("/api/transit/sources", json=source_body(id="Bad Id")).status_code == 422


def test_refresh_redownloads_the_static_feed(tmp_path):
    asyncio.run(_test_refresh(tmp_path))


async def _test_refresh(tmp_path):
    config = SourceConfig(id="t", name="T", agency="T", kind="lines", static_url="http://t/s.zip", route_types=[2])
    service = TransitService([config], tmp_path, [])
    service._client = httpx.AsyncClient(
        transport=transport({"http://t/s.zip": httpx.Response(200, content=make_zip(SHAPED))})
    )
    try:
        result = await service.refresh("t")
    finally:
        await service._client.aclose()
    assert result.status.state == "ok" and result.status.counts.routes == 1 and result.status.counts.stops == 3
    assert result.status.timings.static_load_s is not None
    assert await service.refresh("missing") is None


def test_endpoints_over_the_service(client, live, tmp_path):
    provider = gtfs(tmp_path)
    live.providers["t"] = provider
    live.configs["t"] = provider.source
    bbox = "bbox=-77.3,38.7,-76.5,39.3"
    lines = client.get(f"/api/transit/lines?{bbox}&zoom=1").json()["lines"]
    assert [ln["id"] for ln in lines] == ["t:R1"] and lines[0]["coords"]
    stops = client.get(f"/api/transit/stops?{bbox}").json()["stops"]
    assert {s["id"] for s in stops} == {"t:U", "t:B", "t:PARENT"}
    assert client.get("/api/transit/stops?bbox=nonsense").status_code == 422
    assert client.get("/api/transit/vehicles?bbox=0,0,1,1").json() == []
    assert client.get("/api/transit/trips/t:Train100").status_code == 200
    assert client.get("/api/transit/trips/t:nope").status_code == 404
    board = client.get("/api/transit/stations/t:PARENT?back=60&ahead=240")
    assert board.status_code == 200 and board.json()["stop"]["name"] == "Union Station"
    assert client.get("/api/transit/stations/t:zzz").status_code == 404
    route = client.get("/api/transit/routes/t:R1?date=2026-11-13").json()
    assert route["route"]["name"] == "PENN - WASHINGTON" and len(route["directions"]) == 2
    assert client.get("/api/transit/routes/t:nope").status_code == 404
    stats = client.get("/api/transit/stats").json()
    assert stats["sources"][0]["id"] == "t" and stats["sources"][0]["memory_mb"] >= 0


# --- the schedule lists everything; realtime is overlaid; extras show as added ---------------


def alert_feed() -> bytes:
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    for entity_id, route in (("1", "R1"), ("2", "OTHER")):
        e = feed.entity.add()
        e.id = entity_id
        e.alert.informed_entity.add().route_id = route
        e.alert.header_text.translation.add().text = f"Alert for {route}"
    return feed.SerializeToString()


def added_updates() -> bytes:
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    e = feed.entity.add()
    e.id = "a"
    e.trip_update.trip.trip_id = "Train900"
    e.trip_update.trip.schedule_relationship = gtfs_realtime_pb2.TripDescriptor.ADDED
    for seq, (stop, minute) in enumerate((("B", 20), ("U", 55)), 1):
        u = e.trip_update.stop_time_update.add()
        u.stop_sequence, u.stop_id = seq, stop
        u.arrival.time = u.departure.time = int(NOW.replace(hour=8, minute=minute).timestamp())
    return feed.SerializeToString()


def test_alerts_are_filtered_to_the_sources_routes(tmp_path):
    from app.transit.gtfs_rt import parse_alerts

    p = gtfs(tmp_path)
    p.alert_infos = parse_alerts(alert_feed())
    assert [a.header for a in p.alerts(NOW)] == ["Alert for R1"]
    assert [a.header for a in p.trip("Train100", NOW).alerts] == ["Alert for R1"]
    assert p.alerts_for(NOW, route_id="OTHER") == []  # not one of this source's routes


def test_added_train_shows_on_boards_and_as_a_trip(tmp_path):
    p = gtfs(tmp_path)
    p.trip_updates = parse_trip_updates(added_updates())
    board = p.station_board("U", NOW, timedelta(minutes=30), timedelta(hours=2))
    [row] = [r for r in board.arrivals if r.added]
    assert (row.train, row.state, row.headsign) == ("900", "upcoming", "BWI RAIL STATION MARC")
    trip = p.trip("Train900", NOW)
    assert [s.state for s in trip.stops] == ["next", "upcoming"] and trip.train == "900"


def test_a_whole_scheduled_day_for_any_date(tmp_path):
    p = gtfs(tmp_path)
    saturday = NOW.date() + timedelta(days=1)
    board = p.station_board("U", NOW, timedelta(0), timedelta(0), on=saturday)
    assert [r.train for r in board.arrivals] == ["9"]  # weekday trains skip Saturday; Friday night's 9 arrives 01:10
    friday = p.station_board("U", NOW, timedelta(0), timedelta(0), on=NOW.date())
    assert {r.train for r in friday.arrivals} == {"100", "9"}  # Train100 at 08:10, last night's 9 at 01:10 today
    assert p.trip("Train100", NOW, day=NOW.date() + timedelta(days=7)).service_date == "2026-11-20"


def test_unmatched_live_amtrak_train_is_an_added_row(amtrak_gtfs):
    extra = live_train()
    extra.update(trainID="999-13", trainNum="999")
    amtrak_gtfs.trains.append(extra)
    amtrak_gtfs.match_trips(NOW)
    board = amtrak_gtfs.station_board("WAS", NOW, timedelta(hours=1), timedelta(hours=3))
    assert [(r.train, r.added) for r in board.arrivals] == [("171", False), ("999", True)]
    assert amtrak_gtfs.trip("171-13", NOW).alerts == []


def test_vehicle_carries_its_sources_stale_threshold(tmp_path):
    p = gtfs(tmp_path, stale_after_s=60)
    p.trip_updates = parse_trip_updates(delayed_updates(0))
    p.positions = parse_vehicle_positions(make_positions(NOW - timedelta(seconds=90)))
    [v] = [v for v in p.vehicles(NOW) if v.position == "realtime"]
    assert (v.age_s, v.stale_after_s, v.stale) == (90, 60, True)
    assert v.model_dump()["stale"] is True


# --- station groups ---------------------------------------------------------------------------


def group_service(tmp_path, amtrak) -> TransitService:
    """Amtrak's fixture plus a MARC provider on the shared fixture feed, with WAS and BWI as groups."""
    marc = GtfsProvider(SourceConfig(id="marc", name="MARC", agency="MARC"), tmp_path)
    marc.static = GtfsStatic.from_zip(make_zip(SHAPED))
    marc.index = LineIndex.build(marc.static)
    groups = StationGroups(
        {
            "st:was": StationGroup(
                "st:was", "Washington Union Station", 38.897, -77.0064, {"amtrak": ("WAS",), "marc": ("U", "PARENT")}
            ),
            "st:bwi": StationGroup("st:bwi", "BWI Marshall", 39.1924, -76.6944, {"amtrak": ("BWI",), "marc": ("B",)}),
        }
    )
    service = TransitService([], tmp_path, PLACES, groups=groups)
    service.providers = {"amtrak": amtrak, "marc": marc}
    for p in service.providers.values():
        p.groups = groups
    return service


def test_group_resolves_by_group_id_and_by_any_member(tmp_path, amtrak_gtfs):
    service = group_service(tmp_path, amtrak_gtfs)
    groups = service.groups
    assert groups.resolve("marc", "U") == "st:was" and groups.resolve("marc", "B") == "st:bwi"
    assert groups.resolve("marc", "T4") is None and groups.members("st:was")["amtrak"] == ("WAS",)
    for gid in ("st:was", "ST:WAS", "amtrak:WAS", "marc:U", "marc:PARENT", "marc:T4"):  # T4: a platform of PARENT
        assert service.station(gid, NOW, back_min=60, ahead_min=180).stop.id == "st:was"


def test_group_board_merges_agencies_sorted_with_source(tmp_path, amtrak_gtfs):
    service = group_service(tmp_path, amtrak_gtfs)
    board = service.station("st:was", NOW, back_min=60, ahead_min=180)
    assert board.stop.source == "group" and board.stop.sources == ["amtrak", "marc"]
    assert board.stop.kind == "intercity" and board.stop.name == "Washington Union Station"
    rows = [(r.source, r.agency, r.train) for r in board.arrivals]
    assert ("amtrak", "Amtrak", "171") in rows and ("marc", "MARC", "100") in rows
    assert {r.source for r in board.departures} == {"marc"}  # Train 101 leaves Union; Amtrak's 171 ends here
    times = [r.estimated or r.scheduled for r in board.arrivals]
    assert times == sorted(times)
    assert {r.id for r in board.routes} == {"amtrak:R9", "marc:R1"}
    only = service.station("st:was", NOW, agency="amtrak")
    assert {r.source for r in only.arrivals} == {"amtrak"} and only.departures == []
    assert {r.source for r in service.station("marc:U", NOW, source="marc").arrivals} == {"marc"}


def test_ungrouped_stations_keep_their_ids_and_get_source(tmp_path, amtrak_gtfs):
    service = group_service(tmp_path, amtrak_gtfs)
    service.groups = StationGroups()  # nothing grouped
    board = service.station("marc:U", NOW)
    assert board.stop.id == "marc:U" and {r.source for r in board.arrivals} == {"marc"}
    assert service.station("st:was", NOW) is None


def test_trip_and_next_stop_ids_resolve_to_the_group(tmp_path, amtrak_gtfs):
    service = group_service(tmp_path, amtrak_gtfs)
    trip = service.trip("marc:Train100", NOW)
    assert [s.stop_id for s in trip.stops] == ["st:bwi", "st:was"]
    live = service.trip("amtrak:171-13", NOW)
    assert [s.stop_id for s in live.stops] == ["st:bwi", "st:was"]
    [vehicle] = service.vehicles(NOW)
    assert vehicle.next_stop.stop_id == "st:was"


def test_stops_returns_one_stop_per_group_and_thins(tmp_path, amtrak_gtfs):
    service = group_service(tmp_path, amtrak_gtfs)
    stops = service.stops((-78, 38, -76, 40))
    ids = [s.id for s in stops]
    assert sorted(ids) == sorted(set(ids)) and "st:was" in ids and "st:bwi" in ids
    was = next(s for s in stops if s.id == "st:was")
    assert (was.source, was.kind, was.sources) == ("group", "intercity", ["amtrak", "marc"])
    assert {"amtrak:R9", "marc:R1"} <= set(was.routes)
    assert not [i for i in ids if i in ("amtrak:WAS", "marc:U", "marc:PARENT", "amtrak:BWI", "marc:B")]
    wide = [s.id for s in service.stops((-125, 24, -66, 50))]
    assert len(wide) == 1 and wide[0].startswith("st:")  # thinned to one per cell, and only groups remain


def test_suggestions_pair_ungrouped_stations_across_sources(tmp_path, amtrak_gtfs):
    service = group_service(tmp_path, amtrak_gtfs)
    service.groups = StationGroups({"st:bwi": service.groups.groups["st:bwi"]})  # WAS no longer grouped
    for p in service.providers.values():
        p.groups = service.groups
    found = {(s.a.id, s.b.id): s for s in service.suggestions()}
    assert ("amtrak:WAS", "marc:PARENT") in found  # 50 m apart
    assert found[("amtrak:WAS", "marc:PARENT")].reason == "distance"  # "Union Station" is not the same name
    assert all("BWI" not in s.a.id and s.a.source != s.b.source for s in found.values())
    assert all(s.distance_m <= 1000 for s in found.values())


def test_name_key_ignores_noise_and_order():
    assert name_key("UNION STATION MARC Washington") == name_key("Washington Union Station")
    assert name_key("Aberdeen Amtrak Station") == {"aberdeen"}


def test_seed_is_idempotent_and_the_file_wins(tmp_path):
    from sqlmodel import Session, SQLModel

    from app.db import make_engine
    from app.models import StationMemberRow
    from app.transit.stations import STATIONS_FILE, seed_groups

    engine = make_engine(tmp_path / "g.sqlite")
    SQLModel.metadata.create_all(engine)
    seed_groups(engine)
    with Session(engine) as session:
        session.add(StationMemberRow(source="marc", stop_id="stray", station_id="st:was", method="curated"))
        session.add(StationMemberRow(source="marc", stop_id="11957", station_id="st:was", method="suggested"))
        session.commit()
    seed_groups(engine)
    groups = StationGroups.from_db(engine)
    assert len(groups.groups) == 14 == len(StationGroups.from_file(STATIONS_FILE).groups)
    assert groups.resolve("marc", "stray") is None  # curated rows follow the file
    assert groups.resolve("marc", "11957") is None  # a suggestion is not applied
    assert groups.resolve("amtrak", "WAS") == "st:was" and groups.resolve("marc", "11993") == "st:bwi"
    assert groups.resolve("vre", "00000000000000000000000000000001") == "st:was"


def test_curated_file_members_exist_in_the_cached_feeds():
    """The checked-in members are real stop ids (skipped when the feeds are not cached)."""
    from pathlib import Path

    cache = Path(__file__).parents[2] / "data" / "transit"
    for source in ("amtrak", "marc", "vre"):
        if not (cache / f"{source}-gtfs.zip").exists():
            pytest.skip("feeds not cached")
    stops = {s: set(GtfsStatic.from_zip(cache / f"{s}-gtfs.zip", full=False).stops) for s in ("amtrak", "marc", "vre")}
    for group in StationGroups.from_file().groups.values():
        assert group.members["amtrak"] == (group.id.removeprefix("st:").upper(),)
        for source, ids in group.members.items():
            assert set(ids) <= stops[source], (group.id, source)


def test_stations_endpoints_accept_group_and_member_ids(client, tmp_path, amtrak_gtfs):
    rt = client.app.state.rt
    rt.transit = group_service(tmp_path, amtrak_gtfs)
    merged = client.get("/api/transit/stations/st:was", params={"back": 60, "ahead": 180}).json()
    assert merged["stop"]["id"] == "st:was"
    assert client.get("/api/transit/stations/marc:U").json()["stop"]["id"] == "st:was"
    assert client.get("/api/transit/stations/st:nope").status_code == 404
    only = client.get("/api/transit/stations/st:was", params={"agency": "Amtrak"}).json()
    assert {r["source"] for r in only["arrivals"] + only["departures"]} <= {"amtrak"}
    assert client.get("/api/transit/stops", params={"bbox": "-78,38,-76,40"}).json()["stops"]
    assert isinstance(client.get("/api/transit/stations/suggestions").json(), list)


# --- BE-4: canonical id, station code and short name, board origin and destination ----------------


def test_station_board_names_its_canonical_id(tmp_path, amtrak_gtfs):
    service = group_service(tmp_path, amtrak_gtfs)
    for gid in ("st:was", "amtrak:WAS", "marc:U", "marc:T4"):
        assert service.station(gid, NOW).canonical_id == "st:was"
    plain = TransitService([], tmp_path, PLACES)
    plain.providers = {"amtrak": amtrak_gtfs}
    assert plain.station("amtrak:WAS", NOW).canonical_id == "amtrak:WAS"  # ungrouped: its own id


def test_stops_carry_code_and_short_name(tmp_path, amtrak_gtfs):
    board = group_service(tmp_path, amtrak_gtfs).station("st:was", NOW)
    assert (board.stop.code, board.stop.short_name) == ("WAS", None)  # this test group has no short name
    ungrouped = amtrak_gtfs.station_board("WAS", NOW, timedelta(hours=1), timedelta(hours=1)).stop
    assert (ungrouped.code, ungrouped.short_name) == ("WAS", None)
    marc_stop = gtfs(tmp_path).station_board("PARENT", NOW, timedelta(hours=1), timedelta(hours=1)).stop
    assert marc_stop.code is None  # only Amtrak stations have a code


def test_every_curated_group_has_a_code_and_short_name(tmp_path):
    from app.transit.stations import load_groups

    groups = load_groups(_engine(tmp_path))
    assert len(groups.groups) == 14
    for group in groups.groups.values():
        assert group.short_name and group.code == group.id.removeprefix("st:").upper()
    assert groups.get("st:was").short_name == "Washington Union"
    assert group_stop(groups.get("st:bal"), []).short_name == "Baltimore Penn"


def _engine(tmp_path):
    from sqlmodel import SQLModel

    from app.db import make_engine

    engine = make_engine(tmp_path / "groups.sqlite")
    SQLModel.metadata.create_all(engine)
    return engine


def test_board_rows_carry_origin_and_destination(amtrak_gtfs, tmp_path):
    board = amtrak_gtfs.station_board("WAS", NOW, timedelta(hours=1), timedelta(hours=3))
    [row] = board.arrivals
    assert (row.origin, row.destination, row.headsign) == ("BWI Airport", "Washington Union Station", "BWI Airport")
    marc = gtfs(tmp_path).station_board("PARENT", NOW, timedelta(hours=1), timedelta(hours=3))
    [leaves] = marc.departures
    assert (leaves.origin, leaves.destination, leaves.headsign) == (
        "Union Station",
        "BWI RAIL STATION MARC",
        leaves.headsign,
    )
    assert leaves.headsign == leaves.destination


# --- BE-7: a platform in Amtraker's payload reaches every board row and trip stop ------------------


def test_amtraker_platform_reaches_boards_and_trips(amtrak_gtfs):
    wide = (timedelta(hours=1), timedelta(hours=3))
    [row] = amtrak_gtfs.station_board("WAS", NOW, *wide).arrivals
    assert row.track == "9"  # board row of the matched live train
    assert amtrak_gtfs.trip("171-13", NOW).stops[1].track == "9"  # its live trip page
    assert amtrak_gtfs.trip("g171", NOW, NOW.date()).stops[1].track == "9"  # the scheduled trip it is matched to
    assert amtrak_gtfs.trip("g171", NOW, NOW.date()).stops[0].track is None  # no platform yet: nothing invented
    other = live_train()
    other.update(trainID="999-13", trainNum="999")  # matches no scheduled trip: an "added" row, straight from Amtraker
    amtrak_gtfs.trains.append(other)
    amtrak_gtfs.match_trips(NOW)
    [added] = [r for r in amtrak_gtfs.station_board("WAS", NOW, *wide).arrivals if r.added]
    assert (added.trip_id, added.track) == ("amtrak:999-13", "9")

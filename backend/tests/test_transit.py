"""Transit: GTFS static + realtime and Amtraker, from small in-memory fixture feeds (no network)."""

import asyncio
import io
import zipfile
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest
from google.transit import gtfs_realtime_pb2

from app.transit import SourceConfig, TransitService
from app.transit.amtraker import STATIONS_URL, AmtrakerProvider
from app.transit.gtfs_provider import GtfsProvider
from app.transit.gtfs_rt import parse_trip_updates, parse_vehicle_positions
from app.transit.gtfs_static import GtfsStatic, seconds
from app.transit.places import Place, StopPoint, assign_stops

NY = ZoneInfo("America/New_York")
# Friday 2026-11-13, 08:00 local
NOW = datetime(2026, 11, 13, 8, 0, tzinfo=NY)

PLACES = [
    Place("union", "Washington Union Station", 38.8973, -77.0063),
    Place("bwi", "BWI Marshall Airport Rail Station", 39.1924, -76.6946),
]

FILES = {
    "agency.txt": "agency_id,agency_name,agency_url,agency_timezone\n1,Test Rail,http://x,America/New_York\n",
    "routes.txt": "route_id,agency_id,route_short_name,route_long_name,route_type\nR1,1,T,PENN - WASHINGTON,2\n",
    "stops.txt": (
        "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\n"
        "U,UNION STATION MARC Washington,38.8990,-77.0068,0,\n"
        "B,BWI RAIL STATION MARC nb,39.1923,-76.6945,0,\n"
        "P,Platform,38.8975,-77.0060,0,PARENT\nPARENT,Union Station,38.8975,-77.0060,1,\n"
        "T4,4,38.8975,-77.0060,0,PARENT\n"
    ),
    "calendar.txt": (
        "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n"
        "WK,1,1,1,1,1,0,0,20260101,20261231\nLATE,1,1,1,1,1,1,1,20260101,20261231\n"
    ),
    "calendar_dates.txt": "service_id,date,exception_type\nWK,20261126,2\n",
    "trips.txt": (
        "trip_id,route_id,service_id,trip_headsign,trip_short_name\n"
        "Train100,R1,WK,WASHINGTON,Train 100\nTrain101,R1,WK,BALTIMORE,Train 101\nTrain102,R1,WK,BALTIMORE,Train 102\n"
        "Night,R1,LATE,WASHINGTON,Train 9\n"
    ),
    "stop_times.txt": (
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
        "Train100,07:00:00,07:00:00,B,1\nTrain100,08:10:00,08:10:00,U,2\n"  # arrives Union 08:10
        "Train101,07:45:00,07:45:00,T4,1\nTrain101,08:40:00,08:40:00,B,2\n"  # left Union 07:45 (15 min ago)
        "Train102,06:00:00,06:00:00,U,1\nTrain102,06:50:00,06:50:00,B,2\n"  # left Union two hours ago
        "Night,24:30:00,24:30:00,B,1\nNight,25:10:00,25:10:00,U,2\n"  # last night's, 00:30 and 01:10 today
    ),
}


def make_zip(files: dict[str, str] = FILES) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, text in files.items():
            archive.writestr(name, text)
    return buffer.getvalue()


def make_trip_updates(*, late_s: int = 0, cancel: str | None = None) -> bytes:
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    e = feed.entity.add()
    e.id = "1"
    e.trip_update.trip.trip_id = "Train100"
    u = e.trip_update.stop_time_update.add()
    u.stop_sequence = 1
    u.departure.delay = late_s
    if cancel:
        c = feed.entity.add()
        c.id = "2"
        c.trip_update.trip.trip_id = cancel
        c.trip_update.trip.schedule_relationship = gtfs_realtime_pb2.TripDescriptor.CANCELED
    return feed.SerializeToString()


def make_positions(timestamp: datetime) -> bytes:
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    e = feed.entity.add()
    e.id = "v1"
    v = e.vehicle
    v.trip.trip_id = "Train100"
    v.vehicle.id = "cab-7"
    v.position.latitude, v.position.longitude, v.position.bearing, v.position.speed = 39.0, -76.8, 225.0, 20.0
    v.timestamp = int(timestamp.timestamp())
    return feed.SerializeToString()


@pytest.fixture
def provider(tmp_path) -> GtfsProvider:
    p = GtfsProvider(SourceConfig(id="t", name="Test", agency="Test"), tmp_path)
    p.static = GtfsStatic.from_zip(make_zip())
    p.set_places(PLACES)
    return p


def board(p, place="union", now=NOW):
    return p.board(place, now, timedelta(minutes=30), timedelta(hours=3))


# --- static ---------------------------------------------------------------


def test_seconds_past_midnight():
    assert seconds("25:10:00") == 90600
    assert seconds("") is None


def test_service_calendar(provider):
    feed = provider.static
    assert feed.services_on(NOW.date()) == {"WK", "LATE"}
    assert feed.services_on(datetime(2026, 11, 14).date()) == {"LATE"}  # Saturday
    assert feed.services_on(datetime(2026, 11, 26).date()) == {"LATE"}  # Thanksgiving: WK removed


def test_trip_number_strips_prefix(provider):
    assert provider.static.trips["Train100"].number == "100"


def test_places_map_to_nearest_stops(provider):
    assert set(provider.place_stops["union"]) == {"U", "T4"}
    assert provider.place_stops["bwi"] == ["B"]


def test_far_stop_needs_a_name_match():
    place = [Place("a", "Odenton", 39.0, -76.7)]
    near_but_wrong = StopPoint("x", "Somewhere Else", 39.004, -76.7)  # about 440 m away
    near_and_named = StopPoint("y", "ODENTON MARC", 39.004, -76.7)
    assert assign_stops(place, [near_but_wrong]) == {}
    assert assign_stops(place, [near_and_named]) == {"a": ["y"]}


# --- board ----------------------------------------------------------------


def test_board_splits_upcoming_and_departed(provider):
    b = board(provider)
    assert [(e.train, e.event) for e in b if e.scheduled > NOW] == [("100", "arrival")]
    assert next(e for e in b if e.train == "100").origin == "BWI RAIL STATION MARC"
    assert [(e.train, e.status) for e in b if e.scheduled <= NOW] == [("101", "departed")]
    # Train 102 left two hours ago and is outside the 30 minute window
    assert "102" not in {e.train for e in b}


def test_board_applies_realtime_delay(provider):
    provider.trip_updates = parse_trip_updates(make_trip_updates(late_s=600))
    entry = next(e for e in board(provider, "union") if e.train == "100")
    assert entry.delay_s == 600  # the delay at the first stop carries forward to Union
    assert entry.estimated == entry.scheduled + timedelta(minutes=10)
    assert entry.status == "delayed"


def test_board_marks_cancelled(provider):
    provider.trip_updates = parse_trip_updates(make_trip_updates(cancel="Train101"))
    entry = next(e for e in board(provider) if e.train == "101")
    assert entry.status == "cancelled"


def test_board_finds_late_night_trip_from_yesterdays_service(provider):
    after_midnight = datetime(2026, 11, 14, 0, 40, tzinfo=NY)
    trains = {e.train for e in provider.board("bwi", after_midnight, timedelta(minutes=30), timedelta(hours=1))}
    assert "9" in trains  # 24:30 on Friday's service = 00:30 Saturday


def test_board_track_is_the_platform_number(provider):
    entry = next(e for e in board(provider) if e.train == "101")  # leaves from platform stop "4"
    assert entry.track == "4"
    assert provider.static.track_of("U") is None


# --- vehicles -------------------------------------------------------------


def test_vehicle_joins_static_and_delay(provider):
    provider.trip_updates = parse_trip_updates(make_trip_updates(late_s=120))
    provider.positions = parse_vehicle_positions(make_positions(NOW))
    [v] = provider.vehicles(NOW)
    assert (v.agency, v.route_name, v.train, v.headsign) == ("Test", "PENN - WASHINGTON", "100", "WASHINGTON")
    assert v.delay_s == 120
    assert v.bearing == 225
    assert v.speed_mph == pytest.approx(44.7, abs=0.1)


def test_stale_vehicle_is_dropped(provider):
    provider.positions = parse_vehicle_positions(make_positions(NOW - timedelta(hours=1)))
    assert provider.vehicles(NOW) == []


def test_realtime_of_other_routes_is_not_ours(provider):
    """A feed covering every mode (MBTA): only entities of the loaded routes are kept."""
    route = next(iter(provider.static.routes))
    assert provider._ours("Train100", None)  # a scheduled trip
    assert provider._ours("unknown", route)  # an added trip on one of our routes
    assert not provider._ours("bus-trip", "bus-77")  # another route
    provider.source = provider.source.model_copy(update={"route_types": [2]})
    assert not provider._ours("unknown", None)  # no route, and the source filters routes
    provider.source = provider.source.model_copy(update={"route_types": None})
    assert provider._ours("unknown", None)  # MARC's added trips carry no route


# --- polling and failure ----------------------------------------------------


def transport(routes: dict[str, httpx.Response | Exception]):
    def handler(request: httpx.Request) -> httpx.Response:
        result = routes[str(request.url)]
        if isinstance(result, Exception):
            raise result
        return result

    return httpx.MockTransport(handler)


SOURCE = SourceConfig(
    id="t",
    name="Test",
    agency="Test",
    static_url="http://t/static.zip",
    rt_trip_updates_url="http://t/tu",
    rt_vehicle_positions_url="http://t/vp",
)


def test_update_downloads_caches_and_reads_realtime(tmp_path):
    asyncio.run(_test_update_downloads_caches_and_reads_realtime(tmp_path))


async def _test_update_downloads_caches_and_reads_realtime(tmp_path):
    p = GtfsProvider(SOURCE, tmp_path)
    p.set_places(PLACES)
    routes = {
        "http://t/static.zip": httpx.Response(200, content=make_zip()),
        "http://t/tu": httpx.Response(200, content=make_trip_updates(late_s=60)),
        "http://t/vp": httpx.Response(200, content=make_positions(datetime.now(NY))),
    }
    async with httpx.AsyncClient(transport=transport(routes)) as client:
        await p.update(client)
    assert p.api_status().state == "ok"
    assert (p.state.stops, p.state.trips, p.state.vehicles, p.state.places) == (3, 4, 1, 2)
    assert (tmp_path / "t-gtfs.zip").exists()


def test_dead_source_fails_soft_and_reports(tmp_path):
    asyncio.run(_test_dead_source_fails_soft_and_reports(tmp_path))


async def _test_dead_source_fails_soft_and_reports(tmp_path):
    p = GtfsProvider(SOURCE, tmp_path)
    routes = {
        "http://t/static.zip": httpx.Response(503),
        "http://t/tu": httpx.ConnectError("down"),
        "http://t/vp": httpx.Response(200, content=b"not a protobuf"),
    }
    async with httpx.AsyncClient(transport=transport(routes)) as client:
        await p.update(client)  # must not raise
    assert p.api_status().state == "error"
    assert "503" in p.state.static_error
    assert "down" in p.state.realtime_error
    assert p.board("union", NOW, timedelta(minutes=30), timedelta(hours=1)) == []
    assert p.vehicles(NOW) == []


def test_stale_cache_is_used_when_the_download_fails(tmp_path):
    asyncio.run(_test_stale_cache_is_used_when_the_download_fails(tmp_path))


async def _test_stale_cache_is_used_when_the_download_fails(tmp_path):
    (tmp_path / "t-gtfs.zip").write_bytes(make_zip())
    p = GtfsProvider(SOURCE.model_copy(update={"static_refresh_h": 0.0}), tmp_path)
    routes = {
        "http://t/static.zip": httpx.Response(500),
        "http://t/tu": httpx.Response(204),
        "http://t/vp": httpx.Response(204),
    }
    async with httpx.AsyncClient(transport=transport(routes)) as client:
        await p.update(client)
    assert p.static is not None and p.state.static_error


# --- Amtraker ---------------------------------------------------------------


def amtrak_train(**over):
    stop = lambda code, sch, est, status, platform="": {  # noqa: E731
        "name": code,
        "code": code,
        "bus": False,
        "schArr": sch,
        "schDep": sch,
        "arr": est,
        "dep": est,
        "status": status,
        "platform": platform,
    }
    train = {
        "trainNum": "171",
        "trainID": "171-12",
        "routeName": "Northeast Regional",
        "lat": 39.0,
        "lon": -76.8,
        "heading": "SW",
        "velocity": 80.5,
        "destName": "Newport News",
        "trainState": "Active",
        "updatedAt": NOW.isoformat(),
        "stations": [
            stop("BWI", "2026-11-13T07:50:00-05:00", "2026-11-13T07:52:00-05:00", "Departed"),
            stop("WAS", "2026-11-13T08:25:00-05:00", "2026-11-13T08:40:00-05:00", "Enroute", "9"),
            stop("NPN", "2026-11-13T12:00:00-05:00", "2026-11-13T12:15:00-05:00", "Enroute"),
        ],
    }
    return {**train, **over}


@pytest.fixture
def amtrak(tmp_path) -> AmtrakerProvider:
    p = AmtrakerProvider(SourceConfig(id="amtrak", name="Amtrak", agency="Amtrak", kind="amtraker"), tmp_path)
    p.stations = {
        "WAS": {"name": "Washington Union", "lat": 38.8973, "lon": -77.0063},
        "BWI": {"name": "BWI Marshall Airport", "lat": 39.1925, "lon": -76.6947},
        "NPN": {"name": "Newport News", "lat": 37.0, "lon": -76.4},
    }
    p.trains = [amtrak_train()]
    p.state.realtime_polled = True
    p.set_places(PLACES)
    return p


def test_amtrak_board_has_track_and_delay(amtrak):
    [entry] = board(amtrak, "union")
    assert (entry.agency, entry.train, entry.headsign, entry.track) == ("Amtrak", "171", "Newport News", "9")
    assert entry.delay_s == 900
    assert entry.status == "delayed"


def test_amtrak_departed_within_window(amtrak):
    [entry] = board(amtrak, "bwi", now=NOW)  # left BWI at 07:52, eight minutes ago
    assert entry.status == "departed"


def test_amtrak_vehicle(amtrak):
    [v] = amtrak.vehicles(NOW)
    assert (v.train, v.bearing, v.speed_mph, v.delay_s) == ("171", 225, 80.5, 900)


def test_amtraker_failure_is_soft(tmp_path):
    asyncio.run(_test_amtraker_failure_is_soft(tmp_path))


async def _test_amtraker_failure_is_soft(tmp_path):
    p = AmtrakerProvider(
        SourceConfig(
            id="amtrak", name="Amtrak", agency="Amtrak", kind="amtraker", rt_vehicle_positions_url="http://a/t"
        ),
        tmp_path,
    )
    routes = {"http://a/t": httpx.Response(500), STATIONS_URL: httpx.ConnectError("no")}
    async with httpx.AsyncClient(transport=transport(routes)) as client:
        await p.update(client)
    assert p.api_status().state == "error"


# --- API ----------------------------------------------------------------------


def test_api_endpoints(client, provider, amtrak):
    rt = client.app.state.rt
    rt.transit = TransitService([], rt.settings.transit_dir, PLACES)
    rt.transit.providers = {"t": provider, "amtrak": amtrak}
    rt.transit.configs = {"t": provider.source, "amtrak": amtrak.source}
    provider.positions = parse_vehicle_positions(make_positions(datetime.now(NY)))
    amtrak.trains[0]["updatedAt"] = datetime.now(NY).isoformat()  # the API checks freshness against the real clock

    sources = client.get("/api/transit/sources").json()
    assert [s["id"] for s in sources] == ["t", "amtrak"]

    vehicles = client.get("/api/transit/vehicles").json()
    assert sorted(v["train"] for v in vehicles) == ["100", "171"]
    assert client.get("/api/transit/vehicles?agency=nobody").json() == []

    response = client.get("/api/transit/stations/union/board?ahead=1440&back=240")
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Washington Union Station"
    assert body["sources"] == ["t", "amtrak"]
    assert "Amtraker" in body["attribution"][0]
    assert client.get("/api/transit/stations/nowhere/board").status_code == 404


def test_api_with_no_sources_is_empty(client):
    assert client.get("/api/transit/sources").json() == []
    assert client.get("/api/transit/vehicles").json() == []
    assert client.get("/api/transit/stations/union/board").status_code == 404


def test_follow_shapes_keeps_an_express_on_the_track():
    """A train that skips the middle stop is drawn along the shape through it, not as a chord."""
    from app.transit.geometry import follow_shapes

    bend = [(0.0, 0.0), (0.0, 0.05), (0.05, 0.05), (0.05, 0.1)]  # an L-shaped track, ~5.5 km legs
    line = follow_shapes([(0.0, 0.0), (0.05, 0.1)], [bend])
    assert (0.0, 0.05) in line and (0.05, 0.05) in line
    assert follow_shapes([(1.0, 1.0), (1.05, 1.1)], [bend]) == [(1.0, 1.0), (1.05, 1.1)]  # no shape near: straight


def test_amtraker_keeps_only_amtrak_trains(amtrak):
    """Amtraker also carries VIA Rail and Brightline: VIA is dropped, Brightline has its own source."""
    trains = {
        "171": [amtrak_train(provider="Amtrak")],
        "v67": [amtrak_train(trainID="v67-13", provider="Via")],
        "1001": [amtrak_train(trainID="1001-13", provider="Brightline")],
    }
    amtrak._stations_at = 1e12  # stations are fresh: only the trains call is made
    routes = {"https://api.amtraker.com/v3/trains": httpx.Response(200, json=trains)}

    async def load():
        async with httpx.AsyncClient(transport=transport(routes)) as client:
            await amtrak._load_realtime(client)

    asyncio.run(load())
    assert [t["trainID"] for t in amtrak.trains] == ["171-12"]


# --- warming ----------------------------------------------------------------------


def test_source_is_warming_until_its_first_realtime_poll(tmp_path):
    asyncio.run(_test_source_is_warming_until_its_first_realtime_poll(tmp_path))


async def _test_source_is_warming_until_its_first_realtime_poll(tmp_path):
    p = GtfsProvider(SOURCE, tmp_path)
    p.static = GtfsStatic.from_zip(make_zip())  # the schedule is in...
    p.positions = parse_vehicle_positions(make_positions(datetime.now(NY)))  # ...and some realtime has arrived
    service = TransitService([], tmp_path, PLACES)
    service.providers, service.configs = {"t": p}, {"t": SOURCE}
    assert p.api_status().state == "warming" and service.sources()[0].status.state == "warming"
    assert service.vehicles() == []  # no partial list while warming
    routes = {
        "http://t/tu": httpx.Response(200, content=make_trip_updates()),
        "http://t/vp": httpx.Response(200, content=make_positions(datetime.now(NY))),
    }
    p._static_at = 1e12  # the schedule is fresh: only realtime is fetched
    async with httpx.AsyncClient(transport=transport(routes)) as client:
        await p.update(client)
    assert p.api_status().state == "ok"
    assert [v.train for v in service.vehicles()] == ["100"]


def test_a_failed_first_poll_ends_warming_with_the_error_shown(tmp_path):
    asyncio.run(_test_a_failed_first_poll_ends_warming(tmp_path))


async def _test_a_failed_first_poll_ends_warming(tmp_path):
    p = GtfsProvider(SOURCE, tmp_path)
    p.static = GtfsStatic.from_zip(make_zip())
    p._static_at = 1e12
    routes = {"http://t/tu": httpx.ConnectError("down"), "http://t/vp": httpx.Response(204)}
    async with httpx.AsyncClient(transport=transport(routes)) as client:
        await p.update(client)
    assert not p.warming and p.api_status().state == "error"

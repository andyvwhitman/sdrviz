"""Automatic station merging (decision 29): an Amtrak and a commuter station within 400 m are one station."""

from pathlib import Path

import pytest
from sqlmodel import SQLModel

from app.db import make_engine
from app.transit import SourceConfig, TransitService
from app.transit.gtfs_static import GtfsStatic
from app.transit.places import distance_m
from app.transit.stations import (
    Candidate,
    StationGroup,
    StationGroups,
    build_groups,
    clear_name,
    load_groups,
    nearest_anchors,
    store_groups,
)

M = 1 / 111_320  # degrees of latitude per metre


def station(source, ident, name="X", north_m=0.0):
    return Candidate(source, ident, name, 40.0 + north_m * M, -75.0)


AMTRAK = Candidate("amtrak", "BOS", "Boston", 40.0, -75.0)


def test_merges_within_the_radius_and_not_beyond():
    near, far = station("mbta", "near", north_m=399), station("mbta", "far", north_m=401)
    groups = build_groups(StationGroups(), [AMTRAK], [near, far])
    assert groups.groups["st:bos"].members == {"amtrak": ("BOS",), "mbta": ("near",)}
    assert groups.resolve("mbta", "far") is None
    assert build_groups(StationGroups(), [AMTRAK], [near], radius_m=100).groups == {}  # the radius is a setting
    assert build_groups(StationGroups(), [AMTRAK], [far], radius_m=500).resolve("mbta", "far") == "st:bos"


def test_an_amtrak_station_takes_only_the_nearest_station_of_each_source():
    a, b = station("marc", "a", north_m=300), station("marc", "b", north_m=100)
    vre = station("vre", "v", north_m=350)
    groups = build_groups(StationGroups(), [AMTRAK], [a, b, vre])
    assert groups.groups["st:bos"].members == {"amtrak": ("BOS",), "marc": ("b",), "vre": ("v",)}
    assert groups.resolve("marc", "a") is None  # left on its own


def test_a_commuter_station_joins_only_its_nearest_amtrak_station():
    north = Candidate("amtrak", "NOR", "North", 40.0 + 600 * M, -75.0)
    between = station("mbta", "mid", north_m=250)  # 250 m from BOS, 350 m from NOR
    groups = build_groups(StationGroups(), [AMTRAK, north], [between])
    assert groups.resolve("mbta", "mid") == "st:bos" and "st:nor" not in groups.groups


def test_station_with_no_commuter_neighbour_stays_alone():
    assert build_groups(StationGroups(), [AMTRAK], [station("mbta", "far", north_m=5000)]).groups == {}


def curated_was() -> StationGroups:
    return StationGroups(
        {"st:bos": StationGroup("st:bos", "Hand Named", 40.0, -75.0, {"amtrak": ("BOS",), "mbta": ("forced",)}, "Hand")}
    )


def test_curated_members_are_forced_and_keep_their_group_unchanged():
    forced = station("mbta", "forced", north_m=2000)  # far outside the radius, but curated
    near = station("mbta", "near", north_m=50)  # the rule's choice: but the curated group already has an MBTA member
    groups = build_groups(curated_was(), [AMTRAK], [forced, near])
    assert groups.groups["st:bos"].members == {"amtrak": ("BOS",), "mbta": ("forced",)}
    assert groups.groups["st:bos"].name == "Hand Named" and groups.groups["st:bos"].short_name == "Hand"
    assert groups.resolve("mbta", "near") is None


def test_curated_group_gains_a_source_it_lacks():
    curated = StationGroups({"st:bos": StationGroup("st:bos", "Hand Named", 40.0, -75.0, {"amtrak": ("BOS",)})})
    groups = build_groups(curated, [AMTRAK], [station("vre", "v", north_m=50)])
    assert groups.groups["st:bos"].members == {"amtrak": ("BOS",), "vre": ("v",)}


def test_blocked_pairs_are_never_merged():
    near = station("mbta", "near", north_m=50)
    blocked = frozenset({("bos", "mbta", "near")})
    assert build_groups(StationGroups(), [AMTRAK], [near], blocked=blocked).groups == {}
    other = Candidate("amtrak", "BBY", "Back Bay", 40.0 + 300 * M, -75.0)  # blocked from BOS, it goes to the next one
    assert build_groups(StationGroups(), [AMTRAK, other], [near], blocked=blocked).resolve("mbta", "near") == "st:bby"


def test_nearest_anchors_reports_distances():
    found = nearest_anchors([AMTRAK], [station("mbta", "m", north_m=100)])
    other, metres = found["BOS"]["mbta"]
    assert other.id == "m" and round(metres) == 100


def test_group_names_prefer_the_telling_name():
    assert clear_name(["Boston", "South Station"]) == "South Station"
    assert clear_name(["Boston", "Back Bay"]) == "Back Bay"
    assert clear_name(["Route 128 Amtrak Station", "Route 128"]) == "Route 128 Station"
    assert clear_name(["Chicago Union Station", "Chicago Union Station"]) == "Chicago Union Station"
    assert clear_name(["Washington", "UNION STATION MARC"]) == "Union Station"  # all caps: title case


def test_auto_groups_are_stored_and_reloaded(tmp_path):
    engine = make_engine(tmp_path / "g.sqlite")
    SQLModel.metadata.create_all(engine)
    curated = load_groups(engine)
    groups = build_groups(curated, [AMTRAK], [station("mbta", "m", north_m=100)])
    store_groups(engine, groups, curated)
    store_groups(engine, groups, curated)  # idempotent
    again = StationGroups.from_db(engine)
    assert again.groups["st:bos"].members == {"amtrak": ("BOS",), "mbta": ("m",)}
    assert again.resolve("amtrak", "WAS") == "st:was"  # the curated groups are still there
    store_groups(engine, build_groups(curated, [AMTRAK], []), curated)  # the merge went away: so does the group
    assert StationGroups.from_db(engine).resolve("mbta", "m") is None


# --- through the service ------------------------------------------------------------------------


def lines_provider(tmp_path, source_id, kind, stations):
    """A provider holding just stations: (id, name, north_m) rows at the same longitude."""
    from app.transit.lines import LineIndex, StationRec
    from app.transit.provider import Provider

    p = Provider(SourceConfig(id=source_id, name=source_id, agency=source_id, kind=kind), tmp_path)
    p.index = LineIndex([], [StationRec(i, name, 40.0 + north * M, -75.0, []) for i, name, north in stations])
    return p


def test_the_service_regroups_when_stations_load(tmp_path):
    amtrak = lines_provider(tmp_path, "amtrak", "amtraker", [("BOS", "Boston", 0), ("BBY", "Boston", 3000)])
    mbta = lines_provider(tmp_path, "mbta", "lines", [("sstat", "South Station", 7), ("bbsta", "Back Bay", 3010)])
    engine = make_engine(tmp_path / "g.sqlite")
    SQLModel.metadata.create_all(engine)
    curated = load_groups(engine)
    service = TransitService([], tmp_path, [], groups=curated, curated=curated, engine=engine)
    service.providers = {"amtrak": amtrak, "mbta": mbta}
    shared = service.groups
    for p in service.providers.values():
        p.groups = shared
    assert service.regroup() and not service.regroup()  # nothing changed the second time
    assert service.groups is shared and amtrak.groups is shared  # replaced in place: every provider sees it
    assert shared.resolve("mbta", "sstat") == "st:bos" and shared.resolve("mbta", "bbsta") == "st:bby"
    assert amtrak.station_gid("BOS") == "st:bos" and mbta.station_gid("sstat") == "st:bos"
    assert StationGroups.from_db(engine).resolve("mbta", "bbsta") == "st:bby"  # stored for the next start

    merges = service.merges()
    assert merges.radius_m == 400
    bos = next(g for g in merges.groups if g.id == "st:bos")
    assert bos.name == "South Station" and bos.code == "BOS"
    assert [(m.source, m.stop_id, m.distance_m, m.method) for m in bos.members] == [
        ("amtrak", "BOS", 0, "auto"),
        ("mbta", "sstat", 7, "auto"),
    ]
    assert service.station("st:bos", None).canonical_id == "st:bos"


def test_the_service_waits_for_every_source_before_regrouping(tmp_path):
    amtrak = lines_provider(tmp_path, "amtrak", "amtraker", [("BOS", "Boston", 0)])
    mbta = lines_provider(tmp_path, "mbta", "lines", [])
    mbta.index = None  # still loading
    service = TransitService([], tmp_path, [])
    service.providers = {"amtrak": amtrak, "mbta": mbta}
    assert not service.regroup()
    mbta.state.static_error = "down"  # failed: no reason to wait any longer
    assert service.regroup()


def test_merges_list_unmerged_pairs_for_review(tmp_path):
    commuter_a = lines_provider(tmp_path, "sa", "lines", [("a", "Alpha", 0)])
    commuter_b = lines_provider(tmp_path, "sb", "lines", [("b", "Beta", 700)])  # 700 m: reviewable, never automatic
    service = TransitService([], tmp_path, [])
    service.providers = {"sa": commuter_a, "sb": commuter_b}
    service.regroup()
    assert service.groups.groups == {}
    [pair] = service.merges().suggestions
    assert (pair.a.id, pair.b.id, pair.reason) == ("sa:a", "sb:b", "distance") and abs(pair.distance_m - 700) <= 1


def test_merges_endpoint_is_empty_without_transit(client):
    client.app.state.rt.transit = None
    assert client.get("/api/transit/stations/merges").json() == {"radius_m": 0, "groups": [], "suggestions": []}


# --- the real cached feeds (skipped when they are not downloaded) ------------------------------------

CACHE = Path(__file__).parents[2] / "data" / "transit"
FEEDS = ("amtrak", "marc", "vre", "mbta", "septa", "metra", "metrolink")


def feed_stations(name):
    kwargs = {"exclude_routes": ["42985", "42948"]} if name == "amtrak" else {}
    feed = GtfsStatic.from_zip(CACHE / f"{name}-gtfs.zip", [2], full=False, **kwargs)
    return [Candidate(name, s.id, s.name, s.lat, s.lon) for s in feed.stations.values()]


@pytest.fixture(scope="module")
def real_groups():
    if not all((CACHE / f"{name}-gtfs.zip").exists() for name in FEEDS):
        pytest.skip("feeds not cached")
    stations = {name: feed_stations(name) for name in FEEDS}
    others = [c for name in FEEDS[1:] for c in stations[name]]
    return build_groups(StationGroups.from_file(), stations["amtrak"], others), stations


def test_real_feeds_merge_the_shared_stations(real_groups):
    groups, _ = real_groups
    expected = {
        ("amtrak", "BOS"): ("mbta", "place-sstat"),
        ("amtrak", "BBY"): ("mbta", "place-bbsta"),
        ("amtrak", "RTE"): ("mbta", "place-NEC-2173"),
        ("amtrak", "PVD"): ("mbta", "place-NEC-1851"),
        ("amtrak", "PHL"): ("septa", "90004"),
        ("amtrak", "CHI"): ("metra", "CUS"),
        ("amtrak", "LAX"): ("metrolink", "107"),
        ("amtrak", "WAS"): ("marc", "11958"),
    }
    for anchor, member in expected.items():
        assert groups.resolve(*member) == groups.resolve(*anchor) is not None, (anchor, member)
    assert groups.resolve("vre", "00000000000000000000000000000001") == "st:was"
    assert groups.groups["st:bos"].name == "South Station"
    assert len(groups.groups) > 40


def test_real_feeds_leave_chicago_ogilvie_alone(real_groups):
    groups, stations = real_groups
    [ogilvie] = [s for s in stations["metra"] if s.id == "OTC"]  # Ogilvie Transportation Center
    union = next(s for s in stations["amtrak"] if s.id == "CHI")
    assert distance_m(union.lat, union.lon, ogilvie.lat, ogilvie.lon) > 400
    assert groups.resolve("metra", ogilvie.id) is None

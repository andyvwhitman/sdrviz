"""Station groups: one station that several sources (Amtrak, MARC, VRE, MBTA...) share, with an id such as `st:was`.

Groups are built automatically (decision 29): whenever the feeds load, each Amtrak station takes the nearest station of
every other source within a radius (400 m), and a commuter station joins only its nearest Amtrak station. The checked-in
curated list overrides that: its members are always merged (`force`) and its `block` pairs never are. Everything is
kept in the `station_groups` / `station_members` tables (`method` curated or auto) so ids work before the feeds load.
Stops in no group keep their `<source>:<stop_id>` id.
"""

import json
import re
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.engine import Engine
from sqlmodel import Session, col, delete, select

from ..models import StationGroupRow, StationMemberRow
from .places import distance_m

STATIONS_FILE = Path(__file__).parent / "data" / "stations.json"
APPLIED = ("curated", "auto")  # member methods that take effect; "suggested" is only a proposal
NAME_NOISE = {"station", "amtrak", "marc", "vre", "rail", "railroad", "train", "the", "of"}
AGENCY_WORDS = {"amtrak", "marc", "vre", "mbta"}  # said in a station's name to tell it from the other agency's
MERGE_RADIUS_M = 400  # an Amtrak station and a commuter station this close are one station (0.25 mi)
NEAR_M = 800  # ungrouped stations of different sources this close are suggested as one, for review
SAME_NAME_M = 1000  # ...or this close with the same name


@dataclass(frozen=True)
class StationGroup:
    id: str  # "st:was"
    name: str
    lat: float
    lon: float
    members: dict[str, tuple[str, ...]]  # source id -> stop ids
    short_name: str | None = None  # "Washington Union", for tight spaces

    @property
    def code(self) -> str:
        return self.id.partition(":")[2].upper()


@dataclass
class StationGroups:
    groups: dict[str, StationGroup] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self._of = {(src, sid): g.id for g in self.groups.values() for src, ids in g.members.items() for sid in ids}

    def resolve(self, source: str, stop_id: str) -> str | None:
        """The group a source's stop belongs to, or None."""
        return self._of.get((source, stop_id))

    def get(self, group_id: str) -> StationGroup | None:
        return self.groups.get(group_id.lower())

    def replace(self, other: "StationGroups") -> None:
        """Become `other`, in place: the service and every provider share this one object."""
        self._of = other._of
        self.groups = other.groups

    def members(self, group_id: str) -> dict[str, tuple[str, ...]]:
        group = self.get(group_id)
        return group.members if group else {}

    # --- storage -----------------------------------------------------------

    @classmethod
    def from_file(cls, path: Path = STATIONS_FILE) -> "StationGroups":
        groups = [_group(entry) for entry in _read(path)]
        return cls({g.id: g for g in groups})

    @classmethod
    def from_db(cls, engine: Engine, path: Path = STATIONS_FILE) -> "StationGroups":
        short_names = {g.id: g.short_name for g in cls.from_file(path).groups.values()}
        with Session(engine) as session:
            rows = session.exec(select(StationGroupRow)).all()
            members = session.exec(select(StationMemberRow).where(col(StationMemberRow.method).in_(APPLIED))).all()
        found: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
        for m in members:
            found[m.station_id][m.source].append(m.stop_id)
        return cls(
            {
                r.station_id: StationGroup(
                    r.station_id,
                    r.name,
                    r.lat,
                    r.lon,
                    {src: tuple(ids) for src, ids in found[r.station_id].items()},
                    short_names.get(r.station_id),
                )
                for r in rows
                if r.station_id in found
            }
        )


def _read(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["stations"]


def read_blocks(path: Path = STATIONS_FILE) -> frozenset[tuple[str, str, str]]:
    """(station code lowercase, source, stop id) triples the rule must never merge."""
    entries = json.loads(path.read_text(encoding="utf-8")).get("block", [])
    return frozenset((e["station"].lower(), e["source"], e["stop_id"]) for e in entries)


def _group(entry: dict) -> StationGroup:
    members = {src: tuple(ids) for src, ids in entry["members"].items()}
    return StationGroup(
        f"st:{entry['code'].lower()}", entry["name"], entry["lat"], entry["lon"], members, entry.get("short_name")
    )


def seed_groups(engine: Engine, path: Path = STATIONS_FILE) -> None:
    """Make the curated rows match the file (idempotent). Other methods' rows are left alone."""
    curated = StationGroups.from_file(path).groups.values()
    with Session(engine) as session:
        session.exec(delete(StationMemberRow).where(StationMemberRow.method == "curated"))  # type: ignore[arg-type]
        for g in curated:
            session.merge(StationGroupRow(station_id=g.id, name=g.name, lat=g.lat, lon=g.lon))
            for source, ids in g.members.items():
                for stop_id in ids:
                    session.merge(StationMemberRow(source=source, stop_id=stop_id, station_id=g.id, method="curated"))
        session.flush()
        used = {m.station_id for m in session.exec(select(StationMemberRow)).all()}
        for row in session.exec(select(StationGroupRow)).all():
            if row.station_id not in used:  # a group dropped from the file
                session.delete(row)
        session.commit()


def load_groups(engine: Engine, path: Path = STATIONS_FILE) -> StationGroups:
    seed_groups(engine, path)
    return StationGroups.from_db(engine, path)


# --- automatic merges ----------------------------------------------------------------


@dataclass(frozen=True)
class Candidate:
    """A station of one source, for matching against other sources' stations."""

    source: str
    id: str  # local station id
    name: str
    lat: float
    lon: float


def _cells(stations: list[Candidate]) -> dict[tuple[int, int], list[Candidate]]:
    cells: dict[tuple[int, int], list[Candidate]] = defaultdict(list)
    for st in stations:  # 0.02 degrees is over a kilometre in both directions at US latitudes
        cells[(int(st.lat / 0.02), int(st.lon / 0.02))].append(st)
    return cells


def _around(cells: dict[tuple[int, int], list[Candidate]], st: Candidate) -> list[Candidate]:
    row, col_ = int(st.lat / 0.02), int(st.lon / 0.02)
    return [c for dr in (-1, 0, 1) for dc in (-1, 0, 1) for c in cells.get((row + dr, col_ + dc), ())]


def nearest_anchors(
    anchors: list[Candidate],
    others: list[Candidate],
    radius_m: float = MERGE_RADIUS_M,
    skip: Callable[[Candidate, Candidate], bool] = lambda anchor, other: False,
) -> dict[str, dict[str, tuple[Candidate, float]]]:
    """{anchor id: {source: (nearest other station of that source, metres)}} within the radius.

    Each other station is claimed by its nearest anchor alone, and an anchor keeps only the nearest station of
    each source. `skip(anchor, other)` rules a pair out (blocked, or already merged by hand).
    """
    cells = _cells(anchors)
    found: dict[str, dict[str, tuple[Candidate, float]]] = defaultdict(dict)
    for other in others:
        best = min(
            ((distance_m(a.lat, a.lon, other.lat, other.lon), a) for a in _around(cells, other) if not skip(a, other)),
            key=lambda pair: (pair[0], pair[1].id),
            default=None,
        )
        if best is None or best[0] > radius_m:
            continue
        d, anchor = best
        kept = found[anchor.id].get(other.source)
        if kept is None or (d, other.id) < (kept[1], kept[0].id):
            found[anchor.id][other.source] = (other, d)
    return found


def clear_name(names: list[str]) -> str:
    """The most telling of a station's names ('South Station' over 'Boston'): longest once agency words are dropped."""

    def tidy(name: str) -> str:
        words = [w for w in name.split() if w.lower() not in AGENCY_WORDS]
        text = " ".join(words) or name
        return text.title() if text.isupper() else text

    return max((tidy(n) for n in names), key=len)  # max keeps the first of equals: the Amtrak name


def build_groups(
    curated: StationGroups,
    anchors: list[Candidate],
    others: list[Candidate],
    radius_m: float = MERGE_RADIUS_M,
    blocked: frozenset[tuple[str, str, str]] = frozenset(),
) -> StationGroups:
    """The curated groups plus one group per Amtrak station that a commuter station sits within the radius of."""
    in_curated = lambda o: curated.resolve(o.source, o.id) is not None  # noqa: E731
    skip = lambda a, o: in_curated(o) or (a.id.lower(), o.source, o.id) in blocked  # noqa: E731
    groups = dict(curated.groups)
    for anchor_id, by_source in nearest_anchors(anchors, others, radius_m, skip).items():
        anchor = next(a for a in anchors if a.id == anchor_id)
        group_id = f"st:{anchor_id.lower()}"
        existing = groups.get(group_id)
        members = dict(existing.members) if existing else {}
        for source, (other, _) in by_source.items():
            if source not in members:  # a curated group keeps its own members of that source
                members[source] = (other.id,)
        if existing and members == existing.members:
            continue
        names = [anchor.name] + [o.name for _, (o, _) in sorted(by_source.items())]
        groups[group_id] = StationGroup(
            group_id,
            existing.name if existing else clear_name(names),
            existing.lat if existing else anchor.lat,
            existing.lon if existing else anchor.lon,
            members if existing else {anchor.source: (anchor.id,), **members},
            existing.short_name if existing else None,
        )
    return StationGroups(groups)


def store_groups(engine: Engine, groups: StationGroups, curated: StationGroups) -> None:
    """Write the auto members (and the groups they make) to the tables; curated rows are the file's business."""
    with Session(engine) as session:
        session.exec(delete(StationMemberRow).where(StationMemberRow.method == "auto"))  # type: ignore[arg-type]
        for g in groups.groups.values():
            session.merge(StationGroupRow(station_id=g.id, name=g.name, lat=g.lat, lon=g.lon))
            for source, ids in g.members.items():
                for stop_id in ids:
                    if curated.resolve(source, stop_id) != g.id:
                        session.merge(StationMemberRow(source=source, stop_id=stop_id, station_id=g.id, method="auto"))
        session.flush()
        used = {m.station_id for m in session.exec(select(StationMemberRow)).all()}
        for row in session.exec(select(StationGroupRow)).all():
            if row.station_id not in used:  # a group nothing belongs to any more
                session.delete(row)
        session.commit()


# --- suggested merges ----------------------------------------------------------------


def name_key(name: str) -> frozenset[str]:
    """'UNION STATION MARC Washington' and 'Washington Union Station' share the key {union, washington}."""
    return frozenset(re.findall(r"[a-z0-9]+", name.lower())) - NAME_NOISE


def suggest_pairs(stations: list[Candidate]) -> list[tuple[Candidate, Candidate, float, str]]:
    """Pairs from different sources within NEAR_M, or with the same name within SAME_NAME_M. Closest first.

    The reason is "name" when the names match (even if also near), else "distance". Callers pass stations that
    are in no group; pairs inside the merge radius are the ones the automatic rule left alone (no Amtrak side).
    """
    cells = _cells(stations)
    pairs = []
    for here in cells.values():
        for a in here:
            for b in _around(cells, a):
                if a.source >= b.source:
                    continue
                d = distance_m(a.lat, a.lon, b.lat, b.lon)
                same = name_key(a.name) == name_key(b.name) and bool(name_key(a.name))
                if same and d <= SAME_NAME_M:
                    pairs.append((a, b, d, "name"))
                elif d <= NEAR_M:
                    pairs.append((a, b, d, "distance"))
    return sorted(pairs, key=lambda p: (p[2], p[0].source, p[0].id, p[1].id))

"""Station groups: one station that several sources (Amtrak, MARC, VRE) share, with a single id such as `st:was`.

The curated list is a checked-in file; it is copied into the `station_groups` / `station_members` tables at startup
and the file stays the source of truth for the `curated` rows. Stops in no group keep their `<source>:<stop_id>` id.
"""

import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.engine import Engine
from sqlmodel import Session, col, delete, select

from ..models import StationGroupRow, StationMemberRow
from .places import distance_m

STATIONS_FILE = Path(__file__).parent / "data" / "stations.json"
APPLIED = ("curated", "auto")  # member methods that take effect; "suggested" is only a proposal
NAME_NOISE = {"station", "amtrak", "marc", "vre", "rail", "railroad", "train", "the", "of"}
NEAR_M = 300  # stations of different sources this close are suggested as one
SAME_NAME_M = 1000  # ...or this close with the same name


@dataclass(frozen=True)
class StationGroup:
    id: str  # "st:was"
    name: str
    lat: float
    lon: float
    members: dict[str, tuple[str, ...]]  # source id -> stop ids


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

    def members(self, group_id: str) -> dict[str, tuple[str, ...]]:
        group = self.get(group_id)
        return group.members if group else {}

    # --- storage -----------------------------------------------------------

    @classmethod
    def from_file(cls, path: Path = STATIONS_FILE) -> "StationGroups":
        groups = [_group(entry) for entry in _read(path)]
        return cls({g.id: g for g in groups})

    @classmethod
    def from_db(cls, engine: Engine) -> "StationGroups":
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
                )
                for r in rows
                if r.station_id in found
            }
        )


def _read(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["stations"]


def _group(entry: dict) -> StationGroup:
    members = {src: tuple(ids) for src, ids in entry["members"].items()}
    return StationGroup(f"st:{entry['code'].lower()}", entry["name"], entry["lat"], entry["lon"], members)


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
    return StationGroups.from_db(engine)


# --- suggested merges ----------------------------------------------------------------


@dataclass(frozen=True)
class Candidate:
    """A station of one source, for matching against other sources' stations."""

    source: str
    id: str  # local station id
    name: str
    lat: float
    lon: float


def name_key(name: str) -> frozenset[str]:
    """'UNION STATION MARC Washington' and 'Washington Union Station' share the key {union, washington}."""
    return frozenset(re.findall(r"[a-z0-9]+", name.lower())) - NAME_NOISE


def suggest_pairs(stations: list[Candidate]) -> list[tuple[Candidate, Candidate, float, str]]:
    """Pairs from different sources within NEAR_M, or with the same name within SAME_NAME_M. Closest first.

    The reason is "name" when the names match (even if also near), else "distance".
    """
    cells: dict[tuple[int, int], list[Candidate]] = defaultdict(list)
    for st in stations:  # 0.02 degrees is over a kilometre in both directions at US latitudes
        cells[(int(st.lat / 0.02), int(st.lon / 0.02))].append(st)
    pairs = []
    for (row, col_), here in cells.items():
        around = [c for dr in (-1, 0, 1) for dc in (-1, 0, 1) for c in cells.get((row + dr, col_ + dc), ())]
        for a in here:
            for b in around:
                if a.source >= b.source:
                    continue
                d = distance_m(a.lat, a.lon, b.lat, b.lon)
                same = name_key(a.name) == name_key(b.name) and bool(name_key(a.name))
                if same and d <= SAME_NAME_M:
                    pairs.append((a, b, d, "name"))
                elif d <= NEAR_M:
                    pairs.append((a, b, d, "distance"))
    return sorted(pairs, key=lambda p: (p[2], p[0].source, p[0].id, p[1].id))

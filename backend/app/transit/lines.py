"""Route geometry and stations for the map: built once per feed, simplified at several tolerances, cached as JSON.

The map asks for lines by bounding box; the tolerance used is chosen from the box width (the zoom number depends on
the map's scale), so a national view gets coarse lines and a city view gets the full shapes.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path

from .geometry import Bbox, bbox_width_km, bounds, clip, expand, follow_shapes, intersects, simplify
from .gtfs_static import GtfsStatic, Point

CACHE_VERSION = 2
# Douglas-Peucker tolerance in metres, and the coordinate rounding (decimal places) that goes with it.
LEVELS = ((40, 5), (250, 4), (1200, 3), (5000, 2))
# Widest bbox (km) served by each level; wider than the last takes the coarsest level.
LEVEL_MAX_KM = (150, 700, 2500)


def level_for(bbox: Bbox) -> int:
    width = bbox_width_km(bbox)
    return next((i for i, limit in enumerate(LEVEL_MAX_KM) if width <= limit), len(LEVELS) - 1)


@dataclass
class RouteLine:
    route_id: str
    name: str
    short_name: str | None
    color: str | None
    bounds: Bbox
    levels: list[list[list[list[float]]]]  # per level: polylines of [lon, lat]


@dataclass
class StationRec:
    id: str
    name: str
    lat: float
    lon: float
    routes: list[str]


@dataclass
class LineIndex:
    lines: list[RouteLine] = field(default_factory=list)
    stations: list[StationRec] = field(default_factory=list)

    # --- building ----------------------------------------------------------

    @classmethod
    def build(cls, feed: GtfsStatic) -> "LineIndex":
        index = cls()
        for route in feed.routes.values():
            polylines = _polylines(feed, route.id)
            if not polylines:
                continue
            levels = [_level(polylines, tol, digits) for tol, digits in LEVELS]
            index.lines.append(
                RouteLine(route.id, route.name, route.short_name, route.color, _bounds(polylines), levels)
            )
        routes_at: dict[str, set[str]] = {}
        for route_id, stop_ids in feed.route_stops.items():
            for stop_id in stop_ids:
                if station_id := feed.station_of.get(stop_id):
                    routes_at.setdefault(station_id, set()).add(route_id)
        for station_id, stop in feed.stations.items():
            if routes := routes_at.get(station_id):
                index.stations.append(StationRec(station_id, stop.name, stop.lat, stop.lon, sorted(routes)))
        return index

    # --- queries -----------------------------------------------------------

    def lines_in(self, bbox: Bbox) -> list[tuple[RouteLine, list[list[list[float]]]]]:
        level, wide = level_for(bbox), expand(bbox)
        found = []
        for line in self.lines:
            if intersects(line.bounds, wide):
                parts = [part for pl in line.levels[level] for part in clip(pl, wide)]
                if parts:
                    found.append((line, parts))
        return found

    def stations_in(self, bbox: Bbox) -> list[StationRec]:
        w, s, e, n = bbox
        return [st for st in self.stations if w <= st.lon <= e and s <= st.lat <= n]

    @property
    def points(self) -> int:
        return sum(len(pl) for line in self.lines for lv in line.levels for pl in lv)

    # --- cache -------------------------------------------------------------

    def save(self, path: Path, key: str) -> None:
        data = {"version": CACHE_VERSION, "key": key, "index": _to_dict(self)}
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")

    @classmethod
    def load(cls, path: Path, key: str) -> "LineIndex | None":
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data["version"] != CACHE_VERSION or data["key"] != key:
                return None
            return _from_dict(data["index"])
        except (OSError, ValueError, KeyError, TypeError):
            return None


def _to_dict(index: LineIndex) -> dict:
    return {
        "lines": [[ln.route_id, ln.name, ln.short_name, ln.color, ln.bounds, ln.levels] for ln in index.lines],
        "stations": [[st.id, st.name, st.lat, st.lon, st.routes] for st in index.stations],
    }


def _from_dict(data: dict) -> LineIndex:
    return LineIndex(
        [RouteLine(a, b, c, d, tuple(e), f) for a, b, c, d, e, f in data["lines"]],
        [StationRec(*row) for row in data["stations"]],
    )


def _polylines(feed: GtfsStatic, route_id: str) -> list[list[Point]]:
    """A route's distinct shapes (a shape and its reverse count once), else its stops joined along the feed's shapes."""
    seen: set[tuple[Point, ...]] = set()
    polylines = []
    shapes = [feed.shapes[s] for s in feed.route_shapes.get(route_id, []) if s in feed.shapes]
    if not shapes:
        track = list(feed.shapes.values())
        shapes = [
            follow_shapes([(feed.stops[s].lat, feed.stops[s].lon) for s in seq if s in feed.stops], track)
            for seq in sorted(feed.route_sequences.get(route_id, ()))
        ]
    for pts in shapes:
        key = tuple(pts)
        if len(pts) < 2 or key in seen or key[::-1] in seen:
            continue
        seen.add(key)
        polylines.append(pts)
    return polylines


def _level(polylines: list[list[Point]], tolerance: float, digits: int) -> list[list[list[float]]]:
    out, seen = [], set()
    for pts in polylines:
        line = [[round(lon, digits), round(lat, digits)] for lat, lon in simplify(pts, tolerance)]
        line = [p for i, p in enumerate(line) if i == 0 or p != line[i - 1]]
        key = tuple(map(tuple, line))
        if len(line) < 2 or key in seen or key[::-1] in seen:
            continue
        seen.add(key)
        out.append(line)
    return out


def _bounds(polylines: list[list[Point]]) -> Bbox:
    boxes = [bounds(pl) for pl in polylines]
    return min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)

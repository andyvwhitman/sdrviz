"""Fetch and simplify the map geometry for sdrviz (brief §9.5, decision #10).

One Overpass extract over the data extent (Quantico VA to Perryville MD):

* rail lines (``railway=rail`` without a ``service`` tag), classified as
  ``nec`` / ``passenger`` / ``freight`` from the passenger route relations
  (``route=train``) that use each way;
* shorelines: ``natural=coastline`` plus the outlines of river areas
  (``natural=water`` + ``water=river``) at least 120 m wide on average,
  drawn as lines, never as fills. Creeks are left out.

Parallel tracks and duplicate shores are collapsed by a coverage test (a
line keeps only the stretches not already drawn), then each piece is
Douglas-Peucker simplified. Output goes to
``data/geo/`` as GeoJSON with OSM attribution (ODbL), plus a ``.js`` twin of
each file so the file:// mockups can load it (design/spec.md §8.4).

Standard library only. Run from the repo root:

    python3 tools/fetch_geo.py            # fetch (cached) + build
    python3 tools/fetch_geo.py --refresh  # ignore the cache and re-query
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / "data" / "geo"
CACHE_DIR = Path(tempfile.gettempdir()) / "sdrviz-overpass"

# Data extent (brief §9.5): lat 38.50-39.60 N, lon 77.50-76.05 W.
SOUTH, WEST, NORTH, EAST = 38.50, -77.50, 39.60, -76.05
BBOX = f"{SOUTH},{WEST},{NORTH},{EAST}"

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
USER_AGENT = "sdrviz-fetch-geo/0.1 (python urllib; one-off extract)"

ATTRIBUTION = "© OpenStreetMap contributors, ODbL 1.0 · https://www.openstreetmap.org/copyright"

QUERIES = {
    "rail": f"""
        [out:json][timeout:180];
        way["railway"="rail"][!"service"]({BBOX})->.r;
        .r out tags geom;
        rel(bw.r)["route"="train"];
        out body;
    """,
    "water": f"""
        [out:json][timeout:180];
        (
          way["natural"="coastline"]({BBOX});
          way["natural"="water"]["water"="river"]({BBOX});
          way["waterway"="riverbank"]({BBOX});
        );
        out tags geom;
        rel["natural"="water"]["water"="river"]({BBOX});
        out body geom;
    """,
}

# Tuning, in metres.
COVER_M = {"rail": 30.0, "water": 40.0}      # parallel lines closer than this collapse
TOLERANCE_M = {"rail": 20.0, "water": 70.0}  # Douglas-Peucker tolerance
MIN_LEN_M = {"rail": 150.0, "water": 1500.0}  # drop pieces shorter than this
MIN_RIVER_WIDTH_M = 120.0  # narrower river areas (creeks) are left out
MAX_SEG_M = 2500.0  # river-area closing lines across open water are cut here
DECIMALS = 5                                  # about 1 m

M_PER_DEG_LAT = 111_320.0
M_PER_DEG_LON = M_PER_DEG_LAT * math.cos(math.radians((SOUTH + NORTH) / 2))

CLASS_RANK = {"nec": 3, "passenger": 2, "freight": 1}
SKIP_USAGE = {"industrial", "military", "tourism", "test"}


# ---------------------------------------------------------------- fetching

def overpass(name: str, query: str, refresh: bool) -> dict:
    """Run one Overpass query, trying each mirror with exponential backoff."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"{name}.json"
    if cache.exists() and not refresh:
        print(f"  {name}: cached ({cache})")
        return json.loads(cache.read_text())

    body = urllib.parse.urlencode({"data": query}).encode()
    wait = 5.0
    for attempt in range(1, 7):
        for url in MIRRORS:
            request = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
            try:
                print(f"  {name}: attempt {attempt} via {urllib.parse.urlparse(url).netloc}")
                with urllib.request.urlopen(request, timeout=240) as response:
                    raw = response.read()
                data = json.loads(raw)
                cache.write_bytes(raw)
                return data
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as err:
                print(f"    failed: {err}")
        time.sleep(wait)
        wait *= 2
    raise SystemExit(f"Overpass unavailable for {name}; see the fallback note in data/geo/ATTRIBUTION.md")


# ---------------------------------------------------------------- geometry helpers

def to_xy(lon: float, lat: float) -> tuple[float, float]:
    """Local equirectangular metres; plenty for snapping and simplifying."""
    return lon * M_PER_DEG_LON, lat * M_PER_DEG_LAT


def to_lonlat(x: float, y: float) -> list[float]:
    return [round(x / M_PER_DEG_LON, DECIMALS), round(y / M_PER_DEG_LAT, DECIMALS)]


def length_m(points: list[tuple[float, float]]) -> float:
    return sum(math.dist(a, b) for a, b in zip(points, points[1:]))


def simplify(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    """Iterative Douglas-Peucker."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        (ax, ay), (bx, by) = points[first], points[last]
        dx, dy = bx - ax, by - ay
        seg = math.hypot(dx, dy) or 1e-9
        best, index = 0.0, None
        for i in range(first + 1, last):
            px, py = points[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / seg
            if d > best:
                best, index = d, i
        if index is not None and best > tolerance:
            keep[index] = True
            stack += [(first, index), (index, last)]
    return [p for p, k in zip(points, keep) if k]


def densify(pts: list[tuple[float, float]], step: float) -> list[tuple[float, float]]:
    """Points along a polyline no more than `step` metres apart."""
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        n = max(1, math.ceil(math.dist(a, b) / step))
        out += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(1, n + 1)]
    return out


class Coverage:
    """Spatial hash of kept sample points: 'is this point already drawn?'"""

    def __init__(self, radius: float):
        self.radius = radius
        self.cells: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)

    def _cell(self, p):
        return int(p[0] // self.radius), int(p[1] // self.radius)

    def add(self, pts):
        for p in pts:
            self.cells[self._cell(p)].append(p)

    def covers(self, p) -> bool:
        cx, cy = self._cell(p)
        return any(
            math.dist(p, q) <= self.radius
            for dx in (-1, 0, 1) for dy in (-1, 0, 1)
            for q in self.cells.get((cx + dx, cy + dy), ())
        )


def build(lines: list[tuple[dict, list[list[float]]]], kind: str) -> list[dict]:
    """Collapse parallel tracks and duplicate shores, then simplify.

    Ways are taken best class first, longest first. Each keeps only the
    stretches that are not already within COVER_M of something kept, so the
    four NEC tracks become one line and a branch keeps the part that leaves.
    """
    step = COVER_M[kind] / 2
    prepared = []
    for props, coords in lines:
        pts = [to_xy(lon, lat) for lon, lat in coords]
        if len(pts) > 1:
            prepared.append((props, pts, length_m(pts)))
    prepared.sort(key=lambda t: (-CLASS_RANK.get(t[0].get("class"), 0), -t[2]))

    seen = Coverage(COVER_M[kind])
    features = []
    for props, pts, _ in prepared:
        samples = densify(pts, step)
        pieces, stretch = [], []
        for i, p in enumerate(samples):
            if not seen.covers(p):
                if not stretch and i > 0:
                    stretch.append(samples[i - 1])  # start on the line it leaves
                stretch.append(p)
            elif stretch:
                stretch.append(p)                    # end on the line it joins
                pieces.append(stretch)
                stretch = []
        if stretch:
            pieces.append(stretch)
        for piece in pieces:
            if length_m(piece) < MIN_LEN_M[kind]:
                continue
            seen.add(piece)
            simple = simplify(piece, TOLERANCE_M[kind])
            for part in split_long(simple) if props.get("class") == "riverbank" else [simple]:
                features.append({
                    "type": "Feature",
                    "properties": props,
                    "geometry": {"type": "LineString", "coordinates": [to_lonlat(x, y) for x, y in part]},
                })
    return features


def split_long(pts: list[tuple[float, float]]) -> list[list[tuple[float, float]]]:
    """Cut a river-area outline wherever one straight segment exceeds MAX_SEG_M.

    OSM river areas end in straight closing lines across the water where they
    meet the coastline or the next polygon; those are not shores.
    """
    parts, current = [], [pts[0]]
    for a, b in zip(pts, pts[1:]):
        if math.dist(a, b) > MAX_SEG_M:
            if len(current) > 1:
                parts.append(current)
            current = [b]
        else:
            current.append(b)
    if len(current) > 1:
        parts.append(current)
    return parts


# ---------------------------------------------------------------- classification

def rail_lines(data: dict) -> list[tuple[dict, list[list[float]]]]:
    # Any way used by a passenger route relation is a passenger line. The NEC
    # itself is told by name: Northeast Regional relations also run down the
    # RF&P and the NS line into Virginia, so relation names cannot mark it.
    passenger_ways: set[int] = set()
    for el in data["elements"]:
        if el["type"] == "relation":
            passenger_ways |= {m["ref"] for m in el.get("members", []) if m["type"] == "way"}

    out = []
    for el in data["elements"]:
        if el["type"] != "way" or "geometry" not in el:
            continue
        tags = el.get("tags", {})
        if tags.get("usage") in SKIP_USAGE:
            continue
        name = tags.get("name", "")
        cls = "nec" if "Northeast Corridor" in name else "passenger" if el["id"] in passenger_ways else "freight"
        props = {"class": cls, "name": name}
        out.append((props, [[p["lon"], p["lat"]] for p in el["geometry"]]))
    return out


def rings(ways: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
    """Assemble open ways into closed rings by matching end points."""
    pending = [list(w) for w in ways if len(w) > 1]
    done = []
    while pending:
        ring = pending.pop()
        grew = True
        while ring[0] != ring[-1] and grew:
            grew = False
            for i, w in enumerate(pending):
                if w[0] == ring[-1]:
                    ring += w[1:]
                elif w[-1] == ring[-1]:
                    ring += w[-2::-1]
                elif w[-1] == ring[0]:
                    ring[:0] = w[:-1]
                elif w[0] == ring[0]:
                    ring[:0] = w[:0:-1]
                else:
                    continue
                del pending[i]
                grew = True
                break
        if ring[0] == ring[-1]:
            done.append(ring)
    return done


def mean_width_m(ways: list[list[tuple[float, float]]]) -> float:
    """2 x area / perimeter: a river area's mean width; 0 if no ring closes."""
    area = perimeter = 0.0
    for ring in rings(ways):
        pts = [to_xy(lon, lat) for lon, lat in ring]
        area += abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:]))) / 2
        perimeter += length_m(pts)
    return 2 * area / perimeter if perimeter else 0.0


def water_lines(data: dict) -> list[tuple[dict, list[list[float]]]]:
    """Coastline, plus outlines of river areas wide enough to read at corridor scale."""
    out = []
    for el in data["elements"]:
        tags = el.get("tags", {})
        if el["type"] == "way" and "geometry" in el:
            coords = [(p["lon"], p["lat"]) for p in el["geometry"]]
            if tags.get("natural") == "coastline":
                out.append(({"class": "coastline"}, coords))
            elif mean_width_m([coords]) >= MIN_RIVER_WIDTH_M:
                out.append(({"class": "riverbank"}, coords))
        elif el["type"] == "relation":
            ways = [[(p["lon"], p["lat"]) for p in m["geometry"]]
                    for m in el.get("members", [])
                    if m.get("type") == "way" and m.get("role") == "outer" and m.get("geometry")]
            if mean_width_m(ways) >= MIN_RIVER_WIDTH_M:
                out += [({"class": "riverbank"}, w) for w in ways]
    return out


# ---------------------------------------------------------------- output

def write(name: str, features: list[dict], note: str) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    collection = {
        "type": "FeatureCollection",
        "attribution": ATTRIBUTION,
        "license": "ODbL-1.0",
        "generator": "tools/fetch_geo.py",
        "bbox": [WEST, SOUTH, EAST, NORTH],
        "note": note,
        "features": features,
    }
    text = json.dumps(collection, separators=(",", ":"), ensure_ascii=False)
    path = OUT_DIR / f"{name}.geojson"
    path.write_text(text, encoding="utf-8")
    key = f"data/geo/{name}.geojson"
    twin = f'(window.SDRVIZ_DATA = window.SDRVIZ_DATA || {{}})["{key}"] = {text};\n'
    (OUT_DIR / f"{name}.geojson.js").write_text(twin, encoding="utf-8")
    print(f"  wrote {path.relative_to(REPO)}: {len(features)} lines, {len(text) / 1024:.0f} KB")
    return len(text) + len(twin)


def write_attribution() -> None:
    (OUT_DIR / "ATTRIBUTION.md").write_text(
        "# Map geometry attribution\n\n"
        "`rail.geojson` and `water.geojson` are derived from OpenStreetMap data.\n\n"
        "**© OpenStreetMap contributors.** The data is available under the Open Database License (ODbL 1.0): "
        "<https://www.openstreetmap.org/copyright>. The derived files are a produced work under the same licence.\n\n"
        "Every map view must show `© OpenStreetMap contributors`, linked to the copyright page (brief §9.5, layer 11).\n\n"
        "## How it was made\n\n"
        f"`python3 tools/fetch_geo.py` ran one Overpass extract over the bounding box {BBOX} (S, W, N, E), "
        "Quantico VA to Perryville MD. Parallel tracks within "
        f"{COVER_M['rail']:.0f} m were collapsed to one line and lines were Douglas-Peucker simplified "
        f"({TOLERANCE_M['rail']:.0f} m rail, {TOLERANCE_M['water']:.0f} m shoreline). "
        "Rail `class` is `nec`, `passenger` (used by an OSM `route=train` relation) or `freight`.\n",
        encoding="utf-8",
    )


def main() -> int:
    assert __doc__ is not None  # the module docstring supplies the CLI description
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true", help="ignore cached Overpass responses")
    args = parser.parse_args()

    print("Overpass extract", BBOX)
    rail = overpass("rail", QUERIES["rail"], args.refresh)
    water = overpass("water", QUERIES["water"], args.refresh)

    print("Building")
    total = write("rail", build(rail_lines(rail), "rail"), "railway=rail main lines; parallel tracks collapsed")
    total += write("water", build(water_lines(water), "water"), "coastline and river-area outlines, as lines")
    write_attribution()
    print(f"Total {total / 1024:.0f} KB (budget 2048 KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

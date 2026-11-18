"""Polyline helpers: simplification in metres, bounding boxes, clipping, position along a path."""

from math import atan2, cos, degrees, radians, sqrt

import numpy as np

from .gtfs_static import Point
from .places import distance_m

M_PER_DEG = 111_320.0

Bbox = tuple[float, float, float, float]  # west, south, east, north


def _xy(points: list[Point]) -> np.ndarray:
    """Points as metres on a local flat plane (accurate enough for a line a few hundred km long)."""
    arr = np.asarray(points, dtype=float)
    lat0 = float(arr[:, 0].mean())
    return np.column_stack(
        ((arr[:, 1] - arr[0, 1]) * cos(radians(lat0)) * M_PER_DEG, (arr[:, 0] - arr[0, 0]) * M_PER_DEG)
    )


def simplify(points: list[Point], tolerance_m: float) -> list[Point]:
    """Douglas-Peucker: drop vertices closer than `tolerance_m` to the line through their neighbours."""
    if len(points) < 3:
        return list(points)
    xy = _xy(points)
    keep = np.zeros(len(points), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        if last - first < 2:
            continue
        seg = xy[last] - xy[first]
        rel = xy[first + 1 : last] - xy[first]
        length = float(np.hypot(*seg))
        if length == 0:
            dist = np.hypot(rel[:, 0], rel[:, 1])
        else:
            dist = np.abs(seg[0] * rel[:, 1] - seg[1] * rel[:, 0]) / length
        far = int(dist.argmax())
        if dist[far] > tolerance_m:
            mid = first + 1 + far
            keep[mid] = True
            stack += [(first, mid), (mid, last)]
    return [p for p, k in zip(points, keep, strict=True) if k]


def length_m(points: list[Point]) -> float:
    return sum(distance_m(a[0], a[1], b[0], b[1]) for a, b in zip(points, points[1:], strict=False))


def bbox_width_km(bbox: Bbox) -> float:
    west, south, east, north = bbox
    return distance_m((south + north) / 2, west, (south + north) / 2, east) / 1000


def intersects(a: Bbox, b: Bbox) -> bool:
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


def bounds(points: list[Point]) -> Bbox:
    lats, lons = [p[0] for p in points], [p[1] for p in points]
    return min(lons), min(lats), max(lons), max(lats)


def expand(bbox: Bbox, fraction: float = 0.1) -> Bbox:
    w, s, e, n = bbox
    dx, dy = (e - w) * fraction, (n - s) * fraction
    return w - dx, s - dy, e + dx, n + dy


def clip(line: list[list[float]], bbox: Bbox) -> list[list[list[float]]]:
    """The parts of a [lon, lat] polyline inside bbox, each run keeping one vertex outside so edges stay joined."""
    w, s, e, n = bbox
    inside = [w <= x <= e and s <= y <= n for x, y in line]
    if all(inside):
        return [line]
    runs, current = [], []
    for i, pt in enumerate(line):
        near = inside[i] or (i > 0 and inside[i - 1]) or (i + 1 < len(line) and inside[i + 1])
        if near:
            current.append(pt)
        elif current:
            runs.append(current)
            current = []
    if current:
        runs.append(current)
    return [r for r in runs if len(r) >= 2]


class Path:
    """A polyline with cumulative distance: where along it a point is, and the point at a distance."""

    def __init__(self, points: list[Point]):
        self.points = points
        self.cum = [0.0]
        for a, b in zip(points, points[1:], strict=False):
            self.cum.append(self.cum[-1] + distance_m(a[0], a[1], b[0], b[1]))
        self._array: np.ndarray | None = None

    @property
    def total(self) -> float:
        return self.cum[-1]

    def _points(self) -> np.ndarray:
        if self._array is None:
            self._array = np.asarray(self.points, dtype=float)
        return self._array

    def locate(self, lat: float, lon: float, after: float = 0.0) -> float:
        """Distance along the path of the vertex nearest (lat, lon), not before `after` (stops come in order)."""
        points = self._points()
        cum = np.asarray(self.cum)
        d = (points[:, 0] - lat) ** 2 + ((points[:, 1] - lon) * cos(radians(lat))) ** 2
        d[cum < after] = np.inf
        best = int(d.argmin())
        return float(cum[best]) if np.isfinite(d[best]) else after

    def project(self, lat: float, lon: float) -> tuple[float, float]:
        """(distance along the path, metres off it) of the point on the path nearest (lat, lon). Whole segments, not
        vertices: some feeds put their vertices kilometres apart."""
        i, (near_lat, near_lon), off = _nearest(self._points(), (lat, lon))
        span = self.cum[i + 1] - self.cum[i]
        a, b = self.points[i], self.points[i + 1]
        seg_lat, seg_lon = b[0] - a[0], b[1] - a[1]
        # the share of the segment before the nearest point, from whichever coordinate moves more
        if abs(seg_lat) >= abs(seg_lon):
            share = (near_lat - a[0]) / seg_lat if seg_lat else 0.0
        else:
            share = (near_lon - a[1]) / seg_lon
        return self.cum[i] + min(max(share, 0.0), 1.0) * span, off

    def at(self, distance: float) -> tuple[float, float, float | None]:
        """(lat, lon, bearing) at a distance from the start."""
        distance = min(max(distance, 0.0), self.total)
        hi = next((i for i, c in enumerate(self.cum) if c >= distance and i > 0), len(self.cum) - 1)
        if hi == 0:
            return (*self.points[0], None)
        lo = hi - 1
        span = self.cum[hi] - self.cum[lo]
        f = (distance - self.cum[lo]) / span if span else 0.0
        (la, oa), (lb, ob) = self.points[lo], self.points[hi]
        return la + (lb - la) * f, oa + (ob - oa) * f, bearing(la, oa, lb, ob)


def bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float | None:
    dy = lat2 - lat1
    dx = (lon2 - lon1) * cos(radians((lat1 + lat2) / 2))
    if sqrt(dx * dx + dy * dy) == 0:
        return None
    return (degrees(atan2(dx, dy)) + 360) % 360


# A stop is on a shape when a vertex of it is this close; a shape's stretch between two stops is rejected when it is
# this many times longer than the straight line (a loop or a branch, not the track between them).
SNAP_M = 1000
DETOUR = 2.5


def _nearest(shape: np.ndarray, point: Point) -> tuple[int, Point, float]:
    """The segment of `shape` nearest `point` (index of its first vertex), the nearest point on it, and the distance
    in metres. Segments, not vertices: some feeds (Amtrak's) put their vertices kilometres apart."""
    kx = M_PER_DEG * cos(radians(point[0]))
    xy = np.column_stack(((shape[:, 1] - point[1]) * kx, (shape[:, 0] - point[0]) * M_PER_DEG))
    a, seg = xy[:-1], xy[1:] - xy[:-1]
    length2 = (seg**2).sum(axis=1)
    t = np.clip(-(a * seg).sum(axis=1) / np.where(length2 == 0, 1, length2), 0, 1)
    near = a + seg * t[:, None]
    dist = np.hypot(near[:, 0], near[:, 1])
    i = int(dist.argmin())
    x, y = near[i]
    return i, (point[0] + float(y) / M_PER_DEG, point[1] + float(x) / kx), float(dist[i])


def follow_shapes(stops: list[Point], shapes: list[list[Point]]) -> list[Point]:
    """
    A line through `stops` that runs along the track: each stop-to-stop leg takes the stretch of whichever shape passes
    both stops (another route's shape over the same rails), and only falls back to a straight leg when none does.
    Routes published without shapes, and express trains that skip stops, otherwise draw chords across the map.
    """
    arrays = [np.asarray(s, dtype=float) for s in shapes if len(s) >= 2]
    out: list[Point] = stops[:1]
    for a, b in zip(stops, stops[1:], strict=False):
        straight = distance_m(a[0], a[1], b[0], b[1])
        best: tuple[float, list[Point]] | None = None
        for shape in arrays:
            (ia, pa, da), (ib, pb, db) = _nearest(shape, a), _nearest(shape, b)
            if max(da, db) > SNAP_M:
                continue
            middle = shape[ia + 1 : ib + 1] if ia <= ib else shape[ib + 1 : ia + 1][::-1]
            leg = [pa, *((float(lat), float(lon)) for lat, lon in middle), pb]
            if length_m(leg) > DETOUR * straight + 2 * SNAP_M:
                continue
            if best is None or da + db < best[0]:
                best = (da + db, leg)
        out += [*best[1], b] if best else [b]
    return out

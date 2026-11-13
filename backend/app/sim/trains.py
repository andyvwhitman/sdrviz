"""Passenger train runs, rebuilt from data/sim/trains.json and routes.json.

A run is a list of path points (arrival and departure times). `position(t)` interpolates
linearly in track miles, exactly as tools/gen_sim.py does. Freight is never positioned.
"""

from dataclasses import dataclass

from .timefmt import DAY

# Cruise speed (mph) of each service in trains.json.
SERVICE_SPEED_MPH = {
    "marc-penn": 48,
    "marc-camden": 36,
    "marc-brunswick": 40,
    "vre-fbg": 40,
    "vre-mss": 38,
    "acela": 80,
    "regional": 62,
    "auto-train": 45,
}


@dataclass(frozen=True)
class PathPoint:
    place_id: str
    route_id: str
    prefix: str | None
    mp: float | None
    mp_approx: bool
    route_mi: float
    lat: float
    lon: float
    arr: float
    dep: float
    stop: bool


def mp_text(prefix: str | None, mp: float | None, approx: bool) -> str | None:
    if prefix is None or mp is None:
        return None
    return f"{'≈' if approx else ''}{prefix} {mp:.1f}"


@dataclass(frozen=True)
class TrainRun:
    train_id: str
    operator: str
    line: str
    service: str
    direction: str
    points: tuple[PathPoint, ...]

    @property
    def start(self) -> float:
        return self.points[0].arr

    @property
    def end(self) -> float:
        return self.points[-1].arr

    @property
    def speed_mph(self) -> int:
        return SERVICE_SPEED_MPH[self.service]

    def position(self, t: float) -> dict | None:
        """Position in track miles at `t`; None when the run does not span `t`."""
        if not self.start <= t <= self.end:
            return None
        pts = self.points
        for i, p in enumerate(pts):
            if p.arr <= t <= p.dep:
                return self._pos(p, p, 0.0, 0, self._next_stop(i))
        for i, (a, b) in enumerate(zip(pts, pts[1:], strict=False)):
            if a.dep <= t <= b.arr and b.arr > a.dep:
                frac = (t - a.dep) / (b.arr - a.dep)
                return self._pos(a, b, frac, self.speed_mph, self._next_stop(i))
        return None

    def _next_stop(self, i: int) -> PathPoint | None:
        return next((q for q in self.points[i + 1 :] if q.stop), None)

    @staticmethod
    def _pos(a: PathPoint, b: PathPoint, frac: float, speed: int, nxt: PathPoint | None) -> dict:
        def lerp(x: float, y: float) -> float:
            return x + (y - x) * frac

        mp = None
        if a.mp is not None and b.mp is not None and a.prefix == b.prefix:
            mp = round(lerp(a.mp, b.mp), 1)
        approx = (a.mp_approx or b.mp_approx) if 0 < frac < 1 else a.mp_approx
        return {
            "route_id": b.route_id,
            "route_mi": round(lerp(a.route_mi, b.route_mi), 2),
            "prefix": b.prefix,
            "mp": mp,
            "mp_label": mp_text(b.prefix, mp, approx),
            "lat": round(lerp(a.lat, b.lat), 5),
            "lon": round(lerp(a.lon, b.lon), 5),
            "speed_mph": speed,
            "at_place": a.place_id if frac == 0 else None,
            "next_stop": nxt.place_id if nxt else None,
            "next_stop_t": nxt.arr if nxt else None,
        }


def _route_point(routes: dict[str, dict], route_id: str, place_id: str, label: str | None) -> dict:
    """The route point for a place; `label` picks one when a route passes the place twice."""
    candidates = [p for p in routes[route_id]["points"] if p["place_id"] == place_id]
    if len(candidates) > 1:
        candidates = [p for p in candidates if p["mp_label"] == label] or candidates
    return candidates[0]


def _point(route_pt: dict, arr: float, dep: float, stop: bool) -> PathPoint:
    return PathPoint(
        place_id=route_pt["place_id"],
        route_id=route_pt["route_id"],
        prefix=route_pt["prefix"],
        mp=route_pt["mp"],
        mp_approx=route_pt["mp_approx"],
        route_mi=route_pt["route_mi"],
        lat=route_pt["lat"],
        lon=route_pt["lon"],
        arr=arr,
        dep=dep,
        stop=stop,
    )


def build_run(record: dict, routes: dict[str, dict]) -> TrainRun:
    """Rebuild a run from its trains.json record.

    A milepost equation ("NEC 135.7 | ≈CFP 112.6") was merged into one stop by the generator;
    it is expanded back into the two path points it came from.
    """
    points: list[PathPoint] = []
    for stop in record["stops"]:
        arr = stop["t"]
        dep = stop.get("t_dep", arr)
        first = _route_point(routes, stop["route_id"], stop["place_id"], stop["mp"])
        points.append(_point({**first, "route_id": stop["route_id"]}, arr, dep, stop["stop"]))
        if "mp_equation" in stop:
            label = stop["mp_equation"].split(" | ", 1)[1]
            next_route = stop["route_id_next"]
            second = _route_point(routes, next_route, stop["place_id"], None if label == "None" else label)
            points.append(_point({**second, "route_id": next_route}, dep, dep, stop["stop"]))
    return TrainRun(
        train_id=record["train_id"],
        operator=record["operator"],
        line=record["line"],
        service=record["service"],
        direction=record["direction"],
        points=tuple(points),
    )


def load_runs(trains: list[dict], routes: dict[str, dict]) -> list[TrainRun]:
    return [build_run(record, routes) for record in trains]


def trains_at(runs: list[TrainRun], t: float) -> list[tuple[TrainRun, dict]]:
    """Positions at `t`, resolving runs that cross midnight on the repeating day."""
    out = []
    for run in runs:
        for shift in (0, DAY, -DAY):
            pos = run.position(t + shift)
            if pos:
                out.append((run, pos))
                break
    return out

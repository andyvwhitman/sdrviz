"""A GTFS static feed (the zip), parsed with the standard library into compact lookups.

`full=True` keeps every stop_time (schedules, boards, timetables). `full=False` is for feeds drawn only as lines on
the map: stop_times are streamed through once to learn which stops each route serves, and then dropped.
"""

import csv
import io
import re
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from .places import distance_m

DEFAULT_TZ = "America/New_York"
STATION_MERGE_M = 400  # same-named stops this close are one station (MARC lists a stop per direction)
DIRECTION_SUFFIX = re.compile(r"\s+(nb|sb|eb|wb)$", re.IGNORECASE)

Point = tuple[float, float]  # (lat, lon)


@dataclass(frozen=True)
class Stop:
    id: str
    name: str
    lat: float
    lon: float
    parent: str | None = None
    location_type: int = 0
    tz: str | None = None


@dataclass(frozen=True)
class Route:
    id: str
    name: str
    short_name: str | None = None
    color: str | None = None
    type: int | None = None


@dataclass(frozen=True)
class Trip:
    id: str
    route_id: str
    service_id: str
    headsign: str | None
    number: str | None
    direction: int = 0
    shape_id: str | None = None


@dataclass(frozen=True)
class StopTime:
    stop_id: str
    sequence: int
    arrival: int | None  # seconds after midnight of the service day; may exceed 86400
    departure: int | None


@dataclass
class Calendar:
    days: tuple[bool, ...]  # Monday first
    start: date
    end: date


def seconds(text: str) -> int | None:
    """'25:10:00' -> 90600. Blank when the feed only times its timepoints."""
    if not text or not text.strip():
        return None
    h, m, s = (int(part) for part in text.strip().split(":"))
    return h * 3600 + m * 60 + s


def _day(text: str) -> date:
    return datetime.strptime(text.strip(), "%Y%m%d").date()


def _reader(archive: zipfile.ZipFile, name: str):
    """Rows as lists, header first, fields stripped (Metra pads its CSV with spaces)."""
    if name not in archive.namelist():
        return
    with archive.open(name) as raw:
        for row in csv.reader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")):
            yield [cell.strip() for cell in row]


def _rows(archive: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    rows = _reader(archive, name)
    header = next(rows, None)
    return [dict(zip(header, row, strict=False)) for row in rows] if header else []


def _columns(archive: zipfile.ZipFile, name: str, *wanted: str):
    """Yield tuples of the wanted columns (missing ones as ''), cheaper than a dict per row for big files."""
    rows = _reader(archive, name)
    header = next(rows, None)
    if not header:
        return
    index = [header.index(w) if w in header else -1 for w in wanted]
    for row in rows:
        yield tuple(row[i] if 0 <= i < len(row) else "" for i in index)


def trip_number(short_name: str, trip_id: str) -> str:
    """'Train 400' -> '400'; VRE's trip_short_name is already '300'."""
    text = short_name or trip_id
    return text.removeprefix("Train").strip() or trip_id


def station_name(name: str) -> str:
    return DIRECTION_SUFFIX.sub("", name)


def open_feed(source: bytes | Path) -> zipfile.ZipFile:
    """The feed's zip; SEPTA wraps its rail and bus feeds as zips inside a zip, so look one level down."""
    archive = zipfile.ZipFile(io.BytesIO(source) if isinstance(source, bytes) else source)
    if "routes.txt" in archive.namelist():
        return archive
    inner = [n for n in archive.namelist() if n.lower().endswith(".zip")]
    inner.sort(key=lambda n: "rail" not in n.lower())
    if not inner:
        raise ValueError("no routes.txt in the feed")
    return zipfile.ZipFile(io.BytesIO(archive.read(inner[0])))


@dataclass
class GtfsStatic:
    timezone: ZoneInfo = field(default_factory=lambda: ZoneInfo(DEFAULT_TZ))
    version: str | None = None
    stops: dict[str, Stop] = field(default_factory=dict)
    routes: dict[str, Route] = field(default_factory=dict)
    trips: dict[str, Trip] = field(default_factory=dict)
    stop_times: dict[str, list[StopTime]] = field(default_factory=dict)  # full feeds only
    at_stop: dict[str, list[tuple[str, int]]] = field(default_factory=dict)  # stop id -> (trip id, index in trip)
    calendar: dict[str, Calendar] = field(default_factory=dict)
    exceptions: dict[tuple[str, date], int] = field(default_factory=dict)  # 1 = added, 2 = removed
    shapes: dict[str, list[Point]] = field(default_factory=dict)  # only the shapes the kept trips use
    route_shapes: dict[str, list[str]] = field(default_factory=dict)  # route id -> distinct shape ids
    route_stops: dict[str, set[str]] = field(default_factory=dict)  # route id -> stop ids it serves
    route_sequences: dict[str, set[tuple[str, ...]]] = field(default_factory=dict)  # stop lists of shapeless trips
    # stations: the unit shown on the map (a parent station, or the stops of one name that sit together)
    station_of: dict[str, str] = field(default_factory=dict)
    members: dict[str, list[str]] = field(default_factory=dict)
    stations: dict[str, Stop] = field(default_factory=dict)

    @classmethod
    def from_zip(
        cls,
        source: bytes | Path,
        route_types: list[int] | None = None,
        full: bool = True,
        keep_shapes: bool = True,
        exclude_routes: list[str] | None = None,
    ) -> "GtfsStatic":
        archive = open_feed(source)
        feed = cls()
        feed._parse(archive, route_types, full, set(exclude_routes or ()))
        if not keep_shapes:
            feed.shapes = {}
        return feed

    def _parse(
        self, archive: zipfile.ZipFile, route_types: list[int] | None, full: bool, exclude_routes: set[str]
    ) -> None:
        agencies = _rows(archive, "agency.txt")
        if agencies and agencies[0].get("agency_timezone"):
            self.timezone = ZoneInfo(agencies[0]["agency_timezone"])
        info = _rows(archive, "feed_info.txt")
        if info:
            self.version = info[0].get("feed_version") or info[0].get("feed_start_date") or None
        for r in _rows(archive, "stops.txt"):
            self.stops[r["stop_id"]] = Stop(
                r["stop_id"],
                r.get("stop_name", ""),
                float(r.get("stop_lat") or 0),
                float(r.get("stop_lon") or 0),
                r.get("parent_station") or None,
                int(r.get("location_type") or 0),
                r.get("stop_timezone") or None,
            )
        for r in _rows(archive, "routes.txt"):
            rtype = int(r["route_type"]) if r.get("route_type", "").isdigit() else None
            if (route_types is not None and rtype not in route_types) or r["route_id"] in exclude_routes:
                continue  # trips, stop_times, shapes and lines all follow `self.routes`
            short = r.get("route_short_name") or None
            self.routes[r["route_id"]] = Route(
                r["route_id"],
                r.get("route_long_name") or short or r["route_id"],
                short,
                (r.get("route_color") or "").lstrip("#") or None,
                rtype,
            )
        wanted_shapes: set[str] = set()
        for r in _rows(archive, "trips.txt"):
            if r["route_id"] not in self.routes:
                continue
            shape_id = r.get("shape_id") or None
            self.trips[r["trip_id"]] = Trip(
                r["trip_id"],
                r["route_id"],
                r["service_id"],
                r.get("trip_headsign") or None,
                trip_number(r.get("trip_short_name", ""), r["trip_id"]),
                int(r.get("direction_id") or 0),
                shape_id,
            )
            if shape_id:
                wanted_shapes.add(shape_id)
                shapes = self.route_shapes.setdefault(r["route_id"], [])
                if shape_id not in shapes:
                    shapes.append(shape_id)
        for r in _rows(archive, "calendar.txt"):
            days = tuple(
                r[d] == "1" for d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
            )
            self.calendar[r["service_id"]] = Calendar(days, _day(r["start_date"]), _day(r["end_date"]))
        for r in _rows(archive, "calendar_dates.txt"):
            self.exceptions[(r["service_id"], _day(r["date"]))] = int(r["exception_type"])
        if any(route_id not in self.route_shapes for route_id in self.routes):
            wanted_shapes = None  # a route has no shape: keep every shape, its line follows them (lines.follow_shapes)
        self._parse_shapes(archive, wanted_shapes)
        self._parse_stop_times(archive, full)
        self._build_stations()

    def _parse_shapes(self, archive: zipfile.ZipFile, wanted: set[str] | None) -> None:
        """The shapes trips use, or all of them when `wanted` is None."""
        points: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
        for shape_id, lat, lon, seq in _columns(
            archive, "shapes.txt", "shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"
        ):
            if wanted is None or shape_id in wanted:
                points[shape_id].append((int(seq), float(lat), float(lon)))
        for shape_id, pts in points.items():
            pts.sort()
            self.shapes[shape_id] = [(lat, lon) for _, lat, lon in pts]

    def _parse_stop_times(self, archive: zipfile.ZipFile, full: bool) -> None:
        sequences: dict[str, list[tuple[int, str]]] = defaultdict(list)  # trips without a shape, for a fallback line
        trips = self.trips
        for trip_id, arrival, departure, stop_id, seq in _columns(
            archive, "stop_times.txt", "trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"
        ):
            trip = trips.get(trip_id)
            if trip is None:
                continue
            self.route_stops.setdefault(trip.route_id, set()).add(stop_id)
            if full:
                self.stop_times.setdefault(trip_id, []).append(
                    StopTime(stop_id, int(seq), seconds(arrival), seconds(departure))
                )
            if trip.shape_id is None or trip.shape_id not in self.shapes:
                sequences[trip_id].append((int(seq), stop_id))
        for trip_id, pairs in sequences.items():
            pairs.sort()
            self.route_sequences.setdefault(trips[trip_id].route_id, set()).add(tuple(s for _, s in pairs))
        for trip_id, times in self.stop_times.items():
            times.sort(key=lambda t: t.sequence)
            for index, st in enumerate(times):
                self.at_stop.setdefault(st.stop_id, []).append((trip_id, index))

    def _build_stations(self) -> None:
        served = {sid for stops in self.route_stops.values() for sid in stops if sid in self.stops}
        groups: dict[str, list[str]] = {}
        loose: dict[str, list[list[str]]] = defaultdict(list)  # normalised name -> clusters of nearby stops
        for sid in sorted(served):
            stop = self.stops[sid]
            if stop.parent and stop.parent in self.stops:
                groups.setdefault(stop.parent, []).append(sid)
                continue
            clusters = loose[station_name(stop.name).lower()]
            for cluster in clusters:
                first = self.stops[cluster[0]]
                if distance_m(first.lat, first.lon, stop.lat, stop.lon) <= STATION_MERGE_M:
                    cluster.append(sid)
                    break
            else:
                clusters.append([sid])
        for clusters in loose.values():
            for cluster in clusters:
                groups[cluster[0]] = cluster
        for station_id, children in groups.items():
            base = self.stops[station_id]
            self.stations[station_id] = Stop(station_id, station_name(base.name), base.lat, base.lon, tz=base.tz)
            self.members[station_id] = sorted({station_id, *children} & set(self.stops))
            for sid in self.members[station_id]:
                self.station_of[sid] = station_id

    # --- queries -----------------------------------------------------------

    def services_on(self, day: date) -> set[str]:
        active = {sid for sid, cal in self.calendar.items() if cal.start <= day <= cal.end and cal.days[day.weekday()]}
        for (sid, d), kind in self.exceptions.items():
            if d == day:
                (active.add if kind == 1 else active.discard)(sid)
        return active

    def midnight(self, day: date) -> datetime:
        """Start of a service day. Times are in the agency timezone (Amtrak's too, even for Los Angeles stops)."""
        return datetime(day.year, day.month, day.day, tzinfo=self.timezone)

    def service_days(self, now: datetime) -> list[date]:
        """Yesterday and today: yesterday's late trips run past midnight (times of 24:30 and up)."""
        today = now.astimezone(self.timezone).date()
        return [today - timedelta(days=1), today]

    def served_stops(self) -> list[Stop]:
        return [self.stops[sid] for sid in self.at_stop if sid in self.stops]

    def track_of(self, stop_id: str) -> str | None:
        """A platform stop under a parent station is named for its track (VRE: '1', '2')."""
        stop = self.stops.get(stop_id)
        return stop.name if stop and stop.parent and stop.name.isdigit() else None

    def station_name(self, stop: Stop) -> str:
        """The parent station's name for a platform stop ('2' belongs to 'Union Station')."""
        parent = self.stops.get(stop.parent) if stop.parent else None
        return station_name(parent.name if parent else stop.name)

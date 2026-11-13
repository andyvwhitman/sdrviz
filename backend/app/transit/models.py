"""What the transit API returns (see docs/transit-api.md). Ids are "<source>:<gtfs id>" so sources never collide."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, computed_field, model_validator

ON_TIME_S = 120  # |delay| under two minutes counts as on time


def delay_status(delay_s: int | None) -> Literal["on_time", "late", "early", "unknown"]:
    if delay_s is None:
        return "unknown"
    if abs(delay_s) < ON_TIME_S:
        return "on_time"
    return "late" if delay_s > 0 else "early"


class NextStop(BaseModel):
    stop_id: str
    name: str
    eta: datetime | None = None
    scheduled: datetime | None = None


class Vehicle(BaseModel):
    id: str
    trip_id: str | None = None
    source: str
    agency: str
    route_id: str | None = None
    route_name: str | None = None
    train: str | None = None
    headsign: str | None = None
    origin: str | None = None
    destination: str | None = None
    lat: float
    lon: float
    bearing: float | None = None  # degrees clockwise from north
    speed_mph: float | None = None
    delay_s: int | None = None  # positive = late
    status: Literal["on_time", "late", "early", "unknown"] = "unknown"
    next_stop: NextStop | None = None
    position: Literal["realtime", "estimated"] = "realtime"
    updated: datetime | None = None
    age_s: int | None = None
    stale_after_s: int  # its source's threshold: a position older than this is stale

    @computed_field
    @property
    def stale(self) -> bool:
        return self.age_s is not None and self.age_s > self.stale_after_s


class TripStop(BaseModel):
    stop_id: str
    name: str
    seq: int
    arr_scheduled: datetime | None = None
    arr_estimated: datetime | None = None
    dep_scheduled: datetime | None = None
    dep_estimated: datetime | None = None
    delay_s: int | None = None
    track: str | None = None
    state: Literal["passed", "current", "next", "upcoming", "skipped"] = "upcoming"
    state_basis: Literal["position", "clock"] = "clock"  # position = from the train's fresh position; clock = estimated
    kind: Literal["stop", "pass"] = "stop"  # "pass": the train runs through without stopping (`?passes=1` only)
    pass_scheduled: datetime | None = None  # a pass entry's approximate time (arr_* and dep_* are null then)
    pass_estimated: datetime | None = None
    approx: bool = False  # true for every pass entry: the time is interpolated, not published


class Alert(BaseModel):
    header: str
    description: str | None = None
    url: str | None = None
    routes: list[str] = []  # namespaced route ids
    stops: list[str] = []  # namespaced stop ids
    start: datetime | None = None
    end: datetime | None = None


class Trip(BaseModel):
    id: str
    source: str
    agency: str
    route_id: str | None = None
    route_name: str | None = None
    train: str | None = None
    headsign: str | None = None
    service_date: str
    vehicle: Vehicle | None = None
    stops: list[TripStop]
    alerts: list[Alert] = []  # service alerts for this trip's route or stops


class Stop(BaseModel):
    id: str
    source: str
    name: str
    code: str | None = None  # Amtrak station code ("WAS"), when the station has one
    short_name: str | None = None  # "Washington Union": for tight spaces, set for curated station groups
    lat: float
    lon: float
    kind: Literal["intercity", "commuter"]
    routes: list[str]
    sources: list[str] = []  # the sources behind it: [source], or every member's source for a station group

    @model_validator(mode="after")
    def _default_sources(self) -> "Stop":
        if not self.sources:
            self.sources = [self.source]
        return self


class Line(BaseModel):
    id: str
    source: str
    agency: str
    route_id: str
    name: str
    short_name: str | None = None
    color: str | None = None
    kind: Literal["intercity", "commuter"]
    coords: list[list[list[float]]]


class RouteBrief(BaseModel):
    id: str
    name: str
    short_name: str | None = None
    color: str | None = None
    agency: str


class BoardRow(BaseModel):
    trip_id: str
    source: str
    train: str | None = None
    route_name: str | None = None
    agency: str
    headsign: str | None = None  # departures: destination; arrivals: origin
    origin: str | None = None  # station name where the trip begins (every row)
    destination: str | None = None  # station name where the trip ends (every row)
    scheduled: datetime
    estimated: datetime | None = None
    delay_s: int | None = None
    track: str | None = None
    state: Literal["passed", "upcoming", "cancelled"]
    state_basis: Literal["position", "clock"] = "clock"  # position = from the train's fresh position; clock = estimated
    added: bool = False  # realtime shows this train but the schedule has no such trip


class StationBoard(BaseModel):
    stop: Stop
    canonical_id: str  # the id to address this station by: its group (`st:was`), else the stop's own id
    routes: list[RouteBrief]
    departures: list[BoardRow]
    arrivals: list[BoardRow]
    alerts: list[Alert] = []


class StationSuggestion(BaseModel):
    """Two stations of different sources that may be one (a proposal for Settings, never applied)."""

    a: Stop
    b: Stop
    distance_m: int
    reason: Literal["name", "distance"]  # same name within 1 km, or just within 800 m


class MergeMember(BaseModel):
    source: str
    stop_id: str  # the source's own station id (`<source>:<stop_id>` is what the API calls it)
    name: str
    distance_m: int  # from the group's position
    method: Literal["curated", "auto"]


class MergeGroup(BaseModel):
    id: str  # "st:was"
    code: str
    name: str
    short_name: str | None = None
    lat: float
    lon: float
    members: list[MergeMember]


class Merges(BaseModel):
    """Every station group with how each member got in, plus pairs of ungrouped stations that may be one."""

    radius_m: int
    groups: list[MergeGroup]
    suggestions: list[StationSuggestion]


class RouteInfo(BaseModel):
    id: str
    source: str
    agency: str
    name: str
    short_name: str | None = None
    color: str | None = None
    kind: Literal["intercity", "commuter"]


class TimetableStop(BaseModel):
    stop_id: str
    name: str


class TimetableTrip(BaseModel):
    trip_id: str
    train: str | None = None
    times: list[datetime | None]


class TimetableDirection(BaseModel):
    id: int
    headsign: str
    stops: list[TimetableStop]
    trips: list[TimetableTrip]


class Timetable(BaseModel):
    route: RouteInfo
    directions: list[TimetableDirection]


# --- the app-place board (/transit/stations/{place_id}/board), unchanged ---------------------------------


class BoardEntry(BaseModel):
    agency: str
    route: str | None = None
    train: str | None = None
    headsign: str | None = None
    origin: str | None = None  # where the trip began, for arrivals
    event: str  # "departure", or "arrival" at a trip's last stop
    scheduled: datetime
    estimated: datetime | None = None  # None until the agency publishes a realtime estimate
    delay_s: int | None = None
    track: str | None = None
    status: str  # scheduled, on time, delayed, departed, arrived, cancelled


class Board(BaseModel):
    place_id: str
    name: str
    generated: datetime
    upcoming: list[BoardEntry]
    departed: list[BoardEntry]
    sources: list[str]  # source ids that serve this place
    attribution: list[str] = []

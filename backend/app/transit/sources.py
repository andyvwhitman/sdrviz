"""Transit sources: what the settings page edits and what the database stores (see docs/transit-api.md)."""

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

MASK = "***"
MIN_STALE_S = 120  # default stale threshold: twice the poll interval, never under two minutes


class SourceCounts(BaseModel):
    routes: int = 0
    stops: int = 0
    trips: int = 0
    vehicles: int = 0


class SourceTimings(BaseModel):
    static_load_s: float | None = None  # download + parse + index of the last static load
    rt_fetch_ms: float | None = None  # last realtime poll


class SourceStatus(BaseModel):
    state: Literal["ok", "stale", "error", "disabled", "loading"] = "loading"
    error: str | None = None
    static_loaded_at: datetime | None = None
    static_version: str | None = None
    rt_updated_at: datetime | None = None
    counts: SourceCounts = Field(default_factory=SourceCounts)
    timings: SourceTimings = Field(default_factory=SourceTimings)


class SourceConfig(BaseModel):
    """A source as written by the client (no status)."""

    id: str
    name: str
    agency: str
    kind: Literal["gtfs", "amtraker", "lines"] = "gtfs"
    enabled: bool = True
    static_url: str | None = None
    rt_trip_updates_url: str | None = None
    rt_vehicle_positions_url: str | None = None
    rt_alerts_url: str | None = None
    api_key: str | None = None  # write-only: reads return MASK when set
    key_header: str | None = None  # header (or query parameter) name for the key
    route_types: list[int] | None = None  # GTFS route_type filter, [2] = rail; None = all
    exclude_routes: list[str] | None = None  # raw GTFS route_ids dropped from the static feed and its realtime
    static_refresh_h: float = Field(default=24.0, gt=0)
    rt_poll_s: float = Field(default=15.0, ge=5)
    stale_after_s: int | None = Field(default=None, gt=0)  # a train whose position is older than this is stale

    @model_validator(mode="after")
    def _default_stale(self) -> "SourceConfig":
        if self.stale_after_s is None:
            self.stale_after_s = max(MIN_STALE_S, round(2 * self.rt_poll_s))
        return self

    @field_validator("id")
    @classmethod
    def _slug(cls, value: str) -> str:
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,39}", value):
            raise ValueError("id must be a lowercase slug (letters, digits, - and _)")
        return value

    @property
    def headers(self) -> dict[str, str]:
        return {self.key_header or "Authorization": self.api_key} if self.api_key else {}


class TransitSource(SourceConfig):
    """A source as the API returns it."""

    status: SourceStatus = Field(default_factory=SourceStatus)


AMTRAK_STATIC = "https://content.amtrak.com/content/gtfs/GTFS.zip"
# Amtrak's "Commuter Rail" routes: MARC Penn Line and CTrail Shore Line East trips (each agency owns its trains)
AMTRAK_COMMUTER_ROUTES = ["42985", "42948"]


def _lines(
    id_: str, name: str, agency: str, url: str, route_types: list[int] | None = (2,), enabled: bool = True
) -> SourceConfig:
    return SourceConfig(
        id=id_,
        name=name,
        agency=agency,
        kind="lines",
        enabled=enabled,
        static_url=url,
        route_types=list(route_types) if route_types else None,
        static_refresh_h=168,
    )


DEFAULT_SOURCES: list[SourceConfig] = [
    SourceConfig(
        id="amtrak",
        name="Amtrak",
        agency="Amtrak",
        kind="amtraker",
        static_url=AMTRAK_STATIC,
        route_types=[2],
        exclude_routes=AMTRAK_COMMUTER_ROUTES,
        rt_poll_s=60,
        stale_after_s=360,
    ),
    SourceConfig(
        id="marc",
        name="MARC Train",
        agency="MARC",
        static_url="https://feeds.mta.maryland.gov/gtfs/marc",
        rt_trip_updates_url="https://mdotmta-gtfs-rt.s3.amazonaws.com/MARC+RT/marc-tu.pb",
        rt_vehicle_positions_url="https://mdotmta-gtfs-rt.s3.amazonaws.com/MARC+RT/marc-vp.pb",
        rt_alerts_url="https://feeds.mta.maryland.gov/alerts.pb",  # all MDOT MTA modes; filtered to MARC's routes
        stale_after_s=120,
    ),
    SourceConfig(
        id="vre",
        name="Virginia Railway Express",
        agency="VRE",
        enabled=False,
        static_url="https://gtfs.vre.org/containercdngtfsupload/google_transit.zip",
        rt_trip_updates_url="https://gtfs.vre.org/containercdngtfsupload/TripUpdateFeed",
        rt_vehicle_positions_url="https://gtfs.vre.org/containercdngtfsupload/VehiclePositionFeed",
        stale_after_s=120,
    ),
    _lines("lirr", "Long Island Rail Road", "MTA LIRR", "https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip"),
    _lines("mnr", "Metro-North Railroad", "MTA Metro-North", "https://rrgtfsfeeds.s3.amazonaws.com/gtfsmnr.zip"),
    _lines(
        "septa",
        "SEPTA Regional Rail",
        "SEPTA",
        "https://github.com/septadev/GTFS/releases/latest/download/gtfs_public.zip",
    ),
    _lines("mbta", "MBTA Commuter Rail", "MBTA", "https://cdn.mbta.com/MBTA_GTFS.zip"),
    _lines("metra", "Metra", "Metra", "https://schedules.metrarail.com/gtfs/schedule.zip"),
    _lines(
        "caltrain", "Caltrain", "Caltrain", "https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip"
    ),
    _lines("smart", "SMART", "SMART", "https://data.trilliumtransit.com/gtfs/smart-ca-us/smart-ca-us.zip"),
    _lines("metrolink", "Metrolink", "Metrolink", "https://metrolinktrains.com/globalassets/about/gtfs/gtfs.zip"),
    _lines(
        "coaster",
        "Coaster and Sprinter",
        "NCTD",
        "https://lfportal.nctd.org/staticGTFS/google_transit.zip",
        enabled=False,
    ),
    _lines(
        "sounder",
        "Sounder and Sound Transit rail",
        "Sound Transit",
        "https://www.soundtransit.org/GTFS-rail/40_gtfs.zip",
    ),
    _lines("wes", "WES Commuter Rail", "TriMet", "https://developer.trimet.org/schedule/gtfs.zip"),
    _lines("frontrunner", "FrontRunner", "UTA", "https://gtfsfeed.rideuta.com/GTFS.zip"),
    _lines("rtd-rail", "RTD commuter rail", "RTD Denver", "https://www.rtd-denver.com/files/gtfs/google_transit.zip"),
    _lines("tre", "Trinity Railway Express", "DART", "https://www.dart.org/transitdata/latest/google_transit.zip"),
    _lines("sunrail", "SunRail", "SunRail", "https://corporate.sunrail.com/gtfs/google_transit.zip"),
]

"""One transit source: loads its static GTFS (cached on disk), keeps the map lines and stations, answers queries.

This base class is a complete `lines` source (shapes and stations only). `GtfsProvider` adds schedules and realtime.
"""

import asyncio
import logging
import sys
import time
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx

from .geometry import Bbox
from .gtfs_static import GtfsStatic
from .lines import LineIndex
from .models import (
    Alert,
    BoardEntry,
    Line,
    RouteBrief,
    RouteInfo,
    StationBoard,
    Stop,
    Timetable,
    Trip,
    Vehicle,
)
from .places import Place
from .sources import SourceConfig, SourceCounts, SourceStatus, SourceTimings
from .stations import StationGroups

log = logging.getLogger(__name__)

LATE_S = 300  # five minutes behind counts as "delayed" on the place board
USER_AGENT = "sdrviz/0.1 (railroad radio visualizer)"
RETRY_S = 600  # after a failed download, try again in ten minutes


@dataclass
class ProviderState:
    """What the status shows, plus errors kept apart so each can clear on its own."""

    static_error: str | None = None
    realtime_error: str | None = None
    static_loaded: datetime | None = None
    realtime_updated: datetime | None = None
    version: str | None = None
    static_load_s: float | None = None
    rt_fetch_ms: float | None = None
    routes: int = 0
    stops: int = 0
    trips: int = 0
    vehicles: int = 0
    places: int = 0
    memory_bytes: int = 0


def deep_size(root: object) -> int:
    """Approximate bytes of a nested structure of containers and dataclasses (each object counted once)."""
    seen: set[int] = set()
    stack = [root]
    total = 0
    while stack:
        obj = stack.pop()
        if id(obj) in seen:
            continue
        seen.add(id(obj))
        total += sys.getsizeof(obj)
        if isinstance(obj, dict):
            stack += list(obj.keys()) + list(obj.values())
        elif isinstance(obj, list | tuple | set | frozenset):
            stack += list(obj)
        elif hasattr(obj, "__dict__"):
            stack += list(vars(obj).values())
        elif hasattr(obj, "__slots__"):
            stack += [getattr(obj, s) for s in obj.__slots__ if hasattr(obj, s)]
    return total


def entry_status(delay_s: int | None, past: bool, event: str, canceled: bool = False) -> str:
    if canceled:
        return "cancelled"
    if past:
        return "arrived" if event == "arrival" else "departed"
    if delay_s is None:
        return "scheduled"
    return "delayed" if delay_s >= LATE_S else "on time"


class Provider:
    def __init__(self, source: SourceConfig, cache_dir: Path):
        self.source = source
        self.cache_dir = cache_dir
        self.zip_path = cache_dir / f"{source.id}-gtfs.zip"
        self.state = ProviderState()
        self.static: GtfsStatic | None = None  # None for `lines` sources: only the index is kept
        self.index: LineIndex | None = None
        self.places: list[Place] = []
        self.gate: asyncio.Semaphore | None = None  # limits how many big feeds parse at once
        self.groups = StationGroups()  # cross-source stations, set by the service
        self._static_at = 0.0
        self._etag: str | None = None

    # --- identity ----------------------------------------------------------

    @property
    def kind(self) -> str:
        """intercity (Amtrak) or commuter, for how the map styles the source."""
        return "intercity" if self.source.kind == "amtraker" else "commuter"

    @property
    def attribution(self) -> str | None:
        return None

    def gid(self, local_id: str) -> str:
        return f"{self.source.id}:{local_id}"

    def station_id(self, stop_id: str) -> str:
        """The station a stop (or platform) belongs to in this source."""
        return self.static.station_of.get(stop_id, stop_id) if self.static else stop_id

    def station_gid(self, stop_id: str) -> str:
        """The API id of a stop's station: its group (`st:was`) when it has one, else `<source>:<station>`."""
        station = self.station_id(stop_id)
        group = self.groups.resolve(self.source.id, station) or self.groups.resolve(self.source.id, stop_id)
        return group or self.gid(station)

    @property
    def has_realtime(self) -> bool:
        return False

    @property
    def keep_shapes(self) -> bool:
        return False

    # --- loading -----------------------------------------------------------

    async def update(self, client: httpx.AsyncClient, force: bool = False) -> None:
        """Refresh whatever is due. Errors go in `state`, never out."""
        if self.source.static_url and (force or self._static_due()):
            if self.gate:
                async with self.gate:
                    await self._load_static(client, force)
            else:
                await self._load_static(client, force)
        await self._load_realtime(client)

    async def _load_realtime(self, client: httpx.AsyncClient) -> None:
        """Sources with live data override this."""

    def _static_due(self) -> bool:
        return time.time() - self._static_at > self.source.static_refresh_h * 3600

    async def _download(self, client: httpx.AsyncClient) -> None:
        self.zip_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.zip_path.with_suffix(".part")
        async with client.stream("GET", self.source.static_url, headers=self.source.headers) as response:
            response.raise_for_status()
            self._etag = response.headers.get("etag") or response.headers.get("last-modified")
            with tmp.open("wb") as out:
                async for chunk in response.aiter_bytes(1 << 20):
                    out.write(chunk)
        tmp.replace(self.zip_path)

    async def _load_static(self, client: httpx.AsyncClient, force: bool) -> None:
        st = self.state
        started = time.monotonic()
        fresh = (
            not force
            and self.zip_path.exists()
            and time.time() - self.zip_path.stat().st_mtime < self.source.static_refresh_h * 3600
        )
        try:
            if not fresh:
                await self._download(client)
            await self._parse_cached()
        except Exception as exc:  # a dead source must never break the app; keep whatever was loaded before
            st.static_error = f"{type(exc).__name__}: {exc}"
            log.warning("%s static GTFS failed: %s", self.source.id, st.static_error)
            self._static_at = time.time() - self.source.static_refresh_h * 3600 + RETRY_S
            if self.index is None and self.zip_path.exists():  # last resort: the file on disk, however old
                try:
                    await self._parse_cached()
                except Exception:
                    log.exception("%s cached GTFS is unreadable", self.source.id)
            return
        self._static_at = time.time()
        st.static_error = None
        st.static_loaded = datetime.now(UTC)
        st.static_load_s = round(time.monotonic() - started, 2)

    async def _parse_cached(self) -> None:
        static, index = await asyncio.to_thread(self._build, self.zip_path)
        self.static, self.index = static, index
        st = self.state
        st.version = (static.version if static else None) or self._etag
        st.routes = len(index.lines)
        st.stops = len(index.stations)
        st.trips = len(static.trips) if static else 0
        st.memory_bytes = await asyncio.to_thread(deep_size, (static, index))
        self.on_static_loaded()

    def _build(self, path: Path) -> tuple[GtfsStatic | None, LineIndex]:
        """Runs in a thread. Lines sources go straight from a cached index when the zip has not changed."""
        full = self.source.kind != "lines"
        stat = path.stat()
        key = f"{stat.st_size}:{stat.st_mtime_ns}:{self.source.route_types}:{self.source.exclude_routes}"
        cache = self.cache_dir / f"{self.source.id}-lines.json"
        if not full and (index := LineIndex.load(cache, key)):
            return None, index
        feed = GtfsStatic.from_zip(
            path, self.source.route_types, full=full, keep_shapes=True, exclude_routes=self.source.exclude_routes
        )
        index = LineIndex.build(feed)
        if not full:
            index.save(cache, key)
            return None, index
        if not self.keep_shapes:
            feed.shapes = {}
        return feed, index

    def on_static_loaded(self) -> None:
        """Hook for subclasses (map places onto the new stops)."""

    # --- status ------------------------------------------------------------

    def api_status(self) -> SourceStatus:
        st = self.state
        error = st.static_error or st.realtime_error
        loaded = st.static_loaded or st.realtime_updated
        if error:
            state = "stale" if loaded else "error"
        else:
            state = "ok" if (loaded or not self.source.static_url) else "loading"
        return SourceStatus(
            state=state,
            error=error,
            static_loaded_at=st.static_loaded,
            static_version=st.version,
            rt_updated_at=st.realtime_updated,
            counts=SourceCounts(routes=st.routes, stops=st.stops, trips=st.trips, vehicles=st.vehicles),
            timings=SourceTimings(static_load_s=st.static_load_s, rt_fetch_ms=st.rt_fetch_ms),
        )

    # --- map layers --------------------------------------------------------

    def lines(self, bbox: Bbox) -> list[Line]:
        if not self.index:
            return []
        return [
            Line(
                id=self.gid(line.route_id),
                source=self.source.id,
                agency=self.source.agency,
                route_id=self.gid(line.route_id),
                name=line.name,
                short_name=line.short_name,
                color=line.color,
                kind=self.kind,
                coords=parts,
            )
            for line, parts in self.index.lines_in(bbox)
        ]

    def stops(self, bbox: Bbox) -> list[Stop]:
        if not self.index:
            return []
        return [
            Stop(
                id=self.gid(st.id),
                source=self.source.id,
                name=st.name,
                lat=st.lat,
                lon=st.lon,
                kind=self.kind,
                routes=[self.gid(r) for r in st.routes],
            )
            for st in self.index.stations_in(bbox)
        ]

    def route_info(self, route_id: str) -> RouteInfo | None:
        line = next((ln for ln in self.index.lines if ln.route_id == route_id), None) if self.index else None
        if line is None:
            return None
        return RouteInfo(
            id=self.gid(route_id),
            source=self.source.id,
            agency=self.source.agency,
            name=line.name,
            short_name=line.short_name,
            color=line.color,
            kind=self.kind,
        )

    # --- live queries: sources with schedules override these ----------------

    def vehicles(self, now: datetime) -> list[Vehicle]:
        return []

    def alerts(self, now: datetime) -> list[Alert]:
        return []

    def trip(self, trip_id: str, now: datetime, day: date | None = None) -> Trip | None:
        return None

    def station_board(
        self, stop_id: str, now: datetime, back: timedelta, ahead: timedelta, day: date | None = None
    ) -> StationBoard | None:
        """Lines sources know a station's name and routes, but have no departures."""
        station = self.station_rec(stop_id)
        if station is None:
            return None
        stop = Stop(
            id=self.gid(station.id),
            source=self.source.id,
            name=station.name,
            lat=station.lat,
            lon=station.lon,
            kind=self.kind,
            routes=[self.gid(r) for r in station.routes],
        )
        return StationBoard(stop=stop, routes=self.route_briefs(station.routes), departures=[], arrivals=[])

    def station_rec(self, station_id: str):
        if self.index is None:
            return None
        if getattr(self, "_station_map_for", None) is not self.index:
            self._station_map = {s.id: s for s in self.index.stations}
            self._station_map_for = self.index
        return self._station_map.get(station_id)

    def route_briefs(self, route_ids: list[str]):
        lines = {ln.route_id: ln for ln in self.index.lines} if self.index else {}
        return [
            RouteBrief(
                id=self.gid(r),
                name=lines[r].name,
                short_name=lines[r].short_name,
                color=lines[r].color,
                agency=self.source.agency,
            )
            for r in route_ids
            if r in lines
        ]

    def timetable(self, route_id: str, day: date) -> Timetable | None:
        info = self.route_info(route_id)
        return Timetable(route=info, directions=[]) if info else None

    # --- the app-place board (unchanged) -----------------------------------

    def set_places(self, places: list[Place]) -> None:
        self.places = places
        self.remap_places()

    def remap_places(self) -> None:
        """Rebuild the place-to-stop mapping (places changed, or the stops did)."""

    def serves(self, place_id: str) -> bool:
        return False

    def board(self, place_id: str, now: datetime, back: timedelta, ahead: timedelta) -> list[BoardEntry]:
        return []

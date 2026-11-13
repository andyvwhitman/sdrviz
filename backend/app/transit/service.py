"""All transit sources behind one object: polls the enabled ones in the background and answers every query.

Sources can be added, edited, enabled, disabled and removed while the app runs; each change swaps that source's
provider (and its polling task) without touching the others.
"""

import asyncio
import contextlib
import json
import logging
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx

from .amtraker import AmtrakerProvider
from .geometry import Bbox, bbox_width_km
from .gtfs_provider import GtfsProvider
from .models import (
    Alert,
    Board,
    BoardEntry,
    BoardRow,
    Line,
    RouteBrief,
    RouteInfo,
    StationBoard,
    StationSuggestion,
    Stop,
    Timetable,
    Trip,
    Vehicle,
)
from .places import Place
from .provider import USER_AGENT, Provider
from .source_store import SourceStore
from .sources import MASK, SourceConfig, SourceStatus, TransitSource
from .stations import Candidate, StationGroup, StationGroups, suggest_pairs

log = logging.getLogger(__name__)

# Washington to Baltimore, Fredericksburg to Martinsburg: where the app's place boards look.
DEFAULT_BBOX = (38.2, -78.1, 39.7, -76.0)  # south, west, north, east
STATIC_PARALLEL = 2  # big national feeds parse a couple at a time
IDLE_POLL_S = 600  # a source with no realtime feed only checks whether its static copy is due
THIN_ABOVE_KM = 200  # stops are thinned (one per grid cell) when the map is wider than this
GRID_CELLS = 40
WORLD: Bbox = (-180, -90, 180, 90)


def load_places(seed_dir: Path) -> list[Place]:
    data = json.loads((seed_dir / "places.json").read_text(encoding="utf-8"))
    return [Place(p["id"], p["name"], p["lat"], p["lon"]) for p in data["stations"] if not p.get("fictional")]


def _when(entry: BoardEntry) -> datetime:
    return entry.estimated or entry.scheduled


def group_stop(group: StationGroup, stops: list[Stop]) -> Stop:
    """One map stop for a group, from the stops its members have in the view."""
    return Stop(
        id=group.id,
        source="group",
        name=group.name,
        code=group.code,
        short_name=group.short_name,
        lat=group.lat,
        lon=group.lon,
        kind="intercity" if any(s.kind == "intercity" for s in stops) else "commuter",
        routes=list(dict.fromkeys(r for s in stops for r in s.routes)),
        sources=sorted({s.source for s in stops}),
    )


def merge_boards(group: StationGroup, boards: list[StationBoard]) -> StationBoard:
    """The union of the members' boards, rows by time."""
    routes: dict[str, RouteBrief] = {}
    alerts: dict[tuple, Alert] = {}
    for board in boards:
        routes.update((r.id, r) for r in board.routes)
        alerts.update(((a.header, a.description), a) for a in board.alerts)
    return StationBoard(
        stop=group_stop(group, [b.stop for b in boards]),
        canonical_id=group.id,
        routes=list(routes.values()),
        departures=sorted((r for b in boards for r in b.departures), key=_row_time),
        arrivals=sorted((r for b in boards for r in b.arrivals), key=_row_time),
        alerts=list(alerts.values()),
    )


def filter_board(board: StationBoard, agency: str | None, source: str | None) -> StationBoard:
    """Only the rows of one agency (name, any case) and/or one source id."""
    if not (agency or source):
        return board

    def keep(row: BoardRow) -> bool:
        return (not agency or row.agency.lower() == agency.lower()) and (not source or row.source == source)

    return board.model_copy(
        update={
            "departures": [r for r in board.departures if keep(r)],
            "arrivals": [r for r in board.arrivals if keep(r)],
        }
    )


def _row_time(row: BoardRow) -> datetime:
    return row.estimated or row.scheduled


def make_provider(source: SourceConfig, cache_dir: Path) -> Provider:
    if source.kind == "amtraker":
        return AmtrakerProvider(source, cache_dir)
    if source.kind == "lines":
        return Provider(source, cache_dir)
    return GtfsProvider(source, cache_dir)


def thin_stops(stops: list[Stop], bbox: Bbox, limit: int = 1500) -> list[Stop]:
    """Wide views get one stop per grid cell, intercity stations first, then the busiest."""
    width = bbox_width_km(bbox)
    if width <= THIN_ABOVE_KM:
        return stops
    west, south, east, north = bbox
    cell = max(east - west, north - south) / GRID_CELLS
    ranked = sorted(stops, key=lambda s: (s.kind != "intercity", -len(s.routes), s.name))
    taken: set[tuple[int, int]] = set()
    kept = []
    for stop in ranked:
        key = (int((stop.lon - west) / cell), int((stop.lat - south) / cell))
        if key not in taken:
            taken.add(key)
            kept.append(stop)
    return kept[:limit]


class TransitService:
    def __init__(
        self,
        sources: list[SourceConfig],
        cache_dir: Path,
        places: list[Place],
        store: SourceStore | None = None,
        bbox: tuple[float, float, float, float] = DEFAULT_BBOX,
        groups: StationGroups | None = None,
    ):
        self.cache_dir = cache_dir
        self.places = {p.id: p for p in places}
        self._places = places
        self.store = store
        self.bbox = bbox
        self.groups = groups or StationGroups()
        self._suggested: tuple[tuple, list[StationSuggestion]] | None = None
        self.configs: dict[str, SourceConfig] = {s.id: s for s in sources}
        self.providers: dict[str, Provider] = {}
        self._tasks: dict[str, asyncio.Task] = {}
        self._client: httpx.AsyncClient | None = None
        self._gate: asyncio.Semaphore | None = None
        for config in self.configs.values():
            if config.enabled:
                self.providers[config.id] = self._make(config)

    def _make(self, config: SourceConfig) -> Provider:
        provider = make_provider(config, self.cache_dir)
        provider.groups = self.groups
        provider.set_places(self._places)
        provider.gate = self._gate
        return provider

    # --- lifecycle ---------------------------------------------------------

    def start(self) -> None:
        self._client = httpx.AsyncClient(timeout=60, follow_redirects=True, headers={"User-Agent": USER_AGENT})
        self._gate = asyncio.Semaphore(STATIC_PARALLEL)
        for provider in self.providers.values():
            provider.gate = self._gate
            self._spawn(provider)

    async def stop(self) -> None:
        tasks = list(self._tasks.values())
        for task in tasks:
            task.cancel()
        for task in tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self._tasks.clear()
        if self._client:
            await self._client.aclose()

    def _spawn(self, provider: Provider) -> None:
        if self._client is not None:
            self._tasks[provider.source.id] = asyncio.create_task(
                self._poll(provider), name=f"transit-{provider.source.id}"
            )

    async def _drop(self, source_id: str) -> None:
        if task := self._tasks.pop(source_id, None):
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self.providers.pop(source_id, None)

    async def _poll(self, provider: Provider) -> None:
        while True:
            try:
                await provider.update(self._client)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # belt and braces: providers record their own errors
                provider.state.realtime_error = f"{type(exc).__name__}: {exc}"
                log.exception("transit source %s failed", provider.source.id)
            await asyncio.sleep(provider.source.rt_poll_s if provider.has_realtime else IDLE_POLL_S)

    # --- sources (the settings page) -----------------------------------------

    def source(self, source_id: str) -> TransitSource | None:
        config = self.configs.get(source_id)
        if config is None:
            return None
        provider = self.providers.get(source_id)
        status = provider.api_status() if provider else SourceStatus(state="disabled")
        shown = config.model_copy(update={"api_key": MASK if config.api_key else None})
        return TransitSource(**shown.model_dump(), status=status)

    def sources(self) -> list[TransitSource]:
        return [self.source(sid) for sid in self.configs]

    async def apply(self, config: SourceConfig) -> TransitSource:
        """Add or replace a source and make it live: the old provider stops, the new one starts."""
        previous = self.configs.get(config.id)
        if previous and config.api_key == MASK:  # the client echoed the masked key back: keep the stored one
            config = config.model_copy(update={"api_key": previous.api_key})
        config = config.model_copy(update={"api_key": config.api_key or None})
        self.configs[config.id] = config
        if self.store:
            await asyncio.to_thread(self.store.save, config)
        await self._drop(config.id)
        if config.enabled:
            provider = self._make(config)
            self.providers[config.id] = provider
            self._spawn(provider)
        return self.source(config.id)

    async def remove(self, source_id: str) -> bool:
        if source_id not in self.configs:
            return False
        await self._drop(source_id)
        del self.configs[source_id]
        if self.store:
            await asyncio.to_thread(self.store.delete, source_id)
        return True

    async def refresh(self, source_id: str) -> TransitSource | None:
        """Download and parse the static feed again now."""
        provider = self.providers.get(source_id)
        if provider is not None and self._client is not None:
            await provider.update(self._client, force=True)
        return self.source(source_id)

    # --- map layers ----------------------------------------------------------

    def lines(self, bbox: Bbox) -> list[Line]:
        return [line for p in self.providers.values() for line in p.lines(bbox)]

    def stops(self, bbox: Bbox) -> list[Stop]:
        found = [stop for p in self.providers.values() for stop in p.stops(bbox)]
        return thin_stops(self._grouped(found), bbox)

    def _grouped(self, stops: list[Stop]) -> list[Stop]:
        """Each group replaces its member stops with one stop (intercity if any member is, routes united)."""
        singles, members = [], {}
        for stop in stops:
            group_id = self.groups.resolve(stop.source, stop.id.partition(":")[2])
            if group_id:
                members.setdefault(group_id, []).append(stop)
            else:
                singles.append(stop)
        return singles + [group_stop(self.groups.groups[gid], found) for gid, found in members.items()]

    # --- live queries --------------------------------------------------------

    def vehicles(
        self, now: datetime | None = None, agency: str | None = None, bbox: Bbox | None = None
    ) -> list[Vehicle]:
        now = now or datetime.now(UTC)
        found = []
        for provider in self.providers.values():
            if agency and provider.source.agency.lower() != agency.lower():
                continue
            found += provider.vehicles(now)
        if bbox:
            west, south, east, north = bbox
            found = [v for v in found if south <= v.lat <= north and west <= v.lon <= east]
        return found

    def _split(self, gid: str) -> tuple[Provider, str] | None:
        source_id, _, local = gid.partition(":")
        provider = self.providers.get(source_id)
        return (provider, local) if provider and local else None

    def trip(self, gid: str, now: datetime | None = None, day: date | None = None) -> Trip | None:
        found = self._split(gid)
        return found[0].trip(found[1], now or datetime.now(UTC), day) if found else None

    def alerts(self, source: str | None = None, now: datetime | None = None) -> list[Alert]:
        now = now or datetime.now(UTC)
        return [a for sid, p in self.providers.items() if source in (None, sid) for a in p.alerts(now)]

    def _group_of(self, gid: str) -> StationGroup | None:
        """The group a station id names: `st:was` itself, or any of its members' stop ids (platforms too)."""
        if gid.lower().startswith("st:"):
            return self.groups.get(gid)
        source, _, local = gid.partition(":")
        provider = self.providers.get(source)
        station = provider.station_id(local) if provider else local
        found = self.groups.resolve(source, station) or self.groups.resolve(source, local)
        return self.groups.get(found) if found else None

    def station(
        self,
        gid: str,
        now: datetime | None = None,
        back_min: int = 60,
        ahead_min: int = 240,
        on: date | None = None,
        agency: str | None = None,
        source: str | None = None,
    ) -> StationBoard | None:
        now = now or datetime.now(UTC)
        back, ahead = timedelta(minutes=back_min), timedelta(minutes=ahead_min)
        if group := self._group_of(gid):
            boards = []
            for source_id, stop_ids in group.members.items():
                provider = self.providers.get(source_id)
                if provider is None:
                    continue
                stations = dict.fromkeys(provider.station_id(s) for s in stop_ids)  # a station once, not per platform
                for local in stations:
                    if board := provider.station_board(local, now, back, ahead, on):
                        boards.append(board)
            if not boards:
                return None
            board = merge_boards(group, boards)
        else:
            found = self._split(gid)
            board = found[0].station_board(found[1], now, back, ahead, on) if found else None
            if board is None:
                return None
        return filter_board(board, agency, source)

    def suggestions(self) -> list[StationSuggestion]:
        """Stations of different sources that look like one but are in no group (recomputed when a feed reloads)."""
        stamp = tuple((sid, id(p.index)) for sid, p in self.providers.items())
        if self._suggested is None or self._suggested[0] != stamp:
            self._suggested = (stamp, self._suggest())
        return self._suggested[1]

    def _suggest(self) -> list[StationSuggestion]:
        by_id: dict[tuple[str, str], Stop] = {}
        for sid, provider in self.providers.items():
            for stop in provider.stops(WORLD):
                local = stop.id.partition(":")[2]
                if not self.groups.resolve(sid, local):
                    by_id[(sid, local)] = stop
        candidates = [Candidate(sid, local, s.name, s.lat, s.lon) for (sid, local), s in by_id.items()]
        return [
            StationSuggestion(a=by_id[(a.source, a.id)], b=by_id[(b.source, b.id)], distance_m=round(d), reason=why)
            for a, b, d, why in suggest_pairs(candidates)
        ]

    def route(self, gid: str, day: date | None = None) -> Timetable | None:
        found = self._split(gid)
        if not found:
            return None
        provider, local = found
        day = day or datetime.now(UTC).astimezone(provider.static.timezone if provider.static else None).date()
        return provider.timetable(local, day)

    def route_info(self, gid: str) -> RouteInfo | None:
        found = self._split(gid)
        return found[0].route_info(found[1]) if found else None

    # --- stats (the settings page's backend panel) ---------------------------

    def stats(self) -> dict:
        per_source = []
        for sid, config in self.configs.items():
            provider = self.providers.get(sid)
            if provider is None:
                per_source.append({"id": sid, "enabled": False})
                continue
            st = provider.state
            per_source.append(
                {
                    "id": sid,
                    "enabled": True,
                    "kind": config.kind,
                    "static_load_s": st.static_load_s,
                    "rt_fetch_ms": st.rt_fetch_ms,
                    "routes": st.routes,
                    "stops": st.stops,
                    "trips": st.trips,
                    "line_points": provider.index.points if provider.index else 0,
                    "memory_mb": round(st.memory_bytes / 2**20, 1),
                    "state": provider.api_status().state,
                }
            )
        return {
            "sources": per_source,
            "memory_mb": round(sum(s.get("memory_mb", 0) for s in per_source), 1),
            "enabled": len(self.providers),
        }

    # --- the app-place board ---------------------------------------------------

    def board(
        self, place_id: str, now: datetime | None = None, back_min: int = 30, ahead_min: int = 180
    ) -> Board | None:
        place = self.places.get(place_id)
        if place is None:
            return None
        now = now or datetime.now(UTC)
        back, ahead = timedelta(minutes=back_min), timedelta(minutes=ahead_min)
        serving = [p for p in self.providers.values() if p.serves(place_id)]
        entries = [e for p in serving for e in p.board(place_id, now, back, ahead)]
        upcoming = sorted((e for e in entries if _when(e) > now), key=_when)
        departed = sorted((e for e in entries if _when(e) <= now), key=_when, reverse=True)
        return Board(
            place_id=place.id,
            name=place.name,
            generated=now,
            upcoming=upcoming,
            departed=departed,
            sources=[p.source.id for p in serving],
            attribution=[a for p in serving if (a := p.attribution)],
        )

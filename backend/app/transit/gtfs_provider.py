"""A GTFS static schedule plus GTFS-Realtime trip updates and vehicle positions (MARC, VRE).

Everything a trip shows (stops, estimates, delay, state) comes from one place, `legs`: the schedule with the
realtime update laid over it. Vehicles, trip pages, station boards and timetables are all built from legs.
"""

import asyncio
import logging
import time
from collections import Counter
from datetime import UTC, date, datetime, timedelta

import httpx

from .estimates import Leg, Progress, StateBasis, clock_progress, departure_delay, leg_states, next_leg
from .geometry import Path, follow_shapes
from .gtfs_rt import AlertInfo, TripUpdate, VehiclePosition, parse_alerts, parse_trip_updates, parse_vehicle_positions
from .gtfs_static import Trip as StaticTrip
from .models import (
    Alert,
    BoardEntry,
    BoardRow,
    NextStop,
    StationBoard,
    Stop,
    Timetable,
    TimetableDirection,
    TimetableStop,
    TimetableTrip,
    Trip,
    TripStop,
    Vehicle,
    delay_status,
)
from .passes import PassPoint, find_passes, pass_estimated, pass_time
from .places import StopPoint, assign_stops
from .provider import Provider, entry_status
from .tracking import MPS_TO_MPH, MotionTracker

log = logging.getLogger(__name__)

STALE_POSITION = timedelta(minutes=15)  # a vehicle that has not reported for this long is not drawn
BEFORE_START = timedelta(hours=1)  # a trip counts as "today's" from an hour before its first stop...
AFTER_END = timedelta(hours=3)  # ...to three hours after its last, to tell today's run from yesterday's


def _stop_index(legs: list[Leg], position: VehiclePosition) -> int | None:
    """The leg a vehicle position stands at or heads for, by stop sequence else stop id (None: it does not say)."""
    if position.stop_sequence is not None:
        return next((i for i, leg in enumerate(legs) if leg.seq >= position.stop_sequence), len(legs))
    if position.stop_id is not None:
        return next((i for i, leg in enumerate(legs) if leg.stop_id == position.stop_id), None)
    return None


def interleave(stops: list[TripStop], passes: list[tuple[str, TripStop]]) -> list[TripStop]:
    """The stops with each pass slotted in after the stop it follows (named by stop id), renumbered 1..n."""
    after: dict[str, list[TripStop]] = {}
    for stop_id, entry in passes:
        after.setdefault(stop_id, []).append(entry)
    merged = [item for stop in stops for item in (stop, *after.get(stop.stop_id, ()))]
    for number, item in enumerate(merged, 1):
        item.seq = number
    return merged


def merge_order(sequences: list[list[str]]) -> list[str]:
    """One stop order consistent with every trip's: longest first, extra stops slotted in after their neighbour."""
    order: list[str] = []
    for seq in sorted(sequences, key=len, reverse=True):
        prev = None
        for sid in seq:
            if sid not in order:
                order.insert(order.index(prev) + 1 if prev is not None else 0, sid)
            prev = sid
    return order


class GtfsProvider(Provider):
    def __init__(self, source, cache_dir):
        super().__init__(source, cache_dir)
        self.trip_updates: dict[str, TripUpdate] = {}
        self.positions: list[VehiclePosition] = []
        self.alert_infos: list[AlertInfo] = []
        self.place_stops: dict[str, list[str]] = {}
        self.motion = MotionTracker()
        self._paths: dict[str, Path] = {}
        self._passes: dict[tuple, list[PassPoint]] = {}
        self._station_points: dict[str, tuple[float, float]] = {}
        self._by_trip: dict[str, VehiclePosition] = {}
        self._by_trip_of: list[VehiclePosition] | None = None

    @property
    def has_realtime(self) -> bool:
        s = self.source
        return bool(s.rt_trip_updates_url or s.rt_vehicle_positions_url or s.rt_alerts_url)

    @property
    def keep_shapes(self) -> bool:  # shapes are needed to place trains that report no position
        return bool(self.source.rt_trip_updates_url)

    # --- realtime ------------------------------------------------------------

    def _ours(self, trip_id: str | None, route_id: str | None) -> bool:
        """Whether a realtime entity belongs to the routes this source loaded. Feeds like MBTA's carry every mode
        (buses, subway) while the source keeps only rail (`route_types`) and drops `exclude_routes`."""
        feed = self.static
        if feed is None:
            return True  # filtered again once the schedule is in
        if trip_id and trip_id in feed.trips:
            return True
        if route_id:
            return route_id in feed.routes
        return not self.source.route_types  # no route given: trust it only when the source keeps every route

    async def _load_realtime(self, client: httpx.AsyncClient) -> None:
        if not self.has_realtime:
            return
        st = self.state
        started = time.monotonic()
        urls = [self.source.rt_trip_updates_url, self.source.rt_vehicle_positions_url, self.source.rt_alerts_url]
        results = await asyncio.gather(*(self._fetch(client, url) for url in urls), return_exceptions=True)
        errors = [f"{type(r).__name__}: {r}" for r in results if isinstance(r, Exception)]
        tu, vp, al = results
        try:
            if isinstance(tu, bytes):
                updates = parse_trip_updates(tu)
                self.trip_updates = {k: u for k, u in updates.items() if self._ours(u.trip_id, u.route_id)}
            if isinstance(vp, bytes):
                self.positions = [p for p in parse_vehicle_positions(vp) if self._ours(p.trip_id, p.route_id)]
            if isinstance(al, bytes):
                self.alert_infos = parse_alerts(al)
        except Exception as exc:  # a corrupt protobuf
            errors.append(f"{type(exc).__name__}: {exc}")
        st.realtime_error = "; ".join(errors) or None
        st.rt_fetch_ms = round((time.monotonic() - started) * 1000)
        if not errors:
            st.realtime_updated = datetime.now(UTC)
        st.vehicles = len(self.positions)
        self._track_motion()
        if errors:
            log.warning("%s realtime failed: %s", self.source.id, st.realtime_error)

    async def _fetch(self, client: httpx.AsyncClient, url: str | None) -> bytes | None:
        if not url:
            return None
        response = await client.get(url, headers=self.source.headers)
        response.raise_for_status()
        return response.content

    def _track_motion(self) -> None:
        fetched = self.state.realtime_updated or datetime.now(UTC)
        for p in self.positions:
            self.motion.observe(self._key(p), p.lat, p.lon, p.timestamp or fetched)
        self.motion.keep_only({self._key(p) for p in self.positions})

    @staticmethod
    def _key(p: VehiclePosition) -> str:
        return p.vehicle_id or p.trip_id or ""

    # hooks the Amtraker provider overrides (its live data is keyed by day as well)
    def update_for(self, trip_id: str, day: date) -> TripUpdate | None:
        return self.trip_updates.get(trip_id)

    def row_trip_id(self, trip_id: str, day: date) -> str:
        return trip_id

    def track_for(self, trip_id: str, day: date, stop_id: str) -> str | None:
        return self.static.track_of(stop_id)

    # --- alerts ----------------------------------------------------------------

    def _alert(self, a: AlertInfo) -> Alert:
        return Alert(
            header=a.header,
            description=a.description,
            url=a.url,
            routes=[self.gid(r) for r in a.route_ids],
            stops=list(dict.fromkeys(self.station_gid(x) for x in a.stop_ids)),
            start=a.start,
            end=a.end,
        )

    def alerts_for(
        self, now: datetime, route_id: str | None = None, trip_id: str | None = None, stop_ids=()
    ) -> list[Alert]:
        """Active alerts that name this source's routes, stops or trips (a system-wide feed names others too)."""
        feed = self.static
        found = []
        for a in self.alert_infos:
            if a.end and a.end < now or a.start and a.start > now + timedelta(days=1):
                continue
            ours = (
                any(r in feed.routes for r in a.route_ids)
                or any(t in feed.trips for t in a.trip_ids)
                or any(x in feed.stops for x in a.stop_ids)
            )
            hit = route_id in a.route_ids or trip_id in a.trip_ids or any(x in a.stop_ids for x in stop_ids)
            if ours and (hit or (route_id is None and trip_id is None and not stop_ids)):
                found.append(self._alert(a))
        return found

    def alerts(self, now: datetime) -> list[Alert]:
        return self.alerts_for(now) if self.static else []

    # --- trips -----------------------------------------------------------------

    def _schedule_of(self, trip_id: str, day_start: datetime):
        """A function giving the scheduled arrival or departure of the stop a realtime update is about."""
        times = self.static.stop_times.get(trip_id, [])

        def schedule_of(u, departing: bool) -> datetime | None:
            for st in times:
                if (st.sequence == u.sequence) if u.sequence is not None else (st.stop_id == u.stop_id):
                    first, second = (st.departure, st.arrival) if departing else (st.arrival, st.departure)
                    secs = first if first is not None else second
                    return day_start + timedelta(seconds=secs) if secs is not None else None
            return None

        return schedule_of

    def trip_day(self, trip: StaticTrip, now: datetime) -> date:
        """The service day this trip is running on: yesterday's late trips are still going after midnight."""
        feed = self.static
        days = [d for d in feed.service_days(now) if trip.service_id in feed.services_on(d)]
        times = feed.stop_times.get(trip.id)
        if times and days:
            first = times[0].departure if times[0].departure is not None else times[0].arrival
            last = times[-1].arrival if times[-1].arrival is not None else times[-1].departure
            for day in reversed(days):
                start = feed.midnight(day)
                if (
                    start + timedelta(seconds=first or 0) - BEFORE_START
                    <= now
                    <= start + timedelta(seconds=last or 0) + AFTER_END
                ):
                    return day
        return (days or feed.service_days(now))[-1]

    def legs(self, trip_id: str, day: date) -> list[Leg]:
        feed = self.static
        start = feed.midnight(day)
        update = self.update_for(trip_id, day)
        schedule_of = self._schedule_of(trip_id, start)
        legs = []
        times = feed.stop_times.get(trip_id, [])
        for index, st in enumerate(times):
            arr = start + timedelta(seconds=st.arrival) if st.arrival is not None else None
            dep = start + timedelta(seconds=st.departure) if st.departure is not None else None
            leg = Leg(st.stop_id, st.sequence, arr or dep, dep or arr)
            if update:
                own = update.stop_for(st.sequence, st.stop_id)
                leg.arr_d = update.delay_at(st.sequence, st.stop_id, schedule_of, False)
                leg.dep_d = departure_delay(
                    leg.arr_d,
                    update.delay_at(st.sequence, st.stop_id, schedule_of, True),
                    reported=bool(own and own.reports_departure),
                    first=index == 0,
                    last=index == len(times) - 1,
                )
                leg.skipped = update.canceled or any(
                    u.skipped and ((u.sequence == st.sequence) if u.sequence is not None else (u.stop_id == st.stop_id))
                    for u in update.stops
                )
            legs.append(leg)
        return legs

    def _station(self, stop_id: str):
        feed = self.static
        return feed.stations.get(feed.station_of.get(stop_id, stop_id)) or feed.stops.get(stop_id)

    def _station_name(self, stop_id: str) -> str:
        station = self._station(stop_id)
        return station.name if station else stop_id

    def _route_of(self, trip: StaticTrip | None):
        return self.static.routes.get(trip.route_id) if trip else None

    def progress(self, trip_id: str, day: date, legs: list[Leg], now: datetime) -> tuple[Progress, StateBasis]:
        """How far a trip has got: from its vehicle's stop when that position is fresh, else from the clock."""
        position = self._position_of(trip_id)
        if position and day == self.trip_day(self.static.trips[trip_id], now):
            updated = position.timestamp or self.state.realtime_updated
            fresh = updated and (now - updated).total_seconds() <= self.source.stale_after_s
            if fresh and (index := _stop_index(legs, position)) is not None:
                return Progress(index, position.at_stop), "position"
        return clock_progress(legs, now), "clock"

    def _position_of(self, trip_id: str) -> VehiclePosition | None:
        if self._by_trip_of is not self.positions:
            self._by_trip = {p.trip_id: p for p in self.positions if p.trip_id}
            self._by_trip_of = self.positions
        return self._by_trip.get(trip_id)

    def _next_stop(self, legs: list[Leg], states: list[str]) -> NextStop | None:
        leg = next_leg(legs, states)
        if leg is None:
            return None
        station = self._station(leg.stop_id)
        return NextStop(
            stop_id=self.station_gid(leg.stop_id),
            name=station.name if station else leg.stop_id,
            eta=leg.arrive,
            scheduled=leg.arr_s,
        )

    def _added_trip(self, trip_id: str, update: TripUpdate, now: datetime) -> Trip:
        """A train the realtime feed runs but the schedule lacks: its stops are whatever the feed says."""
        feed = self.static
        zone = feed.timezone
        stops, legs = [], []
        for seq, u in enumerate(update.stops, 1):
            stop = feed.stops.get(u.stop_id or "")
            arr = datetime.fromtimestamp(u.arrival_time, zone) if u.arrival_time else None
            dep = datetime.fromtimestamp(u.departure_time, zone) if u.departure_time else None
            legs.append(Leg(u.stop_id or "", seq, arr or dep, dep or arr, 0, 0, u.skipped))
            stops.append(
                TripStop(
                    stop_id=self.station_gid(u.stop_id or ""),
                    name=self._station_name(u.stop_id or "") if stop else (u.stop_id or ""),
                    seq=seq,
                    arr_estimated=arr,
                    dep_estimated=dep,
                    track=self.track_for(trip_id, now.date(), u.stop_id or ""),
                )
            )
        for stop, state in zip(stops, leg_states(legs, clock_progress(legs, now)), strict=True):
            stop.state = state
        first = next((s.dep_estimated or s.arr_estimated for s in stops if s.dep_estimated or s.arr_estimated), now)
        return Trip(
            id=self.gid(trip_id),
            source=self.source.id,
            agency=self.source.agency,
            route_name=None,
            train=trip_id.removeprefix("Train"),
            headsign=stops[-1].name if stops else None,
            service_date=first.astimezone(zone).date().isoformat(),
            vehicle=next((v for v in self.vehicles(now) if v.trip_id == self.gid(trip_id)), None),
            stops=stops,
            alerts=self.alerts_for(now, trip_id=trip_id),
        )

    def trip(self, trip_id: str, now: datetime, day: date | None = None, passes: bool = False) -> Trip | None:
        feed = self.static
        trip = feed.trips.get(trip_id) if feed else None
        if trip is None and feed and (update := self.trip_updates.get(trip_id)) and update.added and update.stops:
            return self._added_trip(trip_id, update, now)
        if trip is None or trip_id not in feed.stop_times:
            return None
        day = day or self.trip_day(trip, now)
        legs = self.legs(trip_id, day)
        route = self._route_of(trip)
        progress, basis = self.progress(trip_id, day, legs, now)
        stops = [
            TripStop(
                stop_id=self.station_gid(leg.stop_id),
                name=self._station_name(leg.stop_id),
                seq=leg.seq,
                arr_scheduled=leg.arr_s,
                arr_estimated=leg.arr_e,
                dep_scheduled=leg.dep_s,
                dep_estimated=leg.dep_e,
                delay_s=leg.delay,
                track=self.track_for(trip_id, day, leg.stop_id),
                state=state,
                state_basis=basis,
            )
            for leg, state in zip(legs, leg_states(legs, progress), strict=True)
        ]
        if passes:
            stops = interleave(stops, self.pass_stops(trip_id, day, now))
        vehicle = next((v for v in self.vehicles(now) if v.trip_id == self.gid(trip_id)), None)
        return Trip(
            id=self.gid(trip_id),
            source=self.source.id,
            agency=self.source.agency,
            route_id=self.gid(trip.route_id),
            route_name=route.name if route else None,
            train=trip.number,
            headsign=trip.headsign,
            service_date=day.isoformat(),
            vehicle=vehicle,
            stops=stops,
            alerts=self.alerts_for(
                now,
                route_id=trip.route_id,
                trip_id=trip_id,
                stop_ids=[leg.stop_id for leg in legs],
            ),
        )

    # --- non-stop passes ---------------------------------------------------------

    def station_points(self) -> dict[str, tuple[float, float]]:
        """Every station of the feed: station id -> (lat, lon)."""
        if not self._station_points:
            self._station_points = {i: (st.lat, st.lon) for i, st in self.static.stations.items()}
        return self._station_points

    def pass_points(self, trip: StaticTrip, legs: list[Leg]) -> list[PassPoint]:
        """Where the trip runs through a station of its route without stopping (cached per stopping pattern)."""
        feed = self.static
        served = [feed.station_of.get(leg.stop_id, leg.stop_id) for leg in legs]
        key = (trip.shape_id or trip.id, tuple(served))
        if key not in self._passes:
            candidates = {i: xy for i, xy in self.station_points().items() if i not in served}
            stops = [(feed.stations[i].lat, feed.stations[i].lon) for i in served if i in feed.stations]
            usable = len(stops) == len(served) and len(served) >= 2
            self._passes[key] = find_passes(self._path(trip, legs), stops, candidates) if usable else []
        return self._passes[key]

    def pass_stops(self, trip_id: str, day: date, now: datetime) -> list[tuple[str, TripStop]]:
        """(stop id of the stop it follows, pass entry) for each station a scheduled trip runs through."""
        trip, legs = self.static.trips[trip_id], self.legs(trip_id, day)
        progress, basis = self.progress(trip_id, day, legs, now)
        trip_stops = {self.station_gid(leg.stop_id) for leg in legs}
        entries = []
        for point in self.pass_points(trip, legs):
            time = pass_time(legs, point)
            gid = self.station_gid(point.station_id)
            if time is None or gid in trip_stops:
                continue
            estimated = pass_estimated(time)
            past = progress.index > point.after + 1 or (
                progress.index == point.after + 1 and (progress.at_stop or (estimated or time.scheduled) <= now)
            )
            entries.append(
                (
                    self.station_gid(legs[point.after].stop_id),
                    TripStop(
                        stop_id=gid,
                        name=self._station_name(point.station_id),
                        seq=0,
                        kind="pass",
                        pass_scheduled=time.scheduled,
                        pass_estimated=estimated,
                        approx=True,
                        delay_s=time.delay_s,
                        state="passed" if past else "upcoming",
                        state_basis=basis,
                    ),
                )
            )
        return entries

    # --- vehicles --------------------------------------------------------------

    def vehicles(self, now: datetime) -> list[Vehicle]:
        if not self.static:
            return []
        out, positioned = [], set()
        for p in self.positions:
            if p.timestamp and now - p.timestamp > STALE_POSITION:
                continue
            if p.route_id in (self.source.exclude_routes or ()):
                continue
            positioned.add(p.trip_id)
            out.append(self._vehicle(p, now))
        out += self._estimated(now, positioned)
        return out

    def _is_added(self, trip_id: str | None) -> bool:
        update = self.trip_updates.get(trip_id or "")
        return bool(update and update.added)

    def _vehicle(self, p: VehiclePosition, now: datetime) -> Vehicle:
        feed = self.static
        trip = feed.trips.get(p.trip_id) if p.trip_id else None
        route_id = p.route_id or (trip.route_id if trip else None)
        route = feed.routes.get(route_id) if route_id else None
        legs, delay, next_stop = [], None, None
        if trip and trip.id in feed.stop_times:
            day = self.trip_day(trip, now)
            legs = self.legs(trip.id, day)
            next_stop = self._next_stop(legs, leg_states(legs, self.progress(trip.id, day, legs, now)[0]))
            if update := self.update_for(trip.id, day):
                delay = update.current_delay(self._schedule_of(trip.id, feed.midnight(day)))
        key = self._key(p)
        updated = p.timestamp or self.state.realtime_updated
        return Vehicle(
            id=self.gid(p.vehicle_id or p.trip_id or ""),
            trip_id=self.gid(trip.id if trip else p.trip_id) if trip or self._is_added(p.trip_id) else None,
            source=self.source.id,
            agency=self.source.agency,
            route_id=self.gid(route_id) if route_id else None,
            route_name=route.name if route else route_id,
            train=trip.number if trip else (p.trip_id or "").removeprefix("Train") or None,
            headsign=trip.headsign if trip else None,
            origin=self._station_name(legs[0].stop_id) if legs else None,
            destination=self._station_name(legs[-1].stop_id) if legs else None,
            lat=p.lat,
            lon=p.lon,
            bearing=p.bearing if p.bearing is not None else self.motion.bearing(key),
            speed_mph=p.speed_mph if p.speed_mph is not None else self.motion.speed_mph(key),
            delay_s=delay,
            status=delay_status(delay),
            next_stop=next_stop,
            position="realtime",
            updated=updated,
            age_s=max(0, round((now - updated).total_seconds())) if updated else None,
            stale_after_s=self.source.stale_after_s,
        )

    # --- positions estimated from the schedule ---------------------------------

    def _path(self, trip: StaticTrip, legs: list[Leg]) -> Path:
        feed = self.static
        shape = feed.shapes.get(trip.shape_id) if trip.shape_id else None
        key = trip.shape_id if shape else f"trip:{trip.id}"
        if key not in self._paths:
            stops = [feed.stops[leg.stop_id] for leg in legs if leg.stop_id in feed.stops]
            points = shape or follow_shapes([(s.lat, s.lon) for s in stops], list(feed.shapes.values()))
            self._paths[key] = Path(points)
        return self._paths[key]

    def _estimated(self, now: datetime, positioned: set) -> list[Vehicle]:
        feed = self.static
        out = []
        for trip_id, update in self.trip_updates.items():
            trip = feed.trips.get(trip_id)
            if trip_id in positioned or update.canceled or not update.stops or trip is None:
                continue
            if trip_id not in feed.stop_times:
                continue
            day = self.trip_day(trip, now)
            legs = self.legs(trip_id, day)
            if vehicle := self._interpolate(trip, day, legs, now):
                out.append(vehicle)
        return out

    def _interpolate(self, trip: StaticTrip, day: date, legs: list[Leg], now: datetime) -> Vehicle | None:
        feed = self.static
        full = legs
        legs = [leg for leg in legs if leg.stop_id in feed.stops and not leg.skipped]
        if len(legs) < 2 or not (legs[0].leave and legs[-1].arrive) or not legs[0].leave <= now < legs[-1].arrive:
            return None
        path = self._path(trip, legs)
        if len(path.points) < 2:
            return None
        dists, after = [], 0.0
        for leg in legs:
            stop = feed.stops[leg.stop_id]
            after = path.locate(stop.lat, stop.lon, after)
            dists.append(after)
        speed = 0.0
        position = None
        for i, leg in enumerate(legs):
            if leg.arrive and leg.leave and leg.arrive <= now < leg.leave:  # waiting at a station
                position = (dists[i], None)
                break
            if i + 1 < len(legs) and leg.leave and legs[i + 1].arrive and leg.leave <= now < legs[i + 1].arrive:
                secs = (legs[i + 1].arrive - leg.leave).total_seconds()
                frac = (now - leg.leave).total_seconds() / secs if secs else 0.0
                metres = dists[i + 1] - dists[i]
                position = (dists[i] + frac * metres, metres / secs * MPS_TO_MPH if secs else 0.0)
                speed = position[1]
                break
        if position is None:
            return None
        lat, lon, bearing = path.at(position[0])
        route = self._route_of(trip)
        delay = next((leg.delay for leg in legs if leg.leave and leg.leave > now and leg.delay is not None), None)
        updated = self.state.realtime_updated or now
        return Vehicle(
            id=self.gid(trip.id),
            trip_id=self.gid(trip.id),
            source=self.source.id,
            agency=self.source.agency,
            route_id=self.gid(trip.route_id),
            route_name=route.name if route else None,
            train=trip.number,
            headsign=trip.headsign,
            origin=self._station_name(legs[0].stop_id),
            destination=self._station_name(legs[-1].stop_id),
            lat=lat,
            lon=lon,
            bearing=bearing,
            speed_mph=round(speed, 1),
            delay_s=delay,
            status=delay_status(delay),
            next_stop=self._next_stop(full, leg_states(full, clock_progress(full, now))),
            position="estimated",
            updated=updated,
            age_s=max(0, round((now - updated).total_seconds())),
            stale_after_s=self.source.stale_after_s,
        )

    # --- stations --------------------------------------------------------------

    def station_board(self, stop_id, now, back, ahead, on: date | None = None):
        feed = self.static
        if feed is None:
            return super().station_board(stop_id, now, back, ahead)
        station_id = feed.station_of.get(stop_id, stop_id)
        station = feed.stations.get(station_id)
        if station is None:
            return super().station_board(stop_id, now, back, ahead)
        rec = self.station_rec(station_id)
        route_ids = rec.routes if rec else []
        stop = Stop(
            id=self.gid(station_id),
            source=self.source.id,
            name=station.name,
            code=self.stop_code(station_id),
            lat=station.lat,
            lon=station.lon,
            kind=self.kind,
            routes=[self.gid(r) for r in route_ids],
        )
        departures, arrivals = [], []
        if on:  # one whole service day, past or future, straight from the schedule
            lo = feed.midnight(on)
            hi, today = lo + timedelta(days=1), on
        else:
            lo, hi, today = now - back, now + ahead, now.astimezone(feed.timezone).date()
        members = feed.members.get(station_id, [])
        for day in (today - timedelta(days=1), today, today + timedelta(days=1)):
            active, start = feed.services_on(day), feed.midnight(day)
            for member in members:
                for trip_id, index in feed.at_stop.get(member, []):
                    trip = feed.trips[trip_id]
                    if trip.service_id in active:
                        self._board_rows(trip, trip_id, index, day, start, now, lo, hi, departures, arrivals)
        extra_departures, extra_arrivals = self._added_rows(station_id, members, now, lo, hi)
        departures += extra_departures
        arrivals += extra_arrivals
        key = lambda r: r.estimated or r.scheduled  # noqa: E731
        return StationBoard(
            stop=stop,
            canonical_id=stop.id,
            routes=self.route_briefs(route_ids),
            departures=sorted(departures, key=key),
            arrivals=sorted(arrivals, key=key),
            alerts=self.alerts_for(now, stop_ids=members),
        )

    def _added_rows(self, station_id: str, members: list[str], now: datetime, lo: datetime, hi: datetime):
        """Rows for trains the realtime feed adds to the schedule (nothing is scheduled, so the estimate stands in)."""
        feed, departures, arrivals = self.static, [], []
        for trip_id, update in self.trip_updates.items():
            if not update.added or trip_id in feed.trips:
                continue
            ends = [u for u in update.stops if u.stop_id]
            for index, u in enumerate(ends):
                if u.stop_id not in members:
                    continue
                for departing, rows in ((True, departures), (False, arrivals)):
                    when = u.departure_time if departing else u.arrival_time
                    if not when or (index == len(ends) - 1 if departing else index == 0):
                        continue
                    at = datetime.fromtimestamp(when, feed.timezone)
                    if lo <= at <= hi:
                        other = ends[-1] if departing else ends[0]
                        rows.append(
                            BoardRow(
                                trip_id=self.gid(trip_id),
                                source=self.source.id,
                                train=trip_id.removeprefix("Train"),
                                agency=self.source.agency,
                                headsign=self._station_name(other.stop_id),
                                origin=self._station_name(ends[0].stop_id),
                                destination=self._station_name(ends[-1].stop_id),
                                scheduled=at,
                                estimated=at,
                                state="cancelled" if u.skipped else ("passed" if at <= now else "upcoming"),
                                added=True,
                            )
                        )
        return departures, arrivals

    def _board_rows(self, trip, trip_id, index, day, start, now, lo, hi, departures, arrivals) -> None:
        feed = self.static
        times = feed.stop_times[trip_id]
        st = times[index]
        route = self._route_of(trip)
        live = self.update_for(trip_id, day) or self._position_of(trip_id)
        legs = self.legs(trip_id, day) if live else None
        if legs:  # realtime: estimates and state come from the same legs and progress as the trip page
            progress, basis = self.progress(trip_id, day, legs, now)
            state = leg_states(legs, progress)[index]
        else:
            basis = "clock"
        for departing, rows in ((True, departures), (False, arrivals)):
            if (index == len(times) - 1) if departing else (index == 0):
                continue
            secs = (
                (st.departure if st.departure is not None else st.arrival)
                if departing
                else (st.arrival if st.arrival is not None else st.departure)
            )
            if secs is None:
                continue
            scheduled = start + timedelta(seconds=secs)
            leg = legs[index] if legs else None
            delay = (leg.dep_d if departing else leg.arr_d) if leg else None
            estimated = scheduled + timedelta(seconds=delay) if delay is not None else None
            shown = estimated or scheduled
            if not lo <= shown <= hi:
                continue
            if leg and leg.skipped:
                row_state = "cancelled"
            elif leg:
                row_state = "passed" if state == "passed" or (state == "current" and not departing) else "upcoming"
            else:
                row_state = "passed" if shown <= now else "upcoming"
            other = times[-1] if departing else times[0]
            rows.append(
                BoardRow(
                    trip_id=self.gid(self.row_trip_id(trip_id, day)),
                    source=self.source.id,
                    train=trip.number,
                    route_name=route.name if route else None,
                    agency=self.source.agency,
                    headsign=self._station_name(other.stop_id),
                    origin=self._station_name(times[0].stop_id),
                    destination=self._station_name(times[-1].stop_id),
                    scheduled=scheduled,
                    estimated=estimated,
                    delay_s=delay,
                    track=self.track_for(trip_id, day, st.stop_id),
                    state=row_state,
                    state_basis=basis,
                )
            )

    # --- timetable -------------------------------------------------------------

    def timetable(self, route_id: str, day: date) -> Timetable | None:
        info = self.route_info(route_id)
        feed = self.static
        if info is None or feed is None:
            return super().timetable(route_id, day)
        active, start = feed.services_on(day), feed.midnight(day)
        by_direction: dict[int, list[tuple[StaticTrip, list[str], dict[str, datetime]]]] = {}
        for trip in feed.trips.values():
            if trip.route_id != route_id or trip.service_id not in active or trip.id not in feed.stop_times:
                continue
            stations, times = [], {}
            for st in feed.stop_times[trip.id]:
                sid = feed.station_of.get(st.stop_id, st.stop_id)
                secs = st.departure if st.departure is not None else st.arrival
                if sid in times or secs is None:
                    continue
                stations.append(sid)
                times[sid] = start + timedelta(seconds=secs)
            by_direction.setdefault(trip.direction, []).append((trip, stations, times))
        directions = []
        for direction, trips in sorted(by_direction.items()):
            order = merge_order([stations for _, stations, _ in trips])
            heads = Counter(t.headsign for t, _, _ in trips if t.headsign)
            headsign = heads.most_common(1)[0][0] if heads else self._station_name(order[-1])
            trips.sort(key=lambda item: min(item[2].values()))
            directions.append(
                TimetableDirection(
                    id=direction,
                    headsign=headsign,
                    stops=[TimetableStop(stop_id=self.station_gid(sid), name=self._station_name(sid)) for sid in order],
                    trips=[
                        TimetableTrip(trip_id=self.gid(t.id), train=t.number, times=[times.get(sid) for sid in order])
                        for t, _, times in trips
                    ],
                )
            )
        return Timetable(route=info, directions=directions)

    # --- the app-place board ---------------------------------------------------

    def on_static_loaded(self) -> None:
        self._paths.clear()
        self._passes.clear()
        self._station_points = {}
        self.remap_places()

    def remap_places(self) -> None:
        if not self.static or not self.places:
            return
        stops = [StopPoint(s.id, self.static.station_name(s), s.lat, s.lon) for s in self.static.served_stops()]
        self.place_stops = assign_stops(self.places, stops)
        self.state.places = len(self.place_stops)

    def serves(self, place_id: str) -> bool:
        return place_id in self.place_stops

    def _origin(self, trip_id: str) -> str | None:
        first = self.static.stops.get(self.static.stop_times[trip_id][0].stop_id)
        return self.static.station_name(first) if first else None

    def board(self, place_id: str, now: datetime, back: timedelta, ahead: timedelta) -> list[BoardEntry]:
        if not self.static:
            return []
        feed = self.static
        entries: dict[tuple[str, object], BoardEntry] = {}
        for day in feed.service_days(now):
            active = feed.services_on(day)
            start = feed.midnight(day)
            for stop_id in self.place_stops.get(place_id, []):
                for trip_id, index in feed.at_stop.get(stop_id, []):
                    trip = feed.trips[trip_id]
                    if trip.service_id not in active:
                        continue
                    times = feed.stop_times[trip_id]
                    last = index == len(times) - 1
                    st = times[index]
                    secs = st.arrival if last else st.departure
                    if secs is None:
                        secs = st.departure if st.arrival is None else st.arrival
                    if secs is None:
                        continue
                    scheduled = start + timedelta(seconds=secs)
                    update = self.update_for(trip_id, day)
                    delay = None
                    if update:
                        delay = update.delay_at(st.sequence, stop_id, self._schedule_of(trip_id, start), not last)
                    estimated = scheduled + timedelta(seconds=delay) if delay is not None else None
                    shown = estimated or scheduled
                    if not now - back <= shown <= now + ahead:
                        continue
                    event = "arrival" if last else "departure"
                    canceled = bool(update and update.canceled)
                    route = feed.routes.get(trip.route_id)
                    entries[(trip_id, day)] = BoardEntry(
                        agency=self.source.agency,
                        route=route.name if route else None,
                        train=trip.number,
                        headsign=trip.headsign,
                        origin=self._origin(trip_id),
                        event=event,
                        scheduled=scheduled,
                        estimated=estimated,
                        delay_s=delay,
                        track=feed.track_of(stop_id),
                        status=entry_status(delay, shown <= now, event, canceled),
                    )
        return list(entries.values())

"""Amtrak through the Amtraker v3 JSON API (https://amtraker.com): keyless, community-run, ODC-By licensed.

Amtrak publishes no GTFS-Realtime feed. Amtraker serves the data behind Amtrak's own train map: for every train
currently running (or about to), its position and every station stop with scheduled and estimated/actual times.
Amtrak's official GTFS static (the source's `static_url`) supplies routes, shapes, stations and the timetable;
live trains are matched to its trips by train number and start time, so boards show estimates too.
"""

import logging
import time
from datetime import UTC, date, datetime, timedelta

import httpx

from .gtfs_provider import GtfsProvider
from .gtfs_rt import StopUpdate, TripUpdate
from .models import (
    Alert,
    BoardEntry,
    BoardRow,
    NextStop,
    Trip,
    TripStop,
    Vehicle,
    delay_status,
)
from .places import StopPoint, assign_stops
from .provider import USER_AGENT, entry_status
from .tracking import MotionTracker

log = logging.getLogger(__name__)

TRAINS_URL = "https://api.amtraker.com/v3/trains"
STATIONS_URL = "https://api.amtraker.com/v3/stations"
HEADINGS = {"N": 0, "NE": 45, "E": 90, "SE": 135, "S": 180, "SW": 225, "W": 270, "NW": 315}
STALE_POSITION = timedelta(minutes=30)
MATCH_WINDOW = timedelta(hours=6)  # a live train and a GTFS trip with the same number and first-stop time this close


def _time(text: str | None) -> datetime | None:
    return datetime.fromisoformat(text) if text else None


def _stops(train: dict) -> list[dict]:
    return [s for s in train.get("stations", []) if not s.get("bus")]


class AmtrakerProvider(GtfsProvider):
    def __init__(self, source, cache_dir):
        super().__init__(source, cache_dir)
        self.trains: list[dict] = []
        self.stations: dict[str, dict] = {}
        self.place_codes: dict[str, list[str]] = {}
        self.motion = MotionTracker()
        self._stations_at = 0.0
        self._by_number: dict[str, list[str]] = {}
        self._route_by_name: dict[str, str] = {}
        self._matched: dict[tuple[str, date], tuple[dict, TripUpdate]] = {}

    @property
    def has_realtime(self) -> bool:
        return True

    @property
    def attribution(self) -> str:
        return "Amtrak data: Amtraker (amtraker.com), ODC-By"

    # --- loading -------------------------------------------------------------

    async def _load_realtime(self, client: httpx.AsyncClient) -> None:
        st = self.state
        headers = {"User-Agent": USER_AGENT, **self.source.headers}
        if time.time() - self._stations_at > self.source.static_refresh_h * 3600:
            try:
                response = await client.get(STATIONS_URL, headers=headers)
                response.raise_for_status()
                self.stations = response.json()
                self._stations_at = time.time()
                self.remap_places()
            except Exception as exc:
                log.warning("amtraker stations failed: %s: %s", type(exc).__name__, exc)
                self._stations_at = time.time() - self.source.static_refresh_h * 3600 + 600
        started = time.monotonic()
        try:
            response = await client.get(self.source.rt_vehicle_positions_url or TRAINS_URL, headers=headers)
            response.raise_for_status()
            # {train number: [train, ...]}: one number can be running on two days at once
            self.trains = [train for group in response.json().values() for train in group]
            st.realtime_error = None
            st.realtime_updated = datetime.now(UTC)
            st.vehicles = len(self.trains)
            self._observe_motion()
            self.match_trips(datetime.now(UTC))
        except Exception as exc:
            st.realtime_error = f"{type(exc).__name__}: {exc}"
            log.warning("amtraker trains failed: %s", st.realtime_error)
        st.rt_fetch_ms = round((time.monotonic() - started) * 1000)

    def _observe_motion(self) -> None:
        for t in self.trains:
            if t.get("lat") is not None and (at := _time(t.get("lastValTS") or t.get("updatedAt"))):
                self.motion.observe(t["trainID"], t["lat"], t["lon"], at)
        self.motion.keep_only({t["trainID"] for t in self.trains})

    def on_static_loaded(self) -> None:
        feed = self.static
        self._by_number = {}
        for trip in feed.trips.values():
            if trip.number and trip.id in feed.stop_times:
                self._by_number.setdefault(trip.number, []).append(trip.id)
        self._route_by_name = {r.name.lower(): r.id for r in feed.routes.values()}
        super().on_static_loaded()

    # --- live trains <-> GTFS trips ---------------------------------------------

    def match_trips(self, now: datetime) -> None:
        """Pair each live train with the GTFS trip (and service day) it is running, as a synthetic TripUpdate."""
        self._matched = {}
        feed = self.static
        if feed is None:
            return
        today = now.astimezone(feed.timezone).date()
        days = [today + timedelta(days=d) for d in (-2, -1, 0, 1)]
        active = {d: feed.services_on(d) for d in days}
        for train in self.trains:
            stops = _stops(train)
            first = _time(stops[0].get("schDep") or stops[0].get("schArr")) if stops else None
            if first is None:
                continue
            best = None
            for trip_id in self._by_number.get(train.get("trainNum", ""), []):
                trip, times = feed.trips[trip_id], feed.stop_times[trip_id]
                secs = times[0].departure if times[0].departure is not None else times[0].arrival
                for day in days:
                    if trip.service_id not in active[day] or secs is None:
                        continue
                    gap = abs(feed.midnight(day) + timedelta(seconds=secs) - first)
                    if gap < MATCH_WINDOW and (best is None or gap < best[0]):
                        best = (gap, trip_id, day)
            if best:
                _, trip_id, day = best
                self._matched[(trip_id, day)] = (train, self._synth_update(trip_id, train))

    def _synth_update(self, trip_id: str, train: dict) -> TripUpdate:
        live = {s["code"]: s for s in _stops(train)}
        update = TripUpdate(trip_id)
        for st in self.static.stop_times[trip_id]:
            if stop := live.get(st.stop_id):
                arr, dep = _time(stop.get("arr")), _time(stop.get("dep"))
                update.stops.append(
                    StopUpdate(
                        st.sequence,
                        st.stop_id,
                        round(arr.timestamp()) if arr else None,
                        round(dep.timestamp()) if dep else None,
                        None,
                        None,
                    )
                )
        return update

    def update_for(self, trip_id: str, day: date) -> TripUpdate | None:
        match = self._matched.get((trip_id, day))
        return match[1] if match else None

    def row_trip_id(self, trip_id: str, day: date) -> str:
        match = self._matched.get((trip_id, day))
        return match[0]["trainID"] if match else trip_id

    def track_for(self, trip_id: str, day: date, stop_id: str) -> str | None:
        match = self._matched.get((trip_id, day))
        if match:
            stop = next((s for s in _stops(match[0]) if s["code"] == stop_id), None)
            return (stop.get("platform") or None) if stop else None
        return None

    # --- vehicles and trips -------------------------------------------------------

    def _train(self, train_id: str) -> dict | None:
        return next((t for t in self.trains if t["trainID"] == train_id), None)

    def vehicles(self, now: datetime) -> list[Vehicle]:
        out = []
        for t in self.trains:
            if t.get("trainState") not in ("Active", None) or t.get("lat") is None:
                continue
            measured = _time(t.get("lastValTS")) or _time(t.get("updatedAt"))
            seen = _time(t.get("updatedAt")) or measured
            if seen and now - seen > STALE_POSITION:
                continue
            delay = self._current_delay(t)
            route_id = self._route_by_name.get((t.get("routeName") or "").lower())
            out.append(
                Vehicle(
                    id=self.gid(t["trainID"]),
                    trip_id=self.gid(t["trainID"]),
                    source=self.source.id,
                    agency=self.source.agency,
                    route_id=self.gid(route_id) if route_id else None,
                    route_name=t.get("routeName"),
                    train=t.get("trainNum"),
                    headsign=t.get("destName"),
                    origin=t.get("origName"),
                    destination=t.get("destName"),
                    lat=t["lat"],
                    lon=t["lon"],
                    bearing=self.motion.bearing(t["trainID"]) or HEADINGS.get(t.get("heading", "")),
                    speed_mph=t.get("velocity"),
                    delay_s=delay,
                    status=delay_status(delay),
                    next_stop=self._live_next_stop(t),
                    position="realtime",
                    updated=measured,
                    age_s=max(0, round((now - measured).total_seconds())) if measured else None,
                    stale_after_s=self.source.stale_after_s,
                )
            )
        return out

    @staticmethod
    def _next_live(train: dict) -> dict | None:
        return next((s for s in _stops(train) if s.get("status") != "Departed"), None)

    def _live_next_stop(self, train: dict) -> NextStop | None:
        stop = self._next_live(train)
        if stop is None:
            return None
        return NextStop(
            stop_id=self.station_gid(stop["code"]),
            name=stop["name"],
            eta=_time(stop.get("arr") or stop.get("dep")),
            scheduled=_time(stop.get("schArr") or stop.get("schDep")),
        )

    def _current_delay(self, train: dict) -> int | None:
        """Lateness at the next stop the train has not yet left."""
        stop = self._next_live(train)
        if stop is None:
            return None
        sched, est = _time(stop.get("schArr") or stop.get("schDep")), _time(stop.get("arr") or stop.get("dep"))
        return round((est - sched).total_seconds()) if sched and est else None

    def trip(self, trip_id: str, now: datetime, day: date | None = None) -> Trip | None:
        train = self._train(trip_id)
        if train is None:
            return super().trip(trip_id, now, day)
        stops, found_next = [], False
        for seq, s in enumerate(_stops(train), 1):
            status = s.get("status")
            if status == "Departed":
                state = "passed"
            elif status == "Station":
                state = "current"
            elif not found_next:
                state, found_next = "next", True
            else:
                state = "upcoming"
            sched = _time(s.get("schArr") or s.get("schDep"))
            est = _time(s.get("arr") or s.get("dep"))
            stops.append(
                TripStop(
                    stop_id=self.station_gid(s["code"]),
                    name=s["name"],
                    seq=seq,
                    arr_scheduled=_time(s.get("schArr")),
                    arr_estimated=_time(s.get("arr")),
                    dep_scheduled=_time(s.get("schDep")),
                    dep_estimated=_time(s.get("dep")),
                    delay_s=round((est - sched).total_seconds()) if sched and est else None,
                    track=s.get("platform") or None,
                    state=state,
                )
            )
        first = stops[0] if stops else None
        started = (first.dep_scheduled or first.arr_scheduled) if first else None
        route_id = self._route_by_name.get((train.get("routeName") or "").lower())
        return Trip(
            id=self.gid(trip_id),
            source=self.source.id,
            agency=self.source.agency,
            route_id=self.gid(route_id) if route_id else None,
            route_name=train.get("routeName"),
            train=train.get("trainNum"),
            headsign=train.get("destName"),
            service_date=(started.date().isoformat() if started else now.date().isoformat()),
            vehicle=next((v for v in self.vehicles(now) if v.id == self.gid(trip_id)), None),
            stops=stops,
            alerts=[Alert(header=a["message"]) for a in train.get("alerts", []) if a.get("message")],
        )

    def _added_rows(self, station_id: str, members: list[str], now: datetime, lo: datetime, hi: datetime):
        """Live trains that match no scheduled trip (extra sections, reroutes): rows straight from Amtraker."""
        matched = {train["trainID"] for train, _ in self._matched.values()}
        departures, arrivals = [], []
        for t in self.trains:
            if t["trainID"] in matched:
                continue
            stops = _stops(t)
            for index, stop in enumerate(stops):
                if stop["code"] not in members:
                    continue
                for departing, rows in ((True, departures), (False, arrivals)):
                    if (index == len(stops) - 1) if departing else (index == 0):
                        continue
                    key = ("schDep", "dep") if departing else ("schArr", "arr")
                    scheduled = _time(stop.get(key[0]))
                    estimated = _time(stop.get(key[1]))
                    if scheduled is None or not lo <= (estimated or scheduled) <= hi:
                        continue
                    other = stops[-1] if departing else stops[0]
                    delay = round((estimated - scheduled).total_seconds()) if estimated else None
                    rows.append(
                        BoardRow(
                            trip_id=self.gid(t["trainID"]),
                            source=self.source.id,
                            train=t.get("trainNum"),
                            route_name=t.get("routeName"),
                            agency=self.source.agency,
                            headsign=other["name"],
                            scheduled=scheduled,
                            estimated=estimated,
                            delay_s=delay,
                            track=stop.get("platform") or None,
                            state="passed" if (estimated or scheduled) <= now else "upcoming",
                            added=True,
                        )
                    )
        return departures, arrivals

    # --- the app-place board (straight from Amtraker's own station lists) ------------

    def remap_places(self) -> None:
        stops = [StopPoint(code, st["name"], st["lat"], st["lon"]) for code, st in self.stations.items() if "lat" in st]
        self.place_codes = assign_stops(self.places, stops) if self.places else {}
        self.state.places = len(self.place_codes)

    def serves(self, place_id: str) -> bool:
        return place_id in self.place_codes

    def board(self, place_id: str, now: datetime, back: timedelta, ahead: timedelta) -> list[BoardEntry]:
        codes = set(self.place_codes.get(place_id, []))
        entries = []
        for t in self.trains:
            stops = t.get("stations", [])
            for index, stop in enumerate(stops):
                if stop["code"] not in codes or stop.get("bus"):
                    continue
                last = index == len(stops) - 1
                scheduled = _time(stop.get("schArr") if last else stop.get("schDep")) or _time(
                    stop.get("schDep") or stop.get("schArr")
                )
                estimated = _time(stop.get("arr") if last else stop.get("dep")) or _time(
                    stop.get("dep") or stop.get("arr")
                )
                if scheduled is None:
                    continue
                shown = estimated or scheduled
                if not now - back <= shown <= now + ahead:
                    continue
                if estimated and estimated < scheduled and stop.get("status") != "Departed" and not last:
                    estimated = (
                        scheduled  # Amtrak's departure estimate can be the arrival time; trains do not leave early
                    )
                delay = round((estimated - scheduled).total_seconds()) if estimated else None
                event = "arrival" if last else "departure"
                entries.append(
                    BoardEntry(
                        agency=self.source.agency,
                        route=t.get("routeName"),
                        train=t.get("trainNum"),
                        headsign=t.get("destName"),
                        origin=t.get("origName"),
                        event=event,
                        scheduled=scheduled,
                        estimated=estimated,
                        delay_s=delay,
                        track=stop.get("platform") or None,
                        status=entry_status(delay, shown <= now, event),
                    )
                )
        return entries

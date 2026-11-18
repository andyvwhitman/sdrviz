"""Trains passing a spot: when each one is nearest to a point on the map (decision: closest point on the line).

Everything is a distance along the trip's own shape, so direction and "already passed" fall out of the geometry.
The pure helpers at the top (bracketing, reconciling the clock with a position, compass names) are tested alone;
`trains_near` joins them to a `GtfsProvider`.
"""

from bisect import bisect_right
from dataclasses import dataclass
from datetime import datetime, timedelta
from math import cos, radians, sin
from typing import TYPE_CHECKING, Literal

from .estimates import Leg, current_delay, leg_states
from .geometry import Path
from .geometry import bearing as initial_bearing
from .models import (
    ApproachingTrain,
    SpotBetween,
    SpotDirection,
    SpotStation,
    SpotVehicle,
    Vehicle,
    delay_status,
)
from .passes import PassPoint, pass_time
from .places import distance_m

if TYPE_CHECKING:
    from .gtfs_provider import GtfsProvider

MPH_TO_MS = 0.44704
V_MAX_MS = 130 * MPH_TO_MS  # no train runs faster than this here: a position can never beat it
MIN_MOVING_MPH = 10  # slower than this is a train crawling or standing, not a speed to divide by
TYPICAL_MPH = {"intercity": 60, "commuter": 40}
AT_SPOT_M = 150  # a train this close along the track is at the spot...
AT_SPOT_S = 60  # ...and so is one whose ETA is this close to now
LIVE_FIX_S = 90  # a position fix older than this is stale, whatever the source's own threshold
STOP_SNAP_M = 250  # a spot this close to a stop of the trip is that stop
END_SLACK_M = 400  # a spot this far beyond a trip's first or last stop still counts (the platform's far end)
POSITION_OFF_M = 1000  # a vehicle farther from the trip's shape than this does not belong to it
UNMATCHED_OFF_M = 300  # ...and one this close to a shape runs on it (trains with no timetable)
STATION_OFF_M = 250  # a station this close to a shape is on that line
STATION_RADIUS_M = 25_000
UNTIMED_REACH_M = 5_000  # an unmatched train with no usable speed is listed only this near the spot

State = Literal["approaching", "at_spot", "passed", "unknown"]


# --- pure helpers -------------------------------------------------------------------------------


def bracket(dists: list[float], where: float, slack: float = END_SLACK_M) -> tuple[int, float] | None:
    """(index of the stop before `where`, share of the way to the next stop), or None when the trip does not reach
    it. A spot just beyond either end is clamped to that end."""
    if len(dists) < 2 or not dists[0] - slack <= where <= dists[-1] + slack:
        return None
    where = min(max(where, dists[0]), dists[-1])
    i = min(bisect_right(dists, where) - 1, len(dists) - 2)
    span = dists[i + 1] - dists[i]
    return i, (where - dists[i]) / span if span else 0.0


def compass(bearing: float | None) -> tuple[str | None, str | None]:
    """('NE', 'NB'): the eight-point name and the railfan's NB/SB/EB/WB. A line is called north-south when it runs
    within 60 degrees of north (the Northeast Corridor heads north-east and is still northbound)."""
    if bearing is None:
        return None, None
    cardinal = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")[round(bearing / 45) % 8]
    north, east = cos(radians(bearing)), sin(radians(bearing))
    if abs(north) >= 0.5:
        return cardinal, "NB" if north > 0 else "SB"
    return cardinal, "EB" if east > 0 else "WB"


def moving_speed_ms(speed_mph: float | None, typical_mph: float) -> float:
    """Metres per second to divide a distance by: the train's own speed when it is moving, else a typical one."""
    mph = speed_mph if speed_mph is not None and speed_mph >= MIN_MOVING_MPH else typical_mph
    return min(mph * MPH_TO_MS, V_MAX_MS)


def reconcile(
    eta: datetime, fix_time: datetime, gap_m: float, speed_mph: float | None, typical_mph: float
) -> tuple[datetime, bool]:
    """Hold a clock-based ETA to where the train was when its position was measured. `gap_m` is the distance along
    the track from the train at `fix_time` to the spot (positive: still to come). The feed's delay is kept unless the
    position makes it impossible: a train cannot arrive sooner than the distance allows after the fix, nor have passed
    more recently than it allows. Any replacement is anchored to the fix time, never to now (a fix four minutes old
    says where the train was four minutes ago), and is a lower bound: it covers the distance at the train's speed, or
    a typical one if the train is crawling at the fix."""
    speed = max(moving_speed_ms(speed_mph, typical_mph), typical_mph * MPH_TO_MS)
    if abs(gap_m) <= AT_SPOT_M:
        if speed_mph is not None and speed_mph < MIN_MOVING_MPH:  # standing at the spot: it leaves when the feed says
            return (fix_time, True) if eta < fix_time else (eta, False)
        return (fix_time, True) if abs((eta - fix_time).total_seconds()) > AT_SPOT_S else (eta, False)
    if gap_m > 0:
        if eta < fix_time + timedelta(seconds=gap_m / V_MAX_MS):
            return fix_time + timedelta(seconds=gap_m / speed), True
    elif eta > fix_time - timedelta(seconds=-gap_m / V_MAX_MS):
        return fix_time - timedelta(seconds=-gap_m / speed), True
    return eta, False


def line_name(agency: str, route_name: str | None) -> str | None:
    """'MARC Camden' from 'CAMDEN - WASHINGTON', 'VRE Manassas' from 'Manassas Line'; Amtrak routes are brands."""
    if not route_name:
        return None
    base = route_name.split(" - ")[0].strip().title().removesuffix(" Line")
    return base if agency == "Amtrak" else f"{agency} {base}"


def route_label(first: tuple[float, float], last: tuple[float, float]) -> str | None:
    """NB/SB/EB/WB for a whole trip, from its origin to its terminal: a train keeps one label along its route (a
    Camden Line train is northbound at Halethorpe and at BWI), as the operators name directions. A route is
    north-south unless it runs within about 70 degrees of east-west."""
    bearing = initial_bearing(*first, *last)
    if bearing is None:
        return None
    north, east = cos(radians(bearing)), sin(radians(bearing))
    if abs(north) >= 0.35:
        return "NB" if north > 0 else "SB"
    return "EB" if east > 0 else "WB"


def state_of(eta_in_s: float) -> State:
    if abs(eta_in_s) <= AT_SPOT_S:
        return "at_spot"
    return "approaching" if eta_in_s > 0 else "passed"


def angle_between(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)


# --- the request ----------------------------------------------------------------------------------


@dataclass(frozen=True)
class Spot:
    lat: float
    lon: float
    radius_m: float
    now: datetime
    lo: datetime  # earliest ETA listed (passed trains)
    hi: datetime  # latest ETA listed
    include_scheduled: bool = True  # trains with no realtime at all, from the timetable
    stations: tuple = ()  # stations of every source near the spot, nearest first (see `Provider.stations_near`)


@dataclass
class NearShape:
    """A shape that passes within the radius of the spot."""

    path: Path
    along: float  # distance along the shape of the point nearest the spot
    off_m: float


class StationsOnShapes:
    """The stations near the spot (of every source) that sit on each near shape, looked up as needed."""

    def __init__(self, spot: Spot):
        self.nearby = spot.stations  # (metres from the spot, api id, name, lat, lon), nearest first
        self._on: dict[tuple[str, str], float | None] = {}

    def along(self, shape_id: str, path: Path, entry: tuple[float, str, str, float, float]) -> float | None:
        """Distance along the shape of a station, None when the station is not on that line."""
        key = shape_id, entry[3], entry[4]
        if key not in self._on:
            where, off = path.project(entry[3], entry[4])
            self._on[key] = where if off <= STATION_OFF_M else None
        return self._on[key]


# --- joining it to a provider ---------------------------------------------------------------------


def near_shapes(provider: "GtfsProvider", spot: Spot) -> dict[str, NearShape]:
    pad = spot.radius_m / 111_320 * 1.5 + 0.001
    found = {}
    for shape_id in provider.shape_trips():
        west, south, east, north = provider.shape_box(shape_id)
        if not (south - pad <= spot.lat <= north + pad and west - pad <= spot.lon <= east + pad):
            continue
        path = provider.shape_path(shape_id)
        if len(path.points) < 2:
            continue
        along, off = path.project(spot.lat, spot.lon)
        if off <= spot.radius_m:
            found[shape_id] = NearShape(path, along, off)
    return found


def trains_near(provider: "GtfsProvider", spot: Spot) -> list[ApproachingTrain]:
    """Every train of one source whose track passes within the radius and whose ETA falls in the window."""
    near = near_shapes(provider, spot)
    if not near:
        return []
    feed = provider.static
    vehicles = provider.vehicles(spot.now)
    by_gid = {v.trip_id: v for v in vehicles if v.trip_id}
    stations = StationsOnShapes(spot)
    today = spot.now.astimezone(feed.timezone).date()
    active = {d: feed.services_on(d) for d in (today - timedelta(days=1), today, today + timedelta(days=1))}
    rows = []
    for shape_id, shape in near.items():
        for trip_id in provider.shape_trips()[shape_id]:
            trip = feed.trips[trip_id]
            for day, services in active.items():
                if trip.service_id in services and (
                    row := _row(provider, spot, trip_id, day, shape_id, shape, stations, by_gid)
                ):
                    rows.append(row)
    rows += _unmatched(provider, spot, near, [v for v in vehicles if not provider.tracked(v)])
    return rows


def _row(provider, spot, trip_id, day, shape_id, shape, stations, by_gid) -> ApproachingTrain | None:
    feed, now = provider.static, spot.now
    times = feed.stop_times.get(trip_id)
    if not times or len(times) < 2:
        return None
    live = provider.update_for(trip_id, day) is not None or provider.position_for(trip_id, day) is not None
    if not live:
        if not spot.include_scheduled:
            return None
        start = feed.midnight(day)
        first = times[0].departure if times[0].departure is not None else times[0].arrival
        last = times[-1].arrival if times[-1].arrival is not None else times[-1].departure
        if first is None or last is None or start + timedelta(seconds=last) < spot.lo:
            return None
        if start + timedelta(seconds=first) > spot.hi:
            return None
    vehicle = provider.vehicle_for(trip_id, day, by_gid, now) if live else None
    if vehicle and _out_of_reach(vehicle, spot):
        return None  # a cheap test before the expensive one: building the trip's legs
    trip = feed.trips[trip_id]
    full = provider.legs(trip_id, day)
    legs = [leg for leg in full if leg.stop_id in feed.stops and not leg.skipped]
    if len(legs) < 2:  # cancelled: every stop is skipped
        return None
    dists = provider.stop_distances(trip, legs)
    if dists[-1] <= dists[0] or (placed := bracket(dists, shape.along)) is None:
        return None
    i, frac = placed
    where = _time_at(legs, dists, shape.along, i, frac)
    if where is None:
        return None
    scheduled, delay = where
    typical = TYPICAL_MPH[provider.kind]
    fix_time, d_v, speed = now, None, None
    if vehicle and vehicle.position == "realtime":
        projected, off_v = shape.path.project(vehicle.lat, vehicle.lon)
        if off_v <= POSITION_OFF_M:  # else the position and the trip disagree: trust neither
            d_v, speed = projected, vehicle.speed_mph
            fix_time = now - timedelta(seconds=vehicle.age_s or 0)
    # One delay per train: how late it is now, at the stop it is heading for, carried to the spot while the spot is
    # still ahead of it. Later stops' own forecasts (a recovery at the terminal) are not used, so the delay never
    # jumps from one spot along the line to the next. A spot already behind the train keeps its own recorded delay.
    current = current_delay(full, leg_states(full, provider.progress(trip_id, day, full, now)[0]))
    ahead = d_v < shape.along if d_v is not None else scheduled + timedelta(seconds=current or 0) > now
    if current is not None and ahead:
        delay = current
    eta = scheduled + timedelta(seconds=delay) if delay is not None else scheduled
    to_go, eta_basis = None, "realtime" if delay is not None else "schedule"
    if d_v is not None:
        gap = shape.along - d_v
        eta, moved = reconcile(eta, fix_time, gap, speed, typical)
        if moved:
            eta_basis = "position"
        if gap > AT_SPOT_M:
            to_go = gap / 1000
    if not spot.lo <= eta <= spot.hi:
        return None
    eta = eta.astimezone(feed.timezone)
    if eta_basis == "position" or delay is not None:
        delay = round((eta - scheduled).total_seconds())
    eta_in_s = round((eta - now).total_seconds())
    bearing = shape.path.at(shape.along)[2]
    cardinal, _ = compass(bearing)
    first, last = feed.stops[legs[0].stop_id], feed.stops[legs[-1].stop_id]
    route = provider.static.routes.get(trip.route_id)
    return ApproachingTrain(
        key=f"{provider.gid(provider.row_trip_id(trip_id, day))}@{day.isoformat()}",
        trip_id=provider.gid(provider.row_trip_id(trip_id, day)),
        vehicle_id=vehicle.id if vehicle else None,
        source=provider.source.id,
        agency=provider.source.agency,
        train=trip.number,
        route_id=provider.gid(trip.route_id),
        route_name=route.name if route else None,
        line=line_name(provider.source.agency, route.name if route else None),
        headsign=trip.headsign,
        origin=provider.station_name(legs[0].stop_id),
        destination=provider.station_name(legs[-1].stop_id),
        state=state_of(eta_in_s),
        eta=eta,
        eta_in_s=eta_in_s,
        scheduled=scheduled,
        delay_s=delay,
        status=delay_status(delay),
        basis=_basis(vehicle, delay),
        eta_basis=eta_basis,
        pass_distance_m=round(shape.off_m),
        to_go_km=round(to_go, 1) if to_go is not None else None,
        station=_station(provider, spot, shape_id, shape, stations, legs, dists),
        between=SpotBetween(
            previous=provider.station_name(legs[i].stop_id), next=provider.station_name(legs[i + 1].stop_id)
        ),
        direction=SpotDirection(
            bearing=round(bearing) if bearing is not None else None,
            cardinal=cardinal,
            label=route_label((first.lat, first.lon), (last.lat, last.lon)),
            toward=provider.station_name(legs[-1].stop_id),
        ),
        vehicle=_vehicle(vehicle),
    )


def _out_of_reach(vehicle: Vehicle, spot: Spot) -> bool:
    """A train farther (in a straight line) from the spot than it could cover by the edge of the window."""
    window_s = max((spot.hi - spot.now).total_seconds(), (spot.now - spot.lo).total_seconds())
    return distance_m(spot.lat, spot.lon, vehicle.lat, vehicle.lon) > (window_s + (vehicle.age_s or 0)) * V_MAX_MS


def _time_at(
    legs: list[Leg], dists: list[float], where: float, i: int, frac: float
) -> tuple[datetime, int | None] | None:
    """(scheduled time, delay) at a distance along the trip: a stop's own arrival (departure at the first stop) when the
    spot is at it, else interpolated between the two stops either side."""
    nearest = min(range(len(legs)), key=lambda j: abs(dists[j] - where))
    if abs(dists[nearest] - where) <= STOP_SNAP_M:
        leg = legs[nearest]
        if nearest == 0:
            return (leg.dep_s, leg.dep_d) if leg.dep_s else None
        return (leg.arr_s, leg.arr_d) if leg.arr_s else None
    passed = pass_time(legs, PassPoint("", i, frac))
    return (passed.scheduled, passed.delay_s) if passed else None


def _basis(vehicle: Vehicle | None, delay: int | None) -> Literal["live", "estimated", "stale", "schedule"]:
    if vehicle is not None and vehicle.position == "realtime":
        return "live" if _fresh(vehicle) else "stale"
    return "estimated" if vehicle is not None or delay is not None else "schedule"


def _fresh(vehicle: Vehicle) -> bool:
    """A real fix is live for 90 s whatever the source's own stale limit (a train at 110 mph covers 4.5 km in that)."""
    return not vehicle.stale and (vehicle.age_s or 0) <= LIVE_FIX_S


def _vehicle(vehicle: Vehicle | None) -> SpotVehicle | None:
    if vehicle is None:
        return None
    return SpotVehicle(
        lat=vehicle.lat,
        lon=vehicle.lon,
        speed_mph=vehicle.speed_mph,
        age_s=vehicle.age_s,
        stale=vehicle.position == "realtime" and not _fresh(vehicle),
        position=vehicle.position,
        next_stop=vehicle.next_stop.name if vehicle.next_stop else None,
    )


def _station(provider, spot, shape_id, shape, stations, legs, dists) -> SpotStation | None:
    """The nearest station to the spot (any source's) that this trip serves or runs through, and its time there."""
    served = {provider.station_gid(leg.stop_id): index for index, leg in enumerate(legs)}
    for entry in stations.nearby:
        dist, gid, name = entry[:3]
        along = stations.along(shape_id, shape.path, entry)
        if along is None:
            continue
        if (index := served.get(gid)) is not None:
            leg = legs[index]
            scheduled, delay = (leg.dep_s, leg.dep_d) if index == 0 else (leg.arr_s, leg.arr_d)
            stops, role = True, "origin" if index == 0 else "terminus" if index == len(legs) - 1 else "stop"
        else:
            placed = bracket(dists, along, slack=0)
            passed = pass_time(legs, PassPoint(gid, *placed)) if placed else None
            if passed is None:
                continue
            scheduled, delay, stops, role = passed.scheduled, passed.delay_s, False, "pass"
        return SpotStation(
            id=gid,
            name=name,
            distance_m=round(dist),
            stops=stops,
            role=role,
            scheduled=scheduled,
            eta=scheduled + timedelta(seconds=delay) if delay is not None else scheduled,
            delay_s=delay,
        )
    return None


def _unmatched(provider, spot, near, vehicles: list[Vehicle]) -> list[ApproachingTrain]:
    """Live trains that match no timetable (extra sections, reroutes): placed on a near shape by position, with an ETA
    from their speed when there is one."""
    rows = []
    typical = TYPICAL_MPH[provider.kind]
    for vehicle in vehicles:
        best = None
        for shape_id, shape in near.items():
            west, south, east, north = provider.shape_box(shape_id)
            if not (south <= vehicle.lat <= north and west <= vehicle.lon <= east):
                continue
            d_v, off = shape.path.project(vehicle.lat, vehicle.lon)
            if off <= UNMATCHED_OFF_M and (best is None or off < best[2]):
                best = shape, d_v, off
        if best is None:
            continue
        shape, d_v, _ = best
        track_bearing = shape.path.at(d_v)[2]
        if vehicle.bearing is None or track_bearing is None:
            forward = None
        else:
            forward = angle_between(vehicle.bearing, track_bearing) < 90
        if forward is None:
            gap, state, eta, eta_in_s = None, "unknown", None, None
        else:
            gap = (shape.along - d_v) if forward else (d_v - shape.along)
            state = "at_spot" if abs(gap) <= AT_SPOT_M else "approaching" if gap > 0 else "passed"
            moving = vehicle.speed_mph is None or vehicle.speed_mph >= MIN_MOVING_MPH
            eta, eta_in_s = None, None
            if moving:  # anchored to the fix: it was `gap` away when it was measured
                fix_time = spot.now - timedelta(seconds=vehicle.age_s or 0)
                eta = fix_time + timedelta(seconds=gap / moving_speed_ms(vehicle.speed_mph, typical))
                eta_in_s = round((eta - spot.now).total_seconds())
                state = state_of(eta_in_s)
                eta = eta.astimezone(provider.static.timezone)
        if eta is not None and not spot.lo <= eta <= spot.hi:
            continue
        if eta is None and abs(shape.along - d_v) > UNTIMED_REACH_M:
            continue
        heading = vehicle.bearing if vehicle.bearing is not None else track_bearing
        cardinal, label = compass(heading)
        rows.append(
            ApproachingTrain(
                key=vehicle.id,
                trip_id=vehicle.trip_id,
                vehicle_id=vehicle.id,
                source=provider.source.id,
                agency=provider.source.agency,
                train=vehicle.train,
                route_id=vehicle.route_id,
                route_name=vehicle.route_name,
                line=line_name(provider.source.agency, vehicle.route_name),
                headsign=vehicle.headsign,
                origin=vehicle.origin,
                destination=vehicle.destination,
                state=state,
                eta=eta,
                eta_in_s=eta_in_s,
                basis=_basis(vehicle, None),
                eta_basis="position",
                pass_distance_m=round(shape.off_m),
                to_go_km=round(gap / 1000, 1) if gap is not None and gap > AT_SPOT_M else None,
                direction=SpotDirection(
                    bearing=round(heading) if heading is not None else None,
                    cardinal=cardinal,
                    label=label,
                    toward=vehicle.destination,
                ),
                vehicle=_vehicle(vehicle),
            )
        )
    return rows

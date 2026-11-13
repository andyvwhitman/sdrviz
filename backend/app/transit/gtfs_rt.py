"""GTFS-Realtime protobuf (trip updates and vehicle positions) as plain dataclasses."""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

from google.transit import gtfs_realtime_pb2

CANCELED = gtfs_realtime_pb2.TripDescriptor.CANCELED
ADDED = gtfs_realtime_pb2.TripDescriptor.ADDED
SKIPPED = gtfs_realtime_pb2.TripUpdate.StopTimeUpdate.SKIPPED
MPS_TO_MPH = 2.236936


@dataclass
class StopUpdate:
    sequence: int | None
    stop_id: str | None
    arrival_time: int | None  # epoch seconds
    departure_time: int | None
    arrival_delay: int | None
    departure_delay: int | None
    skipped: bool = False

    def delay_for(self, scheduled: datetime | None, departing: bool) -> int | None:
        """This update's lateness: its delay field, else its absolute time against the scheduled time."""
        time, delay = (
            (self.departure_time, self.departure_delay) if departing else (self.arrival_time, self.arrival_delay)
        )
        if delay is None and time and scheduled:
            return round(time - scheduled.timestamp())
        if delay is None:  # the other event's delay is the best guess for a stop with only one of them
            return self.arrival_delay if departing else self.departure_delay
        return delay


@dataclass
class TripUpdate:
    trip_id: str
    route_id: str | None = None
    canceled: bool = False
    added: bool = False  # a trip the schedule does not have
    delay: int | None = None  # trip-level delay, when the feed gives one
    stops: list[StopUpdate] = field(default_factory=list)

    def delay_at(
        self, sequence: int, stop_id: str, schedule_of: Callable[["StopUpdate"], datetime | None], departing: bool
    ) -> int | None:
        """Seconds late at a stop: its own update if there is one, else the last earlier update carries forward.

        `schedule_of` gives the scheduled time of the stop an update is about, to turn absolute times into delays.
        """
        carried: int | None = None
        for u in self.stops:
            if u.sequence is not None and u.sequence > sequence:
                break
            delay = u.delay_for(schedule_of(u), departing)
            if delay is not None:
                carried = delay
            if (u.sequence == sequence) if u.sequence is not None else (u.stop_id == stop_id):
                break
        return carried if carried is not None else self.delay

    def current_delay(self, schedule_of: Callable[[StopUpdate], datetime | None]) -> int | None:
        """The delay at the next stop that has one: how late the train is running now."""
        for u in self.stops:
            delay = u.delay_for(schedule_of(u), departing=True)
            if delay is None:
                delay = u.delay_for(schedule_of(u), departing=False)
            if delay is not None:
                return delay
        return self.delay


@dataclass
class VehiclePosition:
    vehicle_id: str | None
    trip_id: str | None
    route_id: str | None
    lat: float
    lon: float
    bearing: float | None
    speed_mph: float | None
    timestamp: datetime | None


def parse_trip_updates(data: bytes) -> dict[str, TripUpdate]:
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(data)
    updates: dict[str, TripUpdate] = {}
    for entity in feed.entity:
        if not entity.HasField("trip_update"):
            continue
        tu = entity.trip_update
        trip_id = tu.trip.trip_id
        if not trip_id:
            continue
        update = TripUpdate(
            trip_id,
            route_id=tu.trip.route_id or None,
            canceled=tu.trip.schedule_relationship == CANCELED,
            added=tu.trip.schedule_relationship == ADDED,
            delay=tu.delay if tu.HasField("delay") else None,
        )
        for s in tu.stop_time_update:
            update.stops.append(
                StopUpdate(
                    sequence=s.stop_sequence if s.HasField("stop_sequence") else None,
                    stop_id=s.stop_id or None,
                    arrival_time=s.arrival.time or None,
                    departure_time=s.departure.time or None,
                    arrival_delay=s.arrival.delay if s.arrival.HasField("delay") else None,
                    departure_delay=s.departure.delay if s.departure.HasField("delay") else None,
                    skipped=s.schedule_relationship == SKIPPED,
                )
            )
        updates[trip_id] = update
    return updates


def parse_vehicle_positions(data: bytes) -> list[VehiclePosition]:
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(data)
    vehicles = []
    for entity in feed.entity:
        if not entity.HasField("vehicle") or not entity.vehicle.HasField("position"):
            continue
        v = entity.vehicle
        vehicles.append(
            VehiclePosition(
                vehicle_id=v.vehicle.id or v.vehicle.label or entity.id or None,
                trip_id=v.trip.trip_id or None,
                route_id=v.trip.route_id or None,
                lat=v.position.latitude,
                lon=v.position.longitude,
                bearing=v.position.bearing if v.position.HasField("bearing") else None,
                speed_mph=v.position.speed * MPS_TO_MPH if v.position.HasField("speed") else None,
                timestamp=datetime.fromtimestamp(v.timestamp, UTC) if v.timestamp else None,
            )
        )
    return vehicles


@dataclass
class AlertInfo:
    header: str
    description: str | None
    url: str | None
    route_ids: list[str]
    trip_ids: list[str]
    stop_ids: list[str]
    start: datetime | None
    end: datetime | None


def _text(translated) -> str | None:
    texts = translated.translation
    english = next((t.text for t in texts if t.language in ("", "en")), None)
    return english or (texts[0].text if texts else None)


def parse_alerts(data: bytes) -> list[AlertInfo]:
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(data)
    alerts = []
    for entity in feed.entity:
        if not entity.HasField("alert"):
            continue
        a = entity.alert
        header = _text(a.header_text)
        if not header:
            continue
        period = a.active_period[0] if a.active_period else None
        alerts.append(
            AlertInfo(
                header=header,
                description=_text(a.description_text),
                url=_text(a.url),
                route_ids=[i.route_id for i in a.informed_entity if i.route_id],
                trip_ids=[i.trip.trip_id for i in a.informed_entity if i.trip.trip_id],
                stop_ids=[i.stop_id for i in a.informed_entity if i.stop_id],
                start=datetime.fromtimestamp(period.start, UTC) if period and period.start else None,
                end=datetime.fromtimestamp(period.end, UTC) if period and period.end else None,
            )
        )
    return alerts

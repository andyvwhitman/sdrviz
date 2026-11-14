/** GET /api/transit/*: real trains from GTFS-Realtime (MARC, VRE) and Amtraker (Amtrak). */

export type VehicleStatus = "on_time" | "late" | "early" | "unknown";

export interface NextStop {
  stop_id: string;
  name: string;
  eta: string | null;
  scheduled: string | null;
}

/** A train (GET /transit/vehicles). Times are ISO 8601 with offset. */
export interface Vehicle {
  /** "<source>:<vehicle or trip id>", stable while the train runs */
  id: string;
  trip_id: string | null;
  source: string;
  agency: string;
  route_id: string | null;
  /** "Northeast Regional", "Penn Line" */
  route_name: string | null;
  /** public train number */
  train: string | null;
  headsign: string | null;
  origin: string | null;
  destination: string | null;
  lat: number;
  lon: number;
  /** degrees clockwise from north */
  bearing: number | null;
  speed_mph: number | null;
  /** seconds late; negative = early */
  delay_s: number | null;
  status: VehicleStatus;
  next_stop: NextStop | null;
  /** estimated: interpolated from the schedule, there is no realtime position */
  position: "realtime" | "estimated";
  updated: string | null;
  /** seconds since `updated` when the response was made */
  age_s: number | null;
  /** its source's threshold: a position older than this is stale (decision 22) */
  stale_after_s: number;
  /** `age_s` > `stale_after_s`, at response time */
  stale: boolean;
  /** `delay_s` is implausible (more than 12 h late or 30 min early): shown with a "?" */
  delay_suspect?: boolean;
}

export type TripStopState = "passed" | "current" | "next" | "upcoming" | "skipped";

/** `position`: the train's own position says so; `clock`: estimated from the times only (no usable position) */
export type StateBasis = "position" | "clock";

export interface TripStop {
  /** "pass" (with `?passes=1`): a station the train runs through without stopping; absent or "stop" otherwise */
  kind?: "stop" | "pass";
  stop_id: string;
  name: string;
  seq: number;
  arr_scheduled: string | null;
  arr_estimated: string | null;
  dep_scheduled: string | null;
  dep_estimated: string | null;
  delay_s: number | null;
  track: string | null;
  state: TripStopState;
  state_basis?: StateBasis;
  /** a pass entry's approximate times, interpolated along the track */
  pass_scheduled?: string;
  pass_estimated?: string | null;
}

/** GET /transit/trips/{trip_id} */
export interface Trip {
  id: string;
  source: string;
  agency: string;
  route_id: string | null;
  route_name: string | null;
  train: string | null;
  headsign: string | null;
  service_date: string;
  vehicle: Vehicle | null;
  stops: TripStop[];
}

export type LineKind = "intercity" | "commuter";

/** GET /transit/lines: one route, a multilinestring of [lon, lat] */
export interface Line {
  id: string;
  source: string;
  agency: string;
  route_id: string;
  name: string;
  short_name: string | null;
  color: string | null;
  kind: LineKind;
  coords: [number, number][][];
}

/** GET /transit/stops: parent stations, or station groups */
export interface Stop {
  /** "<source>:<stop_id>", or "st:<code>" for a station group (source "group") */
  id: string;
  /** a source id, or "group" */
  source: string;
  /** the sources that serve it: [source] for a plain stop */
  sources: string[];
  name: string;
  lat: number;
  lon: number;
  kind: LineKind;
  routes: string[];
  /** Amtrak station code ("WAS"), for Amtrak stops and station groups */
  code?: string | null;
  /** "Washington Union": for tight spaces, set for curated groups only */
  short_name?: string | null;
}

export interface BoardRow {
  trip_id: string;
  source: string;
  train: string | null;
  route_name: string | null;
  agency: string;
  /** departures: the destination; arrivals: the origin */
  headsign: string | null;
  /** where the trip begins and ends, on every row */
  origin?: string | null;
  destination?: string | null;
  scheduled: string;
  estimated: string | null;
  delay_s: number | null;
  track: string | null;
  state: "passed" | "upcoming" | "cancelled";
  state_basis?: StateBasis;
  /** a train in realtime that is not in the schedule */
  added?: boolean;
}

/** A train that runs through a station without stopping (`?passing=1`); its times are approximate. */
export interface PassRow {
  trip_id: string;
  source: string;
  train: string | null;
  route_name: string | null;
  agency: string;
  headsign: string | null;
  origin: string | null;
  destination: string | null;
  scheduled: string;
  estimated: string | null;
  delay_s: number | null;
  state: "passed" | "upcoming";
  state_basis: StateBasis;
  approx: true;
}

/** GET /transit/stations/{stop_id} */
export interface StationBoard {
  /** the id to address the station by (a group id, or the stop's own id) */
  canonical_id?: string;
  stop: Stop;
  routes: { id: string; name: string; short_name: string | null; color: string | null; agency: string }[];
  departures: BoardRow[];
  arrivals: BoardRow[];
  /** with `?passing=1`, else empty */
  passing?: PassRow[];
}

/** GET /transit/routes/{route_id}: one timetable grid per direction */
export interface RouteTimetable {
  route: { id: string; source: string; agency: string; name: string; short_name: string | null; color: string | null; kind: LineKind };
  directions: {
    id: number;
    headsign: string;
    stops: { stop_id: string; name: string }[];
    /** `times[i]` is the trip's time at `stops[i]` (null: it does not stop there) */
    trips: { trip_id: string; train: string | null; times: (string | null)[] }[];
  }[];
}

export interface BoardEntry {
  agency: string;
  route: string | null;
  train: string | null;
  headsign: string | null;
  /** where the trip began; shown for arrivals */
  origin: string | null;
  event: "departure" | "arrival";
  scheduled: string;
  estimated: string | null;
  delay_s: number | null;
  track: string | null;
  status: "scheduled" | "on time" | "delayed" | "departed" | "arrived" | "cancelled";
}

export interface Board {
  place_id: string;
  name: string;
  generated: string;
  upcoming: BoardEntry[];
  departed: BoardEntry[];
  sources: string[];
  attribution: string[];
}

/** GET /transit/sources: a source with its read-only `status` (the fields the map reads; docs/transit-api.md has the rest) */
export interface TransitSourceStatus {
  id: string;
  agency: string;
  kind: string;
  enabled: boolean;
  status: {
    state: "ok" | "stale" | "error" | "disabled" | "loading" | "warming";
    error: string | null;
    rt_updated_at: string | null;
  };
}

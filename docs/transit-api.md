# Transit API contract (v1)

Shared contract between the backend transit agent, the map agent and the settings agent. All endpoints are under
`/api`, need the session cookie like every other endpoint, and return JSON. Times are ISO 8601 with offset; ages in
seconds. Change this file first (and say so in your report) if the contract has to change.

## Sources (settings page)

A source is one data feed. `kind`:
- `gtfs`: GTFS static (+ optional GTFS-RT trip updates / vehicle positions / alerts URLs)
- `amtraker`: Amtrak realtime via api.amtraker.com (paired with Amtrak's GTFS static for routes, stops, schedules)
- `lines`: GTFS static used only to draw route lines (and stops) on the map, no schedules or realtime (commuter rail
  networks across the US, added for context; "areas of high detail" later become full `gtfs` sources)

```
TransitSource {
  id: string            // slug, unique
  name: string          // "MARC Train"
  agency: string        // display operator name
  kind: "gtfs" | "amtraker" | "lines"
  enabled: boolean
  static_url: string | null
  rt_trip_updates_url: string | null
  rt_vehicle_positions_url: string | null
  rt_alerts_url: string | null
  api_key: string | null          // write-only: GET returns "***" when set
  key_header: string | null       // header or query param name for the key
  route_types: number[] | null    // GTFS route_type filter, e.g. [2] rail; null = all
  exclude_routes: string[] | null // raw GTFS route_ids dropped from the static feed and its realtime; null = none
                                  // (amtrak seeds ["42985", "42948"]: MARC / CTrail trains in Amtrak's feed)
  static_refresh_h: number        // default 24
  rt_poll_s: number               // default 15 (amtraker 60)
  stale_after_s: number           // a position older than this is stale; amtrak 360, marc/vre 120,
                                  // others default max(120, 2 * rt_poll_s) when omitted
  status: {                       // read-only
    state: "ok" | "stale" | "error" | "disabled" | "loading" | "warming"   // warming: v1.4, see below
    error: string | null
    static_loaded_at: string | null
    static_version: string | null  // feed_info / ETag / Last-Modified
    rt_updated_at: string | null
    counts: { routes: number, stops: number, trips: number, vehicles: number }
    timings: { static_load_s: number | null, rt_fetch_ms: number | null }   // added in v1.1
  }
}
GET    /transit/sources                 -> TransitSource[]
POST   /transit/sources                 -> TransitSource           (body: TransitSource minus status)
PUT    /transit/sources/{id}            -> TransitSource
DELETE /transit/sources/{id}            -> 204
POST   /transit/sources/{id}/refresh    -> TransitSource           (re-download static now)
```
Sources live in the database (seeded once from the defaults); enabling/disabling or editing applies live, no restart.
Default seeds: Amtrak (amtraker + Amtrak GTFS static) enabled, MARC (gtfs + RT) enabled, VRE disabled, plus `lines`
sources for major US commuter rail networks (enabled).

## Map layers

```
GET /transit/lines?bbox=w,s,e,n&zoom=<map zoom 0..400>
-> { lines: Line[] }
Line { id: string, source: string, agency: string, route_id: string, name: string, short_name: string | null,
       color: string | null, kind: "intercity" | "commuter",
       coords: [lon, lat][][] }        // multilinestring, simplified for the zoom (server-side), clipped loosely to bbox

GET /transit/stops?bbox=w,s,e,n&zoom=<zoom>
-> { stops: Stop[] }                   // parent stations only; thinned at low zoom (intercity first)
Stop { id: string /* "<source>:<stop_id>" */, source: string, name: string, lat: number, lon: number,
       kind: "intercity" | "commuter", routes: string[] /* route ids */ }
```

## Trains

```
GET /transit/vehicles?bbox=w,s,e,n          (bbox optional)
-> Vehicle[]
Vehicle {
  id: string                // "<source>:<vehicle or trip id>", stable while the train runs
  trip_id: string | null    // "<source>:<trip_id>"
  source: string, agency: string
  route_id: string | null, route_name: string | null   // "Northeast Regional", "Penn Line"
  train: string | null       // public train number "171"
  headsign: string | null
  origin: string | null, destination: string | null     // station names
  lat: number, lon: number
  bearing: number | null     // degrees
  speed_mph: number | null
  delay_s: number | null     // + late, - early; null unknown
  status: "on_time" | "late" | "early" | "unknown"     // on_time = |delay| < 120 s
  next_stop: { stop_id: string, name: string, eta: string | null, scheduled: string | null } | null
  position: "realtime" | "estimated"   // estimated = interpolated from the schedule (no RT position)
  updated: string | null     // when the position was measured
  age_s: number | null       // seconds since `updated` at response time (freshness)
  stale_after_s: number      // its source's threshold (v1.3): compare age_s with this
  stale: boolean             // age_s > stale_after_s, computed at response time (v1.3)
}

GET /transit/trips/{trip_id}
-> Trip {
  id, source, agency, route_id, route_name, train, headsign, service_date: string,
  vehicle: Vehicle | null,
  stops: TripStop[]          // every stop in order
}
TripStop { stop_id: string, name: string, seq: number,
           arr_scheduled: string | null, arr_estimated: string | null,
           dep_scheduled: string | null, dep_estimated: string | null,
           delay_s: number | null, track: string | null,
           state: "passed" | "current" | "next" | "upcoming" | "skipped" }
```

## Stations, routes

```
GET /transit/stations/{stop_id}?back=60&ahead=240
-> StationBoard {
  stop: Stop, routes: { id, name, short_name, color, agency }[],
  departures: BoardRow[], arrivals: BoardRow[]       // both include passed rows (within `back` minutes)
}
BoardRow { trip_id: string, source: string /* v1.3 */, train: string | null, route_name: string | null, agency: string,
           headsign: string | null /* departures: destination; arrivals: origin */,
           scheduled: string, estimated: string | null, delay_s: number | null, track: string | null,
           state: "passed" | "upcoming" | "cancelled" }

GET /transit/routes/{route_id}?date=YYYY-MM-DD
-> { route: { id, source, agency, name, short_name, color, kind },
     directions: { id: number, headsign: string,
                   stops: { stop_id, name }[],
                   trips: { trip_id, train, times: (string | null)[] }[] }[] }   // timetable grid
```

The existing `/transit/stations/{place_id}/board` (app place ids) stays for the regional map until the map moves to
GTFS stop ids.

## Implementation notes (v1.1, backend as built)

Additions and clarifications to the contract above; nothing was removed.

- **Namespaced ids.** Every id the API returns is `"<source>:<gtfs id>"`: stops (as the contract says), and also
  `Line.id`, `Line.route_id`, `Stop.routes[]`, `Vehicle.route_id`, `Trip.route_id`, `NextStop.stop_id`,
  `TripStop.stop_id`, `BoardRow.trip_id`, `RouteBrief.id`, timetable `stop_id`/`trip_id`. Feed them straight back
  into `/transit/stations/{stop_id}`, `/transit/routes/{route_id}`, `/transit/trips/{trip_id}`.
- **Stations are stations.** `/stops` and `TripStop.stop_id` use the station id (a parent station, or the stops of
  one name sitting together, e.g. MARC's northbound and southbound platforms), so a trip's stop ids can be opened
  as a station directly. A child platform id also works in `/stations/{stop_id}`.
- **Tolerance follows the bbox width, not `zoom`.** `zoom` is accepted and ignored. Widths up to 150 km get the
  full shapes (40 m tolerance), up to 700 km 250 m, up to 2500 km 1.2 km, wider 5 km. Lines are clipped to the
  bbox plus 10 %. Stops are returned whole under 200 km wide; wider, one stop per cell of a 40x40 grid
  (intercity first, then the busiest), at most 1500. National view: about 65 KB of lines, 29 KB of stops.
- **Amtrak trip ids.** A running Amtrak train's `trip_id` is its live id (`amtrak:171-13`, Amtraker's trainID); the
  trip page then shows Amtraker's stops with platform. Scheduled trips use the GTFS trip id (`amtrak:316975`), and
  board rows of a live train carry the live id. Amtraker `lastValTS` is the position's `updated`.
- **Vehicle `position: "estimated"`** is produced for sources with GTFS-RT trip updates (MARC, VRE) when a trip has an
  update but no vehicle position; its `id` equals its `trip_id`. Speed there is the schedule speed of the segment.
  `speed_mph`/`bearing` fall back to values computed from successive positions when the feed has none.
- **Sources** `PUT/POST` with `api_key: "***"` keeps the stored key; `null` or `""` clears it. A source id must be a
  lowercase slug. `POST` of an existing id is 409. `refresh` waits for the download and parse (seconds for big feeds).
- **Stats.** `GET /transit/stats -> { sources: [{id, enabled, kind, static_load_s, rt_fetch_ms, routes, stops,
  trips, line_points, memory_mb, state}], memory_mb, enabled }` (memory is an estimate of the transit indexes).
- `GET /transit/vehicles` also still takes `agency=`. `/transit/stations/{place_id}/board` is unchanged.

## Schedule first, realtime overlaid (decision D5, v1.2)

- Amtrak and MARC boards, trips and timetables come from the official static GTFS, so every scheduled train is
  listed for any date: `GET /transit/stations/{stop_id}?date=YYYY-MM-DD` lists that whole service day (back/ahead
  ignored), `GET /transit/trips/{trip_id}?date=` shows a scheduled trip on that day, `/transit/routes/{id}?date=`
  as before.
- Realtime is overlaid by train number + service day: Amtrak from Amtraker (a live train is matched to its GTFS
  trip by number and first-stop time), MARC from GTFS-RT trip updates and vehicle positions. Scheduled trains with
  no realtime stay schedule-only (`estimated: null`).
- `BoardRow.added: boolean` (new): the train is in realtime but not in the schedule (MARC trip updates marked ADDED,
  Amtrak live trains that match no GTFS trip); `scheduled` then carries the realtime time. Such trains also have a
  `/trips/` page built from the realtime stops.
- Service alerts: `Trip.alerts` and `StationBoard.alerts` (`{header, description, url, routes[], stops[], start,
  end}`), and `GET /transit/alerts?source=` for all active ones. MARC's source reads the MDOT MTA system-wide alerts
  feed `https://feeds.mta.maryland.gov/alerts.pb` and keeps only alerts that name MARC routes, stops or trips.
  Amtrak trip alerts are Amtraker's per-train messages.

## Station groups (v1.3, decisions 16 and 21)

Amtrak, MARC and VRE stops at one station are ONE station in the API. A group id is `st:<code>` in lowercase, the
Amtrak code (`st:was`, `st:ncr`, `st:bwi`, `st:bal`, `st:abe`, `st:rkv`, `st:hfy`, `st:mrb`, `st:alx`, `st:mss`,
`st:bcv`, `st:wdb`, `st:qan`, `st:fbg`). Stops in no group keep `<source>:<stop_id>` ids, unchanged.

- **Curated list**: `backend/app/transit/data/stations.json` (code, name, lat/lon, explicit member stop ids per
  source, checked by hand against the feeds). It is copied at startup into the `station_groups` and
  `station_members(station_id, source, stop_id, method)` tables (idempotent; the file is the source of truth for
  `curated` rows; only `curated` and `auto` members take effect, `suggested` never does).
- **Every endpoint that takes a station id accepts both** a group id and any member stop id (`amtrak:WAS`,
  `marc:11958`, a VRE platform id): a member resolves to its group. Ids are case-insensitive for `st:`.
- **`GET /transit/stops`**: a group replaces its member stops with one stop
  `Stop { id: "st:was", source: "group", sources: ["amtrak","marc","vre"], name, lat, lon, kind, routes }`;
  `kind` is `intercity` if any member is, `routes` is the union (namespaced route ids). `Stop.sources` is new on
  every stop (`[source]` for a plain one). Bbox thinning is applied after grouping, so a group competes as one
  intercity stop. A group is listed when at least one member stop is in the bbox.
- **`GET /transit/stations/{id}`**: for a group (or a member id) the board is the union of the members' boards:
  `stop` is the group stop, `routes` the union, `alerts` the union, `departures` / `arrivals` sorted by
  `estimated ?? scheduled`. Each `BoardRow` keeps `agency` and gains `source` (also on ungrouped boards).
  New query `agency=` (name, any case) and `source=` (source id) keep only those rows. `date=`, `back` and
  `ahead` behave as before. Sources that are disabled or still loading simply contribute no rows.
- **Ids elsewhere**: `Trip.stops[].stop_id`, `Vehicle.next_stop.stop_id`, `Alert.stops[]` and timetable
  `stops[].stop_id` return the group id when the stop belongs to a group, so the frontend opens the merged
  station. Stop names there stay the source's own name. The raw platform id is not returned.
- **`GET /transit/stations/suggestions`** -> `[{a: Stop, b: Stop, distance_m: number, reason: "name" | "distance"}]`:
  ungrouped stations of different sources within 300 m (`distance`), or with the same normalised name within 1 km
  (`name`, which wins when both hold; "station", "amtrak", "marc", "vre", "rail" are ignored, word order is not).
  Closest first, recomputed when a feed reloads. For the Settings page; nothing is applied automatically.

## Sprint 1 additions (v1.4)

All additive; nothing was removed.

### Departure estimates (BE-1)

`dep_estimated` / `delay_s` on departures no longer repeat the arrival estimate. For a stop that is neither first nor
last, the estimated departure is `max(scheduled departure, estimated arrival + scheduled dwell)`, which is the
scheduled departure plus the arrival delay, never earlier than scheduled (a layover is not assumed to absorb delay). If
the feed reports a departure of its own (Amtraker `dep` different from `arr`; a GTFS-RT departure different from the
arrival), a later-than-scheduled value is trusted and an earlier one is clamped to the schedule. The first stop keeps
the feed's departure (it may leave early); the last stop has no departure and keeps its arrival delay. Rule:
`BoardRow.delay_s` for departures and `TripStop.delay_s` (departure delay where the stop has a departure, else
arrival delay) use this value; arrival rows keep the arrival delay. One implementation (`transit/estimates.py`) serves
the Amtraker and GTFS-RT paths.

### Passed / current state from position (BE-2)

`TripStop.state` and `BoardRow.state` now come from how far the train has really got, the same for the trip page, the
station board and `Vehicle.next_stop`:

- `TripStop.state_basis` and `BoardRow.state_basis`: `"position" | "clock"`. `position`: the train's position is
  fresh (age within its source's `stale_after_s`) and says which stop is next (Amtraker's per-stop status; GTFS-RT
  `current_stop_sequence` / `stop_id` / `current_status` of the vehicle position, as MBTA sends). `clock`: no usable
  position (stale, missing, or the feed gives no stop), so the state is derived from the estimated times and is an
  estimate.
- A stop after the train's next stop is never `passed` (`passed` stops are always a prefix of the trip).
- `Vehicle.next_stop` is the first stop that is not `passed` (the stop the train stands at, or the one it is heading
  for), so it equals the first `current` / `next` stop of `/trips/{id}`. This changes MARC / VRE / MBTA: while a train
  stands at a stop, `next_stop` is that stop (as Amtrak already did) instead of the one after.
- Board rows: a train standing at a stop (`current`) has `passed` as an arrival row and `upcoming` as a departure row.

### Station identity and board rows (BE-4)

- `StationBoard.canonical_id: string`: the id to address the station by. A group id (`st:was`) for a group or any of
  its member stop ids; otherwise the stop's own id (`amtrak:NYP`; a platform id resolves to its parent station). The
  client rewrites the URL to this id and compares map selections with it.
- `Stop.code: string | null`: the Amtrak station code (`WAS`). Set for every Amtrak stop and for every station group
  (the group id's code, uppercase); null for stops of other sources.
- `Stop.short_name: string | null`: a short display name for tight spaces ("Washington Union", "Baltimore Penn").
  Set for the curated groups (the `short_name` key in `data/stations.json`); null elsewhere (the client cleans those
  names, FE-9). `name` is unchanged.
- `BoardRow.origin` and `BoardRow.destination: string | null`: names of the station where the trip begins and ends,
  on every row (departures and arrivals both). `headsign` keeps its meaning (departures: destination; arrivals:
  origin).

### Source state "warming" (BE-3)

`TransitSource.status.state` gains `"warming"`: the source's schedule is loaded but its first realtime poll has not
finished (after a backend restart this lasts a few seconds to a minute). While a source is warming it contributes no
vehicles to `GET /transit/vehicles` (none, not a partial list); boards, trips and the map layers still answer from
the schedule. The first poll ending, well or not, ends the warming: a failed first poll shows `stale` / `error` as
before. Order of states on a restart: `loading` (schedule downloading) -> `warming` -> `ok`.

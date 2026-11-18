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

Amtrak, MARC and VRE stops at one station are ONE station in the API (v1.4: groups are now built automatically,
see "Automatic station merging" at the end; the curated list below is the override). A group id is `st:<code>` in lowercase, the
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
- **`GET /transit/stations/suggestions`** was replaced in v1.4 by `/transit/stations/merges` (below).

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

### Tracks and platforms (BE-7)

`BoardRow.track` and `TripStop.track` are Amtraker's `platform` for that train at that stop, on live trip pages,
on board rows of live trains (matched to a scheduled trip or "added") and on the scheduled trip a live train is
matched to. Nothing is invented: Amtrak publishes a platform only for stops where it has assigned one, usually
within an hour or two of the train's arrival or departure and mostly on the Northeast Corridor from Philadelphia to
New York and on some northern routes. Audit on 2026-11-13 (evening): 54 of 2679 live Amtrak stops carried a
platform, none at WAS, BAL, BWI or NCR (0 of 135); every one of the 54 appeared in the API on its trip stop and on
its departure and arrival board rows (107 rows). A null `track` therefore means "not assigned yet" for Amtrak,
and MARC / VRE / MBTA carry a track only where the static feed names platforms (VRE's numbered platform stops).
The client should say "TBD" for a null Amtrak track on a stop that will see one, not hide the column.

### Automatic station merging (BE-10, decision 29)

Groups are no longer only the 14 curated DC stations. Whenever the enabled sources' stations are (re)loaded, the
backend rebuilds the groups:

- Each Amtrak (`amtraker` source) station merges with the **nearest station of each other source within 400 m**
  (setting `SDRVIZ_TRANSIT_MERGE_RADIUS_M`, default 400). A non-Amtrak station joins at most one group: its nearest
  Amtrak station. A group exists only when an Amtrak station has at least one such neighbour. Commuter-to-commuter
  merges without an Amtrak station are not made (the review list below shows them).
- Group id is `st:<Amtrak code, lowercase>` (`st:bos`, `st:bby`, `st:rte`, `st:pvd`, `st:phl`, `st:chi`, `st:lax`,
  `st:nyp`...), `Stop.code` is the code. The group name is the clearest member name: the longest one once agency words
  (Amtrak, MARC, VRE, MBTA) are dropped, ties to Amtrak's, ALL CAPS title-cased: "South Station" (not "Boston"),
  "Back Bay", "L.A. Union Station". Auto groups have no `short_name` (null); the client cleans the name.
- **Curated overrides** (`data/stations.json`): every curated `members` entry is merged whatever the distance, a
  curated group keeps its members of a source (the rule only adds sources the group lacks), and the `block` list
  (`{"station": "chi", "source": "metra", "stop_id": "OTC"}` entries, currently empty) forbids pairs. Existing curated
  names and short names stay.
- Rebuilt once every enabled source has loaded its stations (or failed), and again when any source reloads, is
  added, edited or removed. Auto members are kept in `station_members` (`method = auto`) so a group id works right
  after a restart, before the feeds load. Boards, stops, trip stop ids and `canonical_id` all use the new groups, no
  client change needed.
- Against the cached real feeds: BOS + MBTA South Station, BBY + Back Bay, RTE + Route 128, PVD + Providence, PHL +
  30th St, CHI + Chicago Union (Metra), LAX + L.A. Union (Metrolink), WAS + MARC + VRE; Chicago Ogilvie (about 1 km
  away) is not merged.

```
GET /transit/stations/merges
-> { radius_m: number,
     groups: { id: "st:bos", code: "BOS", name, short_name: string | null, lat, lon,
               members: { source, stop_id /* the source's station id */, name,
                          distance_m /* from the group position */, method: "curated" | "auto" }[] }[],
     suggestions: { a: Stop, b: Stop, distance_m, reason: "name" | "distance" }[] }
```
`suggestions` are pairs of ungrouped stations of different sources within 800 m (or 1 km with the same normalised
name), closest first, for a later Settings review; nothing in it is applied. This endpoint replaces
`/transit/stations/suggestions`.

### Non-stop passes on trips (BE-5, decision 17)

`GET /transit/trips/{id}?passes=1` (default off; without it the response is exactly as before) lists the stations the
train runs through without stopping, interleaved in order with the stops:

```
TripStop (pass entry) {
  kind: "pass",                    // ordinary entries now carry kind: "stop"
  stop_id: string, name: string,   // the station (group id `st:ncr` when it has one)
  seq: number,                     // seq of every entry is renumbered 1..n in this mode
  arr_scheduled / arr_estimated / dep_scheduled / dep_estimated: null,
  pass_scheduled: string,          // approximate: interpolated along the track between the two bracketing stops
  pass_estimated: string | null,   // the same with the live delay; null when the trip has no realtime
  approx: true, delay_s: number | null, track: null,
  state: "passed" | "upcoming", state_basis: "position" | "clock"
}
```
- A pass is a station of the feed that lies on the trip's route shape between two consecutive stops of the trip and is
  not one of them (within 250 m of the shape, more than 300 m from either stop). Stations of other routes count: an
  Acela runs through New Carrollton, Aberdeen and Metropark although no Acela stops there. Found per stopping
  pattern and cached until the static feed reloads.
- `pass_scheduled` is the scheduled departure of the previous stop plus the share of the way to the next stop's
  scheduled arrival, by distance along the shape. `delay_s` blends the previous stop's delay and the next stop's
  arrival delay the same way; `pass_estimated = pass_scheduled + delay_s`.
- State: `passed` once the train has reached the next stop, or (while it is between the two) when the estimate is in
  the past; otherwise `upcoming`. There is no `current` / `next` for a pass.
- Works for scheduled trips (`/trips/amtrak:316975`, MARC) and for the live id of an Amtrak train matched to a
  scheduled trip (`/trips/amtrak:2122-13`). Added / realtime-only trips (no scheduled trip) have no passes.
- The Amtrak static shapes are kept in memory for this (thinned to 25 m, about 13 MB).

### Non-stop passes on station boards (BE-6)

`GET /transit/stations/{id}?passing=1` adds `passing: PassRow[]` to the `StationBoard`. Without the parameter
`passing` is an empty list. `departures` and `arrivals` are unchanged and never contain a pass. The same `back`,
`ahead`, `date`, `agency` and `source` rules apply; a group (or member id) takes the union of its members.

```
PassRow { trip_id: string,             // the id a trip page takes (live id for a running Amtrak train)
          source: string, train: string | null, route_name: string | null, agency: string,
          headsign: string | null, origin: string | null, destination: string | null,
          scheduled: string,           // approximate (interpolated along the track), same as TripStop.pass_scheduled
          estimated: string | null,    // with the live delay; null without realtime
          delay_s: number | null, state: "passed" | "upcoming", state_basis: "position" | "clock", approx: true }
```
Rows are sorted by `estimated ?? scheduled`. They come from the same computation as the trip page's passes (BE-5),
for scheduled trips of the station's own source (an Amtrak station lists Amtrak trains that run through it, a MARC
station MARC trains; a group board has both). Trips without a shape in the feed have no passes. A cold request for a
station on the Northeast Corridor takes about 0.3 s, later ones under 0.1 s.

### Delay outlier flag and next-stop reason (BE-8)

Two new `Vehicle` fields; `delay_s` is never clamped.

- `delay_suspect: boolean`: true when `delay_s` is more than 12 h late or more than 30 min early (constants
  `SUSPECT_LATE_S` / `SUSPECT_EARLY_S` in `transit/models.py`). A real six hour delay (Auto Train) is not flagged;
  Sudbury's "-56 MIN" is. false when `delay_s` is null. The client may mark the value, never hide it.
- `next_stop_unavailable: string | null`: why `next_stop` is null: `"no stop data"` (the train has no known stops: no
  scheduled trip matched and no stop list in the feed) or `"terminated"` (it has passed all of them). null when
  `next_stop` is set.

## Sprint 1 follow-ups (v1.4.1)

- `BoardRow.delay_suspect: boolean`: same rule as `Vehicle.delay_suspect` (more than 12 h late or 30 min early).
- A GTFS-RT trip update applies only to the service day in its `start_date` (MARC, MBTA and Brightline all send
  it); an update without one applies as before. A vehicle position likewise applies only to the run
  it is on. Before this, yesterday's and tomorrow's runs of the same trip took today's realtime and showed on
  boards as duplicate rows "+24 H" late or early.

## Approaching (v1.5)

`GET /api/transit/approaching`: every train that passes a point on the map, and when. One endpoint for the
trainspotting page; it replaces the `/trains/eta` and `/spot` sketches in the review notes.

```
GET /api/transit/approaching?lat=39.0849&lon=-76.7064
    &radius_km=1        0.1..25   how far the track may pass from the point to count (default 1)
    &ahead_min=60       1..360    trains due within this many minutes (default 60)
    &back_min=10        0..60     trains that passed within this many minutes (default 10)
    &offset_min=0       -360..720 the window's moment, minutes from now (default 0); states and positions stay relative to now
    &agency=MARC                  one operator, any case (default: all operators)
    &include_scheduled=true       also trains with no realtime at all, from the timetable (default true)
    &limit=100          1..500    rows kept after sorting (default 100)
```

`503` when transit is off, `422` for out-of-range values, `200` with `trains: []` when nothing passes (never 404).
The SPOT page asks once for `back_min=60&ahead_min=360&limit=500` and filters its timeline window on the device;
`offset_min` is there for a window further out than that.
The route is a plain `def` like `/vehicles`. Sources that are `warming` are skipped and say so in `meta.sources`.

### What the ETA means

- **ETA is to the closest point on the line**, not to a station. The point is projected on each train's own shape
  (the same shape the trip page and the estimated positions use), so direction, "already passed" and the distance to
  go fall out of the geometry. A train's `eta` is the scheduled time at that point (interpolated by distance between
  the two bracketing stops, or the stop's own arrival if the point is within 250 m of a stop) plus the delay the feed
  gives at that point (the bracketing stops' delays blended the same way).
- **`delay_s` always equals `eta - scheduled`, and one delay serves the whole train.** The delay is the train's
  current delay, the one `Vehicle.delay_s` shows (its delay at the stop it is heading for), carried to the spot while
  the spot is ahead of the train. The feed's forecasts for later stops (a recovery to on time at the terminal) are not
  used, so the same train shows the same delay at every spot along its line. A spot already behind the train keeps the
  delay recorded there.
- **A position can overrule the clock, never the other way round, and it is anchored to when it was measured.** A
  real fix (`vehicle.position == "realtime"`, within 1 km of the trip's shape) carries its age (`vehicle.age_s`).
  With `fix_time = generated - age_s`, the ETA cannot be sooner than `fix_time + distance/130 mph`, nor the passing
  more recent than `fix_time - distance/130 mph`. When the feed's ETA is impossible it is replaced by
  `fix_time + distance_at_fix / speed` (the train's speed, or a typical 60 mph intercity / 40 mph commuter if it is
  crawling), `eta_basis` becomes `"position"` and `delay_s` follows. The replacement never slides with the clock, so a
  four-minute-old fix cannot keep a train "arriving" after it has gone by: if the result is already in the past the
  row is `passed`. A train standing at the spot keeps the feed's departure time (never earlier than the fix); one
  moving at the spot passes at the fix. Estimated and absent positions never change the ETA.
- **Window.** A row is listed when `eta` lies from `back_min` ago to `ahead_min` ahead. Trains with a live
  update or position are considered whatever their schedule says (a train four hours late still shows); trains
  without realtime only when their timetable overlaps the window.

### Response

```jsonc
{
  "generated": "2026-11-17T19:40:19Z",            // UTC
  "position": {
    "lat": 39.0849, "lon": -76.7064, "radius_km": 1.0,
    "nearest_line": {                              // the nearest line of any source within 25 km, else null
      "id": "amtrak:36923", "name": "Crescent", "agency": "Amtrak", "source": "amtrak",
      "distance_m": 87, "lat": 39.08518, "lon": -76.70733     // the nearest point on it
    }
  },
  "trains": [ /* ApproachingTrain, below */ ],
  "meta": {
    "sources": [{"id": "marc", "agency": "MARC", "state": "ok", "rt_age_s": 2, "trains": 3}],
    "window_from": "2026-11-17T19:30:19Z", "window_to": "2026-11-17T20:40:19Z",   // UTC
    "truncated": false                             // more rows matched than `limit`
  }
}
```

`meta.sources[].state` is `ok`, `warming` (skipped), `error` (the feed's last load failed; rows may be stale) or
`lines` (a map-only source: it has no trains). `rt_age_s` is the age of its last good realtime fetch.

Each element of `trains`:

| field | meaning |
|---|---|
| `key` | trip plus service day, stable for a list (`"marc:Train446@2026-11-17"`); a train with no timetable uses its vehicle id |
| `trip_id` | open it with `/transit/trips/{id}`; null only for a live vehicle that names no trip |
| `vehicle_id` | null while the train is not running yet |
| `source`, `agency` | the operator (`"marc"`, `"MARC"`) |
| `train`, `route_id`, `route_name`, `headsign`, `origin`, `destination` | as on `Vehicle`; `origin`/`destination` are station names |
| `line` | short name that tells lines apart on a mixed list: `"MARC Penn"`, `"MARC Camden"`, `"MARC Brunswick"`, `"VRE Manassas"`, `"Acela"`, `"Northeast Regional"`; null if the route has no name |
| `state` | `approaching`, `at_spot` (ETA within 60 s either side), `passed`, or `unknown` (a live train with no timetable and no heading) |
| `eta` | when the train is nearest the point (passed: when it was). Local time of the operator with offset. null: not computable (stopped train with no timetable) |
| `eta_in_s` | seconds from `generated`; negative once passed; null with `eta` |
| `scheduled` | the timetable time at the point; null for trains with no timetable |
| `delay_s`, `status`, `delay_suspect` | `eta - scheduled`; `on_time`/`late`/`early`/`unknown`; as `Vehicle`. null / `unknown` when there is nothing to compare |
| `basis` | **how good the data is**: `live` (a real GPS fix of 90 s or less), `stale` (a real fix older than 90 s, whatever the source's own limit; Amtrak fixes run 2 to 5 minutes), `estimated` (a position interpolated from the schedule, or a trip update with no position), `schedule` (timetable only) |
| `eta_basis` | **how `eta` was worked out**: `realtime` (timetable plus the feed's delay), `schedule` (timetable only), `position` (replaced by the train's position, or a train with no timetable) |
| `pass_distance_m` | how far the track passes from the point |
| `to_go_km` | along the track to the point; only for approaching trains with a usable live fix |
| `station` | the nearest station to the point (any source's, within 25 km) that this train calls at or runs through; null if none: `{id, name, distance_m, stops, role, scheduled, eta, delay_s}`. `stops: false` is "PASSES", `true` is "STOPS" at `eta`. `role` is `origin` (the trip starts here: DEPARTS, `eta` is the departure), `terminus` (it ends here: ARRIVES), `stop` (it calls mid-route) or `pass`. `id` is the usual API id (a group such as `st:was` where one exists) |
| `between` | `{previous, next}`: the stops the point lies between on this trip |
| `direction` | `{bearing, cardinal, label, toward}`: travel direction at the point in degrees and `N`..`NW` (local), `label` = `NB`/`SB`/`EB`/`WB` for the whole trip from origin to terminal (north-south unless the trip runs within about 70 degrees of east-west), so a train keeps one label along its route (a Camden train is NB at Halethorpe and at BWI), and the station the trip ends at |
| `vehicle` | `{lat, lon, speed_mph, age_s, stale, position, next_stop}` for a "where is it now" dot; null when not running. `age_s` is the age of the fix in seconds (show it per row); `stale` is true for a real fix over 90 s old |

Sorting: by `eta` ascending, so passed trains lead and the next train is the first row with `eta_in_s > 0`. Rows with
`eta: null` follow all the timed ones. The page derives `MEET` (opposite directions within 90 s) and the next NB/SB
strip from this list.

### Trains with no timetable

A live vehicle that matches no scheduled trip (an extra section, a reroute, an unmatched Amtraker train) cannot be
timed from a schedule. If it runs within 300 m of a shape that passes the point, it is listed with `eta_basis:
"position"`, `scheduled: null`, `delay_s: null`: direction from its heading, distance along the shape, and speed (its
own if moving, a typical one only when the feed gives none). A stopped train has `eta: null`, and is listed if it
is within 5 km of the point; a train with no heading has `state: "unknown"`.

### Example

`GET /api/transit/approaching?lat=39.0849&lon=-76.7064&agency=MARC&limit=1`, with `meta.sources` cut to the MARC source:

```json
{
  "generated": "2026-11-18T00:40:18.596469Z",
  "position": {
    "lat": 39.0849, "lon": -76.7064, "radius_km": 2.0,
    "nearest_line": {"id": "amtrak:36923", "name": "Crescent", "agency": "Amtrak", "source": "amtrak",
                     "distance_m": 87, "lat": 39.08518737962721, "lon": -76.70733477295946}
  },
  "trains": [{
    "key": "marc:Train446@2026-11-17", "trip_id": "marc:Train446", "vehicle_id": "marc:000012",
    "source": "marc", "agency": "MARC", "train": "446", "route_id": "marc:11705", "route_name": "PENN - WASHINGTON", "line": "MARC Penn",
    "headsign": "BALTIMORE", "origin": "UNION STATION MARC Washington", "destination": "PENN STATION MARC",
    "state": "approaching", "eta": "2026-11-17T19:44:46-05:00", "eta_in_s": 267,
    "scheduled": "2026-11-17T19:43:00-05:00", "delay_s": 106, "status": "on_time", "delay_suspect": false,
    "basis": "live", "eta_basis": "realtime", "pass_distance_m": 86, "to_go_km": 8.9,
    "station": {"id": "marc:11985", "name": "ODENTON MARC", "distance_m": 223, "stops": true, "role": "stop",
                "scheduled": "2026-11-17T19:43:00-05:00", "eta": "2026-11-17T19:44:46-05:00", "delay_s": 106},
    "between": {"previous": "ODENTON MARC", "next": "BWI RAIL STATION MARC"},
    "direction": {"bearing": 24.0, "cardinal": "NE", "label": "NB", "toward": "PENN STATION MARC"},
    "vehicle": {"lat": 39.01963, "lon": -76.76295, "speed_mph": 18.6, "age_s": 16, "stale": false,
                "position": "realtime", "next_stop": "ODENTON MARC"}
  }],
  "meta": {
    "sources": [{"id": "marc", "agency": "MARC", "state": "ok", "rt_age_s": 2, "trains": 3}],
    "window_from": "2026-11-18T00:30:18.596469Z", "window_to": "2026-11-18T01:40:18.596469Z", "truncated": true
  }
}
```

An Amtrak train passing the same point without stopping has `station: {"id": "marc:11985", "name": "ODENTON MARC",
"stops": false, ...}` (the station is taken from any source, so the Amtrak row can name the MARC station it runs
through) and `between: {"previous": "Bwi Thurgood Marshall Airport Station", "next": "Washington Union Station"}`.

### Where the existing code disagrees

- `Vehicle.delay_s` for GTFS-RT sources (MARC, VRE, MBTA, Brightline) used to be `TripUpdate.current_delay`, the delay
  of the first stop update in the feed, often a stop already left (MARC 858 showed 20 s beside a next stop 178 s late).
  Fixed: it is now the next stop's arrival delay (`estimates.current_delay`), as Amtrak's already was, for real and
  estimated vehicles alike, so chips and next-stop ETAs agree site-wide and this endpoint uses the same number.
- `Leg.delay` (and so the blended pass delay) floors an unreported departure delay at zero (a train cannot leave
  early). A train running early between two stops therefore shows a smaller negative delay at a point than at the
  stop it is heading for. This is the same convention as the non-stop pass rows on station boards.
- Amtraker stop times are only for the stops Amtraker lists, so a stop the train skips carries the last earlier delay
  forward (`delay_at`).

### Cost

About 30-45 ms warm for the DC area with all five realtime sources (of which about 17 ms is building every source's
vehicles, the same work as `/vehicles`); 8 ms when no line is near; the first request after a static load is slower
(around 100 ms) while stop distances along each stopping pattern are computed and cached (`GtfsProvider._stop_dists`,
replaced on static load). No new background job or database.

### Checked against the timetable

MARC 451 reads PASSES at Halethorpe and STOPS at BWI because that is its timetable: it skips Halethorpe (a limited-service
stop) and calls at BWI and Odenton (`/trips/marc:Train451?passes=1` lists Halethorpe as a pass).

### Limits

- The nearest-station name is the station's own source name, which differs by operator ("ODENTON MARC" against
  "Odenton"). Stations of grouped sources use the group's id.
- Time between two stops is linear in distance. Trains accelerate, so inside a long leg the error can be a minute or two.
- A path that passes the point twice (a loop) is projected once, at the nearest approach.
- Only sources with trips and realtime appear (`amtrak`, `marc`, `vre`, `mbta`, `brightline`); map-only sources are
  `state: "lines"` in `meta.sources`.
- Radio-only freight is not here; the page lists it from the radio side.

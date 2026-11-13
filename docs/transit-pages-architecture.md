# Transit pages architecture (station, route, trip)

Builds on docs/transit-api.md (v1), docs/transit-sources.md and docs/personas/*. Owners: backend `backend/app/transit/`,
frontend `frontend/src/screens/transit/` (new), map `frontend/src/screens/map/`.

## 1. Entities, ids, URLs

| Entity | Id | Example | Notes |
|---|---|---|---|
| Station | `st:<code>` curated group, else `st:<source>:<parent_stop>` | `st:was` | Groups stops across agencies; Amtrak code is the key where present. Every stop belongs to exactly one station. |
| Stop | `<source>:<stop_id>` | `marc:Penn Station` | Namespaced; URL-encode with `encodeURIComponent`. |
| Route | `<source>:<route_id>` | `amtrak:40751` | v1 `route_id` is unnamespaced in Vehicle/Line; v2 namespaces everywhere (v1 fields left as is). |
| Trip identity | `<source>/<train-or-trip>/<service_date>` | `amtrak/171/2026-11-13` | train = public number (trip_short_name); falls back to native trip_id. The date is always explicit. |
| Vehicle | `<source>:<vehicle or trip>` | | Only on the map; resolves to a trip identity. |

Resolution rules: RT trip -> static trip by train number + service date (never trip_id across days). RT-only trips (ADDED) get a trip identity with `scheduled: false`. The service date is the GTFS service day, not the calendar date (24h+ times).

### URLs (client router)

The router (`frontend/src/lib/router.svelte.ts`) is path + query on the History API; `routeFor` in `routes.ts` matches `r.path === path` exactly, so parameterised paths need one change: a `prefix` field on Route, and `routeFor` returns the route whose `path` equals the path or whose `prefix` the path starts with. One new route:

`{ id: "transit", path: "/transit", prefix: "/transit/", name: "TRANSIT", dir: "transit", shell: true }` (not in NAV; the header highlights MAP while on it, via an optional `navId`).

`screens/transit/Screen.svelte` parses `router.path` into `{kind, ...}` and renders Station/Route/Trip components. Globals (`scenario`, `size`, ...) carry via `carryGlobals` as usual. Use `followLink` for all `<a>`.

| Page | Path | Query |
|---|---|---|
| Station | `/transit/station/{station_id}` | `tab=dep\|arr\|pass`, `date=YYYY-MM-DD`, `at=HH:MM`, `route=`, `dir=`, `details=1` |
| Route | `/transit/route/{route_id}` | `date=`, `dir=0\|1`, `details=1` |
| Trip | `/transit/trip/{source}/{train}/{service_date}` | `from={station_id}` (highlight "you are here"), `details=1` |
| Index (phase 2) | `/transit` | `q=` search, lists of stations/routes |
| Map | `/map` | existing `select`, `mode`, `station`; new `focus=trip:<source>:<train>:<date>` or `focus=station:<id>` (map fits and selects; `follow=1` recentres on a trip until user pans) |

Deep-link rules: unknown id -> "not found" with search box, not blank. Trip whose date has no service -> "not running on this date" with prior/next dates. Back button returns to the map with its query intact (we always use `router.go` push, never replace, when leaving the map). Segments are human-readable where stable (station code, train number).

Map links: train window "Trip details" -> `/transit/trip/...?from=`; station window "Board" -> `/transit/station/st:...`; route chip -> route page. In the page, "Show on map" -> `/map?focus=...`.

## 2. Page design

Common chrome (all pages): title block (name, agency chips), a freshness line ("Live data 40 s ago" / "MARC live data unavailable, showing the schedule"), alert strip (route/stop/trip alerts, collapsed to a count when more than 2), "Details" toggle, Amtraker attribution when Amtrak data is shown, "Show on map" link. Touch targets >= 44 px; nothing hover-only.

### Time display (shared component `TimeCell`)

| State | Look | Text |
|---|---|---|
| scheduled only | grey | `5:29 pm` |
| predicted (agency RT) | normal ink; if differs from scheduled by >= 2 min, scheduled struck through beside | `5:41 pm  5:29` |
| predicted but stale (age > 2x poll or > 3 min) | ink at 60%, no countdown | `5:41 pm, 6 min ago` |
| actual | check mark, ink | `✓ 5:43 pm` |
| derived (interpolated pass / delay propagation) | tilde | `~5:32 pm` |
| cancelled | red, row struck through, "Cancelled", next alternative below | |
| skipped stop | "Not stopping" | |

Words plus colour; under 2 min = "On time"; early shown as early. Times are station-local 12 h; trip pages mark zone changes. Default view never shows raw seconds or ISO. Details adds: source flag per time (`static|rt|amtraker|derived|actual`), raw delay_s, age.

### Position states (shared `PositionBadge`)

| State | Marker / text |
|---|---|
| realtime | solid, "Live, 40 s ago" |
| estimated | hollow dashed, "Estimated from the schedule, not live" |
| last_known | faded, "Last seen 4 min ago, position may be off" |
| none | "Schedule only, no live position" (top of page) |

A train that vanished from RT is not "arrived": after the last stop plus grace (10 min) label "completed (assumed)".

### Station page

Default (rider): header with name and agency chips; line/direction filter chips (remembered); two tabs Departures (default) and Arrivals; rows `time | train | destination | track badge | status`; next row highlighted; last 1-2 passed rows greyed, older passed collapsed under "Earlier"; "Later / Tomorrow" pager at the bottom; track "Track TBD" until posted, "Track changed 7 -> 8" flagged.

One click away ("Details" or tab): third tab "Passing" (all trains through incl. non-stops, N/S columns, expected meets; phase 2), platform and sources columns, raw estimates, alerts list, radio channels covering the station (phase 3), station children/stops list, other stations on the same lines.

Navigation inside the page: previous/next window (`at=`), date picker for a past or future day (passed and upcoming both paged), row -> trip page with `from=`, route chip -> route page filtered to this station.

Through trains appear in both arrivals and departures with different times; termini only in one.

### Route page

Default: today's timetable grid per direction, current direction first, scrolled so "now" is visible and the next trains are highlighted; live badges (late / cancelled) on columns for today; weekday/weekend/holiday date switch; route alerts on top. Stop name -> station page; train column header -> trip page.

Details: service patterns as separate sub-grids (short-turns, express/local), union stop list with null cells in stable topological order, "valid from/to", where each train is now (position state chip), per-train delay row, shape on a mini map, equipment pattern (phase 3).

### Trip page

Default: header (train, route, destination); one sentence ("12 min late, next stop BWI 5:41 pm, was 5:29"); the position badge; vertical stop list: passed (check, actual time) / current ("between Halethorpe and BWI") / upcoming (predicted + struck scheduled + track); small map; "Follow on map".

Details: all three times per stop with source flags, pickup/dropoff types, dwell, delay trend ("lost 8 min since Baltimore"), skipped/added stops, block previous/next trip, vehicle id, speed history (when the feed has positions), history of this train's last N runs (phase 2), radio timeline slot (phase 3), raw feed ids.

Edge cases: added trip (no static: built from RT, badge "Added"), cancelled (whole page banner + alternatives), partially cancelled, RT-only gone (last known 2 h), DST (sort by instant), zone changes.

## 3. Radio extension points (phase 3, defined now)

- `radio_evidence[]` field reserved on Trip and StationBoard responses (always `[]` until phase 3): `{ id, at, channel_id, snippet, audio_url|null, kind: "train_number"|"loco"|"location"|"channel_time", confidence: "strong"|"medium"|"weak", confidence_score: 0..1, bound_by: "auto"|"user" }`.
- `channels` table / settings: `territories[]` per channel as ordered `{ route_id, from_mp|from_station, to_mp|to_station }` or a station-group list; `last_heard_at` per channel for "silence is not nothing".
- Derived endpoint: `GET /transit/v2/trips/{...}/channel` returns the channel(s) for the train's current position (territory lookup), used by the rider's "Listen" button; `GET /transit/v2/stations/{id}/channels`.
- Radio-only sightings: separate `sightings` entity (not a trip), shown on map only, expiring; may be "promoted" to a trip identity with `scheduled:false`.
- Rules: radio never changes status chips; weak matches never auto-claim a train; only "strong" shows on the default trip view (and only in Details until decision D8 says otherwise); no autoplay, opt-in.
- Gazetteer (CP names, mileposts) hangs off station groups and the existing schematic data.

## 4. API v2 (diff against v1)

Prefix `/api/transit/v2/`. v1 endpoints stay as they are (the map keeps working). Additive within v2. Every v2 response includes:
`{ schema_version: 2, generated_at, sources: [{id, state, static_version, static_loaded_at, rt_updated_at, rt_age_s}], attribution: [{source, text, url}] }`.

| Area | v1 | v2 |
|---|---|---|
| Stations | `/stations/{stop_id}`, `/stations/{place_id}/board` | `GET /stations?q=&near=lat,lon&route=&limit=&cursor=` (paged search); `GET /stations/{station_id}` (group, members[{source, stop_id}], timezone, routes); `GET /stations/{station_id}/board?date=&at=&dir=&route=&limit=&cursor=&kind=dep\|arr\|pass` |
| Board row | state passed/upcoming/cancelled | adds `trip` {source, train, service_date}, `scheduled_stop` flags: `stops` (bool, false for pass), `pickup`, `dropoff`, `platform`, `track_changed_from`, `times`: `{scheduled, predicted, actual, source: static\|rt\|amtraker\|derived}`, `scheduled_rel: scheduled\|added\|cancelled\|skipped\|no_data`, `next_cursor`, `prev_cursor` |
| Trip | `/trips/{trip_id}` | `GET /trips/{source}/{train}/{service_date}` -> Trip with `stops[]` carrying all three times + source flags, `position: {state: realtime\|estimated\|last_known\|none, lat, lon, age_s, updated, measure_basis}`, `status`, `scheduled: bool`, `previous_trip`, `next_trip`, `alerts[]`, `radio_evidence: []`; `GET /trips?train=&date=&source=` finds the identity; `GET /trips/.../history?n=10` (phase 2) |
| Route | `/routes/{route_id}?date=` single grid | `GET /routes?source=&q=`; `GET /routes/{route_id}?date=` -> `{route, valid_from, valid_to, directions[{ id, headsign, patterns[{ id, stops[], trips[] }], stops (union, null cells) }], live: {trip -> status/delay/position_state}}`; shape via `GET /routes/{id}/shape` |
| Alerts | none | `GET /alerts?route=&station=&trip=&active=1` -> `{id, header, description, effect, cause, active_period, informed_entities, url, source}`; embedded counts on pages |
| Search | none | `GET /search?q=` -> `{trains, stations, routes}`, running trains first (phase 2) |
| Actuals | none | stored server-side; exposed as `times.actual` on stops and rows |
| Ids | mixed | all `<source>:<native>`; URL-safe encoding documented |
| Lists | unbounded | `limit` + `truncated`, `cursor` |
| Caching | none | static-derived: `ETag` = hash(static_version, params), `Cache-Control: max-age=3600`, 304 support. RT-derived: `ETag` = RT snapshot id, `Cache-Control: max-age=<poll/2>`, `Last-Modified` = rt_updated_at. Single-user, cookie auth: skip `Vary` games |
| Errors | | 404 body includes `suggestions[]`; 410-like "not running on date" is a 200 with `status: "no_service"` and neighbouring dates |

### Migration path

1. v1 contract file stays frozen; the map agent keeps using v1 until phase 2.
2. v2 is built as a new router module (`backend/app/transit/api_v2.py`) on top of shared indexes; v1 handlers are not edited except to call shared helpers.
3. Station group table is read by v1 `stops` (adds optional `station_id` field: additive, ignorable).
4. The map adds `station_id` and trip identity `{source, train, service_date}` to Vehicle (additive v1 fields: `service_date`, `station_id`) so links can be built without a v2 call.
5. When all three pages consume v2 and the map moved to v2 vehicles/stations, retire the place-id board (phase 3) and mark v1 deprecated with `Deprecation` header.

## 5. Backend data model notes

- Static index per source (in-memory, rebuilt on load, versioned by `static_version`): `stop_times_by_stop[(stop) -> sorted array of (secs, trip_idx, seq)]`, `trips_by_train[(train) -> [trip_idx]]`, `trips_by_route`, `services_on(date)` cached per date, stop->station map.
- Time handling: store stop_times as int seconds since service-day noon minus 12 h; resolve to instants per stop timezone at response time; board queries cover two service dates around midnight; sort by instant.
- `station_groups` (SQLite/db): `station_id, name, lat, lon, tz`; `station_members(station_id, source, stop_id, method: curated|suggested|auto)`; seeded from a checked-in YAML for the DC corridor and Amtrak codes; heuristic output is "suggested" only.
- `actuals(source, train, service_date, stop_id, seq, arr_actual, dep_actual, observed_at, basis: rt|amtraker|inferred)` primary key `(source, train, service_date, seq)`; index `(source, stop_id, service_date)`; written on every RT poll when a stop's state flips to passed; kept forever (decision D4); size shown in Settings, backed up with the DB. Also `trip_snapshots` (last RT blob per trip) retained 2 h for last-known.
- `alerts` cache from GTFS-RT alerts (`rt_alerts_url`), keyed by informed entity.
- National scale: only `gtfs`/`amtraker` kinds get stop_time indexes; `lines` sources stay geometry only (no board). Load Amtrak's 18 MB GTFS once, ~40k stop_times; one process fits easily. Lazy-build per-source indexes, keep them behind the already-existing refresh cycle; station search is a trigram/prefix index over names, `near=` via a grid index. Responses capped (board 200 rows) with cursors.
- Amtrak reconciliation: boards = static trips for the date, overlaid with Amtraker by (train number, service date); trains Amtraker doesn't know show scheduled only. Service date for Amtraker = origin day from its id "171-13", mapped to the trip's service date.

## 6. Frontend structure (file ownership)

```
frontend/src/screens/transit/
  Screen.svelte          path parser + page switch (owner: transit-fe)
  StationPage.svelte  RoutePage.svelte  TripPage.svelte
  components/ TimeCell.svelte PositionBadge.svelte FreshnessLine.svelte AlertStrip.svelte DetailsToggle.svelte TrackBadge.svelte
  lib/ api.ts (v2 client) urls.ts (build/parse URLs; unit tested) format.ts
frontend/src/routes.ts   (one-line route + `prefix` match; owner: transit-fe, small PR first)
frontend/src/screens/map/  link-outs only (owner: map)
backend/app/transit/api_v2.py, stations.py, actuals.py, alerts.py  (owner: transit-be)
```

`urls.ts` is the single place that builds links; the map imports it for its window links (read-only dependency).

## 7. Phased plan

### Phase 1: smallest useful slice (after the map work lands)

| # | Task (one agent) | Owner / files | Acceptance |
|---|---|---|---|
| 1 | Station groups: schema, YAML seed for DC corridor + Amtrak codes, `GET /v2/stations/{id}` | transit-be: stations.py | `st:was` returns members from Amtrak, MARC, VRE; every stop in a feed maps to one station |
| 2 | Board endpoint with dates, windows, cursors, times+source flags, passed rows, cancelled | transit-be: api_v2.py | Union board at 23:50 and 00:10 correct across service day; DST test on 2026-11-01; passed rows have `actual` or scheduled flagged |
| 3 | Trip by identity endpoint with position states, RT-only trips | transit-be | `/trips/amtrak/171/<date>` works for static+RT, RT-only, and not-running cases |
| 4 | Route timetable v2 (date, patterns, union stops) | transit-be | MARC Penn short-turns produce null cells; Amtrak NE Regional grid <= 1 s |
| 5 | Router prefix route + Screen shell + `urls.ts` + shared components | transit-fe | `/transit/station/st:was` reloads directly; back returns to map; unit tests for `urls.ts` |
| 6 | Station page (dep/arr tabs, filters, next highlighted, passed greyed, pager) | transit-fe | all states from sec. 2 visible in a fixture story; works at 1440 and 1920 stages and with touch |
| 7 | Trip page | transit-fe | schedule-only, estimated, live, stale and cancelled fixtures render distinct labels |
| 8 | Route page | transit-fe | now-marker scroll, date switch |
| 9 | Map link-outs + `focus=` handling | map | train window -> trip page and back; `?focus=trip:` selects and fits |

Phase-1 non-goals: search, alerts, actuals history, passing tab, pins, radio.

### Phase 2

Search + index page, alerts, actuals table and history ("last 10 runs"), "Passing" tab (decision D3), Amtrak static reconciliation (D5), pins / My stuff (D7), details toggle content, iPad/monitor layouts (D6), caching/ETags, v1 map moved to v2 vehicles. Acceptance: search "537", "Union", "Penn Line" return grouped results <200 ms; actuals visible for trains observed passing; ETag 304s verified.

### Phase 3

Radio evidence (transcript binding, channel territories, last-heard, Listen button, radio-only sightings, corrections), spot notes, watches/alerts, retire v1 place-id endpoint. Acceptance: strong match shows only in Details, weak never claims a train; territories unit-tested against schematic mileposts.

## 8. Risks

Station merge errors (curated first); Amtraker outage or lag (greys rows, falls back to schedule); service-day/time-zone bugs (tests across midnight, DST, Amtrak overnight); feed expiry (warn < 7 days); payload size on route pages (patterns + cursors); user confusion between estimated vs live (shared components only).

## 9. Decisions for the user (each: 5+ options, recommendation)

D1. URL scheme for pages — DECIDED 2026-11-13: option 3 (pages open over the map via `/map?page=…`); sections 1 and 6 still describe option 1 and must be adapted when phase 1 starts.
1. `/transit/station/..` single `transit` route with prefix (recommended: one router change, keeps nav clean).
2. Separate top-level routes `/station/..`, `/route/..`, `/trip/..` (three routes, shorter URLs).
3. Query-based under the map: `/map?page=trip&...` (no router change, but not real pages).
4. Hash fragment paths `/#/trip/...`.
5. Adopt a router library (e.g. a Svelte 5 file-based router) and migrate all screens.
Recommendation: 1.

D2. Station grouping method — DECIDED 2026-11-13: option 1 (curated list keyed on Amtrak codes, heuristics only suggest); option 4 revisited in phase 2.
1. Curated YAML for DC corridor + Amtrak codes, heuristics only suggest (recommended).
2. Fully automatic by distance/name (current approach), no curation.
3. Use only GTFS `parent_station` per source, no cross-agency merge.
4. Curated list editable in the settings page (database table + UI).
5. Import an external station database (e.g. Amtrak codes + Transitland stop groups) and reconcile.
Recommendation: 1 now, 4 in phase 2.

D3. Non-stop "passing" times — DECIDED 2026-11-13: option 1. Passing rows must clearly say the train does NOT stop (e.g. "PASSES · DOES NOT STOP", distinct row style) and show the time as approximate ("~14:32"), never styled like a departure.
1. Shape-distance interpolation between stops, labelled estimated (recommended).
2. Only show stops (no passing view).
3. Interpolate along OpenRailwayMap track geometry with speed profiles.
4. Use live vehicle positions only, no schedule-based pass times.
5. User-defined "spots" along a line with per-spot offset corrections learned from actuals.
Recommendation: 1 in phase 2, 5 later.

D4. Actuals and history — DECIDED 2026-11-13: option 2 (SQLite table, kept forever; plan backups/export).
1. SQLite table, 90-day retention (recommended).
2. Keep forever (small data, valuable for patterns).
3. Memory only, last 24 h.
4. Per-day parquet/JSONL files, offline analytics.
5. Do not store; show only what feeds provide.
Recommendation: 1 (switch to 2 if growth is small).

D5. Amtrak full-day boards — DECIDED 2026-11-13: option 1 for both Amtrak and MARC (official static GTFS for all scheduled trains, all realtime overlaid: Amtraker for Amtrak; GTFS-RT trip updates, positions and alerts for MARC).
1. Static GTFS overlaid with Amtraker by train number + service date (recommended).
2. Amtraker only (current: only running trains).
3. Static only for future days, Amtraker for today.
4. Amtraker + cached previous-day schedule snapshot.
5. Add another source (e.g. Transitland RT) as a second overlay.
Recommendation: 1.

D6. Layout on iPad and big monitor — DECIDED 2026-11-13: one right-side panel (replaces the floating windows; one at a time, context swaps in place) with a maximize button that overlays the page area with a small border; Esc or a click on the border closes overlay and panel. See decisions.md row 23.
1. Same pages, responsive; board on the right-side panel next to the map on the large stage (recommended).
2. Full-page only, no side panel.
3. Bottom sheet on iPad; map-docked board on desktop.
4. Multi-board wall mode (several pinned stations tiled) as its own route.
5. Native-feeling split view with page and map always side by side.
Recommendation: 1 in phase 1, 4 in phase 2.

D7. Home / "My stuff" and pins — DEFERRED 2026-11-13: not wanted now; no pins, saved items, recents or watches are built. Revisit later. See decisions.md row 24.
1. Browser local storage per device, no account sync (recommended for phase 2).
2. Server-side per-user table (the app has a login).
3. URL-only (bookmark-able pinned pages), no storage.
4. Pin on server plus "my train" resolution by train number + weekday rule.
5. Skip pins; rely on search and recents.
Recommendation: 1, then 4.

D8. Radio evidence on rider-facing pages — DEFERRED 2026-11-13: none on transit panels for now; radio is set up in Live Ops and keeps playing on every page. See decisions.md row 25.
1. Details only, strong matches only (recommended).
2. Show on default view when strong.
3. Never on transit pages; radio stays on its own screens.
4. Show all confidence levels with scores, in Details.
5. Territory "Listen" link only, no transcript matching.
Recommendation: 1, with 5 as the first step.

# Persona: GTFS / GTFS-RT data expert

Perspective: data correctness. Read against `docs/transit-api.md` (v1) and `docs/transit-sources.md`.

## 1. What matters on each surface

**Station page** (a place, not a stop_id)
- One station = a group of stops: parent station + child platforms/tracks, plus MARC-style per-direction stops, plus Amtrak/VRE/MARC records that are physically the same building (Washington Union, BWI, New Carrollton, Alexandria). Show one board, filterable by agency/route/platform.
- Board rows need: scheduled vs estimated/actual time, delay, platform/track, cancelled/added/skipped flags, headsign, train number, and whether the row is a *terminus* (arrival only / departure only). A through train appears in both arrivals and departures with different times (dwell).
- Passed rows: keep them, show actual time when known, scheduled otherwise, and say which.
- Alerts that affect this stop or its routes.

**Route page**
- A timetable per direction and service pattern, not one grid. Real routes have short-turns, branches, express vs local, and different stop sets per trip. A single `stops[]` per direction (as in v1) loses this; use a union of stops with null cells, ordered by a stable topological merge, not by first trip.
- Date selector (service day), weekday/weekend/holiday variants (calendar + calendar_dates), and a "valid from/to" note. Shape for the map.

**Trip page**
- Full stop list with scheduled, estimated, actual, delay, track, state. Position (realtime or estimated) with age. Vehicle/consist ids if present. Alerts. Previous/next trip of the same block (a train turns into another trip: block_id) when available.
- Cancelled / added / partially cancelled (skipped stops) / detoured states.

**Map**
- Vehicle marker = position + freshness + trip link. Station marker = station group. Line = shape, coloured by route.

## 2. Easy vs hard

| Topic | Reality |
|---|---|
| Service day past midnight | GTFS times can be 24:30:00, 25:10:00. The "service date" is not the calendar date of the event. Store times as seconds-since-service-day-noon-minus-12h, resolve to an instant per agency time zone. Overnight Amtrak (Lake Shore, Capitol Limited) cross midnight and even time zones. Never `strptime` GTFS times naively. |
| Time zones | `agency_timezone` per agency; stop_timezone overrides. Amtrak trips cross zones: each stop time is in its stop's local zone in Amtraker, but GTFS stop_times are in the agency (or stop) zone. Convert to instants server side, send offsets (v1 does). UI shows station-local time, and trip views should mark zone changes. DST fall-back (the 1:00-2:00 hour repeats) breaks "sort by local time"; sort by instant. Today is 2026-11-13, a week after the change, so test it. |
| Calendar | calendar.txt + calendar_dates.txt (exceptions type 1 add, 2 remove). Many feeds are calendar_dates only. Expire quietly: check feed_info start/end and warn when schedule expires in < 7 days. |
| Cancelled / added trips | RT `schedule_relationship` CANCELED (trip), ADDED / NEW (not in static), SKIPPED (stop), NO_DATA (stop: no prediction, do not carry delay forward), UNSCHEDULED (frequency-style). Added trips have no static row: a trip page must work from RT alone. |
| Delay propagation | RT says delay at stop N applies to later stops without their own update, but **not** earlier. Early trains: do not show departure before scheduled for timed stops where the agency holds. Prefer `time` to `delay` when both present; if only delay, add to scheduled. Don't invent negative dwell. |
| Platform / track | Not in standard GTFS-RT TripUpdate (only experimental `stop_time_properties.assigned_stop_id`). MARC/VRE: track appears as a child stop or in a name; Amtrak: only from Amtraker, and often only 10-30 min before departure. Show "track TBD" and never extrapolate from the last visit. |
| Stale RT | Header timestamp vs entity timestamp vs fetch time are three different things. An empty feed is not an error; a feed with an old header is. Compute `age` from the entity timestamp. Past a threshold (say 2x poll, or 3 min), mark predictions as stale and stop counting down. |
| Multi-agency stops | IDs collide across feeds ("1" exists everywhere), so always namespace. Matching across agencies by name/distance (current approach: <=250 m + word match, up to 1 km) is a heuristic that can merge wrong things (1 km is huge in a city) or miss. Curate a station-group table for the DC corridor (Union, Alexandria, BWI, New Carrollton, Baltimore Penn, Rockville, etc.), verify by hand, and use heuristics only for suggestions. Amtrak station codes (WAS, BWI, NCR) are the best cross-agency key where present. |
| Estimated positions | Hardest to be honest about. Schedule interpolation along `shapes.txt` (use shape_dist_traveled or project stops onto the shape) gives a plausible dot, not a fact. Amtrak with Amtraker is "RT" but updates slowly and sometimes lags several minutes. |
| Amtrak static | Amtrak GTFS is coarse (few shapes, no frequent updates, train numbers in trip_short_name, same train number runs daily with different trip_ids per date range). Match RT to static by train number + service date, not by trip_id. Amtraker's train id embeds the origin day ("171-13"); it is not the service date at every stop. |
| Frequencies / transfers / pathways | Commuter rail rarely uses frequencies.txt; ignore, but don't crash. transfers.txt is worth reading for station groups. pathways.txt helps for large stations (Union) but is low priority. |

**Showing uncertainty honestly**
- Three distinct time states, always visually distinguishable: *scheduled* (grey), *predicted* (agency RT, normal ink), *actual* (observed, with a check). Never show a predicted time in the same style as a scheduled one.
- Position states: `realtime` (measured, show age), `estimated` (schedule-interpolated: hollow/dashed marker plus text "estimated from schedule"), `stale` (last known, faded, with "last seen 6 min ago"), `none`.
- Show "last updated Ns ago" per source, not just globally. Fade/greyscale a source when its status is stale/error, rather than silently hiding trains.
- Delay colours must not imply precision: <2 min "on time", but display the actual minutes.
- A train that disappeared from RT is not "arrived". Only mark arrived when the last stop actual time exists or the schedule plus a grace period has passed, and then label it "completed (assumed)".

## 3. Critique of the v1 contract

**Missing or weak**
1. **No station entity separate from stop.** `Stop` has `id: "<source>:<stop_id>"`, but a station page needs a stable `station_id` that groups stops across agencies. Add `Station { id, name, lat, lon, timezone, stop_ids[], members[{source, stop_id, platform_code}], codes: {amtrak?, ...}, wheelchair }`. Key URLs on station id, not on a raw stop id.
2. **Trip identity is wrong for pages.** A `trip_id` alone is not unique across days (static trip_ids repeat daily by calendar). Trip key = `(source, trip_id, service_date)`; for Amtrak `(train number, service_date)`. `GET /transit/trips/{trip_id}` has no date and `service_date` appears only in the response. Add `?date=` or put the date into the path.
3. **Stop times as strings only.** Add `arr_actual` / `dep_actual`, `time_source` (`static|rt|derived`), and per-stop `schedule_relationship` (scheduled/skipped/no_data/added). `TripStop.state` mixes position progress with relationship (`skipped`); split them.
4. **Estimated vs realtime is only on Vehicle.** Need it per time too. Propose `Prediction { time, source: "agency_rt"|"amtraker"|"schedule", age_s, confidence? }` or at minimum `estimated_source` and `rt_age_s` on BoardRow and TripStop. `delay_s` null should be distinguishable from 0.
5. **`Vehicle.status` 'on_time/late/early/unknown'** conflates delay with data quality. Keep it as delay class; add `stale: bool` and `position: realtime|estimated|last_known`. Add `occupancy`, `current_status` (INCOMING_AT / STOPPED_AT / IN_TRANSIT_TO), `current_stop_sequence`, `trip start_date/start_time` (RT trip descriptor), `schedule_relationship` of the trip.
6. **Cancelled trips**: BoardRow has `cancelled` but `Trip` has no trip-level `status` (`scheduled|running|completed|cancelled|added|detoured`). Add it.
7. **Alerts are absent.** Config has `rt_alerts_url` but no endpoint. Add `Alert { id, header, description, url, cause, effect, active_periods[], informed_entities: {agency, route_id, stop_id, trip_id}[], severity }` and `alerts[]` on station/route/trip responses plus `GET /transit/alerts?route=&stop=`.
8. **Route response is a single grid.** Add `service_patterns`, `date` actually served, valid range, `shape` (polyline), a `has_realtime` flag, and a trips[] of `{trip_id, train, headsign, start_date, variant}`. Null cells need meaning (`null` = not served vs unknown).
9. **Missing static fields**: `route_type`, `route_long_name` vs `short_name` (names are inconsistent), `agency_timezone`, `stop_code`, `platform_code`, `parent_station`, `wheelchair_boarding`, `direction_id` on trips, `block_id`, `shape_id`, `bikes_allowed`, `pickup_type/drop_off_type` (matters: some stops are drop-off only; a "departure" at a drop-off-only stop is wrong), `timepoint`.
10. **Timezone**: add `tz` (IANA) on Station and Trip so the client formats local times without guessing. v1's offset-bearing ISO is correct but loses the name.
11. **Provenance and freshness**: every response should carry `sources: [{id, state, static_version, static_loaded_at, rt_updated_at, rt_age_s}]` and a `generated_at`. Amtraker attribution (required by ODC-By) belongs in a structured `attribution[]`, not a UI convention.
12. **Ids**: `route_id` in `Vehicle` and `Line` is unnamespaced while `Stop.routes` is "route ids" and `trip_id` is namespaced. Pick one rule: every id in the API is `<source>:<native_id>`, with URL-safe encoding (MARC has "BWI RAIL STATION MARC nb"-style names and ids with spaces/plus signs). Document the encoding; use opaque ids in URLs.
13. **Two station APIs.** The old place-id board and the new stop board will diverge. Retire place ids after station groups exist; make place a view of station.

**Pagination / size**
- `/vehicles` unbounded is fine (hundreds). `/stops` and `/lines` are bbox + zoom, OK, but add `limit` + `truncated: true` so the client knows it was thinned.
- Station board: use `back`/`ahead` windows (good) plus `limit` and a `cursor`/`next_from` for "later today / tomorrow". Boards crossing the service-day boundary must pull from two service dates; document this.
- Route timetables can be large (Amtrak long-distance across 30+ stops): `trips` filter by `date`, `direction`; no pagination otherwise.
- Station lists (search, "all stations on route", "all stations") need a paged `GET /transit/stations?q=&near=&route=`; trip pages need nothing paged.

**Caching / ETags**
- Static-derived responses (lines, stops, routes, route timetable) are keyed by `static_version` + date: send `ETag` and `Cache-Control: max-age` long; `If-None-Match` -> 304. Lines at a given zoom are a prime case.
- RT-derived (vehicles, boards, trips with live) get `Cache-Control: max-age=<poll/2>`, `ETag` from the RT snapshot id, and `Last-Modified` = rt_updated_at. Offer `Vary` on cookie only if actually needed (a session cookie on public transit data defeats CDN caching; fine for a single-user app).
- Consider SSE or a `?since=<snapshot>` delta for vehicles later; polling at 15 s is fine at v1.

**Versioning**
- Put `/api/transit/v1/` in the path now, or at least return `X-Transit-Api: 1`. A contract that mixes legacy `/stations/{place_id}/board` with `/stations/{stop_id}` at the same prefix is already ambiguous. Add `schema_version` to responses; additive changes only within v1; never repurpose a field.

## 4. Navigation and URL scheme

Design principle: every entity has a deep-linkable, shareable URL; the map is state, not a page (but its state is in the URL too).

```
/transit/station/{station_id}?date=YYYY-MM-DD&at=HH:MM&route=&dir=
/transit/route/{route_id}?date=YYYY-MM-DD&dir=0
/transit/trip/{source}/{train_or_trip}/{service_date}      e.g. /transit/trip/amtrak/171/2026-11-13
/map?center=lat,lon&z=..&focus=trip:amtrak:171:2026-11-13
/map?focus=station:was
```
- Station -> row click = trip page (anchored to this station, "you are here" highlight and a "this stop" badge). Station -> route chips = route page filtered to this station.
- Route -> stop name = station page; -> train cell = trip page (with the same date); "Show on map" fits to the route shape.
- Trip -> stop = station page scrolled to that train's time (`at=`); route chip = route page; "Follow on map" = map with focus; follow mode re-centres on updates until the user pans.
- Map -> train popup "Details" = trip page; station window "Board" = station page. Back button must return to map state.
- Use human-readable segments where stable (station code `was`, Amtrak train number) and keep opaque ids as fallback. Always carry `date` explicitly in trip URLs; a train link must not silently change meaning at midnight.
- Handle missing: a trip that is gone from RT and the static calendar shows "not running on this date" with the neighbours, not a 404.

## 5. Top 10 priorities (in order)

1. **Define the Station entity and curated cross-agency station groups** for the DC corridor (with Amtrak codes); key all pages on station id.
2. **Trip identity = source + trip/train + service_date**; fix `GET /trips` to take a date; resolve GTFS times (24h+) to instants with correct agency/stop time zones, tested across midnight and the DST change.
3. **Per-value provenance and freshness**: time source (static/RT/Amtraker/derived), `rt_age_s`, stale flag; `sources[]` and `generated_at` on every response.
4. **Honest estimation**: separate `estimated` vs `realtime` vs `last_known` positions and times in API and UI styling; shape-projected interpolation; stop counting down when stale.
5. **Cancelled/added/skipped/no-data handling** from RT `schedule_relationship`; trip-level status; added trips with no static row.
6. **Alerts endpoint and entity matching** (route/stop/trip), surfaced on all three pages and the map.
7. **Namespaced, URL-safe ids everywhere** plus the URL scheme above; retire place-id endpoints.
8. **Route timetables that reflect service patterns and calendar** (date picker, short-turns, direction, valid range) and the shape for the map.
9. **Amtrak static + Amtraker reconciliation** (match on train number + date) so boards show the whole day, not just trains Amtraker currently knows; document and display gaps.
10. **Caching and versioning**: ETags keyed on static_version / RT snapshot, `/v1/` prefix, `schema_version`, pickup/drop-off types, platform codes, and pagination/limits on lists.

## 6. Questions for the other two personas

1. (Rider) When a train's prediction is stale or only schedule-based, would you rather see "~10:42 (estimated, last update 6 min ago)" or have the app hide the time and show only "status unknown"? Where is your line between helpful and misleading?
2. (Railfan) Which identifiers do you need to follow a train across days and sources: consist/locomotive numbers, train number + origin date, block continuation (train turning into another number)? Which of those would you accept as "unknown" rather than guessed?
3. (Both) For the DC corridor, which stations do you consider the same place across agencies (e.g. Washington Union, Alexandria, New Carrollton) and do you expect one merged board or separate boards per agency/platform?

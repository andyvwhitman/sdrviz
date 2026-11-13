# Sprint 1 plan (not started)

Author: product manager. Date: 2026-11-13. Inputs: `feedback-railfan.md` (R#), `feedback-gmunk.md` (G#), `feedback-frontend.md` (F#), `docs/decisions.md` (1-25 override reviewers), `docs/transit-api.md`, `docs/transit-pages-architecture.md`.

## 1. Sprint goal

Make the transit data trustworthy enough to chase a train with (no more "-45 MIN" at Washington, boards that agree with the trip page and the vehicle), deliver the headline decided-but-unbuilt feature (decision 17, non-stop passes, labelled "PASSES - DOES NOT STOP - ~time"), and fix the layout collisions that make the 1180x820 iPad and the docked-panel map awkward to use every day. Design polish and code health follow only after those three; larger redesigns (stringline, strip diagram, Union live occupancy, MapCanvas refactor) are ranked in the backlog.

Sprint 1 (not started). No dates set; planned for about 10 working days per developer.

Not touched by this sprint (owner decisions): the freshness dot (white / amber past the source limit / red past 10 min / pulse on new data / hover "N s / N min since fresh data"); saved items (24); radio on transit panels (25).

## 2. Capacity and summary

Sizes: S = up to 0.5 day, M = 1-2 days (counted as 1.5), L = 3+ days (none in the sprint, all split). Capacity: 10 days each. No buffer is built in, so the slip order is stated below.

| ID | Title | Assignee | Pri | Size | Depends on | Status |
|---|---|---|---|---|---|---|
| BE-1 | Fix estimated departure at layover and terminal stops | BE | P0 | M | none | Ready |
| BE-2 | Passed/current state from position; board, trip and vehicle agree | BE | P0 | M | BE-1 | Ready |
| BE-3 | "warming" source state; never return a partial list | BE | P1 | S | none | Ready |
| BE-4 | Contract additions: canonical_id, station code/short_name, board origin+destination | BE | P1 | S | none | Ready |
| BE-5 | Non-stop passes on trips (decision 17) | BE | P1 | M | BE-1 | Ready |
| BE-6 | Non-stop passes on station boards (`passing`) | BE | P1 | M | BE-5 | Ready |
| BE-7 | Track/platform coverage on boards and trips | BE | P1 | S | none | Ready |
| BE-8 | Delay outlier flag and explicit next_stop reason | BE | P2 | S | none | Ready |
| BE-10 | Automatic station merging within 400 m, curated list as overrides (decision 29) | BE | P1 | M | BE-4 | Ready |
| FE-1 | Header: no chip/tab collision at 1180 and below | FE | P1 | S | none | Ready |
| FE-2 | Map overlays vs docked panel; train list cap/collapse; TERMINALS chip | FE | P1 | M | none | Ready |
| FE-3 | Feeds page responsive at 1440 and 1180 | FE | P1 | M | none | Ready |
| FE-4 | Board and trip honesty: actual/est departure, tracks, FROM/TO, no false LEFT | FE | P0 | M | BE-1, BE-2, BE-4, BE-7 | Blocked (on BE) |
| FE-5 | Passes UI (trip stop list, station "Passing" tab) | FE | P1 | M | BE-5, BE-6 | Blocked (on BE) |
| FE-6 | Delay display: luminance steps instead of ember, hours format, suspect marker | FE | P2 | M | BE-8 (suspect marker only) | Ready |
| FE-7 | Member-stop id highlight on map via canonical_id | FE | P2 | S | BE-4 | Blocked (on BE) |
| FE-8 | Feed-level chips: transit warming and transit stale | FE | P2 | S | BE-3 | Blocked (on BE) |
| FE-9 | Station and stop name cleaning | FE | P2 | S | BE-4 (short names) | Blocked (on BE) |
| FE-10 | Freshness mark: neutral squares (filled / hollow / crossed) and a single flash | FE | P2 | S | none | Ready |

Totals: BE 9 tickets = 5 x 1.5 (BE-1, 2, 5, 6, 10) + 4 x 0.5 (BE-3, 4, 7, 8) = 9.5 days. BE-9 (record actuals) moved to the top of the backlog to make room for BE-10 (decision 29). FE 10 tickets = 5 x 1.5 (FE-2, 3, 4, 5, 6) + 5 x 0.5 (FE-1, 7, 8, 9, 10) = 10 days.

Order of work:
- BE week 1: BE-1, BE-2, BE-4, BE-3, then BE-7. Week 2: BE-10, BE-5, BE-6, BE-8.
- FE has independent work first (FE-1, FE-2, FE-3, FE-6, FE-10) while BE-1/2/4 land (about day 4), then FE-4, FE-7, FE-9, then FE-5 and FE-8 when BE-5/6 and BE-3 land.
- Slip order if the sprint runs long: FE-9, FE-8, BE-8 (move to the top of the backlog), then FE-6.
- BE merges to main as each ticket completes; each updates `docs/transit-api.md` for any contract change it makes.

## 3. Tickets

### Backend

#### BE-1  Fix estimated departure at layover and terminal stops
- Assignee BE. Priority P0. Size M. Sources: R#1 (R#4 partly). Status Ready.
- Problem: At layover stops the estimated departure is copied from the estimated arrival. `/transit/trips/amtrak:1147-13` has WAS arr_sched 16:12 / arr_est 16:19 but dep_sched 17:00 / dep_est 16:19. The WAS board therefore shows Amtrak 40 "-45 MIN", 1147 "-41", 1099 "-39", 19 "-42", 50 "-46" while the vehicle says +12 (R#1, `d-4-was.png`). The cause is on the Amtraker path (`amtraker.py` ~lines 258-270 build `TripStop` from `arr`/`dep` and take `est = arr or dep`) and the same shape exists in `gtfs_provider.Leg.dep_e` / `leave` for GTFS-RT.
- Scope:
  - Estimated departure = max(scheduled departure, estimated arrival + minimum dwell). Use dwell 0 for stops where scheduled dwell is 0 and the scheduled dwell otherwise (never less than the scheduled layover unless the feed reports a real departure).
  - If the feed reports a real departure estimate that is later than scheduled departure, trust it; if it is earlier than scheduled departure at a stop that is not the origin, clamp it to the scheduled departure.
  - `TripStop.delay_s` and `BoardRow.delay_s` for departures use the corrected value (departure delay), arrivals keep the arrival delay.
  - Apply to both providers (Amtraker and GTFS-RT) through one shared helper (a small function in `models.py` or a new `estimates.py`), not two copies.
- Out of scope: position-based passed/current logic (BE-2), recorded actuals (BE-9).
- Acceptance:
  - Unit tests in `backend/tests/test_transit.py` for: terminal layover (arr late, dep scheduled 48 min after), short dwell (dep follows arr + delay), feed-reported later departure, feed-reported earlier-than-scheduled departure (clamped), origin stop (no arrival).
  - Live check: the WAS departures board shows no row with a delay below -5 min for a train whose vehicle delay is positive; Amtrak 40, 1147, 1099, 19, 50 are sensible (record before/after values in the PR).
  - `pytest` green.
- Dependencies: none.
- Notes: `backend/app/transit/amtraker.py`, `gtfs_provider.py` (Leg), `models.py`, `tests/test_transit.py`.

#### BE-2  Passed/current state from position; board, trip and vehicle agree
- Assignee BE. Priority P0. Size M. Sources: R#2, R#4. Status Ready.
- Problem: "passed" is derived from the estimated clock, so one screen says a train has arrived while another says it is still coming. Floridian 40 is physically at Alexandria (data 7 min old); the vehicle says next stop WAS 15:12 on time, while `/transit/stations/WAS` arrivals say est 14:27, state "passed", -2700 s (R#2). NCR board showed "LEFT" for 1195 at 14:47 while the train was about 2 miles north of NCR (R#2). Passed rows for Floridian 41 show the schedule (on time) while the vehicle is +16 (R#4).
- Scope:
  - When a train has a fresh (not stale) position and a known last/next stop sequence (Amtraker `state` per stop, GTFS-RT `stop_sequence`/`current_status`), the per-stop state (`passed`, `current`, `next`, `upcoming`) comes from that, not from `estimated <= now`.
  - When the position is stale or missing, derive from the clock but mark the row estimated: add `BoardRow.state_basis: "position" | "clock"` and `TripStop.state_basis` (same values).
  - Never return `passed` for a stop whose sequence is after the vehicle's next stop.
  - Vehicle `next_stop`, trip `stops[].state` and board `state` use the same function (one source of truth, in `models.py` or the new helper from BE-1).
  - Update `docs/transit-api.md` (`state_basis`).
- Out of scope: any UI (FE-4); recording actuals (BE-9).
- Acceptance:
  - Tests: train whose estimated times are in the past but whose position says it is before the stop is `upcoming`; a stale position falls back to `clock` basis; a vehicle's `next_stop.stop_id` equals the first non-passed trip stop and the board row for that stop is not `passed`.
  - Replay check recorded in the PR for the two cases in R#2 (Floridian 40, 1195 at NCR): vehicle, trip and board all agree.
  - `docs/transit-api.md` updated.
- Dependencies: BE-1.
- Notes: `gtfs_provider.py` (`leg_states`, `_board_rows`, `_next_stop`), `amtraker.py` (stop states ~line 248), `models.py`.

#### BE-3  "warming" source state; never return a partial list
- Assignee BE. Priority P1. Size S. Sources: R#3, F#32. Status Ready.
- Problem: right after a backend restart `/transit/vehicles` returned only 10 Brightline vehicles under source "amtrak" for about a minute, so the map showed no Amtrak on the NEC with no hint (R#3).
- Scope:
  - Add source `status.state: "warming"` for a source whose static feed is loaded but whose first complete realtime poll has not finished (or, for Amtraker, has not yet matched the static schedule).
  - While warming, the source contributes no vehicles at all (not a partial list), and the state is visible in `GET /transit/sources`.
  - Document the new enum value in `docs/transit-api.md`.
- Out of scope: the banner/chip (FE-8).
- Acceptance:
  - Test: with static loaded and no realtime yet, `state == "warming"` and `/transit/vehicles` returns zero vehicles for that source; after the first poll it is `ok`.
  - Manual: restart the backend and watch `/api/transit/sources`; "warming" appears then clears; no partial Amtrak list is returned.
  - `docs/transit-api.md` updated.
- Dependencies: none.
- Notes: `sources.py`, `service.py`, `provider.py`, `amtraker.py`.

#### BE-4  Contract additions: canonical_id, station code/short_name, board origin + destination
- Assignee BE. Priority P1. Size S. Sources: F#34, R#5, R#6, G#7. Status Ready.
- Problem: the client cannot normalise a member stop id to its group id without a second lookup (F#6, F#34); long GTFS names truncate (G#7, R#6); an arrivals row only carries the origin as `headsign`, so 1195 reads "Boston" on arrivals but "Washington Union Station" on departures (R#5).
- Scope (all additive):
  - `GET /transit/stations/{id}` response gets `canonical_id` (the group id, or the stop's own id when ungrouped).
  - `Stop` gets `code: string | null` (Amtrak code, e.g. `WAS`) and `short_name: string | null` (e.g. "Washington Union", "Baltimore Penn", "New York Penn") for curated groups, read from `data/stations.json` (add a `short_name` key per group).
  - `BoardRow` gets `origin: string | null` and `destination: string | null` (station names); `headsign` keeps its current meaning.
  - Update `docs/transit-api.md`.
- Out of scope: display-name cleaning for non-grouped stops (FE-9), Boston groups (question Q4).
- Acceptance:
  - Tests: `/stations/amtrak:WAS` returns `canonical_id == "st:was"`; `/stations/st:was` returns the same; all 14 curated groups have `code` and `short_name`; arrivals rows have `origin` set, departure rows have `destination` set.
  - `docs/transit-api.md` updated.
- Dependencies: none.
- Notes: `stations.py`, `data/stations.json`, `models.py`, `gtfs_provider.py` (`_board_rows`), `amtraker.py` board rows, `service.py`.

#### BE-5  Non-stop passes on trips (decision 17)
- Assignee BE. Priority P1. Size M. Sources: R#7 (top-5 #2). Status Ready.
- Problem: Acela 2133 lists 7 stops and no NCR, Metropark or Aberdeen pass; the "train passing New Carrollton without stopping" walkthrough is impossible (R#7). Decided in 17, not built.
- Scope:
  - For a trip matched to a static GTFS trip, compute passes: stations that lie on the route shape between two consecutive stops of the trip and are served by other trips of the same route (use the route's union stop list; `merge_order` already merges stop orders), but not by this trip.
  - Pass time = interpolation along the shape (`geometry.py`) between the bracketing stops' times (scheduled and estimated), plus the live delay of the previous stop.
  - Opt in with `GET /transit/trips/{id}?passes=1`. With it, `Trip.stops[]` includes pass entries interleaved in order (`seq` renumbered). A pass entry is a `TripStop` with `kind: "pass"`, `arr_*`/`dep_*` all null, new `pass_scheduled` and `pass_estimated`, `approx: true`, `delay_s`, `state`. Ordinary entries get `kind: "stop"`. Without `passes=1` nothing changes.
  - Group ids (`st:*`) used for pass stations, same as stops.
  - Added/realtime-only trips (no static match) have no passes.
  - Update `docs/transit-api.md` (field names above).
- Out of scope: refining the pass time from the live position (backlog), station-board passing list (BE-6), UI (FE-5).
- Acceptance:
  - Tests: a synthetic route A-B-C-D where the trip skips C returns one pass at C between B and D, time between the bracketing times, `kind == "pass"`; with `passes=1` absent, no pass rows; a trip that stops everywhere has none; a delayed trip shifts `pass_estimated`.
  - Live check recorded in the PR: Acela 2133 (or any Acela today) shows NCR/Metropark/Aberdeen passes in the right order, times within the bracketing stops.
  - `docs/transit-api.md` updated.
- Dependencies: BE-1 (correct estimated times to interpolate from).
- Notes: `gtfs_provider.py` (`trip`, `legs`, `_path`), `geometry.py`, `models.py`, `tests/test_transit.py`.

#### BE-6  Non-stop passes on station boards (`passing`)
- Assignee BE. Priority P1. Size M. Sources: R#7, decision 17. Status Ready.
- Problem: NCR's board has no Passing tab and `?passing=` is ignored (R#7). Decision 17 requires passes never to be mixed into departures/arrivals.
- Scope:
  - `GET /transit/stations/{id}?passing=1` adds a third list `passing: PassRow[]` to `StationBoard`; `departures` and `arrivals` are unchanged and never contain passes.
  - `PassRow { trip_id, source, train, route_name, agency, headsign, origin, destination, scheduled /* approx */, estimated /* approx */, delay_s, state: "passed" | "upcoming", approx: true }`.
  - Same window rules (`back`, `ahead`, `date=`) as the board; group stations take the union; `agency=`/`source=` filters apply.
  - Reuse the BE-5 pass computation (one function, no second implementation).
  - Update `docs/transit-api.md`.
- Out of scope: UI (FE-5), a Passing tab for MARC-only stops beyond what BE-5 yields.
- Acceptance:
  - Tests: station on a route where express trips skip it returns pass rows only in `passing`; the same trip is not in `departures`; `passing` absent from the response when `passing=1` is not given (field omitted or empty list: pick empty list and document it); date window respected.
  - Live check: `st:ncr?passing=1` lists Acela and Regional passes today.
  - Response time for `st:was` and `st:ncr` boards with `passing=1` under 1 s (note the measurement in the PR).
  - `docs/transit-api.md` updated.
- Dependencies: BE-5.
- Notes: `gtfs_provider.py` (`station_board`), `service.py`, `stations.py`, API router file for `/transit/stations`.

#### BE-7  Track and platform coverage on boards and trips
- Assignee BE. Priority P1. Size S. Sources: R#8 (top-5 #3). Status Ready.
- Problem: `track` is null for every row except NYP; the WAS departures board has no track column data, so even a Details toggle has nothing to show (R#8). Amtraker supplies `platform` (`TripStop.track` is already filled from `platform`), but board rows and matched static trips may not carry it.
- Scope:
  - Audit: list, for WAS, BAL, BWI, NCR, how many currently live trips have a platform in Amtraker's payload and how many reach `BoardRow.track` / `TripStop.track`. Record the numbers in the PR.
  - Fix any loss: board rows for matched live trains and scheduled-but-matched trips take the Amtraker platform (`track_for` in `amtraker.py`, line ~170); the union group board keeps it.
  - If the feed simply does not publish tracks until shortly before departure, say so in `docs/transit-api.md` (no invented values).
- Out of scope: showing tracks in the UI (FE-4), schematic placement (backlog).
- Acceptance:
  - Test: a live train with a platform in the Amtraker payload has `track` on its board row and its trip stop.
  - PR contains the audit numbers; any train with a platform in the payload also has one in the API.
- Dependencies: none.
- Notes: `amtraker.py`, `gtfs_provider.py`, `service.py`.

#### BE-8  Delay outlier flag and explicit next_stop reason
- Assignee BE. Priority P2. Size S. Sources: F#33, F#17, R#18. Status Ready.
- Problem: UI shows "+361 MIN" (Auto Train 52, a real 6-hour delay), "-56 MIN" (Sudbury, an implausible early), and `— — —` next-station/delay for VIA and Cascades trains with no reason given (F#17, F#33, R#18).
- Scope:
  - Vehicle gets `delay_suspect: boolean`: true when `delay_s` is more than 12 h late or more than 30 min early (thresholds as module constants). The value is never clamped (a 6 h delay is real).
  - Vehicle gets `next_stop_unavailable: string | null` with a short reason ("no stop data", "terminated") when `next_stop` is null.
  - Update `docs/transit-api.md`.
- Out of scope: any clamping or hiding; UI use (FE-6).
- Acceptance:
  - Tests for each threshold edge, and a trip with no stops yields the reason.
  - `docs/transit-api.md` updated.
- Dependencies: none.
- Notes: `models.py`, `provider.py`, `amtraker.py`, `gtfs_provider.py` (`_vehicle`).

#### BE-9  Record actual arrivals, departures and passes in SQLite (decision 18) (MOVED TO BACKLOG for BE-10, decision 29)
- Assignee BE. Priority P2. Size M. Sources: R#4, R#13, decision 18. Status Ready.
- Problem: decision 18 says record actuals forever; nothing is recorded (checked: no actuals table in `backend/app`). Every day without it is history lost, and train history (R#13) and pass refinement depend on it.
- Scope:
  - New table `stop_actuals(service_date, source, train, trip_id, stop_id, kind /* arr|dep|pass */, scheduled, actual, observed_at, basis /* position|feed */)`, unique on (service_date, source, train, stop_id, kind).
  - Record when BE-2's position-based state flips a stop to passed (or a feed reports a real time); write once, never overwrite an earlier observation.
  - Small recorder module called from the existing poll loop; failure to write must never break polling.
  - A read helper `actuals_for(trip)` (no public endpoint yet; contract for it goes to the backlog).
  - Note in `docs/transit-sources.md` or the PR: table grows without pruning; add an export script `scripts/export_actuals.py` (CSV) as the minimum backup plan.
- Out of scope: any API endpoint, history UI.
- Acceptance:
  - Tests with an in-memory SQLite: a stop flipping to passed writes one row; a second poll does not duplicate or overwrite; recorder exceptions are swallowed and logged.
  - After one hour of live run, the PR states the row count, and the export script runs.
- Dependencies: BE-2.
- Notes: `backend/app/transit/` new `actuals.py`, `source_store.py` pattern for DB access, `service.py` poll loop.

### Frontend

#### FE-1  Header: no chip/tab collision at 1180 and below
- Assignee FE. Priority P1. Size S. Sources: F#2, G#13, R#17. Status Ready.
- Problem: the FEEDS/ASR chips overlap the SETTINGS tab at 1180 and 820; with `KEYED · CH22 · CH12` the chips overlay FEEDS & BANKS and SETTINGS (F#2 `v1180-map.png`; G#13 `i-30`, `i-31`; R#17 `i-1-was.png`).
- Scope:
  - `HeaderNav` and `HeaderChips`: flex layout with a guaranteed 24 px gap (no absolute positioning).
  - At stage width <= 1440: the keyed chip shows a count (`KEYED · 2`, full channel list in `title`); the feeds and ASR chips collapse into one bracket (`FEEDS 1/1 · ASR OK`).
- Out of scope: nav semantics (`aria-current`, backlog), new chips (FE-8).
- Acceptance:
  - Screenshots at 1920, 1440, 1180 and 820 with three keyed channels (use the dev simulation): no overlap on Map, Live Ops, Feeds, Settings.
  - A unit test for the chip-collapse helper (count text, tooltip text).
  - `svelte-check` and `vitest` pass.
- Dependencies: none.
- Notes: `frontend/src/lib/components/HeaderNav.svelte`, `HeaderChips.svelte`.

#### FE-2  Map overlays vs docked panel; train list cap and collapse; TERMINALS chip
- Assignee FE. Priority P1. Size M. Sources: F#4, F#5, F#8, F#15, R#15, G#4 (TERMINALS part), G#11 (overlay part), R#17. Status Ready.
- Problem: with the panel open the GEO/SCHEMATIC/ZOOM chips overprint the hero and the train list is cut off (F#4 `i-2-station-from-trip.png`); the TERMINALS list overprints ABERDEEN, BALTIMORE PENN, EDGEWOOD (F#5, G#4); the train list shows 13 of 15 rows and covers the NEC and Union schematic (R#15, G#11); the pointer readout is useless on touch (F#8).
- Scope:
  - Pass the panel width to `.mp-ctl` and `.mp-cursor` (the `--pn-w` variable already exists for `.mp-terms`); hide the POINTER readout under `pointer: coarse`.
  - Train list: fixed max-height showing at most 8 rows then scroll; use the existing header chevron as a collapse toggle; collapsed by default when the stage is under 1400 px wide, when a panel is docked on a stage under 1700, and in schematic mode.
  - TERMINALS becomes one chip `TERMINALS v` in the control row (shown only when a terminal is in view) that opens the list with a `bg-void` plate; and add the list to the label placer's measured obstacles (`Screen.svelte` `overlays`) while open.
  - Hero/list overlays shrink to the count-only row when `stage.width - panel width` is under about 900.
- Out of scope: fit insets (backlog), train label placement (backlog), hero wording change (backlog), the maximize layouts.
- Acceptance:
  - Screenshots at 1920x970 and 1180x820, each with and without the docked panel, in geo and schematic modes: no overlay overlaps another; list shows a scrollbar with 15+ trains.
  - Unit test for the default-collapsed rule (a pure function of stage width, panel state, mode).
  - Keyboard/touch: the chevron toggle works by tap on the iPad viewport.
  - `svelte-check`, `vitest` pass.
- Dependencies: none (the owner-decided freshness dot in `TrainList.svelte` stays exactly as is).
- Notes: `screens/map/Screen.svelte`, `TrainList.svelte`, `map.css`, `MapCanvas.svelte` (props only), `screens/map/lib/measure.ts`.

#### FE-3  Feeds page responsive at 1440 and 1180
- Assignee FE. Priority P1. Size M. Sources: F#1, F#26 (root cause, only for this screen). Status Ready.
- Problem: at 1440x900 and 1180x820 the right column (BANKS, CHANNELS, bank editor) runs off the stage and the SDR-01 inspector overlaps the footer; content is unreachable (F#1 `v1440-feeds.png`, `v1180-feeds.png`).
- Scope:
  - Feeds grid reads `stage.width`: under about 1600 drop to two columns (banks column stacked under the inspector); the centre column scrolls inside its own frame.
  - Replace the `params.size === 1440` constants used by this screen with `stage.width/height` (a small `breakpoints.ts` with named constants is fine; leave the other screens' constants for the backlog).
- Out of scope: contradictory "NO SAMPLES" state (backlog), other screens' constants.
- Acceptance:
  - Screenshots at 1920, 1440, 1180: every panel fully visible or scrollable, nothing overlapping the footer; `scrollWidth <= innerWidth`.
  - Unit test for the column-count helper.
  - `svelte-check`, `vitest` pass.
- Dependencies: none.
- Notes: `frontend/src/screens/feeds/`, `lib/stage.svelte.ts`.

#### FE-4  Board and trip honesty: actual/estimated departure, tracks, FROM/TO, no false LEFT
- Assignee FE. Priority P0. Size M. Sources: R#1, R#2, R#4, R#5, R#8, G#10 (merged time cell). Status Blocked (on BE-1, BE-2, BE-4, BE-7; start with FE mock data once the contract is written in `transit-api.md`).
- Problem: passed rows show the scheduled time, not the actual, and "LEFT"/"ON TIME" can contradict the position (R#2, R#4); the arrivals column shows the origin under a destination-style header (R#5); there is no track column (R#8); SCHEDULED and EXPECTED are two columns and EXPECTED is mostly `— — —` (G#10).
- Scope:
  - Station board: one TIME cell. If a realtime time differs from scheduled, show scheduled struck through in a dimmer ink and the expected time beside it (`15:57 15:12`); equal or schedule-only shows one time.
  - Passed rows show the estimated/actual time, not the schedule.
  - When `state_basis == "clock"` (BE-2), do not show "LEFT": show the state with an "EST." mark (e.g. `DUE`/`EST. PASSED`); only `state_basis == "position"` may read LEFT.
  - TRACK column: show `track` when present, `TBD` when null for Amtrak rows at stations where tracks are announced (WAS, BAL, NYP: use `Stop.code`), nothing for others.
  - Arrivals header is `FROM` (use `origin`), departures `TO` (use `destination`); trip panel keeps its layout.
  - Trip panel stop rows: show arrival/departure pair at stops with a layover (both when they differ), and the track.
  - Status words stay as today (colours handled in FE-6).
- Out of scope: passes (FE-5), maximized redesign (backlog), Details toggle.
- Acceptance:
  - Unit tests in `transitView.test.ts` (or a new `boardView.test.ts`): merged time cell cases (equal, late, schedule-only, passed), `LEFT` only with position basis, track `TBD` rule, FROM/TO selection.
  - Screenshots at 1920 and 1180 of the WAS and NCR boards and a trip panel; WAS departures show no row with a bogus negative delay (after BE-1).
  - `svelte-check`, `vitest` pass.
- Dependencies: BE-1, BE-2, BE-4 (origin/destination), BE-7 (tracks).
- Notes: `screens/map/StationBoard.svelte`, `TripPanel.svelte`, `lib/transitView.ts`, `lib/api` types.

#### FE-5  Passes UI: trip stop list and station "Passing" tab (decision 17)
- Assignee FE. Priority P1. Size M. Sources: R#7 (top-5 #2), decision 17. Status Blocked (on BE-5, BE-6).
- Problem: non-stop passes do not exist anywhere in the UI (R#7).
- Scope:
  - Trip panel requests `?passes=1`; pass rows render unmistakably different from stopping rows: label `PASSES · DOES NOT STOP`, time shown as `~14:32`, never in the arrival/departure columns' normal style (dim italic-free, dashed rule), no track.
  - Station panel: third tab `PASSING` (beside DEPARTURES and ARRIVALS) using `passing=1`; rows carry the same `PASSES · DOES NOT STOP` label and `~time`; passes never appear in the departures or arrivals lists.
  - A train passing a station row is clickable to its trip like other rows.
- Out of scope: pass rows on the route timetable, refining from live position.
- Acceptance:
  - Unit tests: pass row formatting (`~HH:MM`), tab filter, passes absent from departures/arrivals.
  - Screenshots at 1920 and 1180: Acela trip with passes; NCR Passing tab; the label is visible without hover.
  - `svelte-check`, `vitest` pass.
- Dependencies: BE-5, BE-6.
- Notes: `TripPanel.svelte`, `StationPanel.svelte`, `StationBoard.svelte`, `lib/transitView.ts`.

#### FE-6  Delay display: luminance steps instead of ember, hours format, suspect marker
- Assignee FE. Priority P2. Size M. Sources: G#1, R#18, F#17, F#33. Status Ready (the suspect marker part needs BE-8; do the rest first).
- Problem: lateness uses the ember (`state-recent`), so a late train's map label reads like a keyed train while real transmissions are on screen; ember means "has spoken" and is also the TX colour (decision 7; G#1 `d-06`, `d-21`, `crop-markers.png`). Extreme values read as "+361 MIN" (R#18).
- Scope:
  - One `delayTone(delay_s)` helper used by the train list status, map labels, trip panel stop times and the station board: on time `ink-3`; 2-4 min late `ink-2`; 5 min or more `ink` weight 500 with a 2 x 8 px bar before the number; early `ink-2` with a true minus (U+2212). No hue, and map tags never change colour for delay.
  - Remove `.mp-tone-late` / `.mp-vlabel.late` use of `--state-recent` and the cyan "early".
  - One `formatDelay` helper: minutes under 120, then hours and minutes (`+6 H 01`).
  - If `delay_suspect` is present (BE-8), show a small `?` mark and a tooltip "implausible, check source"; do nothing when absent.
  - Do NOT change the train-list freshness dot in any way (owner's request): no edits to its colours, pulse or tooltip.
- Out of scope: freshness dot, marker ring/tail restyle (backlog), name casing (backlog).
- Acceptance:
  - Unit tests for `delayTone` and `formatDelay` (boundaries 119/120 s, 5 min, 361 min = `+6 H 01`, negative).
  - Grayscale and colour screenshots of the train list and a station board carry the same delay information; the only orange on the Map screen is live TX.
  - `grep` shows no `--state-recent` / `--state-fault` use in delay code; the freshness-dot code is untouched in the diff.
  - `svelte-check`, `vitest` pass.
- Dependencies: BE-8 for the suspect marker only.
- Notes: `lib/transitView.ts`, `TrainList.svelte` (status cell only), `map.css`, `VehicleMark`/`TripPanel`/`StationBoard`.
- Note: `TrainList.svelte` and `transitView.ts` have uncommitted changes (freshness dot, MBTA). Commit or stash those before starting.

#### FE-7  Member-stop id highlight on map via canonical_id
- Assignee FE. Priority P2. Size S. Sources: F#6, F#34. Status Blocked (on BE-4).
- Problem: `?page=station&id=amtrak:WAS` resolves to the Washington panel but the station is not highlighted on the map (`TransitStops` compares against the group id only; F#6 `member-was.png`).
- Scope: the station store reads `canonical_id` from the board response; the map highlight uses it; rewrite the URL id with `replaceState` to the canonical id.
- Out of scope: panel history (backlog).
- Acceptance:
  - Unit test: member id resolves to canonical id and is used as `stopId` for the map.
  - Manual: load `/map?page=station&id=amtrak:WAS` and `marc:<member id>`: station highlighted and URL becomes `id=st:was`.
- Dependencies: BE-4.
- Notes: `screens/map/Screen.svelte` (~line 101), `StationPanel.svelte`, `panelStore.svelte.ts`.

#### FE-8  Feed-level chips: transit warming and transit stale
- Assignee FE. Priority P2. Size S. Sources: R#3, F#32, G#2 (feed-level chip part only; not the dot). Status Blocked (on BE-3).
- Problem: after a restart there is no hint that Amtrak is warming (R#3); a failed poll leaves old vehicles on screen with no on-screen indication beyond per-vehicle flags (F#32).
- Scope:
  - Header chip `AMTRAK WARMING` (per source in state "warming").
  - Header chip `TRANSIT FEED STALE` when `fetchedAt` is older than 2 poll intervals; per-source `MARC RT STALE` when a source's state is `stale`.
  - Chips use the existing degraded chip style (not red; no new colours); they collapse into the FE-1 chip group on narrow stages.
- Out of scope: the freshness dot and its colours/pulse; Settings changes.
- Acceptance:
  - Unit tests on the chip derivation (warming, stale, ok, fetch failure).
  - Screenshot of each chip at 1920 and 1180; no header collision.
- Dependencies: BE-3 (and FE-1 for layout).
- Notes: `lib/transit.svelte.ts`, `HeaderChips.svelte`.

#### FE-9  Station and stop name cleaning
- Assignee FE. Priority P2. Size S. Sources: R#6, G#7. Status Blocked (on BE-4 for short names; the stripping rules can be started first).
- Problem: raw GTFS names ("UNION STATION MARC WASHINGTON", "BWI RAIL STATION MARC", "NY MOYNIHAN TRAIN HALL AT PENN STATION", "SLIDELL AMTRAK STATION") truncate lists and read badly (R#6, G#7).
- Scope:
  - One `displayName(stop)` helper: grouped stations use `short_name` (BE-4); other names drop trailing agency/boilerplate tokens (` MARC`, ` AMTRAK STATION`, ` RAIL STATION`, ` STATION` only when the result stays unique within the view); the full official name goes in `title` and the station panel header.
  - Use it in the train list (next stop), boards, trip stop rows, route panel and map labels.
- Out of scope: uppercase/Barlow typography change (backlog), a Boston short-name list (Q4), VIA/Brightline agency labelling (Q6).
- Acceptance:
  - Unit tests with the names above (including a uniqueness case where ` STATION` must not be stripped).
  - Screenshot at 1920 and 1180 of the WAS board, the train list and a route panel: no truncated DC corridor name.
- Dependencies: BE-4.
- Notes: new `lib/displayName.ts`, `transitView.ts`, `StationBoard.svelte`, `TripPanel.svelte`, `RoutePanel.svelte`, `TrainList.svelte`.

#### FE-10  Freshness mark as neutral squares with a single flash
- **Assignee:** FE · **Priority:** P2 · **Size:** S · **Status:** Ready · **Depends on:** none
- **Sources:** G#2, owner decision 27 (replaces the owner's earlier white/amber/red dot with grow-and-shrink pulse).
- **Problem:** the train-list freshness dot uses amber and red (red is reserved for the operator's own equipment faults), relies on colour alone, and its grow/shrink pulse makes long lists twinkle.
- **Scope:** in `frontend/src/screens/map/TrainList.svelte` (and anywhere else the freshness mark appears), replace the dot with a small square in neutral ink colours: filled when fresh (age <= the source's `stale_after_s`), hollow past that limit, hollow with a diagonal cross past 10 minutes (`OLD_S`), dim hollow when unknown. Replace the pulse with a single quick flash (brightness only, no scale, ~250 ms) when `updated` changes; none on first render; none under prefers-reduced-motion. Keep the hover tooltip ("N s / N min since fresh data") and `freshness()` / `sinceText()` helpers.
- **Out of scope:** the trip panel's freshness glance text; delay styling (FE-6).
- **Acceptance:** the three states are distinguishable in a greyscale screenshot at 1920x970 and 1180x820; no amber or red on the mark; flash fires on new data (verify with a MutationObserver count as before) and not on load; tests for any new helper; svelte-check clean.

#### BE-10  Automatic station merging (decision 29)
- **Assignee:** BE · **Priority:** P1 · **Size:** M · **Status:** Ready · **Depends on:** BE-4 (canonical_id, station code/short_name)
- **Sources:** owner decision 29 (reverses "heuristics only suggest" in 16 and 21); research `docs/research/station-merge-radius.md`.
- **Problem:** only 14 hand-curated DC stations merge. Every other shared Amtrak/commuter station (Boston South Station, Back Bay, Route 128, Providence, Philadelphia 30th St, Chicago Union, LA Union...) shows two markers and two boards.
- **Scope:**
  - In `backend/app/transit/stations.py`, build groups automatically whenever static feeds (re)load: each intercity (Amtrak) station merges with the nearest station of each other enabled source within a radius (new setting, default 400 m); a non-Amtrak station joins at most one group (its nearest Amtrak station). Members stored with `method = auto`.
  - Curated `data/stations.json` becomes overrides: `force` members (merge what the rule misses) and a `block` list (pairs never merged). Existing 14 DC entries stay valid.
  - Group id `st:<amtrak code lowercase>`; group name from the clearest member name (fixes BOS/BBY/BON all reading "Boston" and STS/NHV both reading "New Haven").
  - Replace `GET /transit/stations/suggestions` with `GET /transit/stations/merges` -> every group with members, method and distance, so a later Settings view can show them; keep a `suggestions` list for pairs between 400 and 800 m for review.
  - Update `docs/transit-api.md` (station groups section) and `docs/transit-sources.md`.
- **Out of scope:** the Settings UI for merges (backlog); commuter-to-commuter merges without an Amtrak station.
- **Acceptance:** tests on small synthetic feeds (merge within radius, nearest-only, one group per commuter station, force and block overrides, radius setting); against the cached real feeds (skip if not cached) the merged groups include BOS+South Station, BBY+Back Bay, RTE+Route 128, PVD+Providence, WAS+MARC+VRE, PHL+30th St, CHI+Chicago Union, LAX+L.A. Union, and Chicago Union is NOT merged with Ogilvie; `/transit/stops` shows one stop per group in Boston; pytest and ruff clean.

## 4. Questions for the owner

1. DECIDED 2026-11-13 (decisions.md row 27): GMUNK's proposal adopted, ticket FE-10. GMUNK's objection to the freshness dot (G#2): amber and red are wrong because red is for your own equipment faults, the dot has no shape change (grayscale cannot tell states apart), and the pulse makes a list of 200 trains twinkle. He proposes a fresh square, a hollow square past the limit, a crossed square past 10 min, and a one-step flash instead of the pulse. No ticket changes the dot. Recommendation: keep your design as built; if you want to hedge, ask for a grayscale-safe shape cue (hollow/cross) in addition to the colours, as a later ticket.
2. DECIDED 2026-11-13 (decisions.md row 26): approved as recommended. Late trains currently use the ember (the same orange as live TX, decision 7). FE-6 replaces it with brightness steps, bar and text only (G#1). Recommendation: approve it; the freshness dot is not touched.
3. DECIDED 2026-11-13 (decisions.md row 28): keep the Live Ops layout; the bottom ~25% is reserved for a future full-width schematic. Live Ops tile wall at wider stages (was pending): more columns at fixed size, wider tiles, log takes the width, split, or a setting. Blocks the Live Ops re-pack in the backlog (G#15, F#14). Recommendation: more columns at fixed size.
4. DECIDED 2026-11-13 (decisions.md row 29): automatic merging by radius, nationwide. Station groups for Boston (shared MBTA/Amtrak stations such as South Station, Back Bay, Route 128, Providence): extend the curated list? Not in this sprint. Recommendation: yes, next sprint, after BE-4 lands, as a data-only ticket.
5. DECIDED 2026-11-13 (decisions.md row 30): do nothing, not a concern. iPad portrait (820x1180) letterboxes the stage to a third of the height (F#9). Support it with a stacked layout, or show a "rotate" hint? Recommendation: rotate hint (S), since you use the iPad in landscape.
6. DECIDED 2026-11-13 (decisions.md row 31), done outside the sprint: VIA dropped, Brightline its own source. Amtrak's feed carries VIA Rail (`v20`..`v67`) and Brightline vehicles under agency "Amtrak" (R#6). Hide them with the per-source "exclude routes" setting (decision 20 mechanism), show them with their real agency name, or leave? Recommendation: show the real agency name; keep them (they are real trains) but let the list filter by agency (backlog).
7. DECIDED 2026-11-13 (decisions.md row 32): yes, next sprint, after FE-9. Typography of transit tables (G#6): names in Barlow Semi Condensed uppercase, numbers mono, uppercase train tags like `AMTK 20` (G#5). It is a visual taste call across every transit panel. Recommendation: yes, schedule it next sprint after FE-9.
8. DECIDED 2026-11-13 (decisions.md row 33): sprint 2 = code-health and systems-design study and refactor; next headline = Live Ops bottom schematic (owner to specify). Next-sprint bets, in order: stringline route chart on maximize (G#8, a large item), Union Station live occupancy (R#9, G#14), national-view rework (G#12). Recommendation: stringline first, then Union, since both build on this sprint's tracks and pass data.
9. DECIDED 2026-11-13 (decisions.md row 34): deleted now; rebuild after the sprint 2 architecture study. History and Stats screens are shipped and routed but not in the nav (F#27). Keep or park (remove from the routes)? Recommendation: keep; they cost nothing until they diverge.

## 5. Backlog and Later

0. BE-9 Record actual arrivals/departures/passes in SQLite (decision 18), moved out of the sprint for BE-10. M.
0b. FE: Settings view of station merges (from `/transit/stations/merges`), with block/force actions. M.

### Backlog (ranked)

1. Commit the freshness-dot and MBTA work in progress, then remove dead code: LofarStrip, CtcStrip, `ctc/*`, MilepostTagSvg, `lib/hud/index.ts` (F#27). S.
2. Panel navigation on browser history: push entries for open/swap, back button reads history (F#12). M. Most useful iPad gesture fix.
3. Footer build/simulation label from the backend: `/api/health` returns version, git hash and simulation flag; footer reads it (F#10, F#35); favicon (F#11). S + S.
4. Fix/delete `wave.test.ts` (F#30) and frequency-ruler label overlap with a shared ruler (F#3, G#16, F#28). S + S.
5. Train labels into the label placer, one `trainTag()` format (uppercase two-line, delay on line 2), priority order, number-only fallback (R#11, R#16, F#16, G#4, G#5). M.
6. Map fit insets for list and panel; hero reads "N TRAINS IN VIEW" (G#11). S.
7. Union Station schematic with live occupancy: trains on their tracks using BE-7 data, approach markers at the throat, active tracks in ink and others faint, list collapsed (R#9, G#14). L: split into schematic data store (M) and rendering (M).
8. Route page maximize as stringline chart, keeping the single-panel maximize model (G#8, R#14). L.
9. Trip maximize as strip diagram with a delay hero; station maximize with next-departure hero and capped column widths (G#8). M each.
10. Nearest CP / milepost line in the trip panel (R#10); BE needs the milepost source and a `near` field first. M + S.
11. Operator filter chips on the list header and "hide long-distance" (R#12); use `bbox` on `GET /transit/vehicles` (already supported) from the national view (F#33). M.
12. Marker restyle: ring in `line`, 600 m tail, estimated/stale dash patterns (G#3). M.
13. Transit typography: Barlow Semi Condensed uppercase for names, mono for numbers; Settings agency title style (G#6). M.
14. Panel chrome: drop shadows, on-scale title, wrapped chips with "+N", outline calendar glyph (G#9). S.
15. Train history ("last 10 runs", last seen at DC): BE endpoint on the BE-9 table, then UI (R#13, R#4). M + M.
16. Pass time refinement from a fresh live position (decision 17 follow-up). M.
17. Live Ops small fixes only, no layout change (decision 28): near-black waterfall floor at rest, truthful idle hero message (G#15). S.
18. Settings sources as a table, remove duplicate timings, DISK chip above 85% (G#17). M.
19. Cache static map data in a module-level store (F#21); coalesce pointer writes (F#22). S + S.
20. Break up `MapCanvas.svelte` and `Screen.svelte`: view store, command channel instead of nonce props, data loader (F#23, F#24, F#25). L: split into three tickets.
21. Constants keyed on `params.size === 1440` elsewhere, named breakpoints (F#26). M.
22. Duplicated components (RegMark x3, FeedInspector x2, glyph pairs) (F#28). M.
23. Tests: `panelStore`, `transit.svelte.ts` polling, Settings forms, one Playwright smoke of the panel flow (F#29). M.
24. Accessibility: nav semantics `aria-current` (F#7, S), keyboard path and focus handling for the map and maximized panel (F#31, M).
25. Performance: split `commit()` so label placement runs in idle time (F#18), cull vehicles/lines outside the view (F#19), 30-minute heap soak (F#20). M each.
26. Closing a maximized panel for a far station: `reveal` on dock (F#13). S.
27. Feeds screen contradictory "NO SAMPLES" state (G#18); login ruler width (G#19); 10 s motion capture check (G#20). S each.
28. National view: upright projection, 2x6 bars and merged counts, ticks for stations (G#12). L.
29. Panel hierarchy details: sort explanation on the board, `SCHEDULE ONLY` wording (G#10 remainder). S.

### Later (deferred by the owner)

- Saved items, pins, recents, watches, My stuff (decision 24).
- Radio information on station, trip and route panels, including the "K TOWER covers this area" link (decision 25, R#19).
- Boston station groups (question Q4), Settings-editable station groups (decision 16, phase 2).
- Phase 2/3 items in `transit-pages-architecture.md` (search, alerts index, multi-board wall).

## 6. Reviewer findings intentionally not taken

- G#2 (freshness dot: no amber/red, no pulse, new shapes): owner's explicit design stands; listed as Q1.
- G#1 as written ("delay never changes tag colour") is taken in FE-6, but its "early in cyan" is dropped along with all delay hue, which is the same change.
- G#3, R#11 marker/tag restyle: valid but design polish, in the backlog, not the sprint.
- G#12 (national view rework): large and after the five top items per GMUNK himself; backlog.
- G#15, F#14 Live Ops re-pack (taller waterfall, full-height log, more tile columns): declined by the owner (decision 28); the bottom ~25% is reserved for a future full-width schematic.
- G#17 Settings table: polish; backlog.
- R#13 train history UI and R#14 route live overlay: need BE-9 data first; backlog.
- R#18 "keep the STALE wording on the list": the owner's freshness dot and tooltip already cover this; no change.
- R#19 radio link from trips: deferred (decision 25).
- F#33 bbox filter on vehicles: already supported (`GET /transit/vehicles?bbox=`); client use is a backlog item, not a backend ticket.
- F#9 portrait layout: declined by the owner (decision 30); no rotate hint, no portrait layout.
- F#27 History/Stats screens: decision needed (Q9); removal of the other dead code is backlog item 1.
- F#20, F#22: investigation or nice-to-have only; backlog.
- F#23-F#25 (MapCanvas refactor): code health ranks last and it is an L; split in the backlog. FE-2 deliberately only adds props, no refactor.
- F#26 beyond the Feeds screen: kept to FE-3's scope to keep the ticket small.
- R#6 "normalise to WAS, BAL, NYP": covered as short names for curated groups only (BE-4, FE-9); other stops use rule-based cleaning.

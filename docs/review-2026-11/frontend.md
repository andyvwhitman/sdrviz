# Frontend review, 2026-11 (frontend engineer)

Scope: `frontend/` (Svelte 5 + TS). Read-only pass; no app code changed.

Checks run: `npm run check` 0 errors / 0 warnings (553 files); `npx vitest run` 39 files, 335 tests, all pass;
`npm run build` clean in 0.6 s. Largest chunks: map Screen 141 kB (50 kB gz), 78 kB, 56 kB, 43 kB; index 39 kB;
CSS 76 kB (24 kB gz). `dist/` is 1.6 MB, mostly 60 font subset files (browsers fetch only the ones used). Bundle size is fine.

Live checks (Playwright against http://localhost:5197, desktop 1920x1080 and a 390x844 touch phone):
- Click-to-listen works: a click on the waterfall fires `POST /banks/live/channels` then `POST /banks/bank-live/activate`;
  alt-click fires `DELETE /banks/live/channels/52`. No console errors or warnings on /live.
- A touch tap on the waterfall sends nothing (finding 1).
- Phone width: no horizontal scroll, but see finding 2.

## Ranked findings

### 1. Tap-to-listen does nothing on touch (bug) - S
`screens/live-ops/FrontWall.svelte:58-67, 89-91`. `listen()` reads `hoverX`, which only `onpointermove` sets. A tap with no
preceding move leaves `hoverX === null`, so `listen` returns silently (reproduced: tap sent no request). The alt-click drop
also has no touch equivalent.
Fix: compute x from the click event itself (`event.clientX` against the box rect) inside `listen`, instead of reading
`hoverX`. Extract `xOf(event)` and use it in both the move handler and `listen`. Add a long-press or a "DROP" chip for removal on touch.
Related: the three boxes are `role="presentation"` with a click handler, so there is no keyboard path (finding 8).
Also guard against double-submit (a second click while the first two requests are in flight) with a `busy` flag.

### 2. The app is not responsive; a phone gets the 1920 layout scaled to about 0.2 - L
`lib/stores/stage.svelte.ts:12-14`, `lib/components/Stage.svelte`. At 390 px wide the stage scale is
`390 / (1920*0.9) = 0.22`: text is about 3 px, the page is letterboxed in the middle of the screen with empty bands top and
bottom (see `phone-live.png`, `phone-map.png` in the scratchpad `pw/` folder). There are only two `@media` rules in the
codebase, both `pointer: coarse`. The `MIN_WIDTH_RATIO` approach suits desktop and TV; it cannot serve a phone.
Fix, cheapest first:
- S: below about 900 px, show a one-screen "best on a larger display" notice with a link to the Trains page (below), so a
  phone user is not shown an unreadable wall.
- M: make the new Trains page a normal responsive document (no Stage), the one route that is phone-first (`shell: false`-style
  route with its own light header).
- L: a real phone layout for the map (list-first, map as a tab).

### 3. A backend outage on first load looks like a logged-out user - S
`lib/stores/session.svelte.ts:13-15`. `check()` sets `authenticated = false` on any error, including a network failure or 502,
so the guard in `App.svelte` sends the user to /login, where a correct password then fails with "Backend unreachable".
Fix: only 401 means unauthenticated. Keep a `status: "checking" | "in" | "out" | "error"` and render the existing
`ConnectingOverlay`/retry for `error`. Retry with backoff.

### 4. A failed screen chunk leaves a blank stage forever - S
`App.svelte:44` (`loadScreen(wanted).then(...)` has no `.catch`), `routes.ts:50`. After a deploy, a stale tab requesting an old
hashed chunk 404s, the promise rejects, `Screen` stays null, and the user sees an empty shell. This is the usual failure mode
after every production deploy.
Fix: `.catch` renders a small "NEW VERSION, RELOAD" panel with a reload button (or reloads once automatically, guarded by
sessionStorage so it cannot loop).

### 5. Live socket does not survive a bad frame and ignores page visibility - S
`lib/ws/client.ts:61`. `JSON.parse` is unguarded; a malformed frame throws inside `onmessage` (uncaught, the frame is
dropped, but a throwing handler in `live.apply` also skips the rest of that frame's work). Wrap parse and dispatch in
try/catch with a `console.warn`. Also: no heartbeat or stall detection (a half-open TCP connection never fires `close`;
the link chip would stay green). Fix: have the server's periodic message (hello/level) reset a watchdog; if nothing arrives
for N seconds, `socket.close()` to trigger the retry path. Backoff itself and 4401 handling are correct and tested (`link.test.ts`).

### 6. Logout/stop race in startLive - S
`lib/boot.ts:25-28`. `startLive` awaits `jumpToScenario()` before `connect()`. If the effect cleanup `stopLive` runs during
that await (fast logout, 401), `connect()` still runs afterwards and opens a socket with no session; it gets 4401 and is
harmless but noisy, and `link.lost()` restarts the outage clock. Fix: a `let generation = 0` token checked after the await.

### 7. Waterfall redraws the full canvas pixel by pixel on every row - M
`screens/live-ops/Waterfall.svelte:52-101`. `draw()` allocates a new `ImageData` (about 1856x200x4 = 1.5 MB, more on the
Live Ops wide layout) and loops every pixel in JS (the inner loop calls `colour()` which allocates a new array per pixel via
`rampRgb[i].map`). It also runs a `strongest` scan over all rows each time. At 2 rows/s it is fine on a laptop; on a Pi or
phone it will hurt, and it re-runs on `dropAge` ticks too.
Fix: precompute a 256-entry RGB lookup table once (clamp changes only when `low`/`high` change), reuse one `ImageData`,
or better, scroll the canvas with `ctx.drawImage(canvas, 0, rowPx)` and paint only the new row (the model already knows
which rows are new). Keep the full redraw for resize/clamp changes.

### 8. Accessibility: pointer-only interactions, little ARIA - M
- `grep` finds 86 aria/role uses across the app but 8 `svelte-ignore a11y_*` suppressions, covering `Panel.svelte:40`,
  `MapCanvas.svelte:590`, `LiveOps.svelte:228,256`, `FeedCard.svelte:44`, `TranscriptRow.svelte:54`.
  The map's stations/trains are SVG hit targets with `tabindex="-1"` (`MapCanvas.svelte:685`), so keyboard users cannot select
  anything. The waterfall listen action has no keyboard route (use arrow keys to move a cursor and Enter to listen).
- Contrast is a design question for the director (dim ink at 0.7 opacity at 10 px), noting only that at stage scale below 1
  the text falls under any readable size.
Fix: give the map `TrainList` rows (already buttons) the keyboard path and say so in the UI; add a screen-reader live region
for `flash` in FrontWall (`role="status"`); remove suppressions where a real role fixes them.

### 9. Layering inversion: `lib/` imports from `screens/` - S
`lib/api/client.ts:9` (settings types), `lib/stores/transit.svelte.ts:4` (map `transitView`), `lib/stores/audio.svelte.ts:3`
(live-ops `mixer`). The shared layer depends on screens, and `userLocation.svelte.ts` (a store) sits in `screens/map/`.
Fix: move `BackendStats/SourceConfig/TransitSource` into `lib/types/`, and `Bbox/bboxParam/snapBbox/zoomBucket`, `mixer.ts`
and `userLocation*` into `lib/`. Mechanical, and required for the Trains page to reuse the location store cleanly.

### 10. Dead and loose API surface - S
`lib/api/client.ts`: `api.trains.list`/`trains.live` (line 135), `api.liveState` (79), `api.lofar` (129), `api.sim.get` have
no callers; `Json`-typed responses remain for frequencies/banks/feeds/radio/geo (casts such as
`as unknown as GeoFeatureCollection` in `map/Screen.svelte:79-83`). `gen:api` still points at port 8100 (the owner's server).
Fix: delete the unused calls, run `gen:api` against the review backend (8171) and replace `Json` with generated types.
Also `routes.ts:24` comment mentions History and Stats routes that no longer exist.

### 11. `request()` has no timeout, no abort, and assumes JSON on 2xx - S
`lib/api/client.ts:43-60`. A hung backend hangs the caller forever (map static layers show nothing and no error). Add
`AbortSignal.timeout(15_000)` (and accept an optional signal so the Trains page can cancel a superseded query). A 200 with
a non-JSON body (proxy error page) throws a raw `SyntaxError`; wrap as `ApiError`.

### 12. Transit polling has overlap and keeps going in a hidden tab - S
`lib/stores/transit.svelte.ts:55-69`. `setInterval(refresh, 15s)` can start a new request while the previous is still
pending (slow link), and polling continues while the tab is hidden. Fix: chain with `setTimeout` after completion, pause on
`document.visibilitychange`, refresh immediately on becoming visible. Also `refresh()` fires the `sources` request with
no error state of its own (fine) but also no abort on stop.

### 13. Large files and dense components - M
`map/MapCanvas.svelte` 777 lines, `schematicLayout.ts` 737, `map/Screen.svelte` 372 (about 25 `$state`s and several
`{n: counter}` "command" objects such as `centre`, `reveal`, `locate`, `focus`, `national`, used to trigger imperative
actions through props). Works, but it is the hardest code to change. Fix when next touched: expose a small `mapView`
command store (`centreOn`, `reveal`, `locate`) instead of counter-in-prop; split MapCanvas pan/zoom, layer drawing and hit
testing.

### 14. Test coverage gaps - M
335 tests, but all on pure logic (`hud/*`, `map/lib/*`, `reduce`, `link`, protocol). Untested: `lib/api/client.ts`
(query building, 401 handler, error mapping), `ws/client.ts` reconnect loop (only the backoff function is tested), the
stores with timers (`transit`, `spectrum`, `session`), `router`, any component (only `NodesSection.test.ts`), and the new
FrontWall `channelAt`/`listen` logic, which is inline in the component and so not testable. Fix: extract `channelAt(x, width)`
to `live-ops/wall.ts` (shared with `FrequencyCursor.svelte`, which duplicates the same band/slot maths, lines 25-29)
and unit-test it; add a fake-`WebSocket` test for `LiveSocket`; add a `fetch`-mock test for `request()`.
There is no e2e smoke test; one Playwright script (login, /live click-to-listen, /map loads) would have caught findings 1 and 4.
Note the review environment has no Playwright in `package.json`; the browser cache holds a mismatched version.

### 15. Duplicated logic - S
- `FrontWall.svelte:73-79` and `FrequencyCursor.svelte:24-29`: x to MHz to channel to on-slot, written twice.
- `CH${String(n).padStart(2,"0")}` appears in both (`fmt.ch` exists in `lib/hud/fmt.ts:26`; use it).
- `map/TrainList.svelte` has its own 1 s `setInterval` clock while `transit.now` already ticks every 5 s; two clocks.
- `FrequencyRuler.svelte`, `RegMark.svelte` exist in both `screens/system` and `screens/live-ops`/`map` (three RegMarks);
  consolidate into `lib/components`.

### 16. Smaller items
- `FrontWall.svelte:57-67`: `hover` spread onto three elements; `getBoundingClientRect` on every pointermove (cache rect on
  pointerenter).
- `FrontWall.svelte:101`: the error path uppercases the server message into the 10 px hint line; long messages overflow.
- `map/Screen.svelte:78`: the `console.warn` for missing track detail is the only user-invisible failure; fine.
- `map/Screen.svelte:70-83`: static geo (`rail`, `water`, `places`, `routes`) are fetched on every visit to /map; the
  backend/Etag presumably caches, but a module-level memo avoids the wait on revisit.
- `lib/stores/audio.svelte.ts`: `engine.stop()` clears voices but not the `gains` map; harmless.
- `userLocation.svelte.ts:11`: `window.isSecureContext` needs https; the production site is https, the LAN dev server is not
  (LOCATE N/A is shown; fine, documented in code).
- `loading` states are mostly blank until the first snapshot (`App.svelte:62` renders nothing while the session is unknown);
  a one-line "CONNECTING" frame would remove the dark flash.

## Trainspotting page: frontend plan

### What it is
A standalone page: position in (browser geolocation by default, or picked or typed), table of all trains out:
TRAIN, OPERATOR, ETA to that position (plus delay and status). Phone-first (see finding 2), reachable from the nav.

### Router and nav
- Add `"trains"` to `ScreenId` and a route in `routes.ts`:
  `{ id: "trains", path: "/trains", name: "TRAINS", dir: "trains", shell: ??? }`. Two options, my recommendation first:
  1. `shell: true` on desktop, but the screen renders in a responsive document container instead of the 1080-high stage.
     Cleanest: give `Route` an optional `layout: "stage" | "page"`; `App.svelte` skips `<Stage>` for `"page"` and
     `AppShell` gets a compact header variant. This also unlocks the later phone layouts for other screens.
  2. Quick: a `shell: false` page with its own minimal header (logo, link back to MAP/LIVE).
- Nav: add `"trains"` to `NAV_ORDER` (`routes.ts:33`) after `map`; its hotkey becomes the matching letter (the list assigns
  Q, W, E, R by order; placing it last avoids moving existing hotkeys: `["map","live-ops","feeds","trains","settings"]` would
  shift Settings from R to T, so append instead: `[... "settings", "trains"]` gives T).
- Query params (the router already carries globals): `?lat=38.897&lon=-77.006` (a typed or picked position is shareable
  as a link), `?q=<station name>` for a named place, `?agency=` filter, `?sort=eta|train`. Use `router.setQuery`.
- Deep link from the map: a "TRAINS TO HERE" action in `StationPanel` linking to `/trains?stop=<id>`.

### Reuse
- `lib/api/client.ts`: `request()` / `get`, `ApiError`, `api.transit.stops(bbox, zoom)` and `api.transit.station(...)`
  for the place picker (station search); `api.transit.vehicles()` if the position-to-ETA calc is done client-side as a fallback.
- Stores: `transit` store (`vehicles`, `fetchedAt`, `failed`, `sources`, `now`, ref-counted `start()`/stop) for polling;
  `userLocation` store (`fix`, `status`: idle/locating/tracking/denied/unavailable) for geolocation. Use
  `watchPosition` only while the page is open (it already starts and stops by mount); for this page one `getCurrentPosition`
  is enough, so add a `userLocation.once()` or keep watching but throttle re-queries when the fix moves less than about 200 m.
- Types: `Vehicle` (`train`, `agency`, `route_name`, `headsign`, `delay_s`, `delay_suspect`, `status`, `age_s`, `stale`,
  `position`), `NextStop`, `Stop`; `Fix` from `map/lib/userLocation.ts`.
- Pure helpers from `map/lib/transitView.ts`: `delayCell`, `delayTone`, `hhmm`, `formatDuration`, `freshness`, `ageNow`,
  `trainTag`; from `lib/displayName.ts`: `cleanName`; `lib/hud/fmt.ts` `BLANK`, `trainId`.
- Components: `Chip`, `EmptyState`, `SimTag`, `Delay.svelte` (map), `HeaderChips` (transit health chips), the `TrainList` row
  styling (`.tl__mark` freshness square). The table can be a slimmer sibling of `TrainList`; share the row via a common
  component once both exist. Row click opens the existing trip panel logic: `/map?page=trip&id=<trip_id>` (so TripPanel,
  `api.transit.trip`, is reused with no new page-level code).
- Prerequisite: move `userLocation` and `transitView` bits into `lib/` (finding 9) so the page does not import from `screens/map`.

### New API needed from the backend
The frontend cannot compute a trustworthy ETA to an arbitrary point: it needs route geometry and per-trip stop times.
`vehicles` only gives lat/lon and `next_stop`. Proposed (reuses the existing trip/stop model server-side):

```
GET /api/transit/trains/eta?lat=38.8977&lon=-77.0063&radius_km=40&limit=200&agency=Amtrak
```
Response:
```json
{
  "position": {"lat": 38.8977, "lon": -77.0063},
  "as_of": "2026-11-17T19:12:04-05:00",
  "nearest_stop": {"id": "amtrak:WAS", "name": "Washington Union Station", "distance_km": 0.3},
  "trains": [
    {
      "id": "amtrak:2150-17",
      "trip_id": "amtrak:...",
      "train": "2150",
      "agency": "Amtrak",
      "source": "amtrak",
      "route_name": "Northeast Regional",
      "headsign": "Boston",
      "origin": "Newport News",
      "destination": "Boston",
      "status": "late",
      "delay_s": 420,
      "delay_suspect": false,
      "position": "realtime",
      "age_s": 12,
      "stale": false,
      "eta": "2026-11-17T19:41:00-05:00",
      "eta_s": 1730,
      "eta_basis": "stop",
      "eta_stop": {"id": "amtrak:WAS", "name": "Washington Union Station"},
      "distance_km": 42.1,
      "heading_to": true,
      "passed": false
    }
  ]
}
```
Semantics: `eta` is when the train reaches the nearest station (or the nearest point on its route; `eta_basis` is
`"stop"` or `"track"`) to the given position; `heading_to` false and `passed` true for trains already past it (the UI
greys or hides them); `eta_s` is seconds from `as_of` (client re-derives a countdown with `transit.now`); `null` eta for
trains with no usable estimate (UI shows BLANK, sorted last). Sort order by default: upcoming by `eta_s`, then passed.
Errors: 400 for lat/lon out of range; 200 with an empty `trains` when no source is up (the `sources` health chips explain why).
A `stop_id=` form (`/trains/eta?stop=st:WAS`) for picked stations avoids the geometry step.

### Screen design (phone-first)
- Header block: position line (`38.8977, -77.0063 · FROM DEVICE · ±35 M`), buttons `USE MY LOCATION`, `PICK STATION`
  (a search box over `api.transit.stops`), and lat/lon inputs behind a "TYPE COORDINATES" fold. Denied or unavailable
  geolocation shows the manual choices, never a dead end.
- Table: TRAIN, OPERATOR, ROUTE/HEADSIGN, ETA (clock plus "in 28 MIN"), DELAY. Under 600 px collapse to two-line cards.
  Sortable by ETA/train; filter chips per operator (from `transit.sources`). Stale or estimated rows flagged with the
  existing freshness square.
- States: locating, no position yet (prompt), loading (skeleton rows), empty (no trains near), source down (reuse chips),
  request failed (keep last table, show "STALE" age). Polling every `TRANSIT_POLL_MS` through a `trainsEta` store that
  re-queries when the position changes (debounced) and ticks the countdown locally.

### Testing
- Unit (vitest, pure): `etaText(eta_s)`, sort/filter (`byEta`, passed-last, null-last), position parsing/validation for
  typed coordinates and the URL (`?lat&lon`), and "has the fix moved enough to refetch".
- Store test with mocked `fetch` and a fake `navigator.geolocation` (granted, denied, timeout, unavailable): asserts the
  query, debounce, polling stop on destroy, and keeps the last table on a failed poll.
- Component test with jsdom (the project already uses it): renders rows from a fixture, empty/denied/error states,
  row click navigates to `/map?page=trip&id=...`.
- Contract test shared with the backend: a JSON fixture in the repo validated by the backend's Pydantic model and loaded
  by the frontend tests, so the shape cannot drift.
- One Playwright smoke run against the review stack: grant a mocked geolocation (`context.grantPermissions` +
  `setGeolocation`), load `/trains`, check the table has rows, then a 390 px viewport pass for no horizontal scroll.

### Suggested order (each step leaves the app running)
1. Move `userLocation` and `transitView` bits to `lib/` (finding 9). S.
2. Backend `/transit/trains/eta` with the fixture. (backend engineer)
3. `api.transit.trainsEta` + types + store + unit tests. S.
4. Route, nav entry and a page-layout option on `Route` (finding 2 option M). S-M.
5. Screen: position controls, table, states, URL params. M.
6. Smoke test and phone pass. S.

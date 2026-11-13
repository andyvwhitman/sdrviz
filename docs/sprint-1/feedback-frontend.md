# Frontend review, sprint 1

Reviewer: senior frontend engineer (read-only review). Date 2026-11-13. Build under test: Vite dev on :5190, ~215 live trains, 18 transit sources.
Evidence: screenshots and CDP scripts in `/private/tmp/claude-501/-Users-andy-Code-sdrviz/dc1fec01-2c61-4ccf-957d-14b364a6eac4/scratchpad/review-frontend/` (v1920-*, v1440-*, v1180-*, v820-* per screen; d-/i-* panel flow; perf-*.png; touch-pan.png; member-was.png; scripts perf.py, inter.py, pinch.py, screens.py, panel.py).

## Verdict

The app is in good shape for a prototype. `svelte-check` reports 0 errors and 0 warnings over 565 files. `vitest` passes 284 of 285 tests; the one failure is the known `wave.test.ts` (`expected 0.105 to be greater than 0.105`). The console is clean on all four screens at all four viewports: the only noise is a `favicon.ico` 404. The docked panel flow works end to end: train to station to route, BACK, maximize, Esc, border click, and URL reload all behaved correctly. Pinch (3.4x then 11.6x), touch pan and double-tap all work, and the browser keyboard hotkeys Q/W/E/R work. Map performance is acceptable: 60 fps idle and while dragging, with occasional 55-90 ms long tasks when a pan or zoom commits.

The weak spot is layout below the 1920 design width. The stage scales, but several screens were composed for 1920 and collide at 1440, 1180 and 820 (Feeds, header, map overlays). Beyond that the map code has grown past comfortable size (a 777-line `MapCanvas` with a 25-prop interface). The panel history (BACK trail) is also not tied to the URL, so reload and the browser Back button don't match what the panel shows.

## BUGS

1. **Feeds page clipped at 1440x900 and 1180x820.** Severity: major.
   Evidence: `v1440-feeds.png`, `v1180-feeds.png`. The right column (BANKS, CHANNELS, bank editor) runs off the stage ("BANK ME...", "CATALO..."). The bottom of the SDR-01 inspector overlaps the footer: "RECEIVER PARAMETERS" collides with the telemetry rows and with "DEVICE + REMOTE HOST" under the status bar. `scrollWidth` equals `innerWidth`, so it is clipped rather than scrolled; the user cannot reach the content.
   Fix: make the Feeds grid width-aware like the map (`stage.width`), drop to two columns (or stack the banks column under the inspector) under about 1600, and let the centre column scroll inside its own frame. Size: M.

2. **Header: SETTINGS tab collides with the FEEDS 1/1 chip at 1180 and 820.** Severity: major.
   Evidence: `v1180-map.png`, `i-2-station-from-trip.png`, `v820-*`. The tab row and the chips row share one line with no room; at 820 the chips sit on top of the SETTINGS tab. On the FEEDS tab the active tab is wider and overlaps further.
   Fix: collapse the chips group (hide ASR OK, shorten "KEYED · CH12", or drop to icons) under a width breakpoint on `HeaderNav` / `HeaderChips`. Size: S.

3. **Frequency ruler labels 16 and 17 overlap ("1617"), and the channel numerals collide with MHz numerals.** Severity: minor (confirmed leftover).
   Evidence: `v1440-live.png` (ruler shows "1617", "47 160.860 54", "27 160.560"); same on the Feeds spectrum at 1440 and 1180 (`v1440-feeds.png`: "12 1617 22 27", "161.160161.310161.460"). In `src/screens/live-ops/freqRuler.ts` (lines 72-108) the channel labels, "extra" labels and MHz labels are pushed independently with no collision pass, so they overlap whenever the span per channel is tight.
   Fix: run the existing greedy label placer over the ruler labels (priority: monitored channel > MHz > other), and stagger the MHz row below the channel row. Add a unit test with the 12/16/17 channels. Size: S.

4. **Map controls collide with the docked panel and the hero when the panel is open on narrower stages.** Severity: major at 1180, minor at 1920.
   Evidence: `i-2-station-from-trip.png` (1180, panel open): the GEO/SCHEMATIC/NATIONAL/ZOOM chips overlap "218 TRAINS TRACKED"; the train list is cut off at "NEXT"; the pointer readout (right 728) sits against the panel edge. `d-3-was.png` (1920, panel open): the ZOOM chip is cut by the panel and the "TERMINALS" list overlaps the ABERDEEN and BALTIMORE PENN labels. The readout, ctl and train list are all absolutely positioned against the full stage.
   Fix: pass the panel width to the overlays (`--pn-w` already exists for `.mp-terms`; apply it to `.mp-ctl` and `.mp-cursor`), and let the hero/train list shrink or collapse to the count-only row when `stage.width - PANEL_W` is under about 900. Size: M.

5. **TERMINALS list overlaps map labels (ABERDEEN, BALTIMORE PENN, EDGEWOOD) at 1180 and 1920.** Severity: minor (confirmed leftover).
   Evidence: `v1180-map.png`, `v1920-map.png`. `.mp-terms` (map.css:88) is an overlay but `overlays` (Screen.svelte:176-190) measures only five other elements, so the label placer ignores it.
   Fix: add `.mp-terms` to the measured obstacle list (and remeasure when `terminals` changes). Size: S.

6. **Station opened with a member stop id (for example `?page=station&id=amtrak:WAS`) is not highlighted on the map.** Severity: minor (confirmed).
   Evidence: `member-was.png`. The panel resolves to "Washington Union Station" but `TransitStops` compares `selectedId === s.id` and the map only knows the group id `st:was`. `Screen.svelte:101` sets `stopId = current.id` straight from the URL.
   Fix: resolve member to group in the station store (the API returns `stop.id` for the group) and either rewrite the URL with `replaceState` to the group id or feed the resolved id to the map. Size: S. Needs no backend work.

7. **Hotkeys and tab semantics.** Severity: nice-to-have bug. `HeaderNav` uses `role="tablist"` with `<a role="tab">` links that navigate: screen readers announce tabs that don't behave as tabs. Fix: `<nav aria-label="Screens">` with `aria-current="page"` on the active link. Size: S.

8. **iPad (touch) pointer readout touching the GEO/ZOOM chips with the panel open.** Severity: minor (confirmed, covered by item 4). Measured at 1180: `.mp-cursor` 630-728 px and `.mp-ctl` bottom at 95 px, panel left at 750 px, so the readout has 22 px of clearance and no right margin from the chips. A touch device has no pointer; hide the POINTER readout when `pointer: coarse`. Size: S.

9. **820x1180 portrait: stage is letterboxed to about a third of the height.** Severity: minor (iPad portrait). Evidence: `v820-map.png`; roughly 300 px of dead black above and 300 px below the stage. Decide whether portrait is supported; if so, either allow a portrait layout (stacked) or show a "rotate" hint. Size: M if supported, S for a hint.

10. **Footer shows BUILD SIM-S3 and the SIM tag while the backend reports "SIMULATION OFF" in Settings.** Severity: minor. `v1440-settings.png` vs the footer. The build label is hard-coded. Fix: show the backend `version` and git hash it already exposes. Size: S.

11. **`favicon.ico` 404 on every load.** Severity: nice-to-have. Add a favicon (SVG) to `index.html`. Size: S.

## UX FRICTION

12. **BACK trail is in memory only; browser Back does not walk the panel.** Severity: major for the iPad (hardware/gesture back is the natural way). Evidence: `router.setQuery` uses `history.replaceState` (`router.svelte.ts` line 38) and `PanelStore.#trail` is a private array (`panelStore.svelte.ts`). Result: browser Back from a station panel left the app on `?page=station&id=amtrak:WAS`, the panel's BACK button disappears after reload, and Back leaves the screen entirely. Fix: push (not replace) history entries for panel open/swap, keep close/maximize as replace, and derive `canGoBack` from `history.state` or `history.length`. Update `panelStore` tests. Size: M.

13. **Station opened from a far-away stop (route page to New Orleans) does not move the map.** Severity: minor. `d-7-station-full.png`: the map recentres only via `onlocate`/`reveal`; when maximized the map is hidden anyway, but on close the user lands at the old view with no hint. Fix: on closing a maximized panel, keep the view, but show the station on the map via `reveal` when docked (the TripPanel already does it). Size: S.

14. **Live Ops tile wall does not use extra width at 1920.** Severity: minor (pending owner decision). `v1440-live.png`: at 1440 only 3 tiles per row with 40% of the wall empty; the transcript column gets all the spare width. Fix once the owner decides: either raise tiles per row from `stage.width` (geometry already takes `stage.width`) or let the wall scale tile size. Size: M.

15. **Dense train list hides a large part of the map at every size.** Severity: minor. 12 to 16 rows cover the top-left quarter at 1920 and half the map at 1180 (`touch-pan.png`). Fix: cap at 8 rows with a scroll, a collapse toggle (the header already has a chevron), and default collapsed under 1400 px. Size: S.

16. **Labels overlap near trains** ("Amtrak 41" on ALEXANDRIA UNION, "Amtrak 1195" on "Amtrak 20" at 1180). Severity: minor. Train labels are not in the label-placer obstacle set. Fix: place train labels with `blockPlacer` against station labels, or hide place names that are under a train label. Size: M.

17. **Extreme status values shown literally** ("+364 MIN" for AUTO TRAIN 52, "-56 MIN" SUDBURY). Severity: nice-to-have, belongs to backend data quality (item 33).

## PERFORMANCE

Method: CDP `Input.dispatchMouseEvent` drag and wheel at 1920x970, rAF frame timer and `PerformanceObserver('longtask')` (`perf.py`).

| Action | Frames | Median | Max | Long tasks |
| --- | --- | --- | --- | --- |
| Idle 3 s | 175 | 16.7 ms | 50 ms | none |
| Pan (about 215 trains) | 136 | 16.7 | 50 | 59 ms |
| Zoom in (15 wheel ticks) | 94 | 16.7 | 100 | none |
| Zoom out (40 ticks) | 171 | 16.7 | 150 | 79, 81 ms |
| Pan, national view | 134 | 16.7 | 83 | 89 ms |
| Zoom, national view | 146 | 16.7 | 83 | 56, 56, 78 ms |

18. **Commit-after-gesture causes 55 to 90 ms long tasks.** Severity: minor. During the gesture the `<g>` transform is a cheap `pending` state, but 160 ms after the last event `commit()` (MapCanvas.svelte:149-160) recomputes the whole geo layout, lines and labels synchronously. It is the only jank seen (1 to 3 dropped frames per gesture). Fix: split the commit: first update the transform base, then compute label placement in an idle callback or a `requestAnimationFrame`; also skip placement for lines outside the view. Size: M.

19. **DOM size.** Severity: minor. 2,179 nodes at default view (1,592 `path`), 5,556 nodes in the national view (the extra 3,400 are not `path`: vehicle marks, stop groups and labels). Fix: cull stops and vehicle marks beyond the viewport margin (the stops component already culls; vehicles and lines do not), and render stop labels only when named. Size: M.

20. **JS heap grows 25 MB to 50 MB during the test session.** Severity: nice-to-have (needs a longer soak to tell leak from garbage). Fix: run a 30 min soak with heap snapshots on the map and Live Ops, with special attention to `transit.vehicles` replaced every poll and the WebSocket frame buffers. Size: S to investigate.

21. **Map static data is fetched on every mount** (rail, water, places, routes, rail detail in `Screen.svelte` lines 59-80). Switching Q to W and back re-downloads and re-parses the GeoJSON. Fix: cache in a module-level promise (`$lib/api` or a `geoStore`). Size: S.

22. **Pointer move writes `pointer` state on each event** (`Screen.svelte` `onpointer`), re-rendering the readout at event rate even while panning. Cheap today. Fix: coalesce with rAF. Size: S, nice-to-have.

## CODE HEALTH

23. **`MapCanvas.svelte` is 777 lines with a 25-prop interface** (line 96: `data, measure, mode, width, height, selection, inspectorWidth, overlays, pings, demoMs, onselect, onpointer, onview, onareas, focus, locate, onstation, onpingdone, vehicleId, stopId, onvehicle, onstop, onwindow, centre, reveal, panelWidth, national`). It mixes view/gesture state, layout, transit layers, vehicle windowing and drawing. Severity: major for maintainability. Fix: extract (a) a `mapView.svelte.ts` store (view, pending, commit, zoomAt, pointer handlers, pinch), (b) a `commands` object (`centre`, `reveal`, `focus`, `locate`, `national`, now four nonce-counter props `{n}` that mimic events), (c) one `highlight` object (`vehicleId`, `stopId`). Target: under 400 lines, under 12 props. Size: L.

24. **`map/Screen.svelte` (355 lines) owns data loading, the motion-study demo, the key-up pings, the panels and the overlay measurement.** Severity: minor. Fix: move the data loading into a `loadMapData()` module (also item 21), the demo (`?motion=1`) into its own component or a dev-only module, and the five measured overlays into an `overlays.svelte.ts` helper. Size: M.

25. **"Nonce" props (`{n: number}`) as imperative commands** (`centre`, `reveal`, `focus`, `locate`, `national`; Screen.svelte lines 90-100). Fragile and repetitive. Fix: a tiny `mapCommands` store with `emit()` and subscribe, or an exported `bind:this` API on `MapCanvas`. Size: M (comes with item 23).

26. **Hard-coded layout constants keyed to `params.size === 1440`** (`map/Screen.svelte:48` height 804/984, `history/Screen.svelte:24`, `stats/Screen.svelte:28`, `stage.svelte.ts:13`, `LoginPanel.svelte:15`) and `width < 1500` (Screen.svelte:293). Severity: minor. This is the root cause of the "narrow stage" issues (items 1, 2, 4). Fix: derive from `stage.width/height` with named breakpoints in one `breakpoints.ts`. Size: M.

27. **Dead code.** Severity: minor. Not imported anywhere (verified with an import-graph scan; `vitest` still passes): `src/screens/live-ops/LofarStrip.svelte` (102 lines) and `lofarCells.ts` (10), `src/screens/live-ops/CtcStrip.svelte` plus `ctc/layout.ts` (197), `ctc/labelPass.ts` (149) and its test (89) and the 1,283-line `ctc/fixtures/mockup-ctc.json`, `src/lib/components/MilepostTagSvg.svelte`, `src/lib/hud/index.ts` (barrel, 7 lines). The CTC/LOFAR strips are confirmed unused leftovers; remove together with the two tests that cover them (`labelPass.test.ts`). `screens/history` and `screens/stats` are not in the nav (routes.ts line 33) but are still shipped and routed; decide keep or park them. Size: S.

28. **Duplicated components.** Severity: minor. Three `RegMark.svelte` (`screens/map`, `live-ops`, `system`), two `FrequencyRuler.svelte` (live-ops and system) plus two ruler modules (`freqRuler.ts`, `system/ruler.ts`), two `FeedInspector.svelte` (live-ops and feeds), `PositionGlyph` and `PositionGlyphSvg`, `DataBlock` and `DataBlockSvg`, `MilepostTag` and `MilepostTagSvg`. Fix: move shared ones to `lib/components`; for ruler, one implementation with props (the overlap fix in item 3 then lands once). Size: M.

29. **Test gaps.** Severity: minor. 18 test files for about 200 modules. Panel state (`panelStore`, `lib/panel.ts`), the station-panel data loading, `transit.svelte.ts` (polling, ref-counting), `MapCanvas` view maths (`clampZoom`, pinch) and the Settings forms have little or no coverage; there is no component or e2e test at all. Fix: unit-test `panelStore` (open/back/close/full/date), add `transit.svelte.ts` poll tests with fake timers, and add one Playwright smoke that runs `panel.py`'s flow (train, station, route, Esc, reload). Size: M.

30. **Fix or delete `wave.test.ts`.** Severity: minor (known). The assertion `loud > quiet` fails because both clamp to 0.105 at index 183. Either the envelope has a floor that swallows the 20 dB difference (a real bug in `wave.ts`) or the test constants are stale. Look at `wave.ts` first (does the loud signal get floored?). Size: S.

31. **Accessibility.** Severity: minor to major for an interactive HUD. (a) Map marks are `role="button" tabindex="-1"` groups: not reachable by keyboard, so train/station selection is mouse/touch only; offer the train list as the keyboard path (it is: `button.tl__row`), but add a visible focus style and `aria-label` per row. (b) The svg is `role="img"` while holding interactive children. (c) Zoom/pan have no keyboard equivalent (`+`, `-`, arrows). (d) Maximized panel has no focus trap or focus return on Esc. (e) `svelte-ignore a11y_*` suppressions in MapCanvas (line 598) hide real issues. Size: M.

32. **Rendering loop in `transit.svelte.ts`** is ref-counted (good), but on a failed poll the map keeps showing stale vehicles without an on-screen indication beyond the per-vehicle stale flag. Fix: a header chip "TRANSIT FEED STALE" when `fetchedAt` is older than 2 polls. Size: S.

### Needs backend work (separate)

33. **Delay outliers and nulls.** Trains with +361/+364 min, -56 min, and `— — —` next-station/delay for the Canadian VIA/Amtrak Cascades trains (`perf-after.png`). Clamp or flag implausible delays server-side (`delay_s` beyond about 6 h), and send `next_stop: null` explicitly with a reason. The national view sends all 200+ trains; add a `bbox` filter to `GET /transit/vehicles` so the client does not parse trains it cannot see. Size: S to M.
34. **Station group id resolution.** `GET /transit/stations/{id}` accepts a member id and returns the group; add `canonical_id` to the response so the client can normalise the URL (item 6) without a second lookup. Size: S.
35. **Build/version in `/api/health` or `/api/system`** so the footer can show the real build and simulation state (item 10). Size: S.

## Top 5 priorities for the next sprint

1. Responsive layout pass: fix Feeds at 1440/1180, the header chip/tab collision, map overlays vs the docked panel, and TERMINALS as a label obstacle (items 1, 2, 4, 5, 26). Size: M-L, the highest user-visible gain on iPad and the narrower stage.
2. Make panel navigation history-based: push history entries so browser/iPad Back walks station, trip and route, and fix the member-stop highlight with `canonical_id` (items 12, 6, 34). Size: M.
3. Break up `MapCanvas.svelte` and `map/Screen.svelte`: extract the view store, replace nonce props with a command channel, and cache static map data (items 23, 24, 25, 21). Size: L, unlocks every later map change.
4. Clean up: delete the dead LOFAR/CTC/Milepost files, dedupe RegMark/FrequencyRuler/FeedInspector, and fix the ruler label overlap once (items 27, 28, 3, 30). Size: M.
5. Tests and a11y safety net: panel store and transit store tests, one Playwright smoke of the panel flow, keyboard path for map selection, nav semantics (items 29, 31, 7). Size: M.

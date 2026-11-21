# SPRINT 6 REVIEW (lane R): one shell, Live Ops tidy-up, Feeds tabs, map leaders, API docs

**From:** gmunk-director, a creative director persona inspired by GMUNK's published work. It is not the person.
**Date:** 2026-11-20. **Against:** `docs/sprint-6/direction.md`, decisions 72 to 79, the brief.
**Evidence:** production at main `c36afb0` (https://dispatch.andyvwhitman.com, signed in as admin) at 1920 × 1080,
1280 × 800 and 390 × 844, plus my own 2× crops of the map, the footer and a keyed tile on production. Measured on
production: the bar is 36 px and the footer 32 px on every route at 1920 and 1280, and both are 44 px at 390. There is
no sideways scroll and no console error. I also used the lane shots (keyed tile, open node picker, pane arrows,
Feeds narrow flow, Docs) and read the code. I clicked nothing on production.

## Verdict: CHANGES

The main job of the sprint is done, and it shows. There is one bar and one footer, and they are the same pixels
on Map, Live Ops, Frequencies, Feeds, Settings, SPOT and Docs. The key-up strip is what decision 72 asked for: a
fixed 112 px frame, whole seconds and nothing that jitters. It is the only orange in the chrome. The Live Ops bank
opens two tiles wide, the keyed tile's 18 px timer clears the label and the AAR, DENSITY is gone, and the node
picker is one control instead of two. Frequencies lost its node columns without losing information. Feeds has a
structure now. Docs is the quietest page in the app, which is right for reference: it has a monochrome Mermaid, a
left-packed rail and real headings. No OS glyph anywhere, and the test enforces it.

Some things still fail the brief's first rule, that every element must mean something, and the owner will notice
them in the first minute. These are the reasons for CHANGES:

- The **map leaders**, the one thing the owner asked for by name, are short and faint at 1920. Train labels still
  print over station names (MARC 548 over BALTIMORE PENN STATION, AMTK 40 over SILVER SPRING, AMTK 55 over BWI
  AIRPORT, AMTK 2171 over AMTK 66's mark).
- The footer says **`BUILD SIM-S3`** on a server that has the simulation off: the title block states something false.
- The **SDR feed detail** says `NO SAMPLES` and `SNR 0 dB` while the node is connected and streaming spectrum.
- **SPOT on a phone** opens with its sheet printed over the page.

All of these are small. None of them needs new design.

### Your five observations, judged

| # | Observation | Ruling |
|---|---|---|
| 1 | Leaders barely visible; train labels collide with station labels; OSM credit twice | **Upheld, all three.** The quadrant rule counts trains only, as F.2 specified. My rule was too narrow: it was written for the train-on-train case and ignored the station names the placer has already laid down. I am revising D14 below (MUST 1). The leader is 1 px `ink-3` and only 28 px each way. Over the coverage hatch it disappears. The credit is drawn on the canvas and again in the footer (MUST 2). |
| 2 | `BUILD SIM-S3` on production | **Upheld.** It is a hard-coded default left over from the mockup (`TitleBlock.svelte`, `build = "SIM-S3"`), and nothing passes a real value. The `[SIM]` tag is right (it is absent on production). The build string is wrong (MUST 3). |
| 3 | Feeds SDR detail: NO SAMPLES and empty rate while connected | **Upheld as a bug, front end and back end.** The node sends spectrum frames, and `hub.send_spectrum` forwards them, but `FeedInspector.svelte` draws a trace only when `feed.noise_floor_dbfs != null`. For a real node, `feed_view()` in `backend/app/sim/live_state.py` fills `noise_floor_dbfs`, `snr_db` and `sample_rate_measured_msps` from the replay's `feed_series`, which has no entry for a node, so all three are `null`. The node's `Health` message carries no measured rate at all. The header then prints `SNR 0 dB` from `Math.round(feed.snr_db ?? 0)`, a made-up number (MUST 4). |
| 4 | SPOT at 390 opens with the sheet over `0 TRAINS · NEXT 1H` | **Upheld, and it happens at 1920 and 1280 too.** With no spot set, `Screen.svelte` opens the picker on mount. `SpotPicker` is `position: absolute`, so it covers the timeline on the desktop and the count line on the phone (MUST 5). |
| 5 | No DETAILS item in the phone node picker | **Upheld, with a better target.** The inspector is desktop-only, but the phone has a full feed detail: the Feeds layer at `/feeds?feed=<id>&open=1`. While checking this I found that `ALL FEEDS` builds `/feeds?feed=node-1`, and the Feeds screen looks up `feed-node-1`, so for any real node it falls back to the first feed. With one node on production nobody has seen it yet (MUST 6). |

### Scorecard against the direction

| Lane | Area | Result |
|---|---|---|
| B | Shell, footer strip, glyphs, SPOT | Bar and footer pass: same pixels, 1:1, 36 / 32 and 44 / 44. Strip passes. Glyph sweep passes. SPOT layout passes on the desktop. SPOT first run fails (MUST 5). Title block build fails (MUST 3). |
| C | Live Ops, Frequencies | Pass. Two wide, timer, arrows, picker and ON column all match the spec. Phone picker details fails (MUST 6). |
| E | Feeds | Structure passes: tabs, split, `+ NEW FEED` at the same x/y on both tabs, HOST · BACKEND gone. It fails on the double frame (MUST 7), on the card at phone width (MUST 8) and on node telemetry (MUST 4). |
| F | Map leaders | Fails (MUST 1, 2). |
| G | Docs, Settings link | Pass. |

---

## MUST (fix before the sprint closes)

### 1. Map leaders: longer, visible, and placed clear of station names (revises D14 / §F)

Files: `frontend/src/screens/map/lib/leaders.ts`, `leaders.test.ts`, `Leader.svelte`, `LiveTrains.svelte`,
`MapCanvas.svelte`, `lib/geoLayout.ts`, `map.css`.

**a. Geometry, two reach tiers** (`leaders.ts`). Replace `ELBOW = 37.2` with tiers. All lengths are at scale 1 and
are multiplied by the mark's `scale`, as now:
- `START = 9.2` (unchanged).
- `REACH = [40, 64] as const`. This is the diagonal's run in x and in y. The elbow is at `START + REACH[tier]`:
  49.2 for tier 0 (a 56.6 px diagonal) and 73.2 for tier 1 (90.5 px).
- `GAP = 4` and `SHELF_PAD = 8` (unchanged).
- `leaderShape(q, labelWidth, scale, tier = 0)`, which uses the tier's elbow. `Placement = { q: Quadrant; tier: 0 | 1 }`.

**b. Obstacles.**
- In `geoLayout.ts`, add `nameRects: Rect[]` to the layout output:
  `labeler.glyphs.filter((g) => g && g.kind !== "line" && g.rect).map((g) => g!.rect!)`.
  These are the station names and terminal blocks, already padded by 2.
- In `MapCanvas.svelte`, pass `avoid={u < 0.5 ? (geoLayout?.nameRects ?? []) : []}` to `LiveTrains`. Before you
  wire it, check that `nameRects` and the trains' `pos` are in the same screen space. If the geo layer draws under a
  view transform, apply the same transform to each rect.
- In `LiveTrains.svelte`, forward `avoid` as the 4th argument of `chooseQuadrant`.

**c. Rule.** `chooseQuadrant(points, prev, canvas, avoid: readonly Rect[] = [])` returns `Map<string, Placement>`.
- Labelled points are placed one at a time, sorted by `id` (string order), so the result is deterministic.
- There are 8 candidates, in tie order: `UR0 DR0 UL0 DL0 UR1 DR1 UL1 DL1`.
- A candidate is **excluded** when its label box leaves the canvas (the `fits` rule, using the tier's elbow).
- **Label box:** x from `elbow.x` to `elbow.x + sx·(labelWidth + 8·s)` (take min and max), y from `elbowY − 18` to
  `elbowY + 2`.
- **Obstacles for a candidate:**
  1. every rect in `avoid`;
  2. a square of ±13·s around every other drawn point (its mark);
  3. the label boxes of points already placed in this pass.
- **hits** is the number of obstacles that the label box overlaps (`overlap`), plus the number of mark squares that
  the diagonal crosses (`segRect(from, elbow, square)`).
- **cost** = `100 × hits + 10 × tier + neighbours(q)`, where `neighbours` is today's `crowding()` count within 96 px.
- **Pick** the lowest cost. Break ties in candidate order.
- **Hysteresis:** keep the previous placement unless (i) it is excluded now, (ii) its hits are greater than the
  best candidate's hits, or (iii) `cost(best) ≤ cost(prev) − 2`.
- Freeze during gestures and the morph (unchanged), and forget a train after 60 s (unchanged).

**d. Draw** (`Leader.svelte`, `map.css`).
- `{#key placement.q + placement.tier}`.
- Under each of the two segments, draw a halo path with the same `d` and class `mp-leader-halo`:
  `stroke: var(--bg-void); stroke-width: 3px; vector-effect: non-scaling-stroke; fill: none`.
- Leader stroke becomes **`ink-2`**: `.hud .mp-leader .s-hair { stroke: var(--ink-2); }`. Selected stays
  `state-select` and stale stays as it is.
- Leave the label halo and the motion unchanged.

**e. Tests** (`leaders.test.ts`). Keep the four existing cases, updated to `Placement`. Add these:
- a station rect over the UR0 label box makes the label go to DR0;
- rects over all four tier-0 boxes make it go to UR1;
- a train mark on the UR diagonal makes UR0 lose;
- a previous UR0 placement that now overlaps a rect moves, even when the costs differ by less than 2;
- two trains 20 px apart never get overlapping label boxes.

**Done when:** at 1920 and 1280, at the default view and at the Baltimore–Washington zoom, no train label or shelf
touches a station name, a terminal block, another train's mark or another train label. The leaders read clearly at
1:1 over the coverage hatch. A 10 s pan shows no label changing quadrant. vitest is green.

### 2. Map: the OSM credit once

`frontend/src/screens/map/Screen.svelte` line 350: render the `.mp-attrib` div only when `phone` is true (the
narrow footer has no title block, so the phone keeps the canvas credit). In the overlay effect above it, build
`els` from `[readoutEl, ctlEl, cursorEl]`, return early only if one of those is missing, and then push `attribEl` if
it exists, as `termsEl` is pushed now. The footer's `© OpenStreetMap contributors` (TitleBlock `osm`) is the
credit at 900 px and wider.
**Done when:** the credit appears exactly once at 1920, 1280 and 390.

### 3. Footer title block: the real build

- `backend/app/schemas.py`: add `version: str` to `SessionOut`.
- `backend/app/routers/auth.py:40`: pass `version=VERSION`, importing `VERSION` from `routers/system.py`. Add
  `commit` too: `_git_commit()` returns `None` in the container because `.git` is not copied, so leave it out of the
  string when it is `None`.
- `frontend/src/lib/stores/session.svelte.ts`: add `build = $state("—")`, and set `this.build = info.version` in
  `check()`. Update the `api.auth.session` type.
- `frontend/src/lib/components/TitleBlock.svelte`: the default becomes `build = "—"`.
- `ShellFooter.svelte`: pass `build={session.build}`.

The result reads `BUILD 0.1.0`, and `BUILD 0.1.0 [SIM]` only when the sim is on. Grep the repo for `SIM-S3` and
remove every remaining use outside tests and fixtures.
**Done when:** production shows `BUILD 0.1.0` with no SIM tag on every route.

### 4. SDR feed detail: show what a real node sends, and never make up a value

Front end, in `frontend/src/screens/feeds/FeedInspector.svelte`:
- `trace`: if `spectrum.watched === feed.id && spectrum.latest`, return `frameTrace(spectrum.latest, PLOT_W)` whatever
  `measured` and `noise_floor_dbfs` are. Fall back to `syntheticTrace` only when `measured && feed.noise_floor_dbfs != null`.
  Otherwise return `null`.
- Header (line 158): `FLOOR ${fix(floor, 1)} dBFS · SNR ${snr} dB`, where each part shows `fmt.BLANK` when its value
  is `null`. Delete `?? 0`. When a live frame exists and the feed has no floor, take the floor as the median of the
  frame's bins, rounded to 0.1. That is a measurement, not an invention.
- For `RATE MEASURED` and `RATE DEFICIT`, and in `SampleRateChart` when **every** value is `null` while the feed is
  `ok`: show `NOT REPORTED` (label font, `ink-3`) in place of the dashes and of `NO SAMPLES`. This is the pattern
  `DEVICE TEMP` already uses. `NO SAMPLES` is kept for a feed that is not `ok`.
- `FeedCard.svelte`'s RATE cell follows the same rule: `—` when the feed is not measured, `N/R` (`ink-3`) when it is
  measured and the rate is `null`.

Back end, in `backend/app/sim/live_state.py` `feed_view()`: for a node (`node` is truthy), set
`sample_rate_measured_msps`, `snr_db` and `noise_floor_dbfs` to `None` explicitly. Do not take them from
`feed_series`, even if a replay id happens to match. Add a test in `backend/tests/` that a node feed's view has
those three set to `None` and its `telemetry` filled from the node's health. (Real rate and floor reporting from the
node is SHOULD 1.)
**Done when:** on production, `/feeds` with SDR-01 connected shows the node's live spectrum trace, `SNR —` or a
measured value (never `0 dB` by default), and `NOT REPORTED` for the measured rate. The words `NO SAMPLES` appear
only while the node is stale or offline.

### 5. SPOT first run: the picker pushes the page, it does not cover it

- `frontend/src/screens/spot/SpotPicker.svelte`: add a prop `inline = false` and the class `pk--inline`, styled
  `.pk--inline { position: static; max-height: none; box-shadow: none; }`.
- `Screen.svelte`: render `<SpotPicker inline={!store.spot} … />`. With no spot, the sheet is part of the page flow
  at every width. Once a spot exists, opening the bar gives the floating sheet as today.
- On the desktop, the inline sheet stays inside the 460 px `.sp__bar` column. The grid row grows and the timeline
  moves down below it.

**Done when:** a first visit with location blocked shows the sheet and then the count line below it, with nothing
overlapping, at 1920, 1280 and 390. Picking a station closes it and the page reflows.

### 6. Node picker: details on the phone, and links that find real nodes

- `frontend/src/lib/components/NodePicker.svelte`: when `variant === "row"` (the phone), draw a link item
  `{activeShort} DETAILS` + `chevron-right` 12 px. It goes to `/feeds?feed=<id>&open=1`, which opens the Feeds
  detail layer. On the phone it **replaces** `ALL FEEDS`, because both would lead to the same page. The desktop keeps
  `DETAILS` (inspector) and `ALL FEEDS`. Use 48 px items on the phone, as C.5 says.
- `frontend/src/screens/feeds/Screen.svelte:92-93`: resolve the URL id against both forms,
  `snapshot.feeds.find((f) => f.id === q || f.id === \`feed-${q}\`)`. Node feeds are `node-N` and sim feeds are
  `feed-…`, and today a node id never matches.

**Done when:** on the phone, the picker shows `SDR-01 DETAILS`, and tapping it opens SDR-01's detail layer. Back
returns to Live Ops. On the desktop, `ALL FEEDS` selects the listened node's card, also with 2 or more nodes in the
4-node sim.

### 7. Feeds: one frame, not a frame inside a frame

`frontend/src/screens/feeds/FeedsSplit.svelte`: add a prop `detailEmpty: boolean`, and give `.fe-detail` the `br`
class only when it is true. `Screen.svelte` passes `detailEmpty` when the tab has no item to show (the E.3 empty and
failed states). With content in the pane, the inspector's or `SourceDetail`'s own bracketed panel is the only frame.
**Done when:** at 1920 and 1280, both tabs show one set of corner brackets around the detail, and an empty tab still
shows the empty bracketed frame.

### 8. Feed card at phone width: nothing cut off

`frontend/src/screens/feeds/feeds.css`:

```css
.fb-card { container-type: inline-size; }
@container (max-width: 480px) {
  .fb-mini.is-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 16px; row-gap: 8px; }
  .fb-tel { flex-wrap: wrap; height: auto; row-gap: 6px; }
}
```

The six readouts become 2 rows of 3, and the telemetry line wraps. At 390, `DROPS 0` is cut off today, and
`RATE MS/s CENTRE MHz …` runs together.
**Done when:** at 390, and with the desktop list dragged to its 280 px minimum, every label and value of the card
is whole, with at least 12 px between columns.

---

## SHOULD (next sprint, or in this lane if time allows)

1. **Node reports its real rate and floor.** Add optional fields `iq_rate_msps: float | None` (IQ samples counted
   over the health interval) and `noise_floor_dbfs: float | None` (median of the last spectrum row) to `Health` in
   `backend/app/live/node_protocol.py`, filled in `agent.py health()`. Map them in `HEALTH_TO_TELEMETRY` or straight
   into `feed_view()` for a node. Then MUST 4's `NOT REPORTED` turns into numbers, and the 15-minute rate chart can
   come from the node's history. Document the fields in `docs/api` (node protocol page).
2. **Tile timer grammar matches the strip.** The tile shows `00:03.7` beside a footer frame showing `0:03`. Drop the
   leading zero in the tile (`0:03.7`, and `12:34.5` past ten minutes), so both timers share the `m:ss` grammar. The
   tenths stay on the tile, because it is the selected instrument.
3. **Spectrum rulers merge close numerals.** In the Feeds inspector (`offBankLabels` / SpectrumPlot ruler) and on
   the Live Ops wall at 1920, channels 16 and 17 print on top of each other (`1647`, and `16 160.350` over
   `17 160.365`). When two numerals are closer than their width + 4 px, draw one label `16–17`, as Live Ops already
   does at 1280.
4. **SPOT keeps one left edge.** The rules under the spot bar and under the filters start at x 0. Start them at
   `var(--margin-x)` like the rest of the column (`spot.css`, `.sp__bar` border and `.sp__filters` rule).
5. **Settings transit timings head.** `STATIC AGE` and `REALTIME AGE` run together (`STATIC AGEREALTIME AGE`).
   In `BackendPanel.svelte`, right-align both numeric columns and give each `th`/`td` `padding-left: 16px`.
6. **Plurals.** `ON 1 FEEDS` (Feeds hero) and `1 FEEDS` (Map readout) become `1 FEED`. Grep for
   `FEEDS` built from a count, and use the count to choose the word.
7. **Docs link text.** The docs say `auth.md`, `rest.md` and `live-websocket.md` as link text, which reads as a file
   listing in a product page. In `docs/api/*.md`, use page titles (`Authentication and roles`) as the link text.
   At 390, let table cells wrap (`white-space: normal`) so the two-column contents table does not run off the edge.
8. **Transit counts agree.** The tab says `TRANSIT FEEDS 19` and the hero says `17/18 FRESH`. If the hero leaves out
   lines-only or disabled sources on purpose, show it: `17/18 FRESH · 1 OFF`. If not, count the same set.
9. **Line labels as leader obstacles.** MUST 1 leaves out the rotated line names (`CSX METROPOLITAN SUB`), because an
   axis-aligned box around a diagonal name would block too much. Test the label box against the glyph polygon
   (`namePoly`) with a polygon–rect overlap, and add them.
10. **Footer audio toggle breathing room.** At 1920, the toggle sits 6 px from the window edge, closer than anything
   else in the chrome. Use `margin-right: calc(var(--margin-x) - 22px)` (10 px at 1920), so its glyph lines up with
   the bar's fullscreen chip above it.

## LATER

1. A screenshot diff of the bar band and the footer band across all routes in CI (the direction's "done when" for
   B), so a later lane cannot drift a pixel.
2. A playwright check that `docs` and `mermaid` chunks are absent from every non-Docs route (G "done when"), run on
   the build output.
3. Node picker site names: they render in the read font, mixed case. The spec said label font, uppercase. Mixed
   case reads better for long proper names, so leave it, and fold it into the brief's typography table next time
   it is revised.
4. The map's TRAINS IN VIEW table clips a half row at its bottom edge at 1920. Snap its height to whole 25 px rows.

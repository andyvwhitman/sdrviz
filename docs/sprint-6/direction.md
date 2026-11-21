# SPRINT 6: ONE SHELL, LIVE OPS TIDY-UP, FEEDS TABS, MAP LEADERS, API DOCS (lane D)

**From:** gmunk-director, a creative director persona inspired by GMUNK's published work. It is not the person.
**To:** the frontend engineers of lanes B, C, E, F, G. Lane A (sessions, clock) has no design content here.
**Date:** 2026-11-20. The owner referred every design decision of this sprint to me; nothing below is open.
**Read with:** `docs/decisions.md` rows 72 to 79; `docs/sprint-6/sprint-6.md`; `docs/sprint-5/direction.md` (still
in force where this file does not replace it); `docs/sprint-4/liveops-direction.md`; brief §3 (tokens), §4 (type),
§7 (motion), §11 (do / don't). Phone floors still hold: data 13 px, row primaries 15 px, touch targets 44 px.

Breakpoints are **real CSS pixels of the window**: 1920 and 1280 (desktop), 390 (phone). The shell has one switch
at **900**: at 900 and wider it is the desktop shell, under 900 it is the narrow shell.

---

## Design decisions (this sprint)

| # | Decision | In one line |
|---|---|---|
| D1 | The shell is never scaled | Bar and footer are drawn at 1:1 CSS px on every route. On Map and Settings the Stage scales the content box only. |
| D2 | One bar, 36 px | It is Map's bar as it looks on a laptop today (stage scale about 0.8), fixed as real pixel numbers. Under 900 it is 44 px with a menu. |
| D3 | One footer, 32 px | Contents, left to right: key-up strip, status message, short title block, audio toggle. Under 900 it is 44 px, pinned to the bottom. |
| D4 | Frames show MHz and the time keyed so far | The running duration in whole seconds (`160.920  0:12`). The start clock goes in the tooltip and the ARIA label. |
| D5 | Frame click opens the frequency in Live Ops | `/live?select=<frequency_id>`. It never changes which node is listened to. |
| D6 | Every floating key-up marker goes | Map ON AIR list, PhoneOnAir, the KEYED header chip and the Live Ops `▲ n KEYED` edge chips. The Live Ops hero stays: it is the page's datum, not a marker. |
| D7 | One drawn glyph set | `Glyph.svelte`, 16 named SVG glyphs. Left-pointing glyphs are their right-pointing twins mirrored, so pairs always match. |
| D8 | The node picker is a dropdown on the feed name | It replaces NodeTabs on Live Ops, on desktop and phone. The feed's details move to an item inside the dropdown. |
| D9 | Live Ops is two tiles wide by default | The tile minimum is 320 px, the bank defaults to 672 px and the pane takes the rest (360 to 960 px). Previously saved pane widths are discarded once. |
| D10 | The tile timer drops to 18 px | It sits on the AAR row and has its own 96 px reserved. The AAR no longer steps down. |
| D11 | Frequencies keeps one aggregate `ON` column | It replaces the per-node columns and is read-only. Editing happens in the drawer and on the detail page. |
| D12 | Feeds is fluid, with tabs and a split | Tabs `SDR FEEDS` / `TRANSIT FEEDS`, list 1/3 and detail 2/3 with the Live Ops divider, and `+ NEW FEED` at the top-left of the list on both tabs. Under 1024 px it shows one pane at a time. |
| D13 | SPOT is left-packed | One left edge, a content column of at most 1216 px, nothing pushed to the right edge. |
| D14 | Train labels hang on 45° leaders | Each label goes in the quadrant with the fewest neighbouring trains within 96 px. There is hysteresis of 2, and it is frozen during gestures. |
| D15 | Docs is a page route, not a tab | `/docs/<page>`, linked from a Settings card. It is not in the top menu, and the Q-Y hotkey row is unchanged. |
| D16 | Docs code is monochrome | No syntax colours: hue in this app means state. Mermaid uses the HUD neutrals only. |

---

## 0. Global rules

1. **Colour meanings are unchanged.** Orange (`state-tx`) means a live key-up and nothing else. Cyan (`state-idle`) means armed or enabled. Red only for a present fault or a failed action you can retry.
2. **New tokens: none.** Existing tokens change value only where §B says so (`--header-h`, `--status-h`).
3. **No OS glyphs** (§B.6). Words in the label font, uppercase; numbers in mono; MHz always to 3 decimals.
4. **`prefers-reduced-motion: reduce`** turns every animation in this file into an instant change, with no holds.
5. **Viewing choices stay in the browser** (decision 73, lane A). Everything this file says to remember (the split
   fraction, the open tab) goes in `localStorage`, read inside try/catch, with the default used on failure.

---

## B. Shell (decisions 72, 77)

### B.1 Why Live Ops and Frequencies have the bigger bar
`routes.ts` gives Live Ops and Frequencies `layout: "fluid"`, so `AppShell` renders at 1:1 CSS px: a 44 px bar, a 21 px
mark and 15 px tabs. Map, Feeds and Settings are `layout: "stage"`, so `AppShell` sits **inside** `<Stage>`, and the
whole 1920 × 1080 design is scaled by `min(windowH / 1080, windowW / 1728)`. A laptop browser window (about 1440 × 870 inner)
gives about **0.8**, so Map's bar measures about 35 px and its type about 12 px. SPOT and Frequency (`layout: "page"`) use a third
header, `PageShell`'s, with the nav pushed to the right. The bar's size therefore depends on which layout a route uses, and that is the bug.

### B.2 The fix (MUST)
1. New `lib/components/ShellBar.svelte` and `lib/components/ShellFooter.svelte`. `AppShell` and `PageShell` both render
   them and nothing else as chrome. The header and status markup of `PageShell` (`.pg__head`, `.pg__status`) is deleted.
2. **The shell leaves the Stage.** For a stage route with a shell, `App.svelte` renders
   `<div class="hud-stage hud-stage--fluid"><AppShell {route} staged>…</AppShell></div>`. With `staged`, `AppShell` wraps the
   screen in `<Stage fit="box">` inside `.hud-content`. Login keeps `<Stage fit="window">` as it is today.
3. `Stage fit="box"` scales the **content box**. Its design size is the old content box:
   `designH = stage height − 96` (984, or 804 at `?size=1440`), and `designW = params.size − 64` (1856 or 1376). The scale is
   `min(boxH / designH, boxW / (designW × 0.9))`, and `stage.width = round(boxW / scale)` now **names the content width**.
   Measure the box with a `ResizeObserver`, not the window.
4. Staged content box: `left/right: var(--margin-x)`, `top: calc(var(--header-h) + 12px)`, `bottom: calc(var(--status-h) + 12px)`.
   In `screens/map/Screen.svelte`, replace `stage.width - 64` with `stage.width`. Feeds stops being staged (§E). Settings
   needs no change (`.st` is `inset: 0`).
5. Token values: `--header-h: 36px; --status-h: 32px`. Under 900: `@media (max-width: 899px) { :root { --header-h: 44px; --status-h: 44px; } }`.
   Every sticky offset that already uses these tokens follows on its own.
6. `AppShell`'s `narrow` uses `viewport.width` on every route (`<= 1440`), because the bar is never scaled.

### B.3 The one bar (MUST)
Desktop (≥ 900), height 36, `bg-void`, a 1 px `grid` bottom rule, padding `0 var(--margin-x)`. Its grid is
`var(--nav-x) auto minmax(0, 1fr)` with a 24 px gap, and `--nav-x: 232px`.

| Part | Spec |
|---|---|
| Mark `SDRVIZ` | 600 17px/1 `--font-display`, tracking 0.16em, `ink` |
| Screen name | 500 12px/1 label font, `--track-label`, uppercase, `ink-2`; hidden when `narrow` (≤ 1440) |
| Nav tabs | `HeaderNav`, bottom-aligned. Tab height 26, label 600 12px, tracking 0.12em, padding `0 16px 0 12px`, chamfer 6px. States as today (`tab--bare`). Nav order and Q-Y keys unchanged. |
| Chips | `.hud-header .chip { height: 24px; padding: 0 8px; font-size: 12px; --arm: 3px }`, glyph 12 px. FEEDS, ASR, DISK, HOST and transit chips as today, compacted when `narrow`. **The KEYED chip is removed:** delete `txChip` from `headerChips` and the `keyed` branch of `compactChips`. |
| Clock | 400 13px mono, `ink`, button (UTC toggle) as today |
| Fullscreen | 24 × 24 icon chip, SVG 13 px, `F` key as today |

On a route that is not in the nav (Frequency, Docs), no tab is selected. Nothing else changes.

**Narrow bar (< 900),** height 44, padding `0 16px`, laid out as `PageShell`'s phone header is today: mark, screen name, a
spacer, the short clock (`20:13`), then the 44 × 44 menu button with the sheet under it. No chips and no nav. The narrow bar is
used by every route, Live Ops and Frequencies included.

### B.4 The one footer (MUST)
Desktop (≥ 900): height 32, `bg-void`, a 1 px `grid` top rule, padding-left `var(--margin-x)`, one flex row with `align-items: center`:

1. **Key-up strip** (§B.5). Zero width when nothing is keyed. When it is not empty, a 1 px × 16 px `line-faint`
   rule follows it, with a 12 px gap on each side.
2. **Status message:** `StatusLine` exactly as today, the same text rules and fault tone. Mono 400 12px, `ink-2`,
   `flex: 1; min-width: 0`, one line, ellipsis.
3. **Title block, short:** `WLT-1 · SCREEN <name> · <scope k> <scope v> · BUILD <b> [SIM]`, and `© OpenStreetMap
   contributors` on Map. **The clock leaves the title block** (it is in the bar). k and v are 12px, height 32,
   with the existing hairline cells. Under 1440 only `BUILD <b> [SIM]` and the OSM credit remain.
4. **Audio toggle:** `AudioToggle` 28 × 28, `margin: 0 6px 0 0` (no auto margin: the status message is the flexible part).

**Narrow footer (< 900):** height 44. On every page-layout route it is `position: sticky; bottom: 0; z-index: 14` (today only
Live Ops does this). Padding-left 16. Contents: strip or status message, then the audio toggle at 44 × 44. While anything
is keyed, the strip takes all the width left of the audio toggle and the status message is hidden. When the air goes quiet,
the status message returns. No title block.

`PhoneOnAir.svelte`, `OnAirList.svelte` and their CSS (`.oa*`, `.mp-onair*`) are deleted. So are the Live Ops
`.lo-edge` chips and `measureEdges`.

### B.5 The key-up strip (MUST)
New `lib/components/KeyupStrip.svelte`, inside `ShellFooter`.

**Data.** Every row of `live.state.active_transmissions`, over every feed, gives **one frame per `frequency_id`**:
the earliest start wins, and the other feeds go in the tooltip. The frames are ordered by key-up start, oldest on the left,
and a new frame is appended on the right. Elapsed time comes from lane A's server clock helper, the same one the tile timer uses.

**Frame (desktop):** a `<button>`, 24 tall and **112 wide (fixed, so nothing jitters)**, padding `0 8px`, 4 px gap between frames,
`background: var(--wash-tx-surface)`, `box-shadow: inset 0 0 0 1px var(--state-tx)`, square corners. Content:
`160.920` (500 12px mono, `state-tx`), an 8 px gap, then `0:12` (400 12px mono, `state-tx`, `tabular-nums`, **whole
seconds**: tenths would make a row of ticking numbers exhausting). MHz comes from the frequency
(`snapshot.channels` by id, else the AAR table), to 3 decimals.
**Frame (narrow):** 32 tall, 128 wide, mono 14px. The 44 px footer is the touch target.

**Width.** The strip is `display: flex; overflow-x: auto; scrollbar-width: none` (also hide `::-webkit-scrollbar`).
Desktop: `max-width: 66.667%` of the footer. Narrow: all the width left of the audio toggle. When content is hidden at
an edge, that edge gets a 24 px fade (`mask-image` linear gradient), and only that edge. A vertical wheel over the strip
scrolls it sideways. When a frame enters, the strip scrolls to its right end, unless the pointer is over the strip or a
frame has focus.

**Motion.**
- *Enter:* width 0 → full over `--t-commit` (250 ms) `--ease-instrument`. The stroke is `state-tx-hot` for `--t-flash` (120 ms),
  then `state-tx`. The text fades in over `--t-micro` (80 ms) once the width has settled.
- *Leave (dormant):* stroke and text turn `state-recent` and hold for `--t-settle` (400 ms). Then width → 0 and
  opacity → 0 over 400 ms `--ease-in-out`. The frames on its right close up to the left because the width collapses
  (a flex row: no FLIP needed). A frame whose frequency keys again during the hold goes straight back to orange.
- *Reduced motion:* no width animation and no hold. Frames appear and disappear.

**Click / Enter / Space:** `router.go("/live?select=<frequency_id>")` (keep the global query). On Live Ops itself, call the
same `selectChannel` path. The existing effect scrolls the tile into view, and on the phone the pane layer opens.

**Accessibility.** The strip is `role="list"` with `aria-label="Keyed now"`, and each frame is `role="listitem"` wrapping the button.
Button `aria-label="160.920 MHz, CH54 AMTK NEC, keyed 12 seconds, since 20:13:07 · open in Live Ops"`, and
`title` the same, with `VIA SDR-01, SDR-02`. A visually hidden `aria-live="polite"` node announces `KEYED 160.920` on enter,
and nothing on tick or leave. Focus ring: 1 px `state-select`, offset −3 px.

### B.6 Own the glyphs (decision 77) (MUST)
New `lib/components/Glyph.svelte`: `name` and `size` props (px, default 12), `viewBox="0 0 16 16"`, `aria-hidden="true"`,
`focusable="false"`, `display: inline-block; flex: none; vertical-align: -0.1em`. Stroke glyphs use `fill: none;
stroke: currentColor; stroke-width: 1.25; stroke-linecap: square; stroke-linejoin: miter`, and filled glyphs use
`fill: currentColor; stroke: none`. Colour is always inherited. **Mirrors** are the right-pointing path with
`transform: scaleX(-1)` about the centre (`transform-origin: 8px 8px`), so a pair can never differ.

| name | path (16 × 16) | replaces |
|---|---|---|
| `chevron-right` | `M6 3.5L10.5 8L6 12.5` | `›` (open links, table open), `▸` (disclosure closed, pane next) |
| `chevron-left` | mirror of `chevron-right` | `‹` (back), `◂` (pane previous) |
| `chevron-down` | `M3.5 6L8 10.5L12.5 6` | `▾` (selects, disclosure open, SPOT bar) |
| `chevron-up` | `M3.5 10L8 5.5L12.5 10` | `▴` |
| `caret-up` (filled) | `M8 4L12.5 11H3.5Z` | `▲` (sort ascending) |
| `caret-down` (filled) | `M8 12L3.5 5H12.5Z` | `▼` (sort descending) |
| `arrow-right` | `M2 8H13M9 4L13 8L9 12` | `→`, `▶` as a direction (SPOT DIR, timeline lanes, FROM → TO, trip panel) |
| `arrow-left` | mirror of `arrow-right` | `←`, `◀` |
| `arrow-up` | `M8 14V3M4 7L8 3L12 7` | spare, for vertical motion |
| `arrow-down` | `M8 2V13M4 9L8 13L12 9` | spare |
| `arrow-up-right` | `M5 11L11 5M6 5H11V10` | `↗`, external links (Docs) |
| `play` (filled) | `M5 3L13 8L5 13Z` | `▶` as a play button (TranscriptRow) |
| `pause` (filled) | `M4 3h2.5v10H4zM9.5 3H12v10H9.5z` | any text pause |
| `close` | `M4 4L12 12M12 4L4 12` | `×` |
| `search` | `M7 2.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9M10.5 10.5L14 14` | `⌕` |
| `more` | three 2 × 2 squares at x 3, 7, 11, y 7 | `⋯` (the tile's drawn squares stay as they are) |

Sizes: inline after text 12 px with a 6 px gap. Sort carets 10 px with a 4 px gap. Pane steps and close 16 px in 32 × 32
buttons. SPOT direction 14 px. A string that carried an arrow (`route()` in TrainRows, `→ {toClock}`) becomes markup:
text segments with `<Glyph name="arrow-right" />` between them.

**Stays as typography:** `·` (separator), `—` (blank), `≈`, `~`, `−`, `±`, `©`, `+` (in `+ NEW FEED`), `%`.

**Sweep:** every occurrence in the inventory above (`frontend/src`, about 60 sites: `›‹→▾×▸▲▶▼⌕◀↗◂⋯▴←□`, the last only in
gesture text, where it becomes the word `BOX`). Grep `backend/` too for these characters in user-visible strings (status lines,
chip text) and replace them with words. Add `src/lib/noGlyphs.test.ts`: it fails if any `.svelte` or `.ts` file under `src`
(tests excluded, and lines whose trimmed text starts with `//`, `*` or `/*` skipped) contains a character in U+2190–21FF,
U+2300–23FF, U+25A0–25FF, U+2600–27BF, U+2B00–2BFF, ≥ U+1F000, U+FE0F, or one of `‹ › × ⋯`.

### B.7 SPOT stops right-justifying (MUST)
On desktop (≥ 900), the page reads from one left edge, `var(--margin-x)`. `.sp` gets `max-width: calc(1216px + 2 * var(--margin-x))`,
and the window to its right stays empty `bg-void` (the bar and footer still run full width).
1. Top block: `grid-template-columns: 460px minmax(0, 756px)`, areas `"bar hero" "timeline timeline"`, `justify-content: start`.
   The spot bar comes **first** (the phone order: bar, then hero), with a 1 px `grid` rule on its **right**. The hero is left-aligned.
2. Filters row: `.sp__count { flex: none }`, then OPERATOR 24 px after it. Nothing has an auto margin.
3. Table (`TrainRows`, ≥ 900): FROM → TO becomes `minmax(160px, 1fr)` inside the 1216 column. Every other column is
   unchanged, packed from the left.
4. Direction: `NORTHBOUND` + `arrow-right` 14 px when `side === "left"`, and `arrow-left` + `NORTHBOUND` otherwise. Timeline
   lanes: `{tag} <arrow-right>` and `<arrow-left> {tag}`. With no tag, the arrow is drawn alone (no doubled arrow).
5. SPOT bar caret: `chevron-down` / `chevron-up` 12 px.
6. Phone (390): unchanged except the glyphs.

**Done when:** at 1920, 1280 and 390 every page shows the same 36 px (44 px phone) bar and the same footer. Map's bar
pixels equal Live Ops' bar pixels exactly (screenshot diff of the bar band). A real key-up shows one orange frame, which
leaves and closes up. No emoji anywhere on iOS Safari. The glyph test passes.

---

## C. Live Ops and Frequencies (decisions 74, 76)

### C.1 The tile's orange text (MUST)
The offender is `.tile__timer` in `lib/styles/tile.css`: 500 **32 px** mono at `right: 8px; top: 30px` (24 px at
`top: 3px` in the compact tile, where it runs over the label). New rules for the standard tile (the only desktop variant now):

1. `.tile__timer { right: 8px; top: 32px; width: 96px; text-align: right; font: 500 var(--fs-18)/24px var(--font-data);
   font-variant-numeric: tabular-nums; }`. The tile's local `--fs-18` is 18 px. It stays `state-tx`.
2. **The AAR no longer steps down in TX.** Delete the `.tile[data-tx] .tile__aar` font-size rule, `@keyframes lo-aar-lock`
   and its use. In TX: `.tile[data-tx] .tile__aar { max-width: calc(100% - 120px); overflow: hidden; text-overflow: ellipsis; }`.
   The commit still flashes the frame for 120 ms while the timer waits (the existing `visibility: hidden` rule stays).
3. Label: idle `max-width: calc(100% - 152px)` (so the status readout keeps its room), TX `max-width: calc(100% - 48px)`.
4. Phone row (`.hs .tile--compact .tile__timer`): `font-size: 18px; line-height: 24px; top: 36px; right: 140px`.
5. Check: no text box overlaps another at a tile width of 320 with a `12:34` timer, a `·2` suffix and a 20-character label.

### C.2 Density goes (MUST)
Delete the DENSITY chip, `densityChip`, `autoCompact`, `AUTO_COMPACT_BELOW_PX`, `liveOpsPrefs.density` and `.lo-density`.
The desktop always uses `standard`. A short tile area scrolls, as it already does. `compact` survives only as the phone row.

### C.3 Two frequencies wide (MUST)
1. `.lo .tile-grid { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }`, and `.lo__tiles` gets `scrollbar-gutter: stable`.
2. Default pane: `--pane-w: clamp(360px, calc(100cqw - 696px), 960px)` (the bank defaults to 2 × 320 + 8 gap + 8 padding +
   16 gutter = 672 px, plus the 24 px gutter). In `layout.ts`: `panePx(null, w) = clamp(w − 696, 360, 960)`, `TILE_COLUMN_PX = 328`,
   `tileColumns = max(1, floor((w − 24 − pane − 8) / 328))`. Update the tests to pin these figures.
3. Saved pane fractions from before this sprint are discarded once: bump the prefs storage key, then read `wall` from the old
   key (it stays valid) and not `pane`.

| Window | Content (frame) | Pane | Bank | Columns |
|---|---|---|---|---|
| 1920 | 1856 | 960 | 872 | 2 (each 428) |
| 1280 | 1216 | 520 | 672 | 2 (each 324) |
| 1024 | 960 | 360 | 576 | 1 |
| 390 | handset | layer | full width | 1 row list (unchanged) |

Dragging the divider still changes the column count. The readout stays `PANE 960 · 2 COLUMNS`.

### C.4 Detail pane previous / next (MUST)
In `FrequencyPane.svelte`, both buttons are 32 × 32 and draw `Glyph` 16 px: `chevron-left` (the mirror) and `chevron-right`,
in `ink-2`, hover `ink`, focus 1 px `state-select` inset. A 1 px `grid` rule sits between them. `aria-label` and `title`:
`Previous frequency ([)` / `Next frequency (])`. The `×` becomes `close` 16 px, and `OPEN FULL PAGE ›` becomes text plus
`chevron-right` 12 px.

### C.5 The feed name opens the node picker (MUST)
**Decision: one picker.** NodeTabs is removed from Live Ops (desktop `.lo__tabs` row and phone `.hs__tabs`), and
`NodeTabs.svelte` is deleted. The tile box gains the 40 px. The tabs and the hero chip did the same job twice.

**Trigger.** In `HeroStrip`, the existing chip is `FEED · SDR-01` + `chevron-down` 12 px. It keeps its kind
(active, degraded or fault), and gets `aria-haspopup="menu"` and `aria-expanded`. A click opens the menu, **not** the inspector.

**Menu** (`lib/components/NodePicker.svelte`, the `.lo-menu` look: `bg-raised`, line corner brackets, z 25). It opens
under the chip, right edges aligned, 360 px wide, max 8 items tall, then it scrolls.
- Head row 28: `LISTEN TO` (label 500 `--fs-11`, `ink-3`) and, on the right, `3 NODES` (mono `ink-3`).
- One item per node in `feeds_listenable` order, 40 tall, `role="menuitemradio"`, `aria-checked`. Columns: `PositionGlyph`
  16 (`tx` if one of its frequencies is keyed, else its state, else none), short name (600 `--fs-13` label, `ink`), site
  (500 `--fs-12` label, `ink-2`, ellipsis, flex), then on the right either `8 ON` (mono `ink-2`) or the state word
  `STALE` / `OFFLINE` / `FAULT` in `state-stale` / `ink-3` / `state-fault`. Checked: `ink` text and a 2 px `state-select` inset bar on the left.
- A 1 px `grid` rule, then two link items 32 tall: `SDR-01 DETAILS` + `chevron-right`, which opens the existing
  `FeedInspector` for the listened node (the old behaviour of the chip, one step away), and `ALL FEEDS` + `chevron-right`, which goes to `/feeds?feed=<id>`.
- Choosing a node calls lane A's per-connection listen op. **Any signed-in user may choose** (it is a viewing choice, decision 73).
  The menu closes and the listen flash shows as today.
- Keys: Enter, Space or ArrowDown on the trigger opens the menu with focus on the checked item. Up and Down wrap; Home and End;
  Enter or Space chooses and closes; Esc closes; Tab closes. Focus always returns to the trigger. A click outside closes it.

**Phone (handset).** The tabs row becomes one 44 px row button across the width: glyph, `SDR-01`, `· 8 ON`, a spacer,
`chevron-down` 16. The same menu opens under it at full width, with 48 px items. It sits in the existing sticky `.hs__top`.

The `+1 ON SDR-02` chip stays as it is.

### C.6 Frequencies table without node columns (decision 76) (MUST)
1. Delete the per-node heads and `AssignSlot` cells from `FrequencyTable`, and `--nodes` from `--fr-cols`. Keep the NODE filter chips.
2. **One new column, `ON`, 64 px, read-only,** between LINE and open:
   - NODE ALL: an 8 px filled `state-idle` square + `2` (mono `ink`) = enabled on 2 nodes; an 8 px hollow `line-faint`
     square + `0` (`ink-3`) = assigned, enabled nowhere; `—` `ink-3` = unassigned.
   - A node chosen in the filter: the head reads that node's short name (`SDR-01`), and the cell shows `■ ON` / `□ OFF` / `—`, drawn as the boxes
     above (never characters).
   - It sorts (`aria-sort`) with the enabled count descending first, ties by MHz.
3. Columns: `24px 88px 56px minmax(160px, 0.5fr) 140px 120px minmax(0, 1.5fr) 64px 32px`. Under 1280 LINE hides; under 1024 USE
   hides (as today). `min-width: 704px`.
4. Sort arrows: `caret-up` / `caret-down` 10 px. The open link `›` becomes `chevron-right` 12 px. Search `⌕` becomes `search` 14 px.
5. Phone rows: the right-hand slots become the same `ON` cell (`■ 2`).
6. Editing nodes: the admin drawer's NODES section, unchanged. On `/frequency/:id` the identity block gains a read-only line
   `NODES  SDR-01 ON · SDR-02 OFF` (label `ink-3`, values mono, ON in `ink`, OFF in `ink-3`). For an admin it is followed by
   `EDIT NODES` + `chevron-right`, which goes to `/frequencies?edit=<id>`. If the identity block already shows this, keep it and add the link.

**Done when:** at 1920 and 1280 Live Ops opens two tiles wide; a keyed tile at 320 px has no overlapping text; there is no DENSITY
anywhere; the arrows are pixel-identical mirrors; the feed chip opens the picker on mouse and on keyboard; Frequencies shows no node columns.

---

## E. Feeds (decision 75)

### E.1 Route and frame (MUST)
`feeds` becomes `layout: "fluid", phone: "page"` (no more Stage, no more plate). `feedsColumns`, `breakpoints.ts`, the
`fb-right`/`is-stacked` machinery and **`HostCard` (the HOST · BACKEND card) are deleted.** BACKEND stays only in Settings.
UI wording: `TRANSIT SOURCES` becomes `TRANSIT FEEDS`, and `+ ADD SOURCE` becomes `+ NEW FEED`.

### E.2 Anatomy (desktop, ≥ 1024 wide)
```
┌ bar 36 ──────────────────────────────────────────────────────────────────────────────┐
│ hero 64  FEEDS 3/4 NOMINAL · worst feeds · TRANSIT 7 ›                                │
│ [SDR FEEDS 4][TRANSIT FEEDS 7]                                          tabs 36       │
├───────────────────────────┬┬──────────────────────────────────────────────────────────┤
│ [+ NEW FEED]        40    ││ detail (max 880 wide, left-aligned, scrolls)            │
│ card                      ││                                                          │
│ card (selected bracket)   ││                                                          │
│ … list scrolls            ││                                                          │
└ footer 32 ────────────────┴┴──────────────────────────────────────────────────────────┘
```
1. `FeedsHero` stays (64 px). Its transit item becomes a button that **switches to the TRANSIT FEEDS tab** (`onshowtransit`).
2. Tabs: `Tabs` component, `--tabs-h` 36, items `SDR FEEDS` with `n` = feed count and `TRANSIT FEEDS` with `n` = source count
   (shown as `—` for a viewer or before the list loads). `role="tablist"`, Left and Right move between tabs, and each panel is `role="tabpanel"`.
   The URL holds `?tab=transit` (the default `sdr` is omitted). A 1 px `grid` rule runs under the tab row, full width.
3. **Split, identical on both tabs:** list | divider (16 px gutter, the Live Ops `Divider`, moved to `lib/components/Divider.svelte`,
   `orientation="vertical"`, `grows={1}`) | detail. The default list width is `(W − 16) / 3`, min 280, max `W − 16 − 480`. Remembered as a
   fraction in `localStorage["sdrviz.feeds.split"]`, **one value for both tabs**. Double-click or Enter on the divider resets it.
   Readout `LIST 613`.
4. **List pane:** a 40 px toolbar holding `+ NEW FEED` (`Button sm`) **at its left**, for admins on both tabs. For a viewer the
   toolbar is not drawn. Below it, cards fill 100% of the list width with a 12 px gap. The list scrolls in its own box (6 px padding
   so selection brackets show, thin scrollbar).
   - SDR: `FeedCard` as today, at fluid width. Fix any fixed widths inside it.
   - TRANSIT: `SourceCard` without its EDIT / REFRESH / DELETE buttons (they move to the detail). It keeps its enable toggle and gets
     the FeedCard selected bracket. Click selects it: `?source=<id>`.
5. **Detail pane:** it scrolls in its own box. Content is left-aligned, `max-width: 880px`.
   - SDR: `FeedInspector`, `FeedForm` or `ReceiverForm`, exactly as today.
   - TRANSIT: new `SourceDetail.svelte`. Head: name, kind and enable toggle. Then every readout `SourceCard` had (state, last fetch,
     age, vehicle and trip counts, last error in `state-fault`, URL in mono `ink-2` with ellipsis). Then an action row: `EDIT`, `REFRESH NOW`,
     `DELETE` (with SourceCard's existing confirm). `EDIT` swaps the pane to `SourceForm`.
   - `+ NEW FEED` opens the blank form (FeedForm / SourceForm) in the detail. At the top of the list it adds a provisional item `NEW FEED`
     with a **dashed** `line-faint` bracket (pending geometry), selected, which goes away on save or cancel. `?new=1`.
6. Selection: the first item is selected when nothing in the URL names one. The selection on each tab is kept while you switch tabs.

### E.3 Empty and failed states (MUST, `EmptyState`, in the list pane under the toolbar; the detail pane stays an empty bracketed frame)
| Tab | When | Title | Detail |
|---|---|---|---|
| SDR | no feeds | `NO SDR FEEDS` | `Enrol a node in Settings, or add a receiver with + NEW FEED.` |
| TRANSIT | none | `NO TRANSIT FEEDS` | `Add a GTFS, GTFS-RT, Amtraker or lines feed to put trains on the map.` |
| TRANSIT | request failed | `TRANSIT FEEDS UNAVAILABLE` | `The backend did not answer. Retrying every 5 s.` |
| TRANSIT | viewer | `ADMIN ONLY` | `Transit feeds are set up by an admin.` (`ink-2`, never red) |

### E.4 Narrow (< 1024) and phone (390) (MUST)
Under 1024 wide the screen shows **one pane at a time**: the list at full width, then the detail. Under 768 this is the page layout,
with document scroll. The tab row is sticky under the bar (`top: var(--header-h)`, 44 px tabs on the phone), and the toolbar sits under it.
Tapping a card opens the detail as a full-screen layer (the Live Ops pane-layer pattern): a history entry, the list stays mounted and
`inert` so its scroll survives, and the layer bar is 44 px with `chevron-left` + `SDR FEEDS` (or `TRANSIT FEEDS`) on the left. Back, the
bar button and Esc all return to the list. Forms open in the same layer. No divider.

**Done when:** both tabs are pixel-identical in structure at 1920 and 1280, the split survives a reload, `+ NEW FEED` is at
the same x/y on both tabs, HOST · BACKEND is gone, and at 390 list → detail → back keeps the list's scroll position.

---

## F. Map train leaders (decision 78)

Scope: the **real-train labels** (`LiveTrains.svelte`, `.mp-vlabel`, today drawn at `x + 16, y + 4` with no leader), in both the geo view
and the schematic view. The sim data blocks (`blockPlacer`, `schematicLayout`) are unchanged.

### F.1 Geometry (scale 1; multiply every length by the mark's `scale`, 0.7 when crowded)
- The leader starts on the 45° diagonal 13 px from the mark's centre (2.5 px off the 10.5 px ring), at `(±9.2, ±9.2)`.
- **The diagonal runs 28 px in x and 28 px in y** (39.6 px long) to the elbow at `(±37.2, ±37.2)`.
- **The shelf** runs horizontally outward from the elbow for `labelWidth + 8` px.
- **The label sits on the shelf:** baseline 4 px above the shelf line, starting 4 px past the elbow. Right quadrants use
  `text-anchor="start"` at `elbow.x + 4`; left quadrants use `text-anchor="end"` at `elbow.x − 4`. Measure `labelWidth` with the existing placer measure (`lab11`/tracked).
- Line: `s-hair k-ink3` (1 px `ink-3`, the established "never reads as track" leader). Label: `.mp-vlabel`, plus a halo
  `paint-order: stroke; stroke: var(--bg-void); stroke-width: 3px; stroke-linejoin: round`.
- Stale train: label `ink-3`, leader unchanged. Selected train: leader and label `state-select`.
- The label and the shelf are part of the mark's hit group: clicking either selects the train.

### F.2 Quadrant rule (simple, deterministic, stable)
1. The candidates, in tie-break order, are **UR, DR, UL, DL**.
2. For each named train, count the other **drawn** trains (named or not) within **R = 96 px** (screen distance) in each quadrant, by the sign
   of `dx` and `dy`. A neighbour exactly on an axis counts in both quadrants beside it.
3. A quadrant is excluded if its label box (the shelf end, with a 12 px margin) would leave the canvas.
4. Pick the lowest count, breaking ties by the order in step 1.
5. **Hysteresis:** keep the train's previous quadrant (`Map<vehicleId, quadrant>`) unless it is now excluded, or the best count is at
   least **2 lower** than the previous quadrant's count. Forget an id after it has not been drawn for 60 s.
6. **Frozen while moving:** while a pan or zoom gesture is active (pointer down, or a wheel event within the last 250 ms) and during the
   geo ↔ schematic morph (`0 < u < 1`), no train changes quadrant. Evaluate again once it settles.
7. Put it in a pure function, `chooseQuadrant(points, prev, canvas)` in `screens/map/lib/leaders.ts`, with unit tests: an
   isolated train → UR; a neighbour at UR → DR; hysteresis holds at a difference of 1 and switches at 2; the right edge → UL.

### F.3 Motion
A quadrant change happens rarely, because of the hysteresis. The old leader and label fade out over `--t-flash` (120 ms). The new
diagonal draws outward from the mark over `--t-commit` (250 ms) `--ease-instrument` (stroke-dashoffset), then the shelf and label
fade in over `--t-micro`. Reduced motion: an instant cut. Thinning by `NAME_CELL` and the zoom thresholds stays as it is.

**Done when:** at the national and the Baltimore–Washington zooms no two real-train labels overlap where today they did, a panned map shows
no labels flapping, and the tests pass.

---

## G. Docs page (decision 79)

### G.1 Route and source (MUST)
- Route: `{ id: "docs", path: "/docs", name: "DOCS", dir: "docs", shell: true, layout: "page", prefix: true }`. Not admin-only.
  Signed in, as every route. **Not in `NAV`**: the top menu is the operator's instrument row with its Q-Y keys, and the docs are reference.
- Pages: `docs/api/NN-slug.md`, ordered by `NN`. The title is the first `# H1`. `/docs` shows the first page; `/docs/<slug>` shows a page;
  `#<heading-id>` scrolls to the heading. Bundle them with a lazy `import.meta.glob` of the repo's `docs/api/*.md` with
  `{ query: "?raw", import: "default" }` (relative to the screen file, e.g. `../../../../docs/api/*.md`), and add the repo root to
  Vite's `server.fs.allow` so dev serves them.
- Libraries: `marked` (GFM: tables, fenced code) and `mermaid`, both well-supported. Pin exact versions. Import Mermaid
  **dynamically, only when a page has a ```` ```mermaid ```` block**. Heading ids are slugified from the text, unique-suffixed.
  Relative links between docs (`./03-websocket.md#ops`) are rewritten to `/docs/websocket#ops` and routed with `followLink`.
  External links open in a new tab with `arrow-up-right` 12 px after the text.

### G.2 Layout
**Desktop (≥ 900),** left-packed like SPOT: a nav rail **240 px**, a 48 px gap, then the article, `max-width: 760px`. The article starts at
`var(--margin-x)`, padded 32 px top and 64 px bottom. The rail is sticky at `top: calc(var(--header-h) + 24px)`, `max-height:
calc(100dvh - var(--header-h) - var(--status-h) - 48px)`, and scrolls by itself. At 1920 the right side stays empty.
- Rail: `API DOCS` (500 `--fs-11` label, `--track-label`, `ink-3`), 16 px below it the page links (500 `--fs-13`/32px label, uppercase,
  `ink-2`; current: `ink` and a 2 px `state-select` inset bar on the left). Under the current page, its H2s (400 `--fs-12`/28px read font,
  sentence case, `ink-3`, 12 px indent). The current section is `ink`, found by an `IntersectionObserver` scroll-spy.
- `<nav aria-label="API docs">`. Real `h1` to `h3`.

**Narrow (< 900, phone 390):** the rail becomes a sticky 44 px row under the bar: `CONTENTS` (`ink-3`), then the current page title (`ink`,
ellipsis), then `chevron-down` 16. Tapping it opens a sheet with the pages (48 px rows) and the current page's sections, in the
`pg__sheet` style. The article runs full width with 16 px gutters.

### G.3 Typography
| Element | Spec |
|---|---|
| H1 | `--type-title-lg`, `--track-title`, uppercase, `ink`; 24 px below |
| H2 | 600 `--fs-15` label, `--track-label`, uppercase, `ink`. Margin-top 48, padding-top 16, a 1 px `grid` rule above. Prefixed by its address `2.3` (page `NN`, H2 index) in 400 `--fs-12` mono `ink-3`, 12 px gap |
| H3 | 600 `--fs-13` label, `--track-label`, uppercase, `ink-2`; margin-top 32 |
| Body | 400 `--fs-13` (16 px)/1.6 read font, `ink`, **sentence case**; paragraphs 16 px apart; lists 24 px indent with `ink-3` markers |
| Link | `ink`, 1 px `line-faint` underline with a 3 px offset; hover underline `ink`; focus 1 px `state-select` outline |
| Inline code | 400 0.9em mono, `ink`, `bg-raised`, padding `1px 4px`, no radius |
| Code block | `bg-panel`, 1 px inset `line-faint` frame, M1 corner brackets (`.br`). Padding `28px 20px 16px`; 400 `--fs-11` (14 px)/1.6 mono `ink`; `overflow-x: auto`, thin scrollbar. Top-left: the language tag (`HTTP`, `JSON`, `PYTHON`) in 500 `--fs-11` label `ink-3`. Top-right: a `COPY` text button, which reads `COPIED` for 1.2 s, `aria-label="Copy code"`. **No syntax colours.** |
| Table | Full width of the article. Head: 500 `--fs-11` label uppercase `ink-3`, a 1 px `line-faint` bottom rule. Rows: 1 px `grid` bottom rule, cells padding `8px 16px 8px 0`, top-aligned, 400 `--fs-12` read font. On the phone it scrolls sideways inside a wrapper. |
| Blockquote / note | 2 px `line` left rule, padding-left 16, `ink-2` |

### G.4 Mermaid
`mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables })` with only HUD neutrals: background
`#04070A`, primaryColor `#081015`, primaryBorderColor `#9CC9D6`, primaryTextColor `#E4F1F5`, secondaryColor and tertiaryColor `#0C171D`,
lineColor `#8FAFBA`, textColor `#E4F1F5`, noteBkgColor `#0C171D`, noteBorderColor `#2C4A55`, noteTextColor `#E4F1F5`, actorBkg `#081015`,
actorBorder `#9CC9D6`, signalColor `#8FAFBA`, signalTextColor `#E4F1F5`, labelBoxBkgColor `#0C171D`, fontFamily `"Barlow Semi Condensed"`,
fontSize `14px`. **No cyan, orange or red in diagrams.** Each diagram sits in a `figure` with the code-block frame (no tag, no COPY),
left-aligned, `max-width: 100%`, and scrolls sideways if it is wider. The SVG gets `role="img"` and `aria-label="Diagram: <nearest heading
above>"`. If rendering fails, show the source as a code block with `DIAGRAM DID NOT RENDER` in `ink-2` above it.

### G.5 Page furniture
- At the foot of the article, after a 1 px `grid` rule: `chevron-left PREVIOUS · <title>` and `NEXT · <title> chevron-right`, side by side
  from the left, 44 px tall.
- Status message fallback: `API DOCS · <PAGE TITLE>`.
- Unknown slug: `EmptyState` `NO SUCH PAGE`, with a link to the first page.

### G.6 Link from Settings (MUST)
A new `st-card` at the **top of the right column**, above BACKEND. Head: `API` (`t-panel`), micro `FOR YOUR OWN APPLICATIONS`.
Body, one line, read font `--fs-13` `ink-2`: `REST, WebSocket and node protocol, with authentication and diagrams.`
Action row: `OPEN API DOCS` + `chevron-right` 12 px (the `Button` look, as a link), which goes to `/docs`.

**Done when:** `/docs` renders every `docs/api` page with working diagrams at 1920, 1280 and 390; there is no sideways page scroll; the rail
follows the scroll; the Settings card opens it; Mermaid is absent from every other route's bundle.

---

## Review (lane R)
I review the deployed whole against this file and the brief. I will reject, without debate: any bar or footer that differs by a pixel
between routes; any OS glyph; orange used for anything but a live key-up; a strip that jitters while it ticks; labels that flap during a pan.

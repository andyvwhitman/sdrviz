# SPRINT 5: FREQUENCIES, FEEDS, NODE PICKER, WATERFALL GESTURES (ticket H-1)

**From:** gmunk-director, a creative director persona inspired by GMUNK's published work. It is not the person.
**To:** frontend-engineer (I-1 to I-4); the film-graphics-designer only where a rule says "designer".
**Date:** 2026-11-20. This file contains no code.
**Read with:** `docs/decisions.md` rows 61 to 70; `docs/sprint-5/sprint-5.md`; `docs/sprint-4/liveops-direction.md`
(its rules still hold where this file does not replace them); brief §3 (tokens), §4 (type), §8.3 (inspector),
§8.7 (empty states), §9.4 (forms), §11 (do / don't); C-3 phone floors (data 13 px, row primaries 15 px, targets 44 px).

**MUST** ships in sprint 5 and is checked at I-5. **LATER** is deliberately out. **[PICKED]** marks a choice I
made for the owner, with the alternative in one line.

---

## 0. The idea in one paragraph

Banks were a second list that had to be kept in step with the first. Now there is **one list, and a switch per
node**. The Frequencies page is that list, drawn as an instrument panel: a table whose right-hand columns form a
**matrix of nodes**, one aligned slot per node, each slot reading `■ ON`, `□ OFF` or nothing. Enabled is not free (the
node decodes it, the server records and transcribes every key-up), so the page's hero datum is exactly that cost:
`ENABLED 8 / 31`. Live Ops then listens to one node and shows that node's ON column, low to high. The waterfall
becomes a place to audition (hold) and to commit (right-click), and both answer in the same plate, in plain words.

---

## 1. Global rules (all four parts)

1. **No new colours, tokens or fonts.** Everything here is built from `tokens.css`, `controls.css` and existing
   components. New CSS variables are allowed only as local layout numbers inside a screen's stylesheet.
2. **Colour meanings are unchanged.** Orange (`state-tx`) only for a live key-up. Cyan (`state-idle`) for armed:
   here, "enabled". Red (`state-fault`) only for a present equipment fault or a failed action the user can retry.
   A permission refusal is **not** red: it is `ink-2`.
3. **Every state has geometry.** Enabled = filled square; disabled = hollow square; unassigned = `—`; tuning =
   dashed bracket; listening = solid bracket. The grayscale test must pass for all of them.
4. **Words are uppercase label font; numbers are mono.** MHz always 3 decimals (`160.920`); AAR as `5454` in
   readouts and `CH54` in sentences (`LISTENING · CH54`).
5. **Sticky only at token offsets** (liveops-direction §8.1). No measured height positions anything.
6. **The word "bank" disappears from the UI.** Search the frontend for `BANK` / `bank` in user-visible strings; the
   only survivor is code being deleted. The nav label `FEEDS & BANKS` becomes `FEEDS`.

---

## 2. Frequencies page (`/frequencies`, ticket I-3)

### 2.1 Route and shell (MUST)
1. New route: `id "frequencies"`, path `/frequencies`, name `FREQUENCIES`, dir `frequencies`, `layout: "fluid"`,
   `phone: "page"`. Not admin-only: viewers see it read-only.
2. Nav order: `MAP · LIVE OPS · FREQUENCIES · FEEDS · SETTINGS · SPOT` (the Q-W-E key row follows the order).
3. Add a route test that `/frequencies` does not match the `/frequency` prefix route and `/frequency/x` still does.
4. Status line fallback: `FREQUENCIES 31 · 8 ENABLED ON 1 NODE · ENABLED = RECORDED + TRANSCRIBED`.

### 2.2 Desktop anatomy (≥ 768 wide and ≥ 560 tall) (MUST)
The page itself never scrolls. Only the table body scrolls, in its own box (like the Live Ops tile area).
```
┌ header 44 ───────────────────────────────────────────────────────────────────────────────────────┐
│ ENABLED  8 / 31   RECORDED + TRANSCRIBED                                       [ + ADD FREQUENCY ] │ hero 64
│                   ON 1 NODE · SDR-01 8                                                            │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ NODE [ALL][SDR-01 8] │ [ALL 31][ENABLED 8][DISABLED 0][UNASSIGNED 23] │ RAILROAD ALL ▾ │ ⌕ ______ │ 31 SHOWN │ filter bar 48
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│   MHz ▲    AAR   LABEL         RAILROAD        USE         LINE ……………………      SDR-01 8            │ head 32 (sticky in the box)
│ ••• 160.290  1212  K TOWER      AMTRAK          TERMINAL    Washington Union …   ■ ON         ›   │ rows 40
│ ••• 160.350  1616  WASH OPS2    AMTRAK          TERMINAL    Washington Union …   ■ ON         ›   │
│     160.590  3030  CSX BC       CSX             ROAD        Capital Subdivision  —            ›   │
│ ▮   160.920  5454  AMTK NEC     AMTRAK          ROAD/DISP…  Northeast Corridor   ■ ON         ›   │ keyed: tx wash
└ status 28 ────────────────────────────────────────────────────────────────────────────────────────┘
```
1. **Hero (64 px).** Reuse the `.hero`, `.hero__text`, `.hero__big`, `.hero__stack` classes (as `FeedsHero` does).
   `ENABLED` label, `8` at the hero size, ` / 31` in `ink-2` at the same size. Then a two-line stack in `ink-2`:
   `RECORDED + TRANSCRIBED` / `ON 1 NODE · SDR-01 8` (with more nodes: `ON 3 NODES · SDR-01 8 · SDR-02 5 · SDR-03 0`).
   This line is the "what enabled costs" readout and is required. Right end: `+ ADD FREQUENCY` (`Button`, admin
   only). This is the screen's one hero number.
2. **Filter bar (48 px, one line, never wraps).** Left to right, separated by 1 px `grid` rules:
   - **Node:** `Chip kind="filter"` buttons, `ALL` then one per node in feed order, each with its enabled count
     (`SDR-01 8`). One pressed at a time. A node that is not `ok` shows its `PositionGlyph` (stale / offline /
     fault) before the name. With **more than 3 nodes**, the chips become one `SelectField` `NODE ALL ▾`.
   - **State:** `ALL 31 · ENABLED 8 · DISABLED 0 · UNASSIGNED 23`, filter chips, one pressed. Counts reflect the
     other active filters, not their own group.
   - **Railroad:** `SelectField` (move it from `screens/feeds/` to `lib/components/`), options from the data,
     uppercase, `ALL` first.
   - **Search:** `Field` text, placeholder-free, label `SEARCH`, flexible width (min 160). `/` focuses it; `Esc`
     clears it when focused. Matches label, MHz prefix (`160.92`), AAR in any form (`54`, `5454`, `CH54`),
     railroad, use, line and notes; case-insensitive; 120 ms debounce.
   - **Right:** `31 SHOWN` readout (mono number, label font word), then `CLEAR` (text button, only when a filter
     is set).
   - Under 1100 px of width the bar scrolls sideways inside itself (thin scrollbar, like the phone tabs). The table
     does not move.
3. **State filter meaning.** With `NODE ALL`: ENABLED = enabled on at least one node; DISABLED = assigned somewhere,
   enabled nowhere; UNASSIGNED = no assignments. With a node chosen: the same words about **that node only**
   (UNASSIGNED = not assigned to that node).
4. **All filters, the sort and the open editor live in the URL**: `?node=node-1&state=enabled&rr=CSX&q=ivy&sort=mhz&dir=asc&edit=<id>`.
   Reload and Back restore them. Defaults are omitted from the URL.

### 2.3 The table (MUST)
1. One CSS grid per row (reuse the `.fb-tr` row language: 1 px `grid` bottom rule, head row in `--fs-11` label
   font `ink-3`). Move the shared row CSS into the new screen's stylesheet; `feeds.css` loses it with the banks.
2. **Columns** (desktop):

   | # | Column | Width | Content |
   |---|---|---|---|
   | 1 | glyph | 24 | `PositionGlyph`: `tx` while keyed; `idle` if enabled on a node that is `ok`; `stale` if enabled only on stale nodes; `offline` otherwise (disabled, unassigned, or nodes offline) |
   | 2 | MHz | 88 | mono `--fs-12`, `ink` |
   | 3 | AAR | 56 | mono `--fs-12`, `ink-2`, `5454` |
   | 4 | LABEL | minmax(120, 1.2fr) | label font 600 uppercase `ink`, ellipsis |
   | 5 | RAILROAD | 140 | label font uppercase `ink-2` |
   | 6 | USE | 120 | label font uppercase `ink-2`, ellipsis |
   | 7 | LINE | 1fr | read font `--fs-12` `ink-3`, ellipsis; **hidden under 1280** |
   | 8 | NODES | 72 per node | one aligned slot per node (§2.4) |
   | 9 | open | 32 | `›` link to `/frequency/:id` (as `fb-cat__open` today) |

   Under 1024 also hide USE. Row height **40**, head **32**. Nothing wraps.
3. **Sort.** Every header except glyph and open is a button with `aria-sort`. Active header in `ink` with `▲`/`▼`
   after the word; others `ink-3`, no arrow. First click ascending, second descending. **Default: MHz ascending.**
   Ties always break by MHz, then label. Sorting by a node column orders ON, OFF, unassigned. Rows never re-sort on
   live data (a key-up never moves a row).
4. **Live key-up.** A keyed row takes `.is-tx` exactly as the membership table did: `wash-tx-surface`, MHz and AAR
   in `state-tx`, glyph `tx`. Nothing else on the page goes orange.
5. **Row interaction.** Admin: click or `Enter` on a row opens the editor (§2.5) and the row wears `.is-picked`
   (the catalogue's picked style). Viewer: click or `Enter` opens `/frequency/:id`. The `›` always opens the detail
   page. Arrow keys move row focus. No hover fill: hover raises the label to `ink` only.
6. **Shared frequency.** Two rows on the same MHz (161.070 CSX LNDVR / NS BAYVIEW) show `SAME FREQ` in `ink-3` after
   the label (brief §9.4: informational, never red).

### 2.4 The node slots: assignment and enable (MUST)
The NODES columns form a matrix: one header per node, one slot per row under it, always in the same x position.
1. **Head:** the node short (`SDR-01`) and its enabled count (`8`, mono `ink-2`), with the node's `PositionGlyph`
   when not `ok`. The node name in the head is what lets the slots stay short.
2. **Slot states** (one `AssignSlot.svelte`, a `<button role="switch" aria-checked>` with
   `aria-label="SDR-01, 5454 AMTK NEC, enabled"`):

   | State | Look | Click (admin) |
   |---|---|---|
   | Enabled | `.check`-style 16 px box with its 8 px fill in **`state-idle`**, then `ON` in `ink`; bracketed `.chip` frame in `line` | → disabled |
   | Disabled | hollow 16 px box (`line-faint`), `OFF` in `ink-3`; frame `line-faint` | → enabled |
   | Unassigned | `—` in `ink-3`, no frame. On row hover or focus: ghost `+ ADD` (`ink-2`, `line-faint` frame) | → assigned **and enabled** |
   | Enabled, node not `ok` | as enabled, frame drawn `dash-stale` (enabled but not being heard) | as enabled |
   | Request in flight | text `ink-2`, not clickable; no spinner | — |

3. Toggles are **optimistic**: the slot flips at once (`t-micro`), the PUT goes, and a failure reverts it and
   writes `SDR-01 · 5454 NOT ENABLED: <REASON>` in `state-fault` text at the right of the filter bar for 6 s (a
   retryable failure, brief §9.4). No confirm dialogs for enable or disable.
4. **Unassigning** is not in the table; it is in the editor (§2.5.4). The table can only create or flip.
5. Viewer: slots are plain spans (same look, no frame change on hover, no `+ ADD`).
6. Enabling or disabling updates the hero numbers and the filter counts in the same frame.

### 2.5 The editor drawer (MUST)
1. Admin only. Opens from a row (`?edit=<id>`) or from `+ ADD FREQUENCY` (`?edit=new`). It is a right-docked
   panel, **`--inspector-w` (480 px) wide**, from under the filter bar to the status line, `bg-panel`, corner
   brackets, over the table. **The table never reflows** (brief §8.3); the picked row stays visible at its left.
   `×` and `Esc` close it. Opening is instant (no slide).
2. **Bar:** `5454 · AMTK NEC` (mono + label), right: `OPEN PAGE ›` (link to `/frequency/:id`) and `×`.
3. **Identity readout** (not editable for an existing frequency) **[PICKED]**: `160.920 MHz · CH54 · NFM`. Changing
   the MHz of a saved frequency would silently move its history; delete and add instead. (Alternative: editable
   MHz with a warning.)
4. **NODES section first** (it is the expensive part), heading `NODES` + micro `APPLY AT ONCE`:
   - One 48 px row per node: glyph, `SDR-01`, node state word in `ink-3` (`ONLINE` / `STALE` / `OFFLINE`), then a
     3-way segmented control of filter chips: `—` · `OFF` · `ON` (unassigned, disabled, enabled). Same API calls
     as the slots; `—` is the DELETE assignment.
   - Under the rows, the cost line in `ink-2` `--fs-11` label font, always visible:
     `ON: THE NODE DECODES IT · THE SERVER RECORDS AND TRANSCRIBES EVERY KEY-UP · AUDIO KEPT 90 DAYS`.
     The `90` comes from the backend setting if exposed; otherwise omit `· AUDIO KEPT …` rather than hard-code it.
   - If the frequency has recordings: `LAST 7 DAYS  412 TX · 1H 06M AIR` from the activity endpoint the frequency
     page already uses (one request when the drawer opens). Unknown: `— — —`, never 0.
5. **DETAILS section**, heading `DETAILS` + micro `SAVE TO APPLY`. Underline fields (`Field`):
   `LABEL`, `RAILROAD` (text with a `<datalist>` of existing railroads), `USE` (datalist of existing uses), `LINE`,
   `NOTES` (a textarea in the same underline style, read font `--fs-13`, 4 rows, grows to 8, then scrolls).
   Behind a lid `▸ SOURCE AND CONFIDENCE` (the `RECEIVER PARAMETERS` disclosure pattern): `MODE`, `CONFIDENCE`
   (`SelectField`), `SOURCE URL`. The ID field is gone from the UI.
6. **Footer** (pinned at the drawer bottom): `SAVE` (primary, disabled until a field changes), `CANCEL`. Closing
   with unsaved details shows, in place of the footer: `DISCARD CHANGES?  [DISCARD] [KEEP EDITING]`.
7. **DELETE**: a text button at the footer's far right. It opens an inline typed confirmation (brief §9.4), the
   BankEditor pattern: `TYPE THE LABEL TO DELETE` field + `DELETE` (enabled only on an exact match). Copy under it in
   `ink-2`: the wording in §8.5 (G-2 keeps recordings and transcripts).
8. **Add mode** (`?edit=new`): bar `NEW FREQUENCY`. One field first: **`CHANNEL OR MHz`** (mono). It accepts `54`,
   `CH54`, `5454` (AAR pair) or `160.920`, and resolves live underneath: `CH54 · 160.920 MHz` in `ink`, or
   `NOT AN AAR CHANNEL · CH07–CH97 · 160.215–161.565` in `state-fault` (validation). If a frequency already exists on that MHz:
   `ON THIS MHz: AMTK NEC ›` in `ink-2`, the link opens that one's editor; adding a second is still allowed (shared
   frequencies exist). LABEL defaults to the AAR pair (`5454`, decision 69). NODES default **all `—`**
   **[PICKED]**: enabling costs, so it is a deliberate act (alternative: default `ON` for the node in the filter).
   `ADD` replaces `SAVE`. After adding, the drawer stays open on the new row, which scrolls into view (`nearest`).

### 2.6 Phone (handset test as Live Ops; `PageShell`, document scroll) (MUST)
```
┌ SDRVIZ  FREQUENCIES        20:13  ≡ ┐ 44
│ ENABLED 8/31 · REC + ASR    [+ ADD] │ 44 ┐ one sticky block, top: var(--header-h)
│ ⌕ SEARCH __________________  [SORT ▾]│ 44 │
│ [SDR-01 8][ENABLED 8][UNASS… 23][CSX…│ 44 ┘ chip row scrolls sideways inside itself
│ ••• 160.290  1212           ■ SDR-01 │ 64 row: line 1 MHz --fs-18, AAR --fs-13, slots right
│     K TOWER · AMTRAK · TERMINAL      │    line 2 label --fs-15, then railroad · use ink-3
│ …                                    │
└ FREQUENCIES 31 · 8 ENABLED       🔈 ┘ 28
```
1. The table becomes 64 px two-line rows, 16 px gutters, no column head. Slots on the right show the node short
   with its box (`■ SDR-01` / `□ SDR-01`; unassigned nodes are not shown); **read-only on the phone**. More than two
   assigned nodes: the first two then `+3`.
2. The chip row holds, in order: node chips (when more than one node), state chips, railroad chips (one per
   railroad, they replace the select on the phone). `SORT ▾` is a native `<select>` styled as `SelectField`
   (`MHz ▲`, `MHz ▼`, `AAR`, `LABEL`, `RAILROAD`).
3. Tap a row: admin opens the editor as a full-screen layer (the Live Ops pane-layer pattern: history entry, list
   stays mounted and `inert` so its scroll survives, bar `‹ FREQUENCIES` + `OPEN PAGE ›`). The node controls are
   the 3-way segmented control at 44 px. Viewer: tap opens `/frequency/:id`.
4. Floors: data 13 px, primaries 15 px, every target 44 px, no horizontal page scroll at 360 and 390.

### 2.7 Empty and loading (MUST)
1. Nothing matches: `EmptyState` `NO MATCHES` + `CLEAR FILTERS` button, centred in the table box.
2. No frequencies at all: `NO FREQUENCIES` / `Add one by channel or MHz, or right-click a channel on the Live Ops
   waterfall.`
3. No nodes: the NODES columns are absent and the hero reads `ENABLED — / 31 · NO NODES` with `Add a node in
   Settings.` as a link in the stack's second line.
4. Before data: the head row and `— — —` in the hero. No skeleton shimmer.

### 2.8 LATER
- Per-row cost (key-ups and air time per day) in the table: needs a bulk endpoint.
- Multi-select rows and bulk enable / disable.
- Assignment chips on `/frequency/:id` itself, and a `FREQUENCIES /` crumb when arriving from this page.
- Drag a node header to reorder node columns.

---

## 3. Feeds page (`/feeds`, ticket I-4)

### 3.1 Hierarchy (MUST)
The job sentence changes to *"Are my receivers and my train data healthy?"* Inputs only: what feeds the system.
Radio is primary (left, then its inspector), transit data secondary (right). Frequencies are not here any more.
```
hero 64:  FEEDS NOMINAL 1/1  [worst feed]                       8 ENABLED ON 1 NODE ›   TRANSIT 4/4 FRESH
cols 1-3: SDR FEEDS 1          cols 4-7: FEED INSPECTOR        cols 8-12: TRANSIT SOURCES 4   [+ ADD SOURCE]
          HOST card                      (FeedInspector,                  SourceCard
          FeedCard SDR-01                 or FeedForm /                   SourceCard …
          + NEW FEED                      ReceiverForm in place)          (SourceForm in place when editing)
```
1. The route keeps `layout: "stage"` and `phone: "plate"` this sprint. Route name `FEEDS`; nav label `FEEDS`.
2. **Left (cols 1-3):** new section head `SDR FEEDS` + count (`t-panel` + mono), then `HostCard`, the `FeedCard`s
   and `+ NEW FEED`, unchanged otherwise.
3. **Centre (cols 4-7):** `FeedInspector` / `FeedForm` / `ReceiverForm`, unchanged.
4. **Right (cols 8-12):** the Settings transit block moved whole: the `st-ph` head (`TRANSIT SOURCES`, count,
   `GTFS · GTFS-RT · AMTRAKER · LINES`, `+ ADD SOURCE`), the notice line, `SourceForm` for new / edited sources and
   the `SourceCard` list, with the same handlers, 5 s poll and `EmptyState`s. Move the transit code into
   `screens/feeds/` (or a shared folder) rather than importing across screens; Settings no longer renders it.
   **The column scrolls inside its own box** (`overflow: auto`, the `fb-col` scroll treatment). Delete the absolute
   `sectionTop` positioning entirely: this removes the overlapping bottom.
5. **Viewers:** the transit list is admin-only on the backend. A viewer's right column shows the section head with
   `ADMIN ONLY` in the micro slot and nothing under it. Do not request the list as a viewer.
6. **Hero right side** (replace `ACTIVE BANK` and `CH MONITORED`): `8 ENABLED ON 1 NODE` as a link to
   `/frequencies`, then `TRANSIT 4/4 FRESH` (sources enabled and fresh / enabled; a stale source names itself as
   the worst feed does, e.g. `MARC · STALE 3M`, `state-stale`, never red unless the source reports a fault).
7. **FeedCard:** `HEARS 9 CH` becomes `ENABLED 8 CH` and is a link to `/frequencies?node=<feed id>&state=enabled`.
8. **Deleted:** `BankEditor`, `BankLeverRows`, `MembershipTable`, `membership.ts`, `FrequencyCatalogue`,
   `FrequencyEditor` (its field logic `frequencyForm.ts` moves to the Frequencies screen), the `CHANNELS` header and
   view switch, the capacity readout.
9. **Settings** keeps the left column as `NODES` only and the backend panel on the right. Its status fallback drops
   the transit sentence: `SETTINGS · 1 NODE · CHANGES APPLY LIVE`.
10. Done: screens at 1280 × 800 and 1920 × 1080, admin and viewer; the pairwise overlap script finds nothing.

### 3.2 LATER
- Feeds as a fluid / phone page (decision 62 "other stage screens follow").

---

## 4. Live Ops without banks (ticket I-1)

### 4.1 The node picker (MUST)
1. `BankTabs` becomes `NodeTabs` in the same place (desktop: over the tile column; phone: the sticky 44 px row).
   It uses `Tabs` (chamfered, spec 5.24): one tab per node feed, in feed order, `SDR-01` + the enabled count
   (`8`). The selected tab is `prefs.listen_feed`.
2. Extend `Tabs` items with an optional `glyph`: a node that is not `ok` shows its `PositionGlyph` before the name,
   and a disabled / offline node's tab text is `ink-3`. Never red text on a tab; the glyph carries the fault.
3. **One node still shows its single tab** **[PICKED]**: it names what the list is (it replaces the bank name) and
   the layout does not jump when a second node is enrolled. (Alternative: hide the row with one node.)
4. Switching: admin only, as bank activation was; a viewer's tabs are not buttons. A switch changes the tile list
   **and the front wall** (the wall always shows the listened node). The density chip stays at the right on desktop.
5. **The hero strip's `FEED · SDR-01 ▾` selector loses its `SHOW …` items**; the chip keeps its state colour and
   opens the feed inspector directly (`INSPECT` is its only job now). The off-bank readout is removed. The
   `elsewhere` readout stays (`+1 ON SDR-02`), and for an admin it is a button that switches to that node.
6. Remove the `LIVE` tab, the live-bank empty state and every `bank-live` branch.

### 4.2 Tiles and order (MUST)
1. Tiles = the listened node's **enabled** frequencies, **sorted by MHz ascending**, stable. Digits, `[ ]`, `◂ ▸`
   and the hero all use this order.
2. Enabling or disabling elsewhere inserts or removes a tile in place: the new tile builds on once (`t-commit`),
   others re-pack with the existing 400 ms `ease-in-out`. No auto-scroll, no auto-select.
3. The selection survives a node switch (as it did a bank switch). If the selected frequency is not enabled on the
   new node, the pane tag reads `NOT ON SDR-02` (replace `NOT IN THIS BANK`) and no tile wears brackets.
4. Status line: `NODE SDR-01 · 8 CH` (replaces `BANK NEC CORRIDOR · 8 CH`). Phone pane-layer back label:
   `‹ SDR-01`.

### 4.3 Empty states (MUST)
1. Node with nothing enabled, in the tile area (desktop) or list (phone), `EmptyState`:
   title `NOTHING ENABLED ON SDR-01`, body `Enable frequencies for this node in ` + link `Frequencies` (to
   `/frequencies?node=<id>`), and on desktop for an admin a second line in `ink-3`: `Or right-click a channel on the
   waterfall.` The front wall keeps running: the band is still worth looking at.
2. No nodes at all: `NO NODES` / `Add a node in Settings.` (link, admin) and the wall's existing no-feed message.
3. Phone hero line when empty: `NOTHING ENABLED` replaces `NO CHANNELS IN THIS BANK`.

### 4.4 LATER
- Listening to two nodes at once (a merged list). Not designed; decision 68 says one.

---

## 5. Waterfall gestures (decision 69, ticket I-2)

The spectrum, ruler and waterfall cells are one gesture surface (they share x). Gestures resolve to the AAR
channel slot under the pointer **at press time**; between slots nothing happens.

### 5.1 Gesture rules (MUST)
| Input | Threshold | Result |
|---|---|---|
| Left press, released before 300 ms and moved < 6 px | | **Short click.** Enabled (listed) channel: select it into the pane. Unlisted: show hint plate `CH52 NOT ENABLED · RIGHT-CLICK TO ADD` (admin) or `CH52 NOT ENABLED` (viewer), 2.5 s. |
| Left press held ≥ 300 ms, moved < 6 px before then | | **Listen while held** (§5.2). Moving afterwards does not change the channel. Release, `Esc`, `pointercancel` or window blur ends it. Pointer capture keeps it alive outside the wall. |
| Right-click (`contextmenu`) | | **Add** (§5.3). `preventDefault()` on the three cells only; everywhere else the browser menu stays. |
| Alt-click | | Nothing. Removed. |
| Phone spectrum layer: touch down | | Readout as today (M11 cursor). |
| Phone: touch held ≥ 300 ms, moved < 8 px | | Listen while held, readout stays with the finger. No add, no select on the phone. |

1. Suppress iOS callout and text selection on the three cells: `-webkit-touch-callout: none; user-select: none;
   -webkit-user-select: none;` and `touch-action: none` on the phone layer's cells.
2. **Dwell hint** (the cursor's second line, after 600 ms on a slot), replacing the bank texts:
   listed: `CLICK TO SELECT · HOLD TO LISTEN`; unlisted, admin: `HOLD TO LISTEN · RIGHT-CLICK TO ADD`; unlisted,
   viewer: `HOLD TO LISTEN`.
3. If the backend refuses holds for viewers, the viewer's hint drops `HOLD TO LISTEN` and a hold shows the refusal
   plate (§5.4). Do not decide this on the client.

### 5.2 Holding: the marker and the readout (MUST)
```
spectrum   ⌐            ¬         two hairlines at the slot edges (±7.5 kHz, half the 15 kHz spacing), M1 corner arms 8 px top and bottom
ruler      │ 54 160.920 │         the channel's 45° label shows while held (add it to `extras`)
waterfall  │            │
           └            ┘
           ┌─────────────────────────────────┐
           │ LISTENING · CH54 · 160.920   00:04 │   plate, top-left of the waterfall (the listenFlash position)
           └─────────────────────────────────┘
```
1. **Bracket:** two vertical lines at the slot edges through spectrum and waterfall (not through the ruler text),
   `stroke-emph` (1.5 px), with M1 corner arms (`--arm-len`) at the top of the spectrum and the bottom of the
   waterfall. Colour `--state-select` (white): a held channel is the user's own selection, not a transmission.
   It draws on from the ruler outward in `t-commit` when the hold begins, and retracts in `t-commit` on release.
2. **Driven by G-5's `listen_state {state: tuning | listening | released | failed}`.** `tuning`: the bracket is
   drawn `dash-measure` and the plate reads `TUNING · CH54 · SDR-01` in `ink-2`. `listening`: solid bracket,
   `LISTENING · CH54 · 160.920` in `ink` and a mono held timer (`00:04`, whole seconds) at the right. `released`:
   rule 8. `failed`: §5.4. Never fake a state the server has not sent.
3. **Already enabled channel:** no tuning step; the plate reads `LISTENING · CH54 · ENABLED`.
4. **Key-up while held:** the normal TX choreography (orange slot outline and wash, hero strip, P6) runs inside the
   white bracket. The plate does not turn orange.
5. **Audio muted** (corner mute on, or the channel muted in the mixer): the plate adds `· AUDIO MUTED` in `ink-2`.
   A hold is a user gesture: if the audio context is suspended, resume it on the press.
6. **Node not ok** (stale, offline, fault): no hold request; plate `SDR-01 OFFLINE · CANNOT LISTEN` (state word
   from the feed) in `ink-2` for 2.5 s.
7. **Still `tuning` after 5 s:** plate `NO RESPONSE FROM SDR-01` in `ink-2`; keep holding (the request stays
   live), and go to LISTENING if the confirmation arrives.
8. **Release:** the plate holds for 400 ms (the key-up release hold) then goes; nothing else remains on the wall.
9. The plate is `bg-void` at 0.85 with the M1 corner brackets in `line-faint`, label font `--fs-11`, `role="status"`.
   It replaces the old `lo-flash` box (one plate, one position, for all gesture messages). On the phone layer the
   plate sits at the top of the waterfall, left, inside the safe area.

### 5.3 Right-click: add (MUST)
1. Admin, on a slot: plate `ADDING · CH54 …` in `ink-2` (static, no animation) while `POST
   /api/frequencies/from-channel {aar_channel, feed_id: listen_feed}` runs. One request at a time.
2. **Results** (plate, 4 s, then gone):

   | Result | Plate text | Tone |
   |---|---|---|
   | New frequency created | `5454 ADDED · ENABLED ON SDR-01` | `ink` |
   | Existing frequency, now enabled | `CSX LNDVR · 5454 ENABLED ON SDR-01` | `ink` |
   | Already enabled on this node | `5454 ALREADY ON SDR-01` | `ink-2` |
   | Request failed | `5454 NOT ADDED · <REASON>` | `state-fault` (retryable) |

   On success the new tile builds on in MHz order (§4.2.2) and scrolls into view (`nearest`), but is **not**
   selected. The ruler label for CH54 appears as the list updates.
3. **Viewer right-click:** no request, no browser menu; plate `ADDING NEEDS ADMIN` in **`ink-2`**, prefixed with a
   hollow square glyph, 2.5 s. It is a refusal, not a fault: never red.

### 5.4 Errors from a hold (MUST)
- Hold refused by the server (403 or protocol refusal): `LISTEN NEEDS ADMIN` in `ink-2`.
- Any other hold failure: `CH54 · LISTEN FAILED · <REASON>` in `state-fault`, 4 s; the bracket retracts.

### 5.5 Tests the engineer writes (MUST)
Pure gesture logic in a module (`gesture.ts`): press → click vs hold by time and distance; right-click by role;
renewal every 5 s while held; release on pointerup, cancel, blur, Esc; phone thresholds. vitest covers each row of
§5.1 and the plate texts of §5.2 to §5.4.

### 5.6 LATER
- A `FREQUENCIES ›` link inside the add plate (the plate is `pointer-events: none` today).
- Momentary solo while holding an enabled channel (duck the others).
- Short tap on a listed channel in the phone spectrum layer opens its pane.
- Haptic tick on hold start where supported.

---

## 6. Resolved
- The `R` lever question is answered by decision 71: see §8.

## 7. What I-5 checks
1. Frequencies at 1280 × 800, 1920 × 1080, 2560 × 1440 (filters set, editor open, a keyed row) and at 390 × 844
   (list, editor layer); one hypothetical 3-node fixture at 1920 to check the slot matrix.
2. Feeds at 1280 and 1920, admin and viewer; no overlap.
3. Live Ops at 1920 and 390 with one node, a node with nothing enabled, and the node-switch selection rule.
4. Waterfall: a hold in TUNING, in LISTENING, during a key-up; each right-click result; the viewer refusal.
5. Grayscale pass on the slot states and the hold bracket. A screenshot with nothing keyed has no orange.
6. No user-visible `BANK` anywhere.

---

## 8. Addendum: tile controls and the edit window (decision 71, 2026-11-20)

The tile keeps only what you do *while listening* (mute, solo) and gains one door to what you *configure*
(the `⋯`). Recording is no longer a tile control: it is "enabled", set per node (decision 66).

### 8.1 Tile anatomy (MUST)
```
standard 112                                   compact 56                         phone row 64
┌ ••• 1 AMTK NEC            LAST 23S ┐         ┌ ••• 1 AMTK NEC      LAST 23S ┐   ┌ ••• 1 AMTK NEC  LAST 6S │ ⋯ │ M │ S ┐
│ 5454                    ‾‾‾‾‾‾‾‾   │         │ 5454 160.920   ⋯  │M│ │S│   │   │ 5454  160.920           │   │   │   │
│ 160.920                            │         └───────────────────────────┘   └─────────────────────────┴───┴───┴───┘
│ ▁▂▁▃ meter          ⋯   │M│ │S│    │                                             cells 44 × 64
└ AMTRAK · VIA SDR-01 ┘                                                            
```
1. **R is removed** from `LeverRow` on tiles (`LEVERS` = M, S) and from the tile keyboard (`R` does nothing). Drop
   `prefs.record` from the tile's lever state; leave any backend field alone for G to delete.
2. **M and S snap to the bottom right.** Standard tile: the lever pair at `right: 0; bottom: 4px` (inside the 2 px
   TX frame), 2 × 24 px; the foot row's right edge stops at `right: 88px` so it never runs under them. Compact
   tile: the pair moves from row 1 to row 2 right (`bottom: 4px; right: 2px`), and the status readout moves up to
   row 1 right where the levers were (the `pips2` / `right: 36px` rule stays as is).
3. **The `⋯` button** sits immediately left of M, with an **8 px gap** so it does not read as a third lever:
   24 × 24 px on desktop, no frame at rest, three 2 × 2 px squares in `ink-3` centred on the lever letters' baseline;
   on hover or focus they go `ink` and a 1 px `line` frame appears (the `.lever:hover` treatment). It has no pip
   (it is not a state). `aria-label="Edit 5454 AMTK NEC"`, `aria-haspopup="dialog"`.
4. **Phone row:** three 44 × 64 cells at the right: `⋯`, `M`, `S` (the cell R used is reused, so the row's text
   keeps its width). The `⋯` cell has a 1 px `grid` rule on its right to separate it from the levers.
5. **Click rules:** a press on `⋯` (or M, S) stops propagation and never selects the tile, exactly as levers do
   now. Anywhere else on the tile still selects. Keyboard on a focused tile: `E` opens the window (M, S, F as
   before).
6. **Admin only.** Viewers get no `⋯` (the slot is empty; M and S do not move).
7. The tile that opened the window shows the focus ring while the window is open, so the eye can find its origin.

### 8.2 The `⋯` on the frequency detail page and the pane (MUST)
1. `⋯` goes in the **identity line of `Identity.svelte`, at its right end**, so the full page `/frequency/:id`,
   the Live Ops pane and the phone pane layer all get it from one place. 32 × 32 on desktop, 44 × 44 on the phone.
   Admin only.
2. On the detail page, the window's `OPEN PAGE ›` link is hidden (you are on it).

### 8.3 The floating window (MUST)
1. **Desktop: anchored, non-modal, not draggable** **[PICKED]**. It opens beside its anchor so you can still see the
   tile (and watch it key up) while you edit it. (Alternative: the existing centred `Modal` with a dimmed page.
   Rejected because the dim hides the live state you are editing.)
2. **Placement**, computed once on open and again on window resize (it positions only itself, so the §8.1 rule
   against measured offsets in the Live Ops direction is not broken):
   - From a tile: the window's left edge 8 px right of the tile; if it would cross the window edge, 8 px left of the
     tile. Top aligned with the tile's top, then clamped inside the content area with 16 px margins.
   - From the identity line `⋯`: right-aligned to the button, top 8 px under it, clamped the same way.
3. **Size:** `--inspector-w` (480 px) wide. Height fits the content, up to the content area height − 32 px. The bar
   and footer are pinned; the body scrolls inside.
4. **Look:** `bg-raised`, corner brackets (`br`), no frame and no shadow, no backdrop. `role="dialog"`,
   `aria-modal="false"`, labelled by the bar text. Opening is instant (no scale or slide).
5. **Bar:** `5454 · AMTK NEC`, then `OPEN PAGE ›` and `×` on the right.
6. **Closing:** `×`, `Esc`, or a click outside the window. Focus returns to the `⋯` that opened it. One window at a
   time: `⋯` on another tile replaces the content (subject to rule 7).
7. **Unsaved changes:** with DETAILS changed, any close (or a swap to another tile) shows the footer prompt
   `DISCARD CHANGES?  [DISCARD] [KEEP EDITING]` instead of closing; `Esc` on the prompt means KEEP EDITING. Node
   controls apply at once and are never "unsaved".
8. **Live consequences while open:** turning the listened node `OFF` removes the tile (§4.2.2); the window stays
   where it is, open, and the bar adds `NOT ON SDR-01` in `ink-3`. Deleting closes the window; if the frequency was
   selected, the pane goes to the watermark; on the detail page, delete goes to `/frequencies`.
9. **Phone:** the window is a full-screen layer, the same pattern as the pane layer (history entry, Back closes,
   content beneath stays mounted and `inert`), bar `‹ BACK` (no `×`; Back is the close); the unsaved prompt applies to Back too.

### 8.4 One editor, three containers (MUST)
1. Build **one** `FrequencyEditor.svelte` in `lib/components/frequency-editor/` (it is shared by three screens, so
   not under any one of them). Props: `frequencyId: string | null` (null = add), `variant: "drawer" | "window" |
   "layer"`, `onclose`, `ondone`. It owns the sections in this order: identity readout, NODES (with the cost line
   and 7-day readout), DETAILS (label, notes, railroad, use, line; the `▸ SOURCE AND CONFIDENCE` lid), footer
   (SAVE / CANCEL / DELETE), the discard prompt and the typed delete. Rules §2.5.2 to §2.5.8 describe it.
2. The containers are thin: `FrequencyDrawer` (the Frequencies page, docked right), `FrequencyWindow` (anchored
   float), and the phone layer. They add position, bar and close behaviour only. The variant changes spacing
   (drawer and window 16 px padding, layer 16 px gutters and 44 px controls), never content.
3. Add mode (`CHANNEL OR MHz`) exists only in the drawer and its phone layer. The window always edits an existing
   frequency.
4. vitest: the editor's dirty tracking, the discard prompt, the typed-delete match, and the add-field parser.

### 8.5 Delete wording (MUST)
G-2 keeps a deleted frequency's recordings and transcripts. The confirmation copy under the typed field, in `ink-2`:
> `Removes 5454 AMTK NEC and its node assignments. Its 4 812 recordings and transcripts are kept.`

The count comes from the activity endpoint the editor already calls; when unknown, drop the number
(`Its recordings and transcripts are kept.`). Never write "0 recordings" for unknown.

### 8.6 LATER
- A hairline leader from the tile to its window (functional ornament, only if it stays legible at a glance).
- Dragging the window by its bar.
- Somewhere to find a deleted frequency's kept recordings (they have no page once the frequency is gone).

### 8.7 Added to the I-5 checks
1. Standard, compact and phone tiles with M S at the bottom right and `⋯`, idle and keyed; nothing overlaps the foot.
2. The window from a tile near each edge at 1280 and 1920 (it flips and clamps), from the pane, and from
   `/frequency/:id`; the unsaved prompt on `Esc`, outside click and tile swap; the phone layer with Back.
3. Viewer: no `⋯` anywhere.

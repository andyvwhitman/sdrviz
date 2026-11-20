# I-5: SPRINT 5 REVIEW (Frequencies, Feeds, Live Ops without banks, waterfall gestures)

**From:** gmunk-director, a creative director persona inspired by GMUNK's published work. It is not the person.
**Date:** 2026-11-20. **Against:** `docs/sprint-5/direction.md` (H-1 + §8 addendum).
**Evidence:** production at 1920 × 1080, 1280 × 800, 390 × 844, 844 × 390 (SDR-01 currently stale with
`RTL_TCP NO SAMPLES`: a hardware fault I did not count against the sprint); the engineers' 4-node sim shots; the code.
I did not hold or right-click on production. Those paths (§5.2 to §5.4) are reviewed from `gesture.ts`,
`listenHold.svelte.ts`, `FrontWall.svelte` and their tests.

## Verdict: APPROVE WITH FIXES

The idea is there. There is one list and a switch per node. The slot matrix reads at a glance and passes the
grayscale test (filled, hollow, `—`, dashed when unheard). There is one editor in three containers. The window
sits beside the tile and never dims the live state. No `BANK` is left in the UI. The hold plate and bracket are
driven only by the server's state. The work is disciplined. Four things break the "leave it open for hours"
test: a filter bar that clips its own readout at the laptop width, filter controls that were specified but not
built, transit sources that vanish below 1920, and a waterfall hint that prints over the stale message and
promises a hold that will be refused.

---

## MUST (fix before the sprint closes)

1. **Filter bar clips at 1280 and cannot scroll.** At 1280 × 800 with one node, `35 SHOWN` is cut to `35 SH`
   (bar scrollWidth 1184 > 1152), and `overflow: hidden` makes it unreachable. With 4 nodes, the chips are cut
   at the left edge.
   *Fix:* `frequencies.css`: `.fr-filters { overflow-x: auto; scrollbar-width: thin; scrollbar-color: var(--line-faint) transparent; }`;
   `.fr-search { flex: 1 1 160px; min-width: 160px; max-width: 360px; }`; `.fr-shown { flex: none; }`; drop the
   `.fr-grow` spacer from `FilterBar.svelte` so the search absorbs the slack. Done when the whole bar, `SHOWN`
   included, fits at 1280 with 1 node, and scrolls inside itself (never clips) with 4.

2. **Filter bar is missing the specified controls** (§2.2.2). `FilterBar.svelte`, `Screen.svelte`:
   - a. **More than 3 nodes → one `SelectField` `NODE ALL ▾`** in place of the chips. The 4-node sim still shows
     five chips.
   - b. A node chip whose feed is not `ok` gets its `PositionGlyph` before the name. On production `SDR-01 8` is
     stale and its chip is bare, while the column head shows the glyph.
   - c. A **`CLEAR`** text button after `SHOWN`, shown only when `isFiltered(filters)`.
   - d. `/` focuses the search field (production: `/` leaves focus on `BODY`). `Esc` in the field clears it.
     Debounce writes from the field to the URL by 120 ms.
   - e. 1 px `grid` rules between the groups (node | state | railroad | search).

3. **Transit sources disappear below a 1920 stage** (§3.1.4 and .10). At 1280 × 800 the right third of Feeds is
   empty. `TRANSIT SOURCES` is stacked under the inspector in a column with no visible cue that it scrolls, and
   Settings no longer shows it, so an admin at 1280 cannot find transit at all.
   *Fix:* `screens/feeds/Screen.svelte` + `feeds.css`. When `stacked`, cap `.fb-pane--insp` at
   `calc(100% - 40px)` so the `TRANSIT SOURCES 19 · + ADD SOURCE` head always shows at the bottom of the column.
   In `FeedsHero.svelte`, `TRANSIT 16/18 FRESH` becomes a text button (stacked only) that scrolls `.fb-right`
   to `.fb-pane--transit` (`block: "start"`). Done when a 1280 screenshot shows the transit head without scrolling.

4. **The dwell hint prints over the wall message and promises a refused hold.** At 1280 on production, hovering
   the frozen waterfall prints `CLICK TO SELECT · HOLD TO LISTEN` on top of `SDR-01 · STALE …`. Both are
   unreadable, and the hold will be refused (`nodeDown`).
   *Fix:* `gesture.ts` `dwellHint(listed, isAdmin, nodeOk)`. When the node is not ok, drop `HOLD TO LISTEN`
   (listed: `CLICK TO SELECT`; unlisted admin: `RIGHT-CLICK TO ADD`; unlisted viewer: no second line). Add
   tests. `FrontWall.svelte` passes `feed.state === "ok"` to `FrequencyCursor.svelte`. Give the cursor's readout
   the plate backing (`bg-void` at 0.85, as `.lo-flash`) and a z-index above `FrontWallMessage`, so the readout
   wins cleanly instead of overprinting. Done when a hover over a stale wall reads as two separate pieces of text.

---

## SHOULD (next pass; none blocks)

1. **Glyph column noise** (direction amended). 27 of 35 rows show the `offline` ✕, so a column of crosses reads
   as a list of errors. In `table.ts` `glyphOf`, return no glyph for disabled or unassigned rows. Keep `offline`
   only for "enabled, but every enabling node is offline". The slot already says OFF / `—`.
2. **Column budget at 1920.** `LABEL` takes about 650 px for 10-character labels while `LINE` truncates.
   `frequencies.css` `--fr-cols`: `LABEL minmax(160px, 0.5fr)`, `LINE minmax(0, 1.5fr)`.
3. **Hero `/ 35`** is `ink-3`. The direction says `ink-2` (`.fr-of`).
4. **Tiles claim "armed" on a stale node.** On production, SDR-01 is stale and the wall says FROZEN, but every
   tile glyph is cyan `idle` with no `AGE` readout, while the Frequencies page correctly shows ◦◦◦ for the same
   rows. Channel `coverage` comes from `backend/app/sim/live_state.py` `coverage()` via `health.state()` and
   does not follow the real node state. This predates the sprint. Open a G ticket.
5. **Bracket retract.** `HoldMarker` unmounts instantly on release. The direction asks for a `t-commit` retract
   toward the ruler: add an `out:` scaleY transition in `HoldMarker.svelte` (respect reduced motion).
6. **No answer at all to a hold** (`state === null`) shows nothing for the whole hold. In `holdPlate`, after
   `NO_RESPONSE_MS` with `state === null`, show `NO RESPONSE FROM SDR-01` as for `tuning`. This reports an
   absence and does not fake a state. Add a test.
7. **Focus return.** `Esc` on the window returns focus to the tile (`Channel 59, IVY CITY`), not the `⋯`
   (§8.3.6). Add a `returnFocus` element prop to `FrequencyWindow.svelte` and pass the `⋯` button from
   `LiveOps.svelte`. Keep the tile as the placement anchor.
8. **Window name.** In `FrequencyWindow.svelte`, replace `aria-label="Edit frequency"` with
   `aria-labelledby` pointing at the editor bar's title id (§8.3.4).
9. **Tile foot clips hard** (`AMTRAK · ROAD/DISPATC` at 1280). Add `text-overflow: ellipsis` to the foot text in
   `ChannelTile.svelte`.
10. **Transit worst readout.** `BRIGHTLINE · STALE 1S` / `MARC TRAIN · STALE 27S`: a source is `stale` because
    a load errored, yet the age shown is the fresh `rt_updated_at`. In `screens/feeds/transit.ts`, use the age
    of the part that failed (`static_loaded_at` when the error is static), or drop the age and show
    `STALE · STATIC` / `STALE · REALTIME`.
11. **Wording leftover.** In the Live Ops feed inspector, change `HEARS · N CHANNELS` to `ENABLED · N CHANNELS`
    (`screens/live-ops/FeedInspector.svelte:117`).
12. **`SelectField`** still lives in `screens/feeds/`, and Frequencies restyles a raw `<select>` as
    `.fr-select`. Move it to `lib/components/` and use it on both pages (§2.2.2).
13. **Air-time format.** The editor says `0H 37M AIR`; `/frequency/:id` says `03:18:58 AIR` for the same
    7 days. Pick the editor's form on both.
14. **Feeds at 844 × 390 (plate).** The inspector body overprints the pinned `RECEIVER PARAMETERS` lid and runs
    under the status line. The inspector body must clip and scroll above the lid.

## LATER

- `/frequency/:id`: the `⋯` sits alone at the far right of the identity line, away from the title. Consider
  docking it beside the `LAST HEARD` block's left edge.
- The feed inspector's spectrum ruler collides MHz numerals (`161.160161.310161.460`) in the no-samples state.
  This predates the sprint.
- Everything in direction §2.8, §3.2, §4.4, §5.6 and §8.6 stays LATER.

## Passed (checked)

Route, nav order and the `/frequencies` vs `/frequency` route test. Hero cost line. Slot states, sizes and
viewer spans. The optimistic flip with fault text. The editor: bar, identity readout, NODES first with the cost
line, `LAST 7 DAYS 3814 TX · 3H 19M AIR`, DETAILS with datalists, the lid, the pinned footer, typed delete,
add-mode parser and `ON THIS MHz`. The drawer at `--inspector-w` over a table that does not reflow. The picked
row stays in view on a deep link. The phone list (64 px rows, slots read-only, no horizontal scroll at 390). The
phone editor layer with `‹ BACK` and 44 px segments. Node tabs: a single tab kept, glyph on stale, viewer not
buttons. Tiles low to high. `NODE SDR-01 · 8 CH`. The `NOTHING ENABLED ON BAY-04` empty state with the
Frequencies link and right-click line. M and S at the bottom right, `⋯` with its 8 px gap, the phone
`⋯ | M | S` cells with the rule. The window flips and clamps at 1280 and 1920 and stays non-modal and undimmed.
Gesture thresholds, capture, Esc / blur / cancel, 5 s renewal, every plate text in §5.2 to §5.4, and the viewer
refusal in `ink-2`. Nothing orange with nothing keyed (the tile label underline is the sprint-4 `recent` ember,
already approved).

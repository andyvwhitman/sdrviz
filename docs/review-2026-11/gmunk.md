# sdrviz review, November 2026: creative direction and visual craft

**Reviewer:** gmunk-director, a creative director persona inspired by GMUNK's published work. It is not the person.
**Date:** 2026-11-17
**Build reviewed:** review copy at `http://localhost:5197` with the simulation on (`BUILD SIM-S3`, backend 0.1.0 · 0c3f6cb).
**Measured against:** `docs/brief/creative-brief.md` (rev 2) and `docs/decisions.md` rows 1-54.
**Screenshots:** `docs/review-2026-11/shots/gmunk-*.png`. The `d-` files are 1920 × 1080; the `m-` files are 390 × 844 at 2× (an iPhone-class phone).

## Verdict: REVISE

The instrument language holds. Hairlines on near-black, mono numbers, bracketed panels, the dark cockpit and state shown by
geometry are all in place, and the new transit work (station board, schematic, national view) is the best craft in the
app so far. A fully idle Live Ops screen averages **1.2% relative luminance** over the content area, and the Map averages
1.8%. The brief's budget is 6% (§10.3), so the brightness discipline is real.

What fails is the **edges of the system**:
- the phone, which is unusable;
- the new click-to-listen hint, which breaks four type and colour rules in one line;
- label collisions on the Map, the Live Ops ruler and the station board;
- a set of copy and vocabulary leftovers that contradict locked decisions (recording, bank naming, status words).

None of it needs a layout change on Live Ops (decision 28 holds).

### Scorecard against the brief's principles

| Principle | Score | One line |
|---|---|---|
| P1 Listen first / quiet | 4/5 | The luminance budget is met. The idle waterfall reads as textured fog rather than dark (finding 13). |
| P2 Hue = state | 5/5 | No orange for delay (decision 26), no red outside faults and form errors. Clean. |
| P3 Real data or nothing | 3/5 | `CH--` placeholders, a `SIM` tag on a mostly-real count, and a Record lever for a feature that doesn't exist. |
| P4 One hero per screen | 3/5 | Live Ops wastes its hero on an empty bank. The Map hero counts the nation while showing DC. Settings has no hero. |
| P5 Ornament = function | 4/5 | Always-on levers and boxed tile indexes add greeble at idle. |
| P6 One choreography | n/a | No key-up landed on a displayed feed during the session, so this was not judged. |
| P7 Railroad language | 5/5 | The schematic, the MP equations, `PASSES · DOES NOT STOP` and the coverage-as-ruler strip are excellent. |
| P8 Radio conventions | 5/5 | Frequency left to right, waterfall down, scope-style graticule label. |
| P9 Subtract | 3/5 | Settings cards and the feeds bank column carry form weight where a row would do. |
| P10 / §10 legibility | 2/5 | The phone renders text at 4-5 px. The new hint is 10 px. Collisions in four places. |

---

## Findings, ranked

Each finding gives the screen, what is wrong, why it matters to the HUD language, and the fix. "Done" says what the
reviewer will check.

### 1. Phone width: the whole app is a letterboxed 16:9 stage at about 0.36× (all screens)
- **What:** `Stage.svelte` scales the 1920-wide design canvas to fit the window. At 390 px wide, every screen renders
  inside a 390 × 220 strip in the middle of a black phone. Body text comes out at about 4-5 CSS px, and the login
  ruler runs off the right edge.
  Shots: `gmunk-m-live.png`, `gmunk-m-map.png`, `gmunk-m-station-full.png`, `gmunk-m-login.png`.
- **Why it matters:** §10.2 sets 11 px as the floor, "nothing smaller, ever". A letterboxed instrument reads as a
  screenshot of an instrument, not as one. Decision 30 accepts letterboxing for an iPad in portrait only. A phone was
  never in scope, but the owner's next page (TRAINSPOTTING) is a phone page by definition, and the railfan persona
  lives on a phone.
- **Fix:** below 768 px wide, skip the stage transform and render fluid layouts.
  - Minimum set: login, the station board, the trip page and the new spot page. All four are lists, so they reflow
    naturally.
  - Live Ops, Feeds and Settings may stay desktop-only. On a phone they show one statement instead of a shrunken
    canvas: `LIVE OPS NEEDS A WIDER SCREEN · 1280 PX OR MORE` in 15 px `ink-2`, with links to the phone-ready pages.
  - The type floor on a phone is 13 px for data and 15 px for primary row text. The 11 px floor is a desktop-at-arm's-length
    number.
- **Done:** at 390 × 844, login, a station board, a trip and the spot page have no text under 13 px and no horizontal
  scroll.

### 2. Live Ops: the click-to-listen hover hint (`FrequencyCursor.svelte`)
Shots: `gmunk-d-live-hover-ch54.png`, `gmunk-d-live-hover-edge.png`, `gmunk-d-live-hover-crop.png`.

The idea is right. A cursor that turns the waterfall into a dial is exactly "data shown as instrument", and the diamond
on the ruler plus the 4-decimal readout (M11) are well judged. The second line is where it goes wrong.

1. **10 px.** `.lo-cursor__hint { font-size: 10px }` is the only text under 11 px in the whole codebase (§4 scale,
   §10.2). Set it at 11.
2. **Mono for a label.** It uses `tx-data` (JetBrains Mono), and §4's rule is "numbers are always mono, labels are never
   mono". Use Barlow Semi Condensed 500, uppercase, +0.10 em.
3. **An undefined token.** `fill: var(--ink-dim, var(--ink)); opacity: 0.7`. `--ink-dim` does not exist, so this is
   `ink` at 70% opacity, an off-palette grey. Use `fill: var(--ink-3)` at full opacity. Text tones come from tokens,
   never from opacity.
4. **The hairline strikes through the hint.** The back plate covers only the readout line, so the dashed cursor runs
   straight through `LISTEN · ALT-CLICK`. Either extend the `bg-void` plate to cover both lines (height 17 → 33), or
   break the hairline across the text block, as the ruler gap already does.
5. **The copy undersells the action.** A click does more than listen: it adds the channel to the LIVE bank and
   *activates that bank* (`FrontWall.svelte` `listen()`). The tile grid then re-packs away from whatever bank the user
   was watching, which is the biggest state change the screen can make. Make the hint state-aware and literal:
   - not in LIVE: `CLICK · ADD TO LIVE BANK`
   - already in LIVE: `IN LIVE BANK · ⌥-CLICK TO DROP`. Use `ALT` on Windows/Linux and the ⌥ glyph on macOS, where the
     key is labelled Option.
6. **The unit reads `MHZ`.** §4 sets the unit as `MHz` (in `ink-2` where the context needs it). The cursor readout uppercases
   it: `160.9206 MHZ · CH54`. Render `160.9206 MHz · CH54 AMTK NEC`.
7. **Edge collision.** At the left edge the readout and hint sit on top of the waterfall's `10 S` time-axis labels
   (`gmunk-d-live-hover-edge.png`). Start the "start" anchor at x = 56, past the axis gutter.
8. **No touch or keyboard path for "drop".** Alt-click doesn't exist on a touch screen, and the waterfall is
   `role="presentation"`, so there is no keyboard path either (§10.9). Add `ADD TO LIVE` / `DROP FROM LIVE` to the
   channel inspector, and give tiles in the LIVE bank a drop lever.
9. **Confirmation lives in the hover layer.** The flash (`LISTENING CH54 · LIVE BANK`) renders inside the cursor, which
   exists only while the pointer hovers. A touch tap or a mouse that moves off loses it. Also write it to the status
   line, which is that line's job (§8.1). The cursor flash can stay as the near-field echo.
10. **Restraint.** The instruction appears on every slot hover, forever. Show it after a 600 ms dwell on a slot, so a
    pointer sweeping across the band reads only the frequency.

**Done:** a grayscale screenshot of the hover shows two lines on one plate, no hairline through either, the second line in
Barlow Semi Condensed 11 px `ink-3`, and the copy matching the channel's actual LIVE membership.

### 3. Live Ops: the LIVE bank's empty state points the wrong way, and the hero goes blank
- **What:** with the LIVE bank active and empty (`gmunk-d-live.png`), the hero slot reads `NO CHANNELS IN THIS BANK`,
  and the tile area reads `BANK EMPTY · Add channels in Feeds & Banks.`
- **Why it matters:** decision 54 made the waterfall the way to fill this bank, and the empty state sends the user to a
  different screen. The hero (P4) is the most valuable 64 px on the screen, and it goes silent exactly when the user is
  deciding what to listen to.
- **Fix:**
  - The tile area for an empty `bank-live` reads `LIVE BANK EMPTY` (13 px display, `ink-2`), then
    `Click a channel on the waterfall to listen.` (15 px Barlow, `ink-3`), with a 1 px `line-faint` leader rising to the
    waterfall's bottom edge. Other empty banks keep today's copy.
  - The hero keeps working across all channels: `LAST KEY-UP 4M AGO · CH54 · AMTK NEC`, plus the off-bank note from
    §9.0.1 (`OFF-BANK` in `ink-2`).
- **Also consider:** the tab label `LIVE` next to the screen called `LIVE OPS` reads as a navigation echo. This is the
  owner's call. `LIVE BANK` or `ON DEMAND` would remove the ambiguity.

### 4. Live Ops and Feeds: ruler labels collide
- **What:** the bank channel numbers share a baseline with the MHz majors, giving `160.26012`, `160.41022` and
  `160.560 27` (`gmunk-d-live-nec-keyed.png`). The Feeds spectrum gives `160.560160.710` and `161.160161.310161.460`
  (`gmunk-d-feeds.png`).
- **Why it matters:** M2 is the instrument's scale. A scale with touching numerals reads as broken, and a broken scale is
  the fastest way to lose the "real instrument" read.
- **Fix:**
  - Two registers. Channel numbers sit *above* the ruler baseline, at the top of their 12 px tick in `ink-2`. MHz majors
    sit below in `ink-3`, as M2 already specifies.
  - On the Feeds mini-spectrum (about 540 px wide), label majors every 20 channels (0.300 MHz) instead of 10.
  - Rule for both: a label is dropped if it would sit within 8 px of another label in the same register.

### 5. Map: labels collide at the default zoom (§9.5 "done" criterion)
- **What** (`gmunk-d-map.png`, `gmunk-d-map-schematic.png`, `gmunk-d-station.png`):
  - `BALTIMORE PENN` sits under `MARC 579`, and `AMTK 196` sits over `EDGEWOOD`.
  - `AMTK 2126` overprints its own glyph, and `MARC 858` overprints a station name.
  - Range-ring labels (`16 KM`) sit under train blocks.
  - On the schematic main line: `AMTK 1731TK 138`, `MARC 8…`, and `UNION STATION` through `AMTK 2127`.
  - In the NY view, SIM radio trains pile into `CH54i4l--` at the bottom left.
- **Why it matters:** the brief's done criterion is "labels never collide at the default zoom: drop lower-priority labels
  rather than overlapping them". Collisions turn a light table into a pile of text.
- **Fix:**
  - Put train data blocks into the same greedy placer as stations, with a priority order: selected train, then trains
    talking (TX), then trains with a fresh realtime position, then station names, then estimated/stale trains, then ring
    labels.
  - When three or more train glyphs fall inside 24 px, collapse them into one block: `3 TRAINS · BAL` (click to fan
    out).
  - On the schematic, apply the same rule along the line, and let the 45° station labels yield to train blocks.
  - SIM radio trains outside the view's extent get no labels.

### 6. Map: the hero counts the nation while the view shows DC
- **What:** `200 TRAINS TRACKED SIM· 192 LIVE` with `TRAINS IN VIEW · 25` beneath it. A space is missing before the dot,
  and the `SIM` tag sits on a count that is mostly real live trains.
- **Why it matters:** P4 says the hero is the datum for what you are looking at. P3 says `SIM` marks simulated
  identities, not a whole real count.
- **Fix:**
  - Hero = trains in view: `25` (48 px), with `IN VIEW · 200 TRACKED · 192 LIVE` as the 13 px label beneath.
  - `SIM` appears only on sim objects (and in the title block).
  - The national view uses the same formula, so its hero reads `191`.

### 7. Map: placeholder data in train blocks and two names for one railroad
- **What:**
  - Data blocks show `≈ 10.09 MI · CH--` and `CFP 94.6 · CH--`.
  - The same map shows `AMTRAK 2171 SIM` beside `AMTK 2126`.
- **Why it matters:** P3 ("real data or nothing") and decision 32 (short uppercase tags, `AMTK 20`). `CH--` is a
  placeholder that looks like data.
- **Fix:**
  - When a train has no channel, the second line ends at the milepost: `CFP 94.6`.
  - All train tags use `AMTK`, `MARC`, `VRE` and `MBTA`, including sim trains.

### 8. Map: the train list floats on the map with no plate, and its last row is cut in half
- **What:** rail lines and labels run underneath the table text, and the eighth row is clipped mid-glyph
  (`gmunk-d-map.png`, `gmunk-d-trip.png`, `gmunk-d-map-national.png`).
- **Why it matters:** the inspector rule is "a HUD within a HUD" on `bg-raised` with brackets. A half-row looks like a
  rendering fault rather than a scroll affordance.
- **Fix:**
  - Give the list a `bg-panel` plate (solid, no blur, §P10) with M1 corner brackets.
  - End it on a whole row plus a final `+17 MORE · SCROLL` row in `ink-3`, or use a 16 px fade-to-`bg-panel` mask, not
    a hard cut.

### 9. Station board (docked): scheduled and estimated times overflow into the train column
- **What:** `19:57 20:51AMTK 90`, `18:46 18:48AMTK 241` and `19:50 19:57AMTK 178` (`gmunk-d-station-was.png`,
  `gmunk-d-station.png`). The maximized board is fine (`gmunk-d-station-max.png`).
- **Why it matters:** time is the board's primary datum. Two times butting into a train number is the worst possible
  place for a collision.
- **Fix:** in the docked width, stack the struck scheduled time (11 px `ink-3`) *above* the estimated time (15 px mono
  `ink`) in the same column. Alternatively, size the column for `00:00 00:00` plus 8 px. Keep the strikethrough, which is
  good.

### 10. Station panel: the route chips are clipped, and the board's first row is sliced
- **What:** the chip row ends in `FLORIDIAN (` against the panel edge. The first visible board row is half hidden under
  the column header (`BROAD RUN … LEFT`).
- **Fix:**
  - Chips wrap to at most two rows, then `+9 ROUTES` opens the full list.
  - The board scrolls so the first visible row is whole: scroll-snap to rows, or a 1-row mask under the header.

### 11. Transit status vocabulary is inconsistent
- **What:** across the train list and boards:
  - `SCHED` beside `EST. PASSED`, and `ON TIME` beside `LEFT`;
  - `−37 MIN ?`;
  - `+5 H 27` in the same column as `+101 MIN` and `+104 MIN`;
  - `4 MIN AGO` (trip panel), `4M 9S AGO` (settings) and `LAST 4M` (tiles).
- **Why it matters:** an instrument has one vocabulary, and §4 already sets the age format.
- **Fix:**
  - Delays: `+NN MIN` up to 99, then `+1H 41M`.
  - The `?` becomes the approximate marker the app already uses for passes, `~` (decision 17), as in `~−37 MIN`.
  - The status pair becomes one word plus a basis mark: `LEFT` when the position confirms it, `LEFT ~` when it is derived
    from the clock (`state_basis: "clock"`). `SCHED` stays for schedule-only rows.
  - Ages follow §4 everywhere in the HUD: `AGE 4M`, `48S AGO` becomes `48S`.

### 12. Settings: no hero, form-weight cards, buried health, mono names
Shots: `gmunk-d-settings.png`, `gmunk-d-settings-addnode.png`, `gmunk-d-settings-editsource.png`.
- **No hero (P4).** Add `SOURCES 18/19 OK · NODES 0` in the 64 px strip, followed by the worst current value
  (`MBTA · STALE 3M`) when anything is off.
- **The cards are forms at rest.** Each source card is about 218 px tall with three bracketed buttons, and there are 19
  of them. Collapse each to one 32 px row: glyph · NAME · KIND · counts · `STATIC 4M` · `RT 8S` · toggle. The detail and
  the EDIT, REFRESH and DELETE buttons go behind a `▸` disclosure (the §9.4 "lid", Braun T 1000).
- **Boxed `OK` chips** are full frames. §5.4 keeps full frames for canvases, state frames and `DEFECT`. Use the M6 glyph
  plus the word `OK` unboxed.
- **Disk health is buried.** The Backend panel shows `94% USED`, but the header shows no `DISK` chip, and §8.1 shows
  `DISK 87%` from 85%. Wire the chip, and use `state-stale` from 85%.
- **TRANSIT TIMINGS table:** source names are set in mixed-case mono (`Virginia Railway Express`), which breaks the §4 and
  decision 32 rule that names are Barlow Semi Condensed uppercase. The header collides: `STATIC AGEREALTIME AGE`.
- **Form hints read as values.** Under NAME = `Amtrak` the hint says `MARC Train`. Under an empty LATITUDE it says
  `38.897`, which looks like a filled value. Prefix every example with `e.g.` (`e.g. 38.897`), or move it into the field
  as a placeholder in `ink-3`. Rename `OR COPY FROM FEED: TYPE IT` to `POSITION · TYPE IT ▾ / FROM FEED`.

### 13. Live Ops: the idle waterfall is a textured fog
- **What:** at idle, the 200 px waterfall is uniform blue-grey grain (`gmunk-d-live-nec-keyed.png`). `rampClamp()` sets
  the low end at `floor − 4 dB`, so ordinary noise lands on ramp stops 1-2 (`#0A1F28`-`#124A5A`) instead of void.
- **Why it matters:** §10.3 says "a quiet band looks quiet, not like boiling snow". Total luminance is within budget,
  so this is about texture: a field of moving grain is ambient motion the observer didn't ask for (§7.5). Decision 28
  explicitly allows the "waterfall colour at rest" fix.
- **Fix:** set the low clamp *above* the median floor, `lo = floor + 2 dB`. The floor then renders as void, and only real
  excursions climb the ramp. If carriers then look thin, add a 0.8 gamma to the upper half of the ramp, not the lower.
- **Done:** an idle 60 s waterfall shows mostly `bg-void` with sparse stop-1 speckle, and a key-up still lands at stop 4
  or above.

### 14. Live Ops and Feeds: a Record lever and "recorded" copy for a feature that doesn't exist
- **What:** every tile carries an `R` (Record) lever, and the bank editor's delete hint reads
  `Channels stay monitored and recorded.`
- **Why it matters:** decision 44 says the app records nothing from the real radio. A control that does nothing is the
  worst kind of greeble (P5), and the copy is untrue (P3).
- **Fix:** remove the `R` lever (M21 becomes M/S) until History is redesigned, and change the copy to
  `Channels stay monitored.`

### 15. Live Ops tiles: always-on levers and boxed index numerals add greeble at idle
- **What:** all 8 tiles show their M/S/R levers permanently (24 small boxes at idle). The bank index `1`-`8` is drawn as
  boxed text.
- **Why it matters:**
  - §9.1.3 puts levers on hover, focus or selection, and the brief's touch path (§10.9) covers tap-to-select.
  - §9.1.5 makes `DEFECT` the *only* boxed text label, so it stands out by geometry. Every boxed numeral dilutes that.
- **Fix:**
  - Levers show on hover, focus or selection. A lit lever (M on, S on) stays visible as state, because a muted tile must
    say so at rest. `MUTED` in the footer already does, so the pip alone is enough.
  - The index becomes an unboxed 11 px mono `ink-3` numeral.

### 16. Feeds and Banks: stutters, truncations and a hole
- **What:**
  - The bank rows read `NEC NEC CORRIDOR` and `LIV LIVE`: the 3-letter code repeats the name.
  - The membership headers collide: `NECLIV`.
  - Feed cards truncate their own names at 1920 (`ALEXAN…`, `NEW CA…`, `EAST BA…`, `sdrviz-a…`) while the driver text
    takes the line.
  - About 200 px of void sits between the channel table and the bank editor.
- **Fix:**
  - Show the code only where the name is too long, or drop it.
  - Rotate or abbreviate the bank column headers with 8 px between them.
  - Move the driver to the card's second line, so the site name gets the first line in full.
  - Anchor the bank editor directly under the table (16 px gap). The leftover space falls to the bottom of the column.

### 17. Map toolbar and scale bar
- **What:**
  - `LOCATE N/A` reads as a broken button.
  - At national zoom the scale bar's `400` runs into `KM` and `MI`.
  - The trip panel header has an orphan `STATUS` label with nothing under it.
- **Fix:**
  - Hide LOCATE when geolocation is unavailable, or show `LOCATE · BLOCKED` with a tooltip explaining the browser
    permission.
  - Put the units as a suffix row-end with 8 px clearance.
  - Drop the orphan label: the glance line `LIVE · 4 MIN AGO` is the status.

### 18. Login: dash and scope
- **What:**
  - The subline reads `NEC DC-BAL` with a hyphen. The brief sets `DC–BAL` with an en dash.
  - The product now tracks trains nationally, so the scope line may be stale.
- **Fix:** use the en dash now. The scope wording is the owner's call: keep `NEC DC–BAL` as the radio's home, or move to
  `NEC · DC–BAL RADIO`.

---

## What is already great: keep it

1. **Login** (`gmunk-d-login.png`, `gmunk-d-login-wrong.png`) is the brief to the letter: bracketed 400 px panel, static
   frequency ruler as the only ornament, the underline field, `Password not accepted.` in `state-fault` 13 px, and no
   shake.
2. **Idle luminance.** Live Ops measured 1.2% mean relative luminance and the Map 1.8%, against a 6% budget. The dark
   cockpit is real, not aspirational.
3. **Tile state grammar.** `NO FEEDS` gets a dotted frame and a crossed glyph. The ember underline plus `LAST 4M` sits on
   AMTK NEC. `MUTED` is a footer word. Every one of these survives grayscale.
4. **The transcript log.** It is a disciplined timestamped table: mono metadata, Barlow 15 body, low-confidence words
   in `ink-3`, and the `+1` reception suffix. It is the best reading surface in the app.
5. **The maximized station board** (`gmunk-d-station-max.png`). The `NOW` divider in `state-idle`, dimmed past rows,
   struck scheduled times and generous columns make it a departures board with instrument manners.
6. **Decision 17 executed well.** `PASSES · DOES NOT STOP` rows with `~15:14` times (`gmunk-d-trip.png`) are
   unmistakable without being loud.
7. **Delay and freshness** follow decisions 26 and 27: brightness steps plus a length bar, never orange, and filled or
   hollow squares for freshness.
8. **The schematic and coverage strip** (`gmunk-d-map-schematic.png`) are the strongest new piece of P7 work: Beck
   geometry, MP-equation marks (`≈CFP 112.6 | NEC 135.7`), and feed coverage as M2 rulers along the line. Fix the
   collisions and do not touch anything else.
9. **The national view** (`gmunk-d-map-national.png`). The curved graticule and restrained glyphs on void read like a
   chart, not a game.
10. **Feeds.** The HOST card, `— — — N/A · RTL_TCP` for unknown telemetry, outer selection brackets on the chosen feed,
    and the `▸ RECEIVER PARAMETERS` lid.
11. **The Settings Backend panel.** Key/value in mono, `— — —` for unknowns, no false zeros.
12. **The cursor readout itself.** The diamond on the ruler, the dashed hairline and `160.9206 MHz · CH54 AMTK NEC`.
    Finding 2 is about its second line, not the concept.

## Screens and states not covered
- No key-up landed on the displayed feed (LND-02) during the session, so the full §7.3 choreography on the waterfall and
  tiles was not seen live. Re-check it with `scenarios/keyed.json`.
- The channel inspector did not open from the scripted click. Its review is pending.
- System-down (`NO LINK`) and fault states were not forced. The review copy was healthy throughout.

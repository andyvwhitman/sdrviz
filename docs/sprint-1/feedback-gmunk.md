# Sprint 1: creative director review

Reviewer: creative director (GMUNK-inspired persona). Date: 2026-11-13. Build: 2335ded plus uncommitted freshness-dot and MBTA work.
Method: headless Chromium against http://localhost:5190 at 1920x970 (`d-*`) and 1180x820 (`i-*`). Screenshots are in
`/private/tmp/claude-501/-Users-andy-Code-sdrviz/dc1fec01-2c61-4ccf-957d-14b364a6eac4/scratchpad/review-gmunk/`.
Scored against `docs/brief/creative-brief.md` (P = principle, M = motif, § = section). Decisions 1-25 respected; nothing here reopens one.

## Verdict: REVISE

**What holds.** The shell is still the instrument: header, chamfered nav, bracketed system chips, title block, status line. Login is
exactly the brief (`d-00`). The corridor map at the default fit is the best frame in the product (`d-01`): hairline rail, shoreline
as line not fill, hatched coverage with range rings, the registration mark, the scale ruler. Key-up choreography works across
screens: the `KEYED · CH12` chip, the orange tile frame, the hero timer, the feed glyph turning vertical on the map (`d-13`, `d-21`).
The single docked panel (D23) is the right structure, and the `NOW` rule on the station board is a good instrument detail.

**What has drifted.** The newer transit UI was built as an app, not as part of the instrument. Five things:
1. **Hue has leaked.** Lateness uses the ember (`state-recent`), and on the map a late train's label reads as a keyed train. The
   freshness dot uses ember and **red**, for data the observer cannot act on. That breaks P2 in both directions.
2. **The label system has collapsed.** Train tags collide with station labels, with each other, and with the overlay stack. This
   is worst in schematic mode and on Union Station, and at iPad width the header itself collides.
3. **The type rules are gone in transit.** Whole tables are set in mono, mixed case sits next to uppercase (`Amtrak 20` beside
   `MARC 424`), and agency names in Settings are mono title case at 21 px.
4. **Maximize stretches a list across 1800 px and adds nothing.** The route page is where the brief's stringline (M19) belongs.
5. **Live Ops lost the CTC strip and LOFAR panel, and nothing re-packed.** The bottom 40% is dead, and the waterfall rests as a
   lifted teal field instead of near-black.

None of this is structural. It is discipline, and it is fixable in one sprint.

---

## Findings

### 1. Delay tone uses the ember, so late trains read as transmitting
- **Severity:** blocker
- **Screen:** Map (train list, map tags, trip panel, station board)
- **Seen:** `d-06-station-was.png`, `d-10-schematic.png`, `d-21-trip.png`, `crop-markers.png`. `AMTRAK 41`, `AMTRAK 52` and
  `AMTRAK 1195` are tagged in `#B9773F` on the map, with keyed channels on screen at the same moment. In the trip panel, late stop
  times are ember. `.mp-tone-late` and `.mp-vlabel.late` both map to `--state-recent`, and early maps to `--state-idle`.
- **Why it matters:** warm means "has spoken" (§3.2), and nothing else in the product may be orange (Don't #3). Cyan for
  "early" also spends the armed hue on information.
- **Direction:**
  - Delete hue from delay entirely. Delay is carried by text and luminance (dark cockpit, P1: only change spends brightness):
    - **On time:** `ON TIME` in `ink-3`.
    - **Late, 2-4 min:** `+3` in `ink-2`.
    - **Late, 5 min or more:** `+16` in `ink`, weight 500, with a 2 x 8 px `ink` bar before the number as the geometry
      carrier (§10.4).
    - **Early:** `−4` (true minus, U+2212) in `ink-2`.
  - Map tags never change colour for delay. A late train's tag gains the delay on line 2 instead (see #5).
  - In the trip panel stop list, the time column uses the same steps.
- **Done:** a grayscale screenshot and a colour screenshot carry the same delay information, and the only orange on any screen
  is live TX.

### 2. The freshness dot uses ember and red, has no geometry carrier, and pulses
- **Severity:** blocker
- **Screen:** Map (train list)
- **Seen:** `d-02`, `d-06`, `d-24-gray.png`. The dot is a white circle, ember once past `stale_after_s`, and red once past 10
  min. In grayscale, stale and fresh differ only by tone. Each data refresh scales the dot to 1.9x, so with 200+ trains the list
  twinkles constantly.
- **Why it matters:** red is present-tense *equipment* fault (P2). A third-party train position going old is not the observer's
  equipment. The Map has no ambient-motion budget (§7.5).
- **Direction:** replace the dot with the M6 vocabulary at 7 x 7 px, square:
  - **Fresh:** filled `line`.
  - **Stale** (past the D22 threshold): hollow 1 px `state-stale`.
  - **Old** (past 10 min): crossed `×` in `state-stale`, with the row's text dropped to `ink-3`.
  - Delete the pulse animation. If arrival needs to be visible, step the row's age readout once (`step`, 120 ms), with no
    scale and no glow.
  - Source-level failure (the whole MARC feed down) is shown in Settings and as a degraded header chip `MARC RT STALE` in
    `state-stale` (§8.1 chip rules), never red.
- **Done:** no `--state-fault` or `--state-recent` in `TrainList.svelte`, and the grayscale test distinguishes all three states.

### 3. Train markers: an over-bright cyan ring, a missing tail, and dash patterns that collide
- **Severity:** major
- **Screen:** Map
- **Seen:** `crop-markers.png`, `d-21`. Every train has a 1.5 px `state-idle` ring, which makes 15-20 armed-cyan rings the
  loudest thing on the map. Estimated and stale rings both use `d-measure` (6/3) and differ only by colour and width. The
  brief's traveling-linework tail (§9.5 layer 9) is absent from live trains.
- **Direction:**
  - **Ring:** 1 px `line`. `state-idle` belongs only on armed *marks* (§3.2), and a train is not armed.
  - **Bar:** keep the `ink` bar, and add the 600 m tail (2 px gradient `ink` → 0 along past track). This is the one Tron note
    the map is allowed, and it shows direction without the chevron, so delete the chevron.
  - **Estimated position:** ring in `dash-threshold` (2 3), which the brief defines as planned or predicted.
  - **Stale:** ring in `dash-stale` (4 4), bar hollow, tag in `state-stale`.
  - **TX** (a train whose crew is keyed): bar and ring in `state-tx`. This is the only way a train turns orange.
- **Done:** at k = 2 the brightest marks are the selected train's brackets and any keyed train, not every train.

### 4. Label collisions across geo, schematic and the overlay stack
- **Severity:** blocker (schematic), major (geo)
- **Screen:** Map
- **Seen:**
  - `d-10-schematic.png`: train tags sit on the rail line and overprint each other (`Amtrak 1195` / `Amtrak 11…`,
    `MARC 435` over `Amtr…`). A legend is clipped (`MINAL RADIUS`), and a stray `6/24` appears.
  - `d-12`, `d-23`: `MARC 435` collides with `BALTIMORE PENN STATION`.
  - `d-06`: `Amtrak 1116` overprints a hidden station label.
  - `d-06`, `crop-terminals`: the TERMINALS stack has no knockout plate and runs through `ABERDEEN`, `CSX PHILA SUB` and
    `NEW CARROLLTON`.
- **Direction:**
  - Train tags join the greedy placer (spec: "drop lower-priority labels rather than overlap"), in this priority order:
    1. terminals
    2. selected train
    3. keyed trains
    4. other trains
    5. stations
    6. line names
  - A tag that cannot find a free slot among the 8 M8 offsets drops to number-only, then to none (still clickable).
  - **Schematic:** two tag lanes, northbound/eastbound 16 px above the line and southbound/westbound 16 px below, each tag on
    a 1 px `line-faint` leader. Station names stay at 45° and never share a lane with tags.
  - **TERMINALS:** give the column the `bg-void` knockout plate (4 px) the other overlays already have, or better, collapse it
    into one `TERMINALS ▾` chip in the control row (see #11).
  - Fix the clipped legend and remove `6/24`, or label it (P5: if you can't say what it measures, delete it).
- **Done:** zero glyph overlaps in `d-01`, `d-06`, `d-10` and `d-12` re-shot at the same moments.

### 5. One tag grammar for trains, uppercase and two-line
- **Severity:** major
- **Screen:** Map, panels, list, board
- **Seen:** the map shows `Amtrak 20` beside `MARC 424` and `VRE 325`, while the list and board show `AMTRAK 20`.
- **Direction:**
  - One formatter, `trainTag(v)`, used everywhere. Line 1 is `AMTK 20` / `MARC 424` / `VRE 325`, using reporting marks as in
    the brief's own voice (`AMTK NEC`).
  - Line 2 appears at k ≥ 2 or when selected: `NEC 128.4 · +16` (milepost where known per §9.0.4, else the next stop
    abbreviation, then the delay). If a radio channel is linked, add `· CH54`.
  - Type: line 1 in mono 500 at `--fs-12` `ink`, line 2 in mono 400 at `--fs-11` `ink-2`. This is M8 as specified.
- **Done:** no mixed-case train identifiers anywhere in the UI.

### 6. Transit tables break "numbers mono, labels never mono"
- **Severity:** major
- **Screen:** Train list, station board, trip/route panels, Settings
- **Seen:** `d-01`, `d-09`, `d-22`, `d-15`.
  - Every column is JetBrains Mono, including names, which is why `UNION STATIO…` and `PENN STATION…` truncate.
  - The trip panel's values are mono mixed case (`New Orleans → New York Penn`), with an underlined `Crescent`.
  - Settings agency names are mono title case at about 21 px (`Amtrak`, `MARC Train`).
- **Direction:**
  - **Names** (service, origin, destination, station, operator, agency) are set in Barlow Semi Condensed 500, uppercase,
    tracking +0.06 em, at `--fs-12`. Condensed type recovers about 25% width.
  - **Numbers stay mono:** train number, times, delays, counts.
  - **Trip panel key/values:** keys as now, values uppercase Barlow Semi Condensed 500 `ink`. Use no underline. Links are shown
    by a 1 px `line-faint` underline on hover only, plus a `→` affordance, as in Feeds.
  - **Settings source title:** Rajdhani 600, `--fs-15`, uppercase, `+0.12em` (`AMTRAK`), with code and kind in label style
    after it.
- **Done:** a font audit of `TrainList`, `StationBoard`, `TripPanel`, `RoutePanel` and Settings finds mono only on numerals
  and IDs.

### 7. GTFS display names need a cleaning pass
- **Severity:** major
- **Screen:** all transit views
- **Seen:** `UNION STATION MARC WASHING…`, `BWI RAIL STATION MARC`, `SLIDELL AMTRAK STATION`,
  `NY MOYNIHAN TRAIN HALL AT PENN STATION` (`d-07`, `d-09`, `d-23`). The route row reads `UNION STATION MARC Washington → PENN`.
- **Direction:**
  - Add one `displayName(stop)` helper that strips trailing agency and boilerplate tokens (` MARC`, ` AMTRAK STATION`,
    ` RAIL STATION`, ` STATION` when the result stays unique within the view).
  - Map the curated D21 group ids to short names (`WASHINGTON UNION`, `BALTIMORE PENN`, `NEW YORK PENN`).
  - Keep the full official name in `title` and on the station page header.
  - This is presentation only: P3 still holds, because the value is real and only the label is edited.
- **Done:** no list cell truncates at 1920 for the DC corridor stations.

### 8. Maximize stretches a list instead of revealing an instrument
- **Severity:** major
- **Screen:** Route, Trip and Station panels maximized (D23)
- **Seen:** `d-08-route-full.png` (a 340 px timetable in an 1800 px frame, 80% empty), `d-22-trip-full.png` (names far left,
  times 1300 px away), `d-09-station-full.png` (the docked board with wider gaps).
- **Direction:** maximize is where P7 lives.
  - **Route full** is the stringline (M19). X is stops along the route, evenly spaced, as in the schematic. Y is time over the
    selected date, down = later. Each trip is a 1 px `line` string; today's live trips use 2 px `ink`, and the selected trip
    uses 2 px `state-select`. The now-line is `state-idle`. The timetable grid sits beneath it as a toggle. This is the
    railroad's own chart and the strongest image the product could have.
  - **Trip full** has a left column (40%) with the key/value block and a 48 px hero, the delay readout (`+16` / `ON TIME`). The
    right column (60%) is a vertical strip diagram of the run: a stop tick on a 1 px line, passed stops `ink-3`, the train's
    position as the M8 bar between ticks, and times aligned in a mono column 24 px from the line, not at the far edge.
  - **Station full** has a hero row with the next departure at 48 px (`14:55 · AMTK 2118 · ACELA · NY MOYNIHAN`) and the board
    below with max-width columns: TO capped at 360 px, STATUS beside it, and no full-bleed spread.
- **Done:** no row in a maximized page spans more than about 960 px between related values.

### 9. Panel chrome: drop shadow, off-scale title, cramped header, overflowing chips
- **Severity:** minor
- **Screen:** docked panel
- **Seen:**
  - `d-06`, `d-21`, `i-32`. `Panel.svelte` sets `box-shadow: -12px 0 32px` (and `0 12px 48px` when maximized).
  - The title is `calc(--fs-24 * 0.8)`, about 21.6 px, which is off-scale.
  - `STATUS` sits 4 px under the kind line.
  - The route chip row clips at the right edge (`… FLORIDIAN (`).
  - The date control shows a bright filled white square (`d-07`).
- **Direction:**
  - Delete both shadows (Don't #9). Separate the panel with a 1 px `line-faint` left rule, plus the existing `line` brackets.
  - Title at `--fs-18` docked and `--fs-24` maximized, Rajdhani 600.
  - Use 16 px between header block and first section, with section heads in the spec's inspector style (11 px 600 `ink-2`,
    1 px `line-faint` rule).
  - Chip rows wrap to a maximum of 2 lines, then show a `+9` chip that expands.
  - Replace the filled square with the 16 x 16 outline calendar glyph in `line`.
  - The maximized dim (`rgb(0 0 0 / .35)`) may stay, but use `bg-void` at 60% so the hue stays cold.
- **Done:** the panel reads as the §8.3 Rogue Signal window: bracketed, `bg-raised`, no shadow.

### 10. Station board: the most important value is the faintest
- **Severity:** major
- **Screen:** Station panel
- **Seen:**
  - `d-06`, `d-09`, `i-33`. STATUS (`SCHED`, `ON TIME`, `−45 MIN`) is 11 px `ink-3` at the far right, and `EXPECTED` shows
    `— — —` for most rows.
  - Rows sort by expected time, so `15:57 / 15:12` sits above `15:20` with no visual explanation.
- **Direction:**
  - Merge SCHEDULED and EXPECTED into one TIME cell. When realtime differs, scheduled shows in `ink-3` with a 1 px
    strikethrough and expected in `ink` beside it (`15:57 15:12`). When equal or schedule-only, show one time.
  - Status words follow #1's luminance steps.
  - `SCHED` becomes `SCHEDULE ONLY` in `ink-3`, short form `SCHED` (D19 wording).
  - A track badge, when known, is mono in a 1 px `line` box.
- **Done:** a reader can find the late trains in the board in under two seconds, with no colour.

### 11. Map overlays crowd each other, the fit ignores them, and the hero counts the wrong set
- **Severity:** major
- **Screen:** Map
- **Seen:**
  - `d-01`, `d-02`, `d-11`. The 800 x 300 train list covers the west of the country at national zoom and tracks 7-12 on the
    Union Station schematic.
  - `i-31`: with the panel open, the control row overprints the hero (`GEO` over `220 TRAINS TRACKED · 220 LI`).
  - The hero says `218 TRAINS TRACKED` while the list says `IN VIEW · 15`, and `1 FEEDS` is the wrong plural.
- **Direction:**
  - The default `fitExtent` uses insets: left = list width + 24, right = panel width + 24 when docked.
  - The train list gets a fixed width (560 px at 1920, 4 columns at ≤ 1440: TRAIN · SERVICE · NEXT · STATUS) and a
    `max-height` of 40% of the canvas. On the Union Station schematic it collapses by default.
  - The control row and TERMINALS move into one row; TERMINALS becomes a single `TERMINALS ▾` chip, shown only when a
    terminal is in view.
  - Hero: `15` at 48 px with `TRAINS IN VIEW`, and line 2 `218 TRACKED · 4 SOURCES LIVE · 1 FEED · 37 STATIONS`. The datum the
    observer is looking at is the hero (P4).
- **Done:** no overlay overlaps another at 1920x970 or at 1180x820, with or without the panel.

### 12. The national view is rotated, clumped, and lit by the wrong objects
- **Severity:** major
- **Screen:** Map, national zoom
- **Seen:** `d-02`, `crop-national-ne.png`.
  - The corridor projection's ~54° turn tips the US on its side, and the graticule reads `14 N` beside longitudes.
  - Trains merge into cyan blobs in the Northeast and Florida.
  - The white station diamonds are the brightest marks on the map.
  - The DC TERMINALS list stays up at national scale.
- **Direction:**
  - Below the corridor zoom threshold, morph `projection.angle()` to 0 over 600 ms `ease-in-out` (§9.5 already uses a
    600 ms path morph for GEO/SCHEMATIC). The DC–Baltimore chord only needs to be horizontal at corridor scale.
  - National markers become 2 x 6 px `ink` bars with no ring and no label. Trains within 12 px of each other merge into one
    bar with a mono 11 px count (`×7`) in `ink-2`.
  - Stations at national zoom become 3 px `line-faint` ticks; only the curated D21 terminals get a diamond.
  - Graticule every 5°, with numerals only on the bezel edges and never inside the plot.
- **Done:** the US is recognizable upright, and trains outrank stations.

### 13. The iPad header collides when a channel keys
- **Severity:** major
- **Screen:** all, 1180x820
- **Seen:** `i-30`, `i-31`, `i-33`. `KEYED · CH22 · CH12` pushes `FEEDS 1/1` and `ASR OK` over `FEEDS & BANKS` and `SETTINGS`.
- **Direction:**
  - At stage width ≤ 1440, the keyed chip shows a count (`KEYED · 2`), with the channel list in its title or tooltip.
  - System chips group into one bracket (`FEEDS 1/1 · ASR OK`).
  - The nav keeps a guaranteed 24 px gap to the chip group, enforced by flex `min-width` rather than absolute position.
- **Done:** the header never overlaps itself with three keyed channels at 1180.

### 14. The Union Station schematic is a diagram with no data
- **Severity:** major
- **Screen:** Map, TERMINALS → Union Station
- **Seen:** `d-11-union-station.png`.
  - All tracks are the same `line` weight.
  - Track numbers repeat at both throats.
  - Area labels (`CSX METRO SUB`, `IVY CITY YARD`) are about 20 px tracked display, louder than the terminal.
  - Nothing shows which tracks are in use.
  - The train list covers tracks 7-12, and `LOWER LEVEL` collides with ON AIR.
- **Direction:**
  - Tracks with an assigned departure or arrival in ±60 min (Amtraker gives tracks; D19) draw at `stroke-active` `ink` and
    carry a tag at the platform end (`AMTK 2118 · 14:55`). A train present now gets the M8 bar. All other tracks drop to
    1 px `line-faint` (P5: the drawing earns its ink by carrying occupancy, as a CTC panel does, M18).
  - Number tracks once, at the platform end.
  - Area labels go to `--fs-11` label style `ink-3`.
  - Collapse the train list when the schematic opens (#11).
- **Done:** the screen answers "which tracks are busy in the next hour" at a glance.

### 15. Live Ops: dead bottom 40% and a lifted waterfall after CTC/LOFAR removal
- **Severity:** major
- **Screen:** Live Ops
- **Seen:**
  - `d-13`, `i-34`. Below the tiles is empty to the status line.
  - The waterfall rests as a uniform teal field around `#0A1F28`–`#124A5A`, not near-black, which breaks the §10.3 idle
    luminance budget.
  - The idle hero says `NO KEY-UPS YET` while the log already shows two rows.
- **Direction:**
  - Re-pack:
    - spectrum 120 px
    - waterfall to 240 px (120 s at 2 rows/s, with ruler ticks `−30 S`, `−60 S`, `−90 S`)
    - the tile and log row takes the remainder, the log running full height to the status line
  - Re-check the noise-floor clamp (§3.3): the floor must map to `ramp-0`/`ramp-1`, so a quiet band averages under about 6%
    luminance.
  - Idle hero: `LAST KEY-UP 42M AGO` (§7.5), derived from the same source as the log, and never "yet" while rows exist.
- **Done:** an idle screenshot histogram under about 6%, and no empty quarter of the screen.

### 16. Spectrum and frequency rulers: numerals collide
- **Severity:** minor
- **Screen:** Live Ops, Feeds & Banks
- **Seen:**
  - `d-13`: `160.260 12`, `16 17`.
  - `d-14`: `12 1617`, `161.160161.310161.460`.
  - `i-34`: the `REF −10 dBFS · 10 dB/div` legend is struck through by the trace.
- **Direction:**
  - Two-row ruler per M2: AAR channel numbers on the upper row (12 px `line` tick and mono 11 `ink-2` number, dropping any
    number within 14 px of the previous one) and MHz majors on the lower row in `ink-3`.
  - The per-division legend sits *outside* the trace box, top-right, above the graticule (M3: "the per-division scale in a
    corner"), on a `bg-void` plate.
- **Done:** no numeral overlaps at 1920 or 1180.

### 17. Settings: cards at the wrong density, duplicated timings, a missed disk chip
- **Severity:** minor
- **Screen:** Settings
- **Seen:**
  - `d-15`, `i-36`. Each source is a filled 195 px card, so 18 sources make a long scroll.
  - Card frames are filled boxes (panels are drawn by line, §3.1).
  - `TRANSIT TIMINGS` repeats the card data, with a header collision (`STATIC AGEREALTIME AGE`).
  - Disk is `94% USED` but no `DISK 94%` chip appears in the header (§8.1).
- **Direction:**
  - Sources become one table, 40 px rows: M6 glyph · SOURCE (Rajdhani, #6) · KIND · ROUTES · STOPS · TRIPS · VEHICLES ·
    STATIC AGE · RT AGE · POLL · STALE AFTER (D22, editable inline) · toggle. A row expands in place for EDIT, REFRESH and
    DELETE.
  - Remove the duplicate `TRANSIT TIMINGS` block from the Backend column.
  - Replace the `OK` chip with the M6 idle glyph. Stale or failed sources take the hollow or crossed glyph with an `AGE`
    readout.
  - Raise the degraded `DISK 94%` chip (`state-stale`, dashed brackets) whenever disk exceeds 85%.
- **Done:** all 18 sources are visible without scrolling at 1920x970.

### 18. Feeds & Banks: contradictory spectrum state
- **Severity:** minor
- **Screen:** Feeds & Banks
- **Seen:** `d-14`. The panel reads `NO SAMPLES · LAST 14:48:25` while drawing an orange TX slot.
- **Direction:** pick one truth. If samples are flowing, remove the overlay text. If not, the TX slot must not draw (§8.6: no
  fake rows, values freeze).

### 19. The login ruler stops short of the viewport edge
- **Severity:** nice-to-have
- **Screen:** Login
- **Seen:** `d-00`. The M2 ruler ends at about x = 1695 of 1920 since the stage became dynamic.
- **Direction:** size the ruler to the viewport width minus the 32 px margins.

### 20. Motion check still owed
- **Severity:** nice-to-have
- **Screen:** all
- **Seen:** stills only.
- **Direction:** the next review needs a 10 s screen capture of the idle Map. Pass criteria (§7.5): nothing moves except the
  5 s train glides and pings. This verifies #2's pulse removal and the 400 ms train glide.

---

## Top 5 priorities for the next sprint, in order

1. **Restore P2 hue discipline in the transit UI (#1, #2, #3).** Remove ember and red from delay and freshness, carry those by
   luminance, text and M6 geometry, kill the pulse, and drop the train ring to `line`. Orange means a key-up again, everywhere.
2. **Rebuild the map label and overlay system (#4, #5, #11, #13).** One uppercase two-line train tag in the collision placer,
   two tag lanes in schematic, knockout plates, fit insets for list and panel, the in-view hero, and an iPad header that cannot
   collide.
3. **Bring transit typography and chrome back to the brief (#6, #7, #9, #10).** Names in Barlow Semi Condensed uppercase and
   numbers in mono, cleaned GTFS names, no drop shadows, on-scale titles, and a station board where the delay is the brightest
   value.
4. **Make maximize earn its space (#8, #14).** Route becomes the stringline (M19), trip becomes a strip diagram with a delay
   hero, station gets a next-departure hero, and the Union Station schematic shows track occupancy.
5. **Re-pack Live Ops and fix the waterfall floor (#15, #16).** A taller waterfall, a full-height log, a quiet near-black idle
   band, a truthful idle hero, and collision-free rulers.

The national view (#12) is next in line after these five.

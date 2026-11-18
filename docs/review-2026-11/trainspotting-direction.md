# TRAINSPOTTING: creative direction

**From:** gmunk-director, a creative director persona inspired by GMUNK's published work. It is not the person.
**To:** film-graphics-designer (mockups) and frontend-engineer (build, later)
**Date:** 2026-11-17 · **Status:** direction for design. This file contains no code.
**Read with:**
- `docs/brief/creative-brief.md`, which is the family this page belongs to;
- `docs/personas/railfan.md`, which is the user;
- `docs/decisions.md` rows 15-27 (the transit pages: delay never orange, the freshness square, passes always `~`);
- `docs/transit-api.md`, for the `position`, `stale`, `state_basis` and `pass_estimated` fields.

---

## 0. The one-paragraph version

TRAINSPOTTING is the **wayside listening table folded into a pocket**.

- You stand on a platform at Odenton. The page knows where you are, snaps you to the nearest track, and gives you a
  milepost: `NEC 113.6`.
- The hero is one number: **how many minutes until the next train reaches you**.
- Under it, an **approach ladder** shows every train converging on your spot from both directions, like a radar range
  scale folded flat.
- Under that is the honest table: train number, operator, direction, ETA, and *how we know*.

Nothing on the page is decorative. The ladder is a scale and the spot mark is a registration mark (M4). Measured,
predicted and scheduled are drawn three different ways, so you never chase a train that is not there (railfan §1).

**Job sentence (brief §9 style):** *"What is coming past where I am standing, when, and how sure are we?"*
**Hero datum (P4):** the ETA of the next train to reach the spot, for example `4 MIN`.

---

## 1. The user and the conditions

- **Who:** the railfan persona: scanner on the belt, phone in hand, end of the platform. They want *what it is, where it
  is, what it is doing*. They do not need to be told a train is late, but they must be told when we are guessing.
- **Where:** outdoors, often in sun, one hand, glancing for two seconds between watching the track.
- **What that does to the design:**
  1. **Phone first.** Design at 390 × 844 first, then scale up to desktop. This page must **not** use the letterboxed
     stage (review finding 1). It is a fluid page.
  2. **Glanceable hierarchy.** One number readable at arm's length, then one strip, then a list.
  3. **Bigger type floor.** On a phone, 13 px minimum for data and 15 px for row primaries. The hero is 48 px mono, as
     everywhere (the 72 px step stays reserved for the system-down alarm, §4).
  4. **Contrast for daylight.** Essential text uses `ink`, never `ink-3`. `ink-2` is for secondary labels only. See §8 for
     the optional high-contrast toggle.
  5. **The screen stays awake** while the page is open (Screen Wake Lock), with a small `AWAKE` word in the status line
     so it is never a hidden behaviour.

---

## 2. The spot (position)

The spot is the page's origin. Treat it like the brief treats a feed site: a **registration mark** (M4, circle r = 6
plus crosshair) with a data block.

### 2.1 Sources, in order
1. **Browser geolocation** (default). On first visit the page asks once, with the reason stated: `USE MY LOCATION TO
   TIME TRAINS TO THIS SPOT`. Accuracy is shown: `GPS ±12 M`.
2. **Pick a station.** Search over station groups (`st:BWI`, `st:WAS`, …) and single stations. Typing `odent` finds
   Odenton.
3. **Type a place.** Accepts:
   - `39.0869, -76.7065`
   - a milepost, which is the railfan's native unit: `NEC 113.6`, `BAA 21.7`
   - a station name.
4. **Tap the mini-map** (desktop: click). The spot snaps to the nearest track.

### 2.2 The snapped spot
The raw position is projected onto the nearest line within 2 km, and the spot readout states both:

```
SPOT  NEC 113.6 · ODENTON          GPS ±12 M · 40 M FROM TRACK
```

- **Line:** the route prefix and milepost (P7). Where no sourced MP exists, show `≈ 4.2` in `ink-3` (§4), as the map does.
- **Nearest place:** the nearest station or interlocking name.
- **Offset:** the distance from the raw position to the track.
- **Several lines within 2 km** (for example Halethorpe, where the NEC and the CSX Capital Sub are close): the spot
  readout gets a line selector, `NEC ▾`. The table shows all lines, grouped.
- **No line within 2 km:** a statement, not an error:
  `NO LINE WITHIN 2 KM · NEAREST NEC 113.6 AT 3.4 KM · USE IT`. Tapping `USE IT` snaps there.
- **Geolocation denied:** `LOCATION BLOCKED · PICK A STATION`, in 15 px `ink-2`, with the station search focused. Never
  red: the user chose this, and nothing is broken (P2).

### 2.3 Shareable
The spot lives in the address: by station, or by line and milepost (decision 15 style, query parameters). A railfan can
text a friend `…/spot?mp=NEC+113.6`.

---

## 3. Hierarchy

1. **Hero:** next arrival at the spot.
   - `4 MIN` in 48 px mono `ink`.
   - Then `MARC 537 · SB · STOPS` in 15 px Barlow Semi Condensed uppercase.
   - Then the basis line, `TRACKED · POS 18S`, in 13 px `ink-2`.
   - If the next event is a pass (a train that does not stop at the spot, decision 17), the word is `PASSES` and the
     ETA carries the approximate mark: `~4 MIN`.
2. **Approach ladder:** a full-width strip showing everything converging on the spot (§4).
3. **Table:** every train in the horizon, sorted by ETA (§5).
4. **Spot bar:** where you are and how sure the position is (§2.2). Small on purpose: it is context, not content.
5. **Status line and title block** (shell, §8.1): `SPOT · NEC 113.6 · 9 TRAINS NEXT 60 MIN · AWAKE`, and the title block
   with `WLT-1 · SPOT · 14:07:33 EST`.

---

## 4. The approach ladder (the page's signature element)

A horizontal scale, **minutes to the spot**, with the spot at the centre as an M4 registration mark. Trains approach
along it from each side:

```
 FROM WASHINGTON (NB) ▶                                       ◀ FROM BALTIMORE (SB)
 30    25    20    15    10     5     ⊕     5    10    15    20    25    30   MIN
 ├─────┼─────┼─────┼─────┼─────┼─────╋─────┼─────┼─────┼─────┼─────┼─────┤
   ▫ MARC 540      ▭AMTK 171 ──────────▶⊕◀──── ▭MARC 537          ▭AMTK 2163
 (dashed: predicted)  (hollow 4/4: stale)          (solid: tracked)
```

### 4.1 Geometry
- **Orientation follows the map rule** (§9.0.4, left-to-right). The end of the line with the smaller x on the map goes
  on the left, so DC-side trains approach from the left and Baltimore-side trains from the right. The ladder then reads
  like the CTC strip, the schematic and the map. Name each arm by origin (`FROM WASHINGTON`), not by compass, with
  `NB` / `SB` (the timetable direction) as the secondary tag.
- **The axis is time, not distance.** A railfan plans in minutes. Distance is in the table.
  - M2 ticks: majors every 5 min with numerals, minors every minute.
  - The axis is linear from 0 to 30 min. Trains beyond 30 min sit in a 24 px "beyond" gutter at each end as a count:
    `+3 ›`.
- **Train glyph:** the map's 4 × 10 px rectangle, laid along the axis, with the train tag above it (`MARC 537`, 13 px
  mono). Tags use the greedy placer; when they collide they stack in two rows, then collapse into a count.
- **The spot mark** at centre is an M4 registration mark in `line`, 1 px, with `NEC 113.6` beneath it.
- **Meets** (railfan §1, station page): when two opposite-direction trains are due within 2 min of each other, draw an
  M12 dimension line between their glyphs and the spot, labelled `MEET ~14:32`. It is informational, in `ink-2`.

### 4.2 How "real vs estimated" is drawn: three bases, three geometries
This is the most important rule on the page. Hue is not available: orange means only transmitting, red means only fault,
and the only cyan is the idle/armed mark. **Basis is carried by fill, stroke pattern and a word**, using the dash
tokens the brief already defines (§5.3).

| Basis | Data behind it (transit-api) | Ladder glyph | Table ETA | Basis word |
|---|---|---|---|---|
| **TRACKED** | `position: "realtime"`, not `stale`. ETA = distance along the shape ÷ recent speed, bounded by the schedule. | Solid filled rectangle, `ink`, plus a 600 m-equivalent tail (Tron traveling linework, map §9.5 item 9) | `4 MIN` | `TRACKED · POS 18S` |
| **TRACKED, STALE** | `position: "realtime"`, `stale: true` | Hollow rectangle, `dash-stale` 4/4 outline | `~6 MIN` | `STALE · POS 3M` |
| **PREDICTED** | Realtime trip update with no position (`position: "estimated"`), or `pass_estimated` | Hollow rectangle, `dash-threshold` 2/3 outline (the brief's "planned/predicted" pattern) | `~7 MIN` | `PREDICTED` |
| **SCHEDULED** | Schedule only (`estimated: null`) | Outline-only tick, no rectangle, `line-faint` + label in `ink-2` | `~12 MIN` | `SCHEDULED` |

Rules:
- **The `~` is mandatory** on every non-TRACKED ETA, matching the passes rule (decision 17). A bare number means
  "measured".
- **Freshness square** (decision 27) sits beside every TRACKED and STALE row: filled when fresh, hollow past the stale
  limit, crossed past 10 min. It is the same mark the map's train list uses.
- **Grayscale test:** a grayscale screenshot must still separate solid, 4/4 dashed, 2/3 dashed and tick-only.
- A **SCHEDULED** train that is overdue by more than 10 min with no realtime does not count down into negative numbers.
  It parks at the spot mark as `DUE · NO REALTIME` in `ink-2`. This is the railfan's "no radio contact" idea, stated
  as data, not alarm.

### 4.3 Delay
Delay is not the ladder's job: position on the axis already includes it. In the table, delay follows decision 26:
brightness steps, `+12 MIN` text and a short length bar. Never orange.

---

## 5. The table

Sorted by ETA. It has three bands, separated by the station board's `NOW` divider, which is reused exactly as it is:

1. **JUST PASSED:** trains that reached the spot in the last 10 min. These rows are dimmed to `ink-3`, with ETA replaced
   by `PASSED 3M` (position basis) or `PASSED ~3M` (clock basis, `state_basis: "clock"`).
2. **`NOW` divider.**
3. **COMING:** everything with an ETA inside the horizon. The horizon chips are `30 MIN` · `60 MIN` (default) ·
   `2 H`.

### 5.1 Columns (desktop)

| Column | Content | Type |
|---|---|---|
| ETA | `4 MIN`, `~7 MIN` | mono 24 px `ink` (the second-largest type on the page) |
| AT | clock time at the spot, `14:11` (`~14:11` if not tracked) | mono 15 `ink-2` |
| TRAIN | `MARC 537` | mono 15 `ink` |
| OPERATOR | `MARC` | Barlow Semi Condensed 13 uppercase `ink-2` |
| DIR | `◀ SB` or `NB ▶`, with the arrow pointing the way the train moves *on the ladder* | label 13 |
| STOPS / PASSES | `STOPS` or `PASSES · DOES NOT STOP` (decision 17, same treatment as the boards) | label 13 |
| FROM → TO | `PERRYVILLE → WASHINGTON` | label 13 `ink-2` |
| NOW AT | the nearest place or MP of its current or predicted position: `NEC 118.2 · BOWIE` | mono/label 13 |
| DIST | track distance to the spot, `6.4 MI` (`≈` if estimated) | mono 13 |
| DELAY | decision 26 bar plus text | mono 13 |
| BASIS | freshness square plus `TRACKED` / `STALE` / `PREDICTED` / `SCHEDULED` | label 11 `ink-2` |

- **Selection** uses the brief's outer brackets (§3.5). Selecting a row highlights its glyph on the ladder, and the
  reverse works too: both directions, always (railfan §2).
- **Opening a train:** a second tap, or the `›` at row end, opens the existing trip page. On desktop it docks on the right
  per decision 23; on a phone it opens full screen with a `BACK` chip.
- **Track number** (`TRK 2`), when the feed knows it, joins the STOPS column: `STOPS · TRK 2`. Railfans care because the
  track decides the photo.

### 5.2 Rows (phone)
Two lines per row, 64 px tall, with a 44 px tap target for the whole row:

```
 4 MIN    MARC 537          ◀ SB  STOPS · TRK 2   ■
          PERRYVILLE → WASH · NEC 118.2 · TRACKED
```

- ETA: mono 24 `ink`, left, 88 px column.
- Line 1: train (mono 15 `ink`), direction, stop/pass.
- Line 2: route and now-at, 13 px `ink-2`, ending with the basis word.
- The freshness square sits at the far right of line 1.
- Delay replaces the route on line 2 when the train is late: `+12 MIN ▬▬` first, then the route, truncated.

---

## 6. Layout

### 6.1 Phone (390 × 844, the design target)

```
┌──────────────────────────────────────┐
│ SDRVIZ  SPOT                14:07 EST│  header 44: mark, screen, clock; menu ≡ at far right
├──────────────────────────────────────┤
│ ⊕ NEC 113.6 · ODENTON          ▾     │  spot bar 48: tap opens the spot picker sheet
│   GPS ±12 M · 40 M FROM TRACK        │
├──────────────────────────────────────┤
│                                      │
│  4 MIN                               │  hero 112: 48 px mono
│  MARC 537 · SB · STOPS · TRK 2       │  15 px label
│  TRACKED · POS 18S  ■                │  13 px ink-2
│                                      │
├──────────────────────────────────────┤
│ FROM WAS ▶               ◀ FROM BAL  │  ladder 104: ±30 min at ~5.6 px/min
│ 30  20  10   ⊕   10  20  30  MIN     │
│ ├───┼───┼──┼─╋─┼──┼───┼───┤          │
│  ▫540  ▭171 ─▶⊕◀▭537     ▭2163       │
├──────────────────────────────────────┤
│ [30 MIN] [60 MIN] [2 H]   ALL ▾      │  filter row 40: horizon chips, operator filter
├──────────────────────────────────────┤
│ PASSED 3M  AMTK 2160  NB ▶ PASSED    │  just-passed rows (dim)
│ ─────────────── NOW ──────────────── │
│ 4 MIN   MARC 537  ◀ SB STOPS·TRK 2 ■ │  64 px rows
│         PERRYVILLE → WASH · TRACKED  │
│ ~9 MIN  AMTK 171  NB ▶ PASSES      □ │
│         BOSTON → ROANOKE · STALE 3M  │
│ ~12 MIN MARC 540  NB ▶ STOPS         │
│         WASH → PERRYVILLE · SCHEDULED│
│  …                                   │
├──────────────────────────────────────┤
│ SPOT · 9 TRAINS / 60 MIN · AWAKE     │  status line 24 (title block collapses into the menu)
└──────────────────────────────────────┘
```

- **Sticky:** the header, spot bar, hero and ladder stay pinned, which is about 308 px. The table scrolls beneath, and
  the hero is always visible. In landscape on a phone, the hero and ladder sit side by side to save height.
- **Spot picker:** a bottom sheet (full width, `bg-raised`, M1 brackets) with `MY LOCATION`, a search field, recent
  spots (local to the device), and `PICK ON MAP`, which opens a full-screen mini-map.
- **The phone has no mini-map** on the main view: the ladder *is* the map at this size. The full map is one tap away.

### 6.2 Desktop (1920 × 1080, inside the normal shell)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SDRVIZ SPOT        MAP  LIVE OPS  SPOT  FEEDS & BANKS  SETTINGS              chips · 14:07:33 EST  │ 40
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ NEXT AT SPOT  4 MIN  MARC 537 · SB · STOPS · TRK 2 · TRACKED POS 18S ■     ⊕ NEC 113.6 · ODENTON ▾ │ 64 hero
│                                                                            GPS ±12 M · 40 M TRACK  │
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ◀ FROM WASHINGTON (NB)                                                     FROM BALTIMORE (SB) ▶   │
│ 30      25      20      15      10       5       ⊕       5      10      15      20      25     30  │ 136 ladder
│ ├───────┼───────┼───────┼───────┼────────┼───────╋───────┼───────┼───────┼───────┼───────┼──────┤ │ full width
│     ▭AMTK 171       ▫MARC 540         MEET ~14:16 ├────┤ ▭MARC 537          ▭AMTK 2163        +3 › │
├──────────────────────────────────────────────────────────────────┬─────────────────────────────────┤
│ [30 MIN][60 MIN][2 H]   ALL · AMTRAK · MARC · VRE    9 TRAINS     │  MINI-MAP · 5 KM               │
│ ETA     AT     TRAIN     OPR    DIR   STOPS/PASSES  FROM → TO  …  │                                │
│ PASSED 3M 14:04 AMTK 2160 AMTRAK NB▶ PASSES …              (dim)  │   rail lines within 5 km,      │
│ ───────────────────────────── NOW ───────────────────────────────│   spot ⊕ registration mark,    │
│ 4 MIN   14:11  MARC 537  MARC   ◀SB  STOPS · TRK 2  …  TRACKED ■  │   trains within range on       │
│ ~9 MIN  ~14:16 AMTK 171  AMTRAK NB▶  PASSES · DOES NOT STOP … □   │   their real positions, M5     │
│ ~12 MIN ~14:19 MARC 540  MARC   NB▶  STOPS  …        SCHEDULED    │   range rings at 1 / 2 / 5 km  │
│ …                                                       8 cols    │   4 cols                       │
├──────────────────────────────────────────────────────────────────┴─────────────────────────────────┤
│ SPOT · NEC 113.6 · 9 TRAINS NEXT 60 MIN                    WLT-1 · SPOT · NEC 113.6 · 14:07:33 EST │ 24
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Grid:** the brief's 12 columns and 32 px margins. Table in 8 columns, mini-map in 4.
- **Ladder orientation:** on desktop the ladder runs the full content width (1856 px, so about 30 px per minute), which
  makes it the screen's front wall, as the band is on Live Ops (§8.2).
- **The mini-map** is a cropped instance of the existing map renderer at a fixed 5 km radius:
  - no hatch or coverage (they are radio concerns, not this page's);
  - M5 range rings at 1, 2 and 5 km around the spot, labelled at north;
  - trains glide on updates exactly as on the main map.
  The page's single source of geography, at a glance.

---

## 7. Motion

Choreography, not decoration. The page is quiet until a train is close.

| Event | Motion | Token |
|---|---|---|
| Page open | Standard build-on: brackets → ladder ruler → labels → values tick in from `— — —` | `t-build` 600 ms |
| Position update (every poll) | Ladder glyphs and mini-map trains glide to the new position | 400 ms `ease-in-out` |
| ETA change | Digits *click* (step), and only when the whole-minute value changes | `step`, `t-tick` 240 ms |
| Row order change | Rows re-pack | 400 ms `ease-in-out` (§5.1 Disc Game collapse) |
| Train under 2 min | ETA switches to `1 MIN`, then `DUE` under 30 s. No second-by-second countdown: our estimates are not that precise, and a ticking seconds field is false precision (P3). | step |
| Train reaches the spot | **One** ring from the spot mark, r 6 → 40 px, `line` 60% → 0, 1200 ms (the M14 geometry, in ink, never orange). The row slides under the `NOW` divider into JUST PASSED and dims. | `t-ping` |
| Basis change (PREDICTED → TRACKED) | The glyph's outline goes from dashed to solid with a single 120 ms brightness flash, the same as decision 27's "new data" flash | `t-flash` |
| Spot moved | Ladder and table blank to `— — —` for one frame, then build values in (no full build-on) | 300 ms |

- **Ambient budget:** zero. There is no sweep on this page (§7.5 grants one ambient motion per screen, and this screen
  does not need it). The only things that move at rest are train glides and the clock.
- **Reduced motion** (§7.7): glides become jumps, the ring is skipped, and digits change in place.
- **Tab return** (phone lock and unlock): values snap to the truth with no count-up, and there is no build-on (§10.8).

---

## 8. How it belongs to the sdrviz family

- **Same tokens.** `bg-void` page, `bg-panel` plates, `ink` / `ink-2` / `ink-3`, `line` hairlines, M1 brackets, the
  8 px grid, Rajdhani for the screen title only, Barlow Semi Condensed labels, JetBrains Mono numbers.
- **Same semantic hue rules.** No orange on this page unless a train's crew is transmitting. If the owner later lifts
  decision 25 (no radio on transit pages), a talking train's glyph turns `state-tx` here as on the map. Until then the
  page has no orange at all. Red appears only if a *source* faults (`AMTRAK FEED · FAULT` on the spot bar).
- **Same motifs, each with a job:**
  - M4 registration mark = your spot;
  - M2 ruler = minutes to you;
  - M12 dimension line = a meet;
  - M5 range rings = distance on the mini-map;
  - the decision 27 freshness square = position age;
  - the decision 17 `~` = approximate.
  There are no new ornaments.
- **Same voice.** `NEXT AT SPOT`, `NO LINE WITHIN 2 KM`, `LOCATION BLOCKED · PICK A STATION`. No exclamation marks.
  Never "Your train is almost here!".
- **Shell.** On desktop it is a fifth nav tab, `SPOT`, which is the owner's call (see §9). On a phone it is the landing
  page after login when the viewport is narrow.

### 8.1 Daylight legibility (optional, for the owner)
Dark UI in full sun is hard. The family-safe answer is a **HIGH CONTRAST** toggle in the spot bar menu, not a light
theme:
- every `ink-2` becomes `ink`, and `ink-3` becomes `ink-2`;
- hairlines go from 1 px to 1.5 px;
- the dashed patterns lengthen (4/4 → 6/4, 2/3 → 3/3) so they survive glare.
The palette, hue rules and layout do not change. A true light theme would be a second product and is not recommended
(see §9).

---

## 9. Decisions the owner needs to make (ask one at a time)

### Q1. Where does the page live?
1. **`/spot` as a fifth header tab** (recommended). It is standalone, as asked, its own nav entry, and shareable as
   `/spot?mp=NEC+113.6`. It is the phone landing page.
2. **Inside the map**, as `/map?page=spot&…` per decision 15. This keeps the map the home of transit views, but the map
   canvas makes no sense on a phone.
3. **A separate phone-only site** (for example `/m/spot`) with its own minimal shell. This gives the lightest phone
   load, but two shells drift apart.
4. **A mode of the station panel** ("PASSING THIS SPOT"). This needs no new page, but it loses free positions such as a
   milepost between stations.
5. **Both 1 and 4:** the page, plus a "TIME TRAINS HERE" link from every station panel that opens `/spot` with that
   station as the spot.

### Q2. Daylight legibility
1. **No change.** The standard dark palette, relying on the larger phone type floor.
2. **HIGH CONTRAST toggle** (recommended, §8.1). Same palette, promoted inks and thicker strokes.
3. **Automatic high contrast** from the ambient-light sensor where the browser exposes it, else option 2.
4. **A full light theme** for this page only. Maximum sun legibility, but it breaks the family and doubles design and
   QA.
5. **System `prefers-contrast: more`** honoured app-wide, with option 2 as the manual override.

### Q3. Radio on this page (decision 25 currently says no radio on transit pages)
1. **Keep it out** (default, honours decision 25).
2. **TX state only:** a train whose crew is keyed shows the orange glyph and vertical-dot state (§7.3), but no
   transcript. This is cheap and keeps the hue rule universal.
3. **TX state plus a last-heard line** per row: `HEARD 2M AGO · CH54`.
4. **Full**: last transcript snippet on row expand, plus playback. This is the railfan's dream, but it pulls in the
   decision 25 and decision 44 questions.
5. **Option 2 now, option 4 after the History redesign** (decision 34).

### Q4. Which trains count as "passing the spot"
1. **Every train whose shape comes within 200 m of the snapped spot** in the horizon (recommended), including non-stops,
   with `PASSES` marked.
2. **Stopping trains only**, as on a rider's board. Simpler, but it throws away the railfan's most-wanted view
   (railfan priority 3).
3. **Option 1 plus radio-only sightings** (freights, moves) once they exist.
4. **Option 1, filtered by the line the user selected** at a multi-line spot.
5. **Option 1, plus a 2 km "nearby" band** for trains on parallel lines (Halethorpe, Bowie), shown in a separate group.

---

## 10. What "done" looks like for the mockup

- Frames at 390 × 844 and 1920 × 1080 for:
  - **Odenton**, weekday evening rush: at least one TRACKED, one STALE, one PREDICTED and one SCHEDULED train, one meet,
    and one JUST PASSED row;
  - **Halethorpe**: two lines within 2 km;
  - **Location blocked**;
  - **No line within 2 km**.
- The grayscale screenshot separates all four bases on the ladder and in the table.
- At 390 px: no text under 13 px, no horizontal scroll, and the hero, ladder and first two rows fit above the fold.
- No orange and no red in any frame, except a deliberate "source fault" frame.
- Every displayed value is computed from the transit API (P3). Sim trains carry `SIM`.

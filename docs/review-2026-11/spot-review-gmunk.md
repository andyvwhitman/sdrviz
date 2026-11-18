# SPOT (/spot): review of the first build

**From:** gmunk-director, a creative director persona inspired by GMUNK's published work. It is not the person.
**To:** frontend-engineer
**Date:** 2026-11-17 · **Build:** f0b2ce0 · **Against:** `trainspotting-direction.md`, `docs/brief/creative-brief.md`

**What I looked at:** real data on :5197 at Odenton, Halethorpe, Union Station and BWI, at 1920x1080 and 390x844, in
normal and HIGH CONTRAST. I ran a grayscale pass on the fixture (`sp/approaching.json`, which carries all four bases).
I also looked at your Live Ops shots. My shots are in `scratchpad/gmunk26/spot/` and the script is `gmunk26/spot.mjs`.

## Verdict: REVISE (a short one)

The bones are right. It is a fluid page, not the stage. The hero, ladder and table hierarchy reads in two seconds. The
pinned block works when you scroll. I saw no orange or red, no text under 13 px, no horizontal scroll at 390, and no
console errors. Desktop separates the four bases in grayscale. `~` discipline is correct everywhere, including on
tracked trains that pass.

Five things stop it from being honest or legible:
- The spot is named after a train route.
- The ladder arms are compass points.
- On a phone the table cannot tell PREDICTED from SCHEDULED.
- The glyphs pile up on the phone ladder.
- Meet labels overprint.

Fix the seven items below and it ships.

| Brief / direction area | Score | Note |
|---|---|---|
| Hierarchy and glanceability (§3) | 4/5 | The hero is strong. The phone hero's right column wraps badly (item 6). |
| Ladder (§4) | 2/5 | The geometry and ruler are right. Glyphs collide, arms are unnamed, meets are unreadable. |
| Real vs estimated (§4.2) | 3/5 | The ladder and desktop are correct. The phone table loses the basis word. |
| Table (§5) | 4/5 | Desktop is clean. The phone needs the basis word and a cap on passed rows. |
| Family and tokens (§8) | 5/5 | Tokens, chips, brackets and the NOW divider are all reused correctly. HIGH CONTRAST is right. |
| Motion (§7) | 2/5 | There is a glide and nothing else. That is acceptable for v1 (see the unbuilt list). |

---

## Must fix (v1)

### 1. Stop naming the spot after a train route

`nearest_line.name` is a **route** (CRESCENT at Odenton, NORTHEAST REGIONAL at Halethorpe, FREDERICKSBURG LINE at Union
Station), not a line. "SPOT · CRESCENT · NEAR ODENTON" tells a railfan the wrong thing, and it overrides the `name` they
gave in the link. Without mileposts, the place name is the identity.

- `frontend/src/screens/spot/SpotBar.svelte`: change `title` and `heading` to:
  - `spot.name` if set: `SPOT · ODENTON`;
  - else `nearName`: `SPOT · NEAR ODENTON`;
  - else `SPOT · 39.0849, -76.7064` (4 dp).
  Never use `line.name`. In the blocked state, show just `NO SPOT` (drop the doubled `SPOT · NO SPOT`).
- `SpotBar.svelte` `.sb__far`: change the text to `NO TRACK WITHIN {radiusKm} KM · NEAREST AT {distanceText(...)}`,
  followed by `USE IT`. Drop the route name.
- `frontend/src/screens/spot/Screen.svelte`:
  - `spotLabel` becomes `store.spot?.name ?? nearName ?? "SPOT"`.
  - In the status `$effect`, push `spotLabel`, not `line?.name ?? spotLabel`.
- Done when: all four test spots show their given name in the bar, under the ladder mark and in the status line, and
  no route name appears in any of the three.

### 2. Name the ladder arms by where trains come from, not by compass point

`FROM S ▶ / ◀ FROM N` is the most generic string on the page. The data to fix it is already in the response
(`direction.toward`, `direction.label`).

- In `frontend/src/screens/spot/Screen.svelte`, derive both arm names from all rows (passed plus coming):
  - The **left** arm's name is the most common `cleanName(direction.toward)` among **right**-side rows, because trains
    on the right are heading toward the left end. The right arm's name is the reverse.
  - The timetable tag for each arm is the most common `direction.label` among the rows **on** that arm (`NB`).
  - If a side has no rows, fall back to the current compass `fromLabel`.
  - Pass `leftArm` / `rightArm` strings into `Ladder.svelte` in place of `bearing`.
- Text format:
  - Desktop: `FROM WASHINGTON UNION · NB ▶` and `◀ FROM BALTIMORE PENN · SB`.
  - Phone (`!wide`): drop `FROM` and the tag, and cap the name at 13 characters with `…`, so `WASHINGTON U… ▶`.
  - Keep `.ld__arm` in `ink-2`.
- Done when: Odenton reads WASHINGTON on the left and a northern terminal on the right, and the labels do not flicker
  between polls. Ties break alphabetically, so the label is stable.

### 3. Put the basis word back in the phone table

On the phone, `.tr__basis` is `display: none`. A PREDICTED row and a SCHEDULED row both render as `~12 MIN` with no
square, so they are identical. That breaks the page's most important rule (§4.2).

- In `frontend/src/screens/spot/TrainRows.svelte` (phone only, below 900 px), render the basis word as the last item
  of `.tr__route`:
  - `<span class="tr__bw">{basisLine(row)}</span>`;
  - styles: `flex: none`, mono 14 (`--fs-11`), `ink-2`.
  - The route (`.tr__path`) keeps `min-width: 0` and truncates first.
  - At 900 px and up, hide `.tr__bw`, because the BASIS column has it.
- Done when: line 2 reads `WASHINGTON → PERRYVILLE · SCHEDULED`, the word is never truncated, and a grayscale phone
  screenshot of the fixture shows all four words.

### 4. Ladder glyphs: smaller, never hidden behind each other, every train counted

At 390 px, 20 px is 3.6 minutes of axis. Trains 2 minutes apart merge into one bar (MARC 451 and AMTK 2167 at
Odenton), and a tracked tail runs over the next glyph (Union Station). Tags that fail to place vanish with no count,
so the phone silently loses trains (AMTK 171 on the fixture, AMTK 90 and 186 at Union Station).

I am withdrawing my own 4 × 10: a dashed outline needs perimeter, and 4 px cannot show 2/3 against 4/4. New sizes:

- `frontend/src/screens/spot/Ladder.svelte`:
  - Glyph size: `const GLYPH = wide ? { w: 16, h: 8, tail: 20 } : { w: 12, h: 6, tail: 12 }`. It must be
    `$derived`, since it depends on `wide`. The `.ld__hit` target stays 32×48.
  - Hollow glyphs (stale, predicted): `fill: var(--bg-void)`, so a tail or meet leg never shows through.
  - Render in two passes: all tails first, then all glyphs, so no tail is ever drawn over another train.
- `frontend/src/screens/spot/ladder.ts` `placeTags`:
  - A row whose tag cannot place must attach to the nearest placed tag **on the same side**. That tag then reads
    `MARC 448 +1`.
  - Give `Placed` an `extra: number` and render `{tag}{extra ? " +" + extra : ""}`. Count `extra` in the width test.
  - Add a test in `ladder.test.ts`: three rows within 1 minute on one side at width 358, and the visible tags plus
    the `+n` counts equal 3.
- Done when, at 390 on the fixture and on the Union Station data:
  - no two glyphs overlap by more than 2 px unless their ETAs are under 1 minute apart;
  - every coming train inside 30 min is either tagged or counted;
  - the grayscale crop still separates solid, 4/4, 2/3 and the bare tick.

### 5. Meets: one dimension line, readable label, no overprint

At Union Station two meets draw on the same y, and the labels overprint into `MEET ~20:05~20:02`. On the fixture, the
dimension line runs straight through its own label and through the spot crosshair.

- `frontend/src/screens/spot/Ladder.svelte`:
  - Draw only the **soonest** meet: `joined.slice(0, 1)`, sorted by the later of the two ETAs.
  - Draw the horizontal of the dimension line with a gap for the label: two segments, `a → mid - half - 4` and
    `mid + half + 4 → b`, where `half = label.length * 3.9`. The label sits on the line's y (the brief's M12 puts the
    value in the line, not on top of it).
  - If the gap would not fit between `a` and `b`, set the label on its own row below the spot name
    (`axisY + 56`, `ink-2`, 13 px) and grow `height` by 16 for that case only.
  - The meet line's y must clear the registration mark: use `axisY - 18`, not `axisY - 10`, and keep the legs from
    `glyphY + h/2` to that y.
- `MEET_WINDOW_S = 120` stays. Two minutes is my direction, and it is correct.
- Done when: Union Station shows one legible `MEET ~20:02`, and the fixture's label has no hairline passing through
  the glyphs or touching the crosshair, at both widths.

### 6. The phone hero must not wrap mid-phrase

At 390 px the right column breaks as `AMTK 2167 · SB ·` / `PASSES`. In HIGH CONTRAST the basis line wraps as
`TRACKED · POS` / `19S`, with the freshness square hanging alone.

- `frontend/src/screens/spot/Hero.svelte`, below 900 px:
  - Split `detail` into two `nowrap` lines: line 1 is `next.tag` (mono 15 / `--fs-15`, `ink`); line 2 is
    `SB · PASSES` (label 15, `ink`).
  - Move `.nx__basis` out of `.nx__text` into its own grid row that spans both columns, under the big number:
    `grid-template-areas: "k k" "big text" "basis basis"`. Use `white-space: nowrap`.
  - Desktop keeps the single baseline row it has now.
- Done when: no hero text wraps at 390 px in either contrast mode, with a 4-digit train number, `PASSES` and
  `POS 59S`.

### 7. Phone: keep the first two COMING rows above the fold

At Halethorpe, four JUST PASSED rows push the second coming row under the status line (its bottom is at 824 and the
status line starts at about 815). The phone status line also wraps to two lines.

- `frontend/src/screens/spot/TrainRows.svelte`:
  - Below 900 px, show only the **two most recent** passed rows. Add a quiet `+2 EARLIER` text row above them (label
    14, `ink-3`, 32 px tall) that expands the rest on tap.
  - Desktop shows all of them.
  - Use `matchMedia` or a `wide` prop. CSS alone cannot keep the count honest.
- The shell status line (wherever `shell.statusFallback` renders): add `white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis` on phone. Item 1 also shortens the text.
- Done when: at all four spots on the phone, the hero, the ladder and the first two COMING rows are fully visible
  above the status line, and the status line is one line.

---

## Which unbuilt items v1 needs

| Item | v1? | Call |
|---|---|---|
| Milepost (`NEC 113.6`) | **No** | The API has none. Do not fake an `≈`. The place name (item 1) carries identity until MPs are sourced. |
| Arm origin names | **Yes** | This is item 2. |
| Glyph size | **Yes** | Item 4, at the new 12×6 / 16×8 (not 4×10). |
| Meet window 2 min | Already correct | Keep it. Only the rendering (item 5) changes. |
| Row selection brackets (§5.1) | No | Hover-linking between the table and the ladder already works on desktop. Brackets on the table row are nice-to-have 2. |
| ETA digit click (`t-tick` step) | No | Nice-to-have 3. |
| Ring-ping when a train reaches the spot | No, first in line for v1.1 | It is the page's one earned motion. Nice-to-have 1. |
| Page build-on | No | The blank-to-values swap on a spot change is enough for v1. |
| Mini-map (desktop, 4 cols) | No | The desktop table can take the full width until then. Nice-to-have 4. |

## Nice-to-haves (in order)

1. **Ring-ping** (§7): when a row crosses from coming to passed while the page is visible, draw one ring from the spot
   mark, r 6 → 40, `line` at 60% → 0, 1200 ms. Skip it on tab return and under reduced motion.
2. **Selection brackets on table rows** (brief §3.5): use the M1 outer brackets on `.tr.is-sel` in place of the
   `bg-raised` wash alone. On the phone, a first tap on a ladder glyph should select and scroll its row into view; a
   second tap opens the trip.
3. **ETA step**: change the whole-minute value with a 240 ms step (no count-up), `DUE` under 30 s. This is already
   correct in text; only the motion is missing.
4. **Desktop mini-map**, as in §6.2 (5 km, M5 rings at 1/2/5 km). The bottom third of 1080 is empty at every test spot.
5. **Dim the freshness square on JUST PASSED rows**: set `FreshMark` to `ink-3` inside `.tr.is-dim`. Today a passed
   row's square is as bright as a live one's.
6. **Terminals**: at Union Station, a train that *originates* at the spot station (AMTK 2128) should read `DEPARTS`,
   not `STOPS`, and one that terminates should read `ARRIVES`. On the ladder, an originating train should sit on its
   departure arm, not appear to approach from the south.
7. **Parallel lines at Halethorpe**: MARC 858 (Camden Line, `EB`) is mixed into a Penn Line table with nothing to say
   which line it is on. Until the line selector (§2.2) exists, add the route short name to line 2 when a spot has
   rows from more than one `route_id`.
8. **Data check (backend)**: MARC 451 reads `PASSES` at Halethorpe but `STOPS` at BWI. Check it against the
   timetable before a railfan does.
9. Showing the `LOCATION BLOCKED · PICK A STATION` note in both the bar and the picker is one time too many: keep it
   in the picker.

## Live Ops: click-to-listen hint and the empty LIVE bank. APPROVED

- **Hint** (`spot-liveops-hover.png`): `160.8907 MHz · CH52` in mono `ink`, with `CLICK TO LISTEN · SWITCHES TO LIVE
  BANK` beneath in the label face at `ink-2`. It is on the type tokens, reads as instrument, and says what the click
  will do. The confirmation (`LISTENING CH52 · LIVE BANK`) persisting after the pointer leaves is right.
- **Empty bank** (`spot-liveops-empty.png`): a bracketed plate with `LIVE BANK EMPTY` and one instruction is right.
  - One nit, not blocking: the screen title at top left also says `NO CHANNELS IN THIS BANK`, so the screen says the
    same thing twice. Make the title `LIVE · 0 CHANNELS` and let the plate carry the instruction.

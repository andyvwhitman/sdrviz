# WLT-1 Design Standards · sdrviz

**Document:** `design/spec.md` · **Issue:** 1 (Stage 2 foundation) · **Date:** 2026-11-08
**Author:** film-graphics-designer (lead) · **Reviewer:** gmunk-director
**Authority:** `docs/brief/creative-brief.md` revision 2 is the design authority, and `docs/decisions.md` is the user's locked authority. This spec turns the brief into measurements and gives the parts names. Where the two disagree, the brief wins, except for the deliberate interpretations listed in §11, which go to the director for ruling.
**Implementation:** `design/mockups/_shared/hud.css` (tokens + base classes) and `design/mockups/_shared/hud.js` (helpers + builders). **Specimen:** `design/mockups/_shared/specimen.html` renders every token and component state in this document. Its section numbers (01–14) are cited below as *Specimen 05*, and so on.

Layout follows the NASA Graphics Standards Manual: numbered sections, one subject per section, measurements stated, specimens referenced. Token names are verbatim from brief §3, §5 and §7, and each one is a CSS custom property of the same name (`state-tx` → `--state-tx`).

**Void items.** Decision #13 drops police channels everywhere. The `POL` role tag, `csx-police`, and every brief reference to police are void. The seed `NEC Corridor` bank therefore has **8** channels, not the brief's 9.

---

## 0 How to use this document

| You are | Read | Then |
|---|---|---|
| Screen designer (Live Ops, History/Stats, Feeds/Banks, Map) | §4 for your screen's boxes, §5 components, §8 conventions | Link `_shared/hud.css` + `_shared/hud.js`, call `HUD.shell()`, build your content from `HUD.c.*` / `HUD.svg.*`. Do **not** edit `_shared/`. Send change requests to the lead (§8.6). |
| Front-end engineer (Stage 3) | §1–§3 tokens, §5 states, §6 motion, §9 API | Port tokens 1:1 to a Svelte global stylesheet; port `HUD.resolveTile` and `HUD.fmt` to TypeScript unchanged in behavior. |
| Director review | §11 interpretations, Specimen 05–06 (grayscale test), §7 | Rule on each §11 item. |

---

## 1 Color

Hue means state, and only state (P2). Contrast is WCAG 2.x relative luminance against `bg-void`. *Specimen 01* recomputes every ratio in the browser from the live tokens; they match brief §3.1–3.2 exactly.

### 1.1 Surfaces and ink

| Token / CSS property | Hex | vs void | Role | Rule |
|---|---|---|---|---|
| `--bg-void` | `#04070A` | n/a | Page; every plot surface | Never `#000`. |
| `--bg-panel` | `#081015` | n/a | Panel interior | Panels are drawn by line, not fill. |
| `--bg-raised` | `#0C171D` | n/a | Inspector, popovers, menus | `ink-3` on it = 4.66:1 (allowed). |
| `--grid` | `#12232B` | 1.25 | Graticule, lattice, table rules | Decorative. |
| `--line-faint` | `#2C4A55` | 2.13 | Minor ticks, bezels, inactive frames | Decorative. |
| `--line` | `#9CC9D6` | 11.29 | House hairline | |
| `--ink` | `#E4F1F5` | 17.50 | Primary text, hero datum | |
| `--ink-2` | `#8FAFBA` | 8.66 | Secondary text, units, headers | |
| `--ink-3` | `#67868F` | 5.18 | Tertiary text: the floor | **Never inside a wash** (becomes `ink-2`). |

### 1.2 State

| Token | Hex | vs void | Meaning | Geometry carrier (mandatory) |
|---|---|---|---|---|
| `--state-idle` | `#4FCBE6` | 10.59 | Idle/armed mark; squelch-open brackets | Horizontal glyph; diagonal glyph in squelch-open |
| `--state-idle-dim` | `#2F7D91` | 4.29 | Idle tile brackets at rest | Corner brackets. **Never text.** |
| `--state-tx` | `#FF8A2B` | 8.58 | Live transmission. **Exclusive.** | Vertical glyph, 2 px solid frame, running waveform |
| `--state-tx-hot` | `#FFD3A6` | 14.54 | 120 ms commit flash; glow core | Flash only, never resting |
| `--state-recent` | `#B9773F` | 5.55 | Ember < 2 min after release | 2 px underline + `LAST` readout |
| `--state-recent-dim` | `#6E4A2C` | 2.58 | Ember 2–10 min | Underline only. Decorative. |
| `--state-stale` | `#71838C` | 5.12 | Stale; degraded chips; past faults; labels for offline | Hollow glyph, `dash-stale` frame, `AGE` readout |
| `--state-offline` | `#3A474E` | 2.11 | Offline frame | `dash-offline` frame + label in `state-stale`. Decorative. |
| `--state-fault` | `#FF4A3D` | 6.06 | Present equipment fault; form validation text | Filled triangle, `FAULT · <reason>` label |
| `--state-fault-dim` | `#7A2620` | 2.04 | Map coverage hatch of an unacked faulted feed | Hatch only (see §11 item 2) |
| `--state-select` | `#F5FBFD` | 19.33 | Selection, focus ring | Square outer brackets (select); rounded ring (focus) |

**No green, purple or pink. No caution color.** Orange and red are 1.42:1 apart, so they are always separated by geometry: TX is a vertical glyph plus motion, fault is a static triangle.

### 1.3 Washes

| Token | Value | Where | Text allowed |
|---|---|---|---|
| `--wash-tx-surface` | `rgb(255 138 43 / 0.06)` | Keyed tile, keyed transcript row, TX chip | `ink`, `ink-2`, `state-stale`; never `ink-3` |
| `--wash-tx-plot` | `rgb(255 138 43 / 0.12)` | Keyed slot on spectrum and waterfall | **None** |
| `--wash-fault` | `rgb(255 74 61 / 0.06)` | Unacked faulted tile, fault chip | `ink`, `ink-2` |
| `--wash-select` | `transparent` | Selection has no fill | n/a |

Implementation: any element carrying a surface wash also carries class `.has-wash`, which promotes `.c-ink-3`, `.t-micro`, `.t-data-11` and tile footers to `ink-2`. No surface wash exceeds 8%.

### 1.4 Glow

The glow is a second stroke underneath the first: the same path at 3× width in the same hue at 18%. TX adds a third at 6× width and 6%. **No blur filter anywhere** (P10).

| Token | Value | Use |
|---|---|---|
| `--glow-tx-1` | `rgb(255 138 43 / 0.18)` | 3× halo on TX frames, waveform, TX overlays |
| `--glow-tx-2` | `rgb(255 138 43 / 0.06)` | 6× halo, TX only |
| `--glow-trace-1` | `rgb(156 201 214 / 0.18)` | Spectrum trace halo |

On HTML frames the halo is drawn with zero-blur spread `box-shadow`s (inset 4 px and outset 2 px give the 6 px band around a 2 px stroke; inset 7 px and outset 5 px give the 12 px band). In SVG, use classes `.glow-1` and `.glow-2` on a duplicate path underneath. Only three things may glow: TX elements, the spectrum trace, and the hero datum during a promoted warning. Idle cyan never glows. Text never glows (§11 item 8).

### 1.5 Ramp (waterfall, heatmap, LOFAR, spectrogram)

`--ramp-0 #04070A` · `--ramp-1 #0A1F28` · `--ramp-2 #124A5A` · `--ramp-3 #2C8FA8` · `--ramp-4 #7FD8EC` · `--ramp-5 #E8FBFF`. The `--ramp` property is the 6-stop gradient at 0/20/40/60/80/100%. For canvas, `HUD.rampColor(t)` maps t ∈ 0..1 to an interpolated `rgb()`. Clamp the low end just under the noise floor and the high end just over the strongest signal. The floor tracks with a time constant of at least 10 s. TX state is shown on plots only as a 1 px `state-tx` outline over a `wash-tx-plot` slot.

**Chart series (Stats):** at most 3 per chart. Separate them by `ink` / `line` / `state-idle-dim` together with solid / `6 3` / `1 3` dashes.

---

## 2 Typography

### 2.1 Families (Google Fonts, OFL; 9 files total)

| Token | Family | Weights | Job |
|---|---|---|---|
| `--font-display` | Rajdhani | 500, 600 | Screen and panel titles ≥ 13 px, product mark, alarm word. Uppercase, +0.08 to +0.16 em. |
| `--font-label` | Barlow Semi Condensed | 400, 500, 600 | Micro-labels, tile labels, buttons, column headers, map labels, MP prefixes. Uppercase, +0.10 em. |
| `--font-read` | Barlow | 400, 500 | Transcript text, help, admin text values. Sentence case, 15/1.45. |
| `--font-data` | JetBrains Mono | 400, 500 | **Every number.** Plan for 0.6 em per glyph (6.6 px at 11 px, 28.8 px at 48 px). |

`hud.css` `@import`s exactly these weights from Google Fonts with `display=swap`. The Stage 3 app self-hosts them.

### 2.2 Scale tokens

`--fs-11` `--fs-12` `--fs-13` `--fs-15` `--fs-18` `--fs-24` `--fs-32` `--fs-48` `--fs-72` (px). Utility classes `.fs-11` … `.fs-72`. Nothing is smaller than 11 px, ever.

### 2.3 Named roles (*Specimen 02*)

| Class | Spec | Use |
|---|---|---|
| `.t-alarm` | Rajdhani 600 72 / +0.08 em / `state-fault` | `NO SIGNAL`, `NO LINK` only (§5.29) |
| `.t-hero` | Mono 500 48 / −0.01 em | Hero datum in its hero slot only |
| `.t-mark` | Rajdhani 600 48 / +0.16 em | `SDRVIZ` on login |
| `.t-data-32` | Mono 500 32 | Promoted TX timer, standard tile |
| `.t-data-24` | Mono 500 24 | AAR readout; section hero |
| `.t-section` | Rajdhani 600 24 / +0.12 em | Section titles |
| `.t-data-18` | Mono 500 18 | Compact AAR |
| `.t-body` | Barlow 400 15/1.45 | Transcript body, help, empty-state sentences |
| `.t-tile` | Barlow SC 600 13 / +0.08 em | Tile labels, hero talker label |
| `.t-panel` | Rajdhani 600 13 / +0.14 em | Panel titles |
| `.t-label` | Barlow SC 500 12 / +0.10 em / `ink-2` | Column headers, controls |
| `.t-data-13` / `.t-data-12` / `.t-data-11` | Mono 400 | Values / table metadata / tick numerals |
| `.t-micro` | Barlow SC 500 11 / +0.10 em / `ink-3` | Micro-labels, lever letters, MP prefixes |

Base families: `.display`, `.label`, `.read`, `.mono`. Text colors: `.c-ink`, `.c-ink-2`, `.c-ink-3`, `.c-line`, `.c-idle`, `.c-tx`, `.c-recent`, `.c-stale`, `.c-fault`, `.c-select`.

### 2.4 Formatting rules (implemented in `HUD.fmt`; *Specimen 02* table)

| Quantity | Format | Function | Example |
|---|---|---|---|
| Frequency | 3 decimals; `MHz` in `ink-2` only where needed | `fmt.freq(160.92)` | `160.920` |
| AAR readout | TX/RX pair | `fmt.aar(54)` | `5454`, `0808` |
| AAR compact | `CH` + 2 digits | `fmt.ch(8)` | `CH08` |
| Milepost | Native prefix + space + 1 decimal | `fmt.mp("BAA33.7")` | `BAA 33.7` |
| Derived MP | `≈` + space, no prefix, `ink-3` | `fmt.mp("4.2")` | `≈ 4.2` |
| Clock | 24 h + zone; header toggles `UTC` | `fmt.clock("07:15:00")` | `07:15:00 EST` |
| Single-clip duration | `mm:ss.s` | `fmt.dur(3.3)` | `00:03.3` |
| Totals (every airtime total, any size) | `hh:mm:ss`, always 3 fields; columns labelled `HH:MM:SS` | `fmt.total(148)` | `00:02:28` |
| Train / speaker ID | uppercase, single spaces | `fmt.trainId("Amtrak 53")` | `AMTRAK 53` |
| Age | `48S` → `4M` → `1H 12M` → `2D 3H` | `fmt.age(s)` | `LAST 48S` |
| Age (AGE form) | adds seconds under 10 min | `fmt.age(72,"age")` | `AGE 1M 12S` |
| Level | true minus U+2212 | `fmt.dbfs(-42.1)`, `fmt.snr(18)` | `−42.1 dBFS`, `SNR 18 dB` |
| Unknown | never zero | `fmt.blank` | `— — —` |
| Separator | spaced middle dot | `.sep` class or ` · ` | `CH54 · AMTK NEC` |

**One formatter per quantity (rev 3).** `HUD.fmt.total` owns every airtime total on every screen (History hero, Stats hero, ridgeline share column, Top Talkers); `gen_sim.py total_label` produces the same string for the scenario labels, so `00:02:28` is never `02:28` on another screen. `HUD.fmt.trainId` owns every train/speaker identifier (Map data blocks geo and schematic, CTC strip, stringline, transcript, Stats). Components never call `.toUpperCase()` or slice a label themselves.

Voice: labels are uppercase; transcripts are sentence case; no exclamation marks.

---

## 3 Stroke, dash, frame, corner

### 3.1 Stroke tokens (*Specimen 03*)

| Token | Width | Use |
|---|---|---|
| `--stroke-hair` | 1 px | Default: brackets, rulers, rails, graticule, table rules |
| `--stroke-emph` | 1.5 px | Selection brackets, focus ring, NEC main line, spectrum trace |
| `--stroke-active` | 2 px | TX frame, occupied CTC block, selected stringline, playback line, ember underline |
| `--stroke-hero` | 3 px | The single hero arc on a ring meter |

All SVG strokes take `vector-effect: non-scaling-stroke` (automatic on `.hud .s-*`). Snap 1 px strokes to the half-pixel with `HUD.snap(v)`. 0.5 px strokes are forbidden.

### 3.2 Dash tokens

| Token | Value (`stroke-dasharray`) | Meaning | SVG class |
|---|---|---|---|
| solid | none | Live, normal | n/a |
| `--dash-stale` | `4 4` | Stale | `.d-stale` |
| `--dash-offline` | `1 5` | Offline: reconnecting or disabled | `.d-offline` |
| `--dash-threshold` | `2 3` | Squelch line, coverage radius, predicted | `.d-threshold` |
| `--dash-measure` | `6 3` | 2nd series, dimension extensions, M24 decode bar | `.d-measure` |

The HTML frames reproduce `4 4` and `1 5` exactly with repeating gradients (a 4 px dash on an 8 px period, and a 1 px dot on a 6 px period), because CSS `border-style: dashed` is not exact.

### 3.3 Frames (M1) (*Specimen 03*)

A frame is an absolutely positioned `<span class="frame" data-frame="…">` filling its parent. Generic panels use class `.br` instead (brackets on `::before`, `line-faint`; `.br--line` and `.br--idle` change the tone).

| `data-frame` | Drawing | Fill |
|---|---|---|
| `idle` | Corner brackets, 8 px arms, 1 px `state-idle-dim` | none |
| `squelch` | Brackets, 1 px `state-idle` | none |
| `tx` | 2 px solid inset `state-tx` + glow bands (§1.4) | `wash-tx-surface` |
| `tx-flash` | As `tx` with the stroke at `state-tx-hot` (the 120 ms commit frame) | `wash-tx-surface` |
| `fault` | 1 px solid inset `state-fault` | `wash-fault` |
| `stale` | 1 px `4 4` dashes, `state-stale`, full perimeter | none |
| `offline` | 1 px `1 5` dots, `state-offline` (add `.is-legible` to lift the dots to `state-stale`) | none |
| `none` | nothing | none |

**Overlays** (never replace a frame):
- **Selected:** `<span class="sel">` (shown by `data-selected` or `.is-selected` on the parent). 14 px arms, 1.5 px `state-select`, drawn **4 px outside** the edge. No fill.
- **Focused:** 1.5 px `state-select` ring, 2 px offset, **2 px radius**. Native `:focus-visible` everywhere; on tiles it is drawn by `::after` so it can coexist with the frame. Static mockup frames set `data-focused` (tile) or `data-focus` (input).
- **Bezel:** `.bezel` is the only full box. It is a 1 px `line-faint` inset rule around canvases (spectrum, waterfall, map, plots), with an M4 registration mark at the top-left origin.

### 3.4 Corners and chamfers
No rounded corners, except the 2 px focus ring. Dots in glyphs and pips are circles, not rounded corners. **45° chamfer** (`--chamfer: 8px`, top-right corner) on tab, bank and route selectors only (§5.24).

---

## 4 Layout grids

Base unit `--unit` 4 px; layout unit `--layout-unit` 8 px. Every edge, bracket and baseline snaps to 8, with sub-alignment on 4.

### 4.1 Shell (all screens except login)

| Box | 1920 × 1080 | 1440 × 900 | Token |
|---|---|---|---|
| Header | y 0–40, full width; inner x 32–1888 | y 0–40; inner x 32–1408 | `--header-h` 40 |
| Gap | 16 | 16 | `--gap-chrome` |
| **Content** | **x 32–1888 (1856) · y 56–1040 (984)** | **x 32–1408 (1376) · y 56–860 (804)** | `--margin-x` 32 |
| Gap | 16 | 16 | |
| Status line | y 1056–1080 | y 876–900 | `--status-h` 24 |
| Title block | right end of the status line, flush to the right margin | same | §5.18 |

Header internals (grid `auto 1fr auto`, 24 px gaps; 16 px at 1440): left `SDRVIZ` (Rajdhani 600 18, +0.16 em) + screen name (`t-label`); nav, five bare tabs 28 px tall, **anchored at grid column 3 (x 345 at 1920, x 265 at 1440), never centred in the free column**, so `LIVE OPS` sits at the same x in every state and on every screen (§9.1.7: Live Ops never rearranges because of a fault); right (grid column 3 of the header) system chips, which grow leftward into the reserved space → audio chip → clock (mono 13 `ink`) → `MOTION FULL` chip. Tested at 1440 with the worst-case chip set (`FEEDS 2/4` fault, `ASR BACKLOG 12`, `DISK 87%`, `SOLO 1`, `AUDIO · CLICK TO ENABLE`) without collision.

### 4.2 Twelve-column grid

12 columns, 24 px gutters (`--gutter`), inside the content box. `.hud-content.cols12` sets `grid-template-columns: repeat(12, 1fr)`.

| Column start x | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | end |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1920 (col 132.67) | 32 | 189 | 345 | 502 | 659 | 815 | 972 | 1128 | 1285 | 1442 | 1599 | 1755 | 1888 |
| 1440 (col 92.67) | 32 | 149 | 265 | 382 | 499 | 615 | 732 | 848 | 965 | 1082 | 1199 | 1315 | 1408 |

Column widths are fractional, so snap panel edges to integers. The Live Ops split is snapped as `.span-tiles` (cols 1–7) and `.span-log` (cols 8–12): **1920: tiles x 32–1104 (1072), log x 1128–1888 (760). 1440: tiles x 32–824 (792), log x 848–1408 (560).**

### 4.3 Live Ops boxes (brief §9.1; the arithmetic is binding)

| Box | 1920 × 1080 | 1440 × 900 |
|---|---|---|
| Hero strip | x 32–1888 · y 56–120 | x 32–1408 · y 56–120 |
| Front wall | y 136–360 (224) | y 136–312 (176) |
| · spectrum trace | x 32–1688 (1656) · y 136–208 (72) | x 32–1208 (1176) · y 136–192 (56) |
| · M2 frequency ruler | x 32–1688 · y 208–240 (32) | x 32–1208 · y 192–216 (24) |
| · live waterfall | x 32–1688 · y 240–360 (120 rows = 60 s) | x 32–1208 · y 216–312 (96 = 48 s) |
| · LOFAR strip | x 1704–1888 (184) · y 240–360; mini ruler y 224–240; label `LAST 60 MIN` above | x 1224–1408 · y 216–312; label `LAST 48 MIN` |
| Bank tabs | x 32–1104 · y 376–408 | x 32–824 · y 328–360 |
| Tile grid | x 32–1104 · y 424–904 (480): **5 × 4 standard = 20** (1032 × 472) | x 32–824 · y 376–724 (348): **3 × 5 compact = 15** (616 × 312) |
| Transcript log | x 1128–1888 · y 376–904 | x 848–1408 · y 328–724 |
| CTC track strip | x 32–1888 · y 920–1040 (5 rows × 24) | x 32–1408 · y 740–860 |

The spectrum/waterfall-to-LOFAR gap is 16 (`--gap-panel`). Frequency scale: 1656 px / 1.350 MHz = 818 Hz per px, so one AAR channel is 18.4 px at 1920 (13.1 px at 1440). The listening sweep (M13) runs over the spectrum trace box only (`--sweep-w: 1656px` / `1176px`). The inspector overlays x 1408–1888 at 1920 (x 928–1408 at 1440), y 56–1040, covering the right of the log.

Verified with a stage test at both sizes (`design/screens/stage-test-1920.png`, `stage-test-1440.png`).

### 4.4 History, Stats, Feeds & Banks (starting boxes; screen designers own the interior)

All three share hero y 56–120 and a **body of y 136–1040 (904 px) at 1920, or y 136–860 (724 px) at 1440**. Recommended splits, which a screen designer may refine within the grid:

| Screen | 1920 recommendation |
|---|---|
| History | Route tabs y 136–168; stringline y 184–576 (≈ 45% of content); scrubber + recording rail y 592–688; table cols 1–8 and clip player cols 9–12, y 704–1040 |
| Stats | Ridgeline hero cols 1–8, y 136–600; heatmap cols 9–12, y 136–600; bottom row of three panels (top talkers, detector board, decoder quality + feed uptime) y 616–1040 |
| Feeds & Banks | Feed list cols 1–3 (446 px); feed inspector cols 4–7 (602 px); banks cols 8–12 (760 px); all y 136–1040 (as built and approved, rev 2) |

### 4.5 Map
Canvas = the full content box: **1856 × 984 at 1920, 1376 × 804 at 1440**, with `.bezel`. There is no hero strip; the corner readout sits inside the canvas, top-left (48 px count + 13 px labels). OSM attribution sits inside the bezel at the bottom-left, and in the title block's fifth cell.

Map rules (rev 2):
- **Name priority**, geo and schematic alike: terminals > Amtrak stops (BWI Airport, New Carrollton, Alexandria …) > the station the talking train is at or next to (`active_transmissions[].place_id`, the train's `next_stop`) > MARC / VRE stops by the number of lines serving them > others. In geo, ranks above "others" claim their slot **before** any data block; a block may not cover them (a block that has no other slot is placed, and the name is re-placed around it or dropped, never overlapped). A name may take the slot on the far side of the rail from its block.
- **Terminals never drop.** Two-line 13 px display label (`WASHINGTON / UNION STATION`, `BALTIMORE / PENN STATION`), as in the schematic. It may cross rail on a `bg-void` knockout plate 2 px past the type; the cleanest slot wins (no data, then least rail under it). A label set more than 12 px from its box carries a 1 px `ink-3` tie.
- **Leaders are `ink-3`** (`.k-ink3`) in both modes (talking trains keep `state-tx`). A leader may cross rail but never run along it: a run of more than 8 px within 4 px of a rail segment within 25° of the leader is rejected.
- **Link labels** (`14.3 KM · SNR 15 dB`) are placed after the blocks (link paths are reserved first). The primary link steps further off its link, then falls back to `SNR n dB`; a secondary simply drops.
- **Schematic** (Beck 0°/45°): spine-to-branch rise 138 px at 1920 and 172 px at 1440 (Philadelphia branch 112 px at 1440). Data blocks use 0°/45°/90° leaders only (straight 45°, a vertical flagpole with the block flush past its end, or a vertical-then-45° dogleg), placed by an exact search with labels, route lines, train marks and other leaders as hard obstacles; no penalty fallback. A block that would displace a priority name costs 4 per slot of that name, so a lower-priority neighbour gives way first. NEC names east of Washington rise above the spine, RF&P names hang below; detectors are positioned by milepost between evenly spaced stations; terminal labels sit on their box or tied to it, with a 12 px block keep-out.
- **Selection** pans the view (zoom unchanged) to centre the object in the canvas the inspector leaves uncovered. Map overlays carry a `bg-void` knockout plate. A train's inspector `ROUTE` row names the count it is on (`NEC` for MARC 433 at NEC 113.5; `CFP · RF&P` for VRE 301); the two-count route name stays in the route's own inspector.
- **Coverage hatch (M23, CR map-01, §11.14 ruled):** at rest `line-faint` at 45% opacity (`.hatch-rest`), drawn at **+45°** (rising left to right, `/`). Unacked fault: **−45°** (`\`) in `state-fault-dim` at 100%, the same 8 px pitch, so a faulted disc reads by pattern in grayscale. ACK returns it to the +45° `line-faint` rest hatch; the red registration mark stays. Map discs and the Feeds coverage thumbnail use the same rule.
- **Audit:** `html[data-audit]` carries `geo.terminalsPlaced`, `geo.namesDropped` (priority order), `geo.namesOffView`, `schematicNamesDropped`, `schematicDropWhy`; `pass` is false if a terminal is unnamed in geo or any schematic leader collides.

### 4.6 Login (no shell)
`bg-void`, one `.br` panel 400 px wide, optically centred (centre at 46% of the viewport height). A static M2 frequency ruler (`HUD.svg.freqRuler`) runs along the bottom edge.

### 4.7 2560 × 1440
Scale density, not size: the same tokens with more tiles per row. Not mocked in Stage 2.

---

## 5 Components

Every component lists **anatomy (px)**, **named states**, and **markup/builder**. Builders return HTML strings (`HUD.c.*`) or SVG strings (`HUD.svg.*`, for inside an `<svg class="hud">`).

### 5.1 Shell: header, nav, status line (*Specimen 14*)
- Builder: `HUD.shell(stageEl, { screen, scope:[k,v], clock, zone, chips:[{text, kind, glyph}], audio, status:{text|html, fault, acked}, osm, sim })` → returns the `.hud-content` element. Mount the stage as `<div id="stage">`; the stage is sized by `?size=`.
- Nav tab states: `inactive` (`ink-3`, no outline) · `hover` (`ink-2`) · `active` (`ink`, chamfered `line-faint` outline, 2 px `ink` underline) · `focus` (ring).
- Status line: message mono 12 `ink-2`; `is-fault` turns it `state-fault` while the fault is unacknowledged; `N ACK'D FAULT(S)` count in `ink-2`. When a fault and a stale item share the line, pass `status.html` with per-item tones (`.c-fault` unacked fault, `.c-stale` stale/backlog, `.c-ink-2` the rest) joined by the `·` separator. **Empty:** `NO OPEN EVENTS` in `ink-3` (the shell's default). A screen may instead show its own nominal readout (Stats/History: `RECORDING · DISK 42% · DECODER QUEUE 1 · MEDIAN 1.6 S`; Map: `MAP · GEO · DEFAULT VIEW · ZOOM 1.0×`).
- **One chip set, one status rule on every screen:** `HUD.headerChips(scn, { txChip })` and `HUD.statusFrom(scn, fallback)` build them from the scenario. `txChip` is true everywhere except Live Ops (§5.20).
- **Nav position:** `.hud-nav` is absolutely positioned at grid column 3 (x 345 / 265), so the tabs never move when the right chip set changes width (verified in all four states on all five screens at both sizes).
- Header clock: frozen at the scenario moment unless `?live=1`. A click toggles every clock on the page between the zone and `UTC`.

### 5.2 M6 position-light glyph (*Specimen 04*)
- Anatomy: an 18 × 18 box; dots r 2.5 at a 6 px pitch centred on (9, 9). Drawn with a CSS mask, so `color` sets the tone. SVG form: `HUD.svg.glyph(cx, cy, g)`.
- `data-g` states: `idle` (horizontal, `state-idle`; add `.is-dim` for `state-idle-dim`) · `squelch` (diagonal, lower-left to upper-right, `state-idle`) · `tx` (vertical, `state-tx`) · `stale` (hollow r 2 rings, 1 px, `state-stale`) · `offline` (× of 1.5 px, `state-stale`; §11 item 1) · `fault` (filled triangle 10 × 9 inside 3.5 px corner brackets, `state-fault`) · `fault-past` (hollow triangle, `state-stale`).
- In chips the glyph is 14 × 14.

### 5.3 Frames and overlays
See §3.3. States are frame states; overlays are selected and focused.

### 5.4 M7 AAR readout
`<span class="aar">5454<span class="suffix">LND-02</span><span class="aar-mhz">160.920 MHz</span></span>`. Mono 500 24 with the MHz beneath in 12 `ink-2`. The feed suffix applies only to shared frequencies (161.070: `6464 LND-02`, `6464 BAY-04`; seed `csx-landover` / `ns-bayview`).

### 5.5 Tile state model: five layers (brief §3.5), `HUD.resolveTile(state, ch)`

Input `state`: `{ tx, flash, commit, squelch, elapsed, fault:{reason, acked, onset}|null, coverage:"ok|partial|stale|offline", feeds:[bool…], offlineLabel, reconnecting, ageS, lastS, via, selected, focused, muted, solo, showLevers, levers:{m,s,r}, meter:{db, peak, floor}, spark:[60] }`.

| Layer | Precedence (first match wins) | Output |
|---|---|---|
| Frame | unacked fault → tx (`tx-flash` if `flash` and not muted) → squelch → (acked fault \| stale) → offline → idle. An acked fault drops out of the frame layer: it draws `tx` while transmitting, otherwise the 4/4 `dash-stale` frame (`data-frame="stale"`, brief §3.5, §5.3), so grayscale reads three steps: solid 1 px (unacked), 4/4 dash + triangle (acked), brackets (idle) | `data-frame` |
| Glyph | fault (acked or not) → tx → squelch → offline → stale → idle | `data-g` |
| Status readout | TX (empty; the timer takes the right zone) → `reconnecting` → `AGE …` (backend drop, §8.6) → offline label (`NO FEEDS`) → stale `AGE …`, or `RATE 84%` when every unhealthy feed is rate-stale (samples still arrive, so an age would always read 0S; same wording as the feed label `STALE · RATE 84%`, ≤ 12 characters) → `LAST …` (`ink-2`; `ink-3` when recent-dim) → nothing | `.tile__status` |
| Fault reason | `FAULT · <reason>` in `state-fault`, acked or not | footer (standard) / row 2 (compact, strip) |
| Ember | `lastS` < 120 → `recent`; < 600 → `recent-dim`; regardless of frame; none while TX | `data-ember` |

Also emitted: `.has-wash` when the frame is tx or fault, and an `aria-label` such as "Channel 54, AMTK NEC, transmitting, 3 seconds, via BWI-03".

### 5.6 Channel tile (*Specimen 05*)

Builder: `HUD.c.tile(ch, state, variant)`, where `ch = { aar, label, mhz, railroad, use, suffix }` and `variant` is `standard | compact | strip`. Root `<div class="tile tile--{variant}" role="button" tabindex="0" data-…>`.

**Standard 200 × 112** (x → right, y ↓; all positions from the tile's top-left):
```
  0   8   18 32                                    128     192 200
 0 ┌──                                                        ──┐   brackets 8 px arms
 7 │  [glyph 18×18] LABEL  13/16 Barlow SC 600 (max 96)  STATUS mono 11 →|  (right 8)
25 │               ▔▔▔▔ ember 2 px, label width
32 │  5454  mono 500 24/24  [suffix 12 ink-2]
42 │                                      sparkline 64×14 (right 8)
58 │  160.920  mono 12 ink-2
72 │                                          ┌ levers 3×24, x 128–200, y 72–96 ┐
84 │  meter 120×12 → bar y 92–94, ticks y 86–90
98 │  FOOTER 11/12 Barlow SC 500 +0.06em ……  tags · pips · 3/4 FEEDS
112└──                                                        ──┘
```
TX layout: the AAR steps down to 13 px in place (y 32, line 24); MHz, sparkline and status hide; the **timer** (mono 500 32/32, `state-tx`) sits right-aligned at right 8, y 30; the label max width grows to 150.

**Tile waveform (M15, rev 2):** the TX layout frees the band x 8–192, y 64–80; the waveform runs there (184 × 16, newest audio at the right edge, 30 px/s; live `state-tx` + `glow-1`, frozen `line`). When the levers show (x 128–200, y 72–96) it keeps only the newest 112 px. Builder: `HUD.c.tile(ch, { …, wave: svgString })` → `.tile__wave`.

Footer content rule: `FAULT · <reason>` (replaces everything) → `RAILROAD · VIA BWI-03` during TX/recent → `RAILROAD · USE` at rest. When pips, `MUTED` or `SOLO` are present, the left text shortens to `VIA BWI-03` or `RAILROAD` (§11 item 3).

**Compact 200 × 56:**
```
 7 │ [glyph] LABEL (max 90)              [pips] STATUS |
30 │ 5454 mono 18   160.920 @x64        meter 64 @ right 8, y 33
```
TX: the 24 px timer sits right-aligned at y 27, replacing MHz and meter; the AAR stays 18. Fault reason: replaces MHz and meter on row 2; **under TX it moves to the empty row 1 status slot** (§11 item 4). Levers: row 1 right (x 126–198, y 6–30: pip y 6–8, face y 10–26, so both sit ≥ 4 px inside the 2 px TX frame's inner edge), hiding the status while shown.

**Strip 384 × 28:** glyph x 8 y 5 · `CH54` mono 500 13 at x 32 · label x 80 (max 120) · MHz x 208 · pips at right 96 · status right 8. TX: timer mono 18 at right; MHz hidden. The fault reason replaces the MHz. A muted strip tile says `MUTED` (11 px label `ink-2`) after the MHz at rest, in the MHz slot during TX.

**Shared-frequency suffix (M7) in compact and strip:** the suffix (`6464 LND-02`) takes the MHz slot, since both channels share the MHz (the inspector keeps it). Strip: suffix at x 176, clear of a right-aligned `RECONNECTING`.

**Named states** (Specimen 05): `idle` · `squelch-open` · `tx-flash` · `tx` · `recent` · `recent-dim` · `partial` · `stale` · `offline-reconnecting` · `disabled/no-feeds` · `channel-fault` · `channel-fault-acked` · `hover/levers` · `shared-freq`.

**Overlays:** `selected` (outer brackets; also shows levers) · `focused` · `muted` (no flash, `MUTED` tag in `ink-2`, outline meter bar) · `solo` (`SOLO` tag in `ink`) · `partial` (M25 pips).

**Grid:** `.tile-grid` with `--tile-cols` (5 standard at 1920, 3 at 1440). Gaps 8. Re-pack over 400 ms with `ease-in-out`. Tiles never scroll; the variant is the largest one that fits **every** tile in the bank (brief §9.1.3).

### 5.7 Combination frames (*Specimen 06*)
All required pairs in all three variants: selected + TX · focused + selected · selected + fault · recent + stale · TX + channel fault unacked (red frame and red triangle, orange timer still promoted) · TX + channel fault acked (orange frame, red triangle, red reason) · muted + TX · partial coverage + TX.

### 5.8 M16 level meter (*Specimen 07*)
- `HUD.c.meter({ w, db, peak, floor, tx, muted, na })` → SVG `w × 12`. Scale −60 to 0 dBFS. Standard width 120 = 2 px/dB; compact 64.
- Anatomy: minor ticks every 5 dB (1 × 2, y 4–6) and majors every 10 dB (1 × 4, y 2–6), both `line-faint`; base rail 1 px `grid` at y 9; bar 2 px at y 8–10; peak-hold 1 × 8 `ink` at y 2–10; floor tick 1 × 4 `state-idle-dim` at y 6–10.
- States: `closed` (no bar, floor tick only, static, updated every 10 s with no tween) · `squelch-open` (bar `state-idle`) · `tx` (bar `state-tx`) · `muted` (1 px outline bar) · `na` (scale only, no bar, no floor).
- Ballistics (Stage 3): VU rise/fall about 300 ms; peak holds 1.5 s, then falls at 20 dB/s.

### 5.9 M22 sparkline
`HUD.c.spark(values60, { live })` → 64 × 14. Columns are 1 px. The 59 past minutes sit at x 0–58, then a 4 px gap, then the current minute at x 63 (`state-tx` while live). Height = airtime seconds per minute at a full scale of 30 s, min 1 px if any airtime. A zero minute is a 1 px `grid` dot on the baseline. Updates on the minute.

### 5.10 M25 coverage pips
`HUD.c.pips(feeds, cls, withCount)`. 3 × 7 ticks, 3 px apart: filled `line` = healthy; 1 px hollow `state-stale` = not healthy; then `3/4 FEEDS` (mono numerals, label word) in 11 `ink-2`. Shown only when coverage is partial. Compact/strip: pips only; count in aria-label and inspector.

### 5.11 M15 waveform
`HUD.svg.waveform(env, w, h, { live })`, where `env = [[min,max],…]` in −1..1. A 1 px min/max envelope. `live`: `state-tx` + `glow-1` underlay, scrolling right-to-left. Frozen: `line`, which becomes the History thumbnail (same object, live to archive).

### 5.12 Transcript rows (*Specimen 08*)
- Container `.txlog` (container query); head `.txlog__head` 32 px with `t-panel`.
- `HUD.c.txRow(row, { live, offbank, selected, who, mpPrefix, play, colW })`. `row` is a seed or sim transmission (`clock_local, aar_channel, feed_id, receptions[], speaker_role, speaker, train_id, transcript, duration_s, transcript_state, words[], detector`).
- Columns (760 px log): time 64 (mono 12 `ink-3`) · CH 40 (mono 500 12) · feed 72 (`BWI-03 +2`, mono 11) · role 32 (mono 500 11 `ink-2`) · speaker/train 120 (mono 12 `ink-2`, ellipsis) · text, the remainder (Barlow 15/20). Column gap 12, row padding 7/8/8.
- **Speaker text:** operator names take the tile short forms (`Amtrak dispatcher` → `AMTK DISPATCHER`; crew suffixes `engineer`/`conductor` drop). If a speaker still overflows the 120 px column, cut it at a word boundary, never mid-word and never with an ellipsis, and carry the full speaker in the cell's `title` (its accessible name) and in the inspector.
- Under 640 px (the 560 px log at 1440) the speaker column folds inline before the text.
- Inline speaker shows on all non-detector rows with a speaker, whatever the state.
- **States** (`data-row`): `final` · `decoding` (M24 dashed bar at 8 px/s capped at the column width, plus `DECODING`) · `partial` (`ink-3`, replaced in place) · `carrier_only` (`CARRIER ONLY · 00:00.6`) · `no_transcript_decoder_down` · `failed` (+ `RETRY` button) · `undecodable` · `not_recorded` (`NOT RECORDED` tag) · `kerchunk` (no row).
- **Modifiers:** `data-live` (`wash-tx-surface`, CH tag `state-tx` until final, then `ink`; low-confidence words revert to `ink` inside the wash) · `data-offbank` (CH tag `ink-2`, no wash) · `data-det` (structured mono row: `BAA 6.7 · NO DEFECTS · 412 AX · 41 MPH`) · `data-defect` (boxed `DEFECT` tag: 1 px `ink` frame, 11 px 600 label, 4 px padding; row text weight 500; **never red**) · `is-selected` (outer brackets).
- Low-confidence words (conf < 0.6) are `ink-3`, but never inside a wash.
- Empty log: `.txrow-empty` `NO TRAFFIC SINCE 14:02 EST`.
- **Speaker rule is shared:** `HUD.speaker(row)` returns `{ who, full }` (upper-cased; `Amtrak` → `AMTK`; crew suffix dropped; 16-character word-boundary cut; `full` goes in `title`). History's table uses the same rule (rev 2).
- **Detector fields:** each field (`BAA 33.7`, `DEFECT`, `HOTBOX AXLE 183 S RAIL`, `37 MPH`) is one non-breaking `.fld`; the `·` separator follows the `DEFECT` tag too, so a wrap only falls after a dot.
- `HUD.parseDetector(text, prefix)` is a fallback parser for seed detector phrasing. Rows that carry a `detector` object are preferred.

### 5.13 M8 data block (*Specimen 09*)
- SVG: `HUD.svg.dataBlock({ x, y, dir, len, l1, l2, tx, sim })`. A 1 px leader, 24 px long by default at 45° (`ne`); 8 compass offsets. A two-line tag: line 1 mono 12 `ink` (`state-tx` while talking) with an optional `SIM` (11 px label, `ink-3`); line 2 mono 12 `ink-2`, 15 px below. 4 px gap from the leader end.
- HTML: `HUD.c.dataBlock(l1, l2, { tx, sim, lg })`. `lg` is the inspector-enlarged form (24/30 + 13/18).
- Canonical: `MARC 410 · SIM` / `NEC 113.6 · CH54` (seed `tx-039`, Odenton).

### 5.14 M9 milepost tag
`HUD.c.mpTag("NEC 113.6")` / `HUD.svg.mpTag(x, y, mp)`. A 32 × 48 post with a 1 px `line` rectangle; three 13 px rows of 11 px type: prefix (Barlow SC 500, `ink-3`) / integer (mono `ink`) / `.decimal` (mono `ink-2`). Derived values show `≈` as the prefix; a derived value that keeps its native count (routes.json `≈CFP 85.6`) shows `≈CFP` as the prefix and reads `≈CFP 85.6` inline. Inline form: `HUD.c.mpInline()`.

### 5.15 M4 registration mark
`HUD.svg.regMark(x, y, state)`. Circle r 6 plus a crosshair to ±10 (4 px past the circle), 1 px. States: `line` · `stale` · `fault`.

### 5.16 M14 ping ring
`HUD.svg.ping(x, y, primary)`, then `HUD.firePings(root)`. r 6 → 40, `state-tx` 60% → 0, 1200 ms `ease-instrument`, once per TX commit per receiving feed. The primary feed's ring is 1.5 px. It is removed from the DOM after `t-ping`.

### 5.17 M2 tick ruler
- Frequency: `HUD.svg.freqRuler({ x, y, w, h, hears:[ch], bank:[ch], extraLabels:[{ x, text }] })`. It covers ch 07–97 (160.215–161.565, 91 channels). Every channel gets a 4 px `line-faint` tick; every 10th channel gets an 8 px `line` tick with an MHz numeral (mono 11 `ink-3`); channels the displayed feed hears get 8 px `line-faint`; channels heard **and** in the active bank get 12 px `line` plus the channel number (mono 11 `ink-2`). `extraLabels` adds more channel numerals on the same row (mono 11 `ink-3`, e.g. Feeds' off-bank numbers). **Channel numerals win:** at every ruler height, a MHz numeral is dropped when its text box (mono advance 0.6 em; box from baseline −0.8 em to +0.2 em) comes within 4 px of any channel numeral's box, bank or extra (§11.7). Channel numbers sit at y+23 and MHz at y+h−3.
- Generic: `HUD.svg.ruler({ x, y, w, min, max, minor, major, label, flip })`. Majors 8 px `line`, minors 4 px `line-faint`, numerals on majors only.
- AAR mapping: ch n = 160.110 + 0.015 n MHz (`HUD.chToMhz`, `HUD.mhzToCh`).

### 5.18 M10 title block (*Specimen 10*)
`HUD.c.titleBlock({ screen, scope, clock, build, sim, osm })`. It is 24 px tall in the status line, with 1 px `line-faint` cell rules and 10 px cell padding. Cells: `WLT-1` (mono 500 `ink`) · `SCREEN <name>` · `<scope key> <value>` · clock · `BUILD MOCK-S2 SIM`. On the Map: `© OpenStreetMap contributors` (linked) is a fifth cell. Keys are 11 px label `ink-3`; values are mono 11 `ink-2`.

### 5.19 M21 lever (*Specimen 11*)
`HUD.c.levers({m,s,r})` / `HUD.c.lever(letter, on, aar)`. A 16 × 16 square (1 px `line-faint`), an 11 px 600 letter in `ink-3`, a 4 × 2 pip 2 px above it, and a 24 × 24 hit area. States: `off` · `on` (`aria-pressed="true"`: square `line`, letter `ink`, pip `ink`) · `hover` (square `line`) · `focus` (ring) · `disabled` (dotted `state-offline`). Bank-lever states (rev 2, wrap in `.lever-wrap`): `.is-tx` (2 px `state-tx` frame + glow, orange AAR) · `.is-stale` (4/4 dashed `state-stale`) · `.is-off` (dotted, `ink-3`: heard by no feed).

### 5.20 Chips
`HUD.c.chip(text, kind, { glyph, onset, button, pressed, cls })`. 24 px tall, 8 px side padding, mono 12, 4 px bracket arms.

| `data-chip` | Look | Use |
|---|---|---|
| `nominal` | `ink-2`, `line-faint` brackets | `FEEDS 4/4`, `ASR OK`, `AUDIO MUTED`, `+1 ON BAY-04` |
| `active` | `ink`, `line` brackets | `SOLO 1`, `AUDIO ON`, `FEED · LND-02 ▾`, `▲ 3 NEW`, `LOG +3` |
| `armed` | `ink`, `ink-2` brackets, static | `AUDIO · CLICK TO ENABLE` |
| `degraded` | `state-stale` text + brackets | `ASR BACKLOG 12`, `DISK 87%`, `HOST 81°C` |
| `fault` | `state-fault`, 1 px solid red frame + `wash-fault`, fault glyph; `data-onset` pulses twice | `FEEDS 3/4`, `ASR FAULT`, `DISK FAULT · NOT RECORDING` |
| `acked` | `ink-2`, no frame, red fault glyph kept | `FEEDS 3/4 · 1 ACK'D`; single-object system chips: `ASR FAULT · ACK'D`, `DISK FAULT · NOT RECORDING · ACK'D`, `HOST FAULT · 85°C · ACK'D` |
| `offline` | `ink-2`, dotted `1 5` frame | `RECONNECTING` |
| `tx` | `state-tx`, solid orange frame + wash, TX glyph | Every screen except Live Ops (History, Stats, Feeds & Banks, Map): `KEYED · CH54 · CH08 · +1 OFF-BANK` (on-bank channels, then the off-bank count) |
| `filter` | label 11, `ink-3`; `aria-pressed="true"` → `ink` + `line` brackets | History filters, `BANK ONLY` |

### 5.21 Buttons and disclosure
`HUD.c.btn(label, { primary, sm, disabled })`. Bracketed, 32 px tall (24 px for `sm`), Barlow SC 600 12, +0.12 em. States: `default` (`ink-2`, `line-faint`) · `primary` (`ink`, `line`) · `hover` (`ink`, `line`, 80 ms) · `active` (`state-select`) · `disabled` (`state-offline`). Disclosure `.disclosure[aria-expanded]` shows `▸` / `▾` (`▸ RECEIVER PARAMETERS`).

### 5.22 Inputs
`HUD.c.field({ label, value, unit, text, state, error, hint, width })`. The label sits above in 11 px uppercase `ink-3`, with a 6 px gap. The input is 28 px tall: underline only, 1 px `line-faint`, value in mono 13 `ink` (`text: true` → Barlow 15). States: `default` · `hover` (underline `line`) · `focus` (underline `state-select` + ring) · `autofocus` (the field a page opens on, i.e. login: `autofocus`, caret kept, focus shown as a 1.5 px `state-select` underline with **no ring**, because text inputs match `:focus-visible` on any focus and the rounded ring would box an underline-only field; brief §8.5) · `error` (red Barlow 13 text beneath; **the underline does not turn red**) · `readonly` (no underline, `ink-2`) · `disabled` (dotted `state-offline` underline). Destructive actions require typed confirmation (Feeds screen).

### 5.23 Checkbox and toggle
`HUD.c.check(label, on)`: a 12 × 12 hairline square; checked gets a 6 × 6 `ink` core and a `line` frame. `HUD.c.toggle(label, on)`: a 28 × 12 track with an 8 × 8 knob; on = knob right in `ink` with the track at `line`. Both have a 24 px minimum hit height.

### 5.24 Tabs (nav, bank, route)
`HUD.c.tabs(items, selectedId)`, where items are `{ id, name, n }`. 32 px tall (28 in the header nav), padding 0 20 0 16, Barlow SC 600 12, +0.12 em. A 1 px outline with an 8 px 45° chamfer at the top-right; open bottom; the selected tab gets a 2 px `ink` underline. States: `inactive` (`ink-3`, `line-faint`) · `hover` (`ink-2`) · `selected` (`ink`, `line`) · `focus` (ring). Optional count `.n` (mono 11). `.tab--bare` drops the outline until selected (header nav).

### 5.25 Key/value row and `N/A · RTL_TCP` (*Specimen 12*)
`HUD.c.kv(k, v, { unit, sim, na, meter })`. The key is 11 px label `ink-3`; the value is mono 13 `ink`, right-aligned, with the unit in 12 `ink-2`; a 1 px `grid` rule beneath. **N/A treatment:** label, then `— — —` in `ink-3`, then the tag `N/A · RTL_TCP` in 11 px `ink-3`. Its meter draws the scale only. Never zero, never hidden. `sdrviz-agent` fields carry `SIM`.

### 5.26 Inspector
`HUD.c.inspector({ title, kind, glyph, sim, log, lead, sections:[{title, html}] })`. 480 px wide, docked right, full content height, `bg-raised`, `line` brackets, 16/20 padding, 16 px section gap, 4 px sub-grid. Head: glyph, title (`t-panel`), `SIM`, `LOG +n` chip, `ESC` chip. Section heads: 11 px 600 `ink-2` with a 1 px `line-faint` rule. It always overlays and never pushes.

### 5.27 Hero strip (*Specimen 13*)
`.hero`, 64 px, flex with 16 px gaps. Parts: `.hero__big` (mono 500 48; `.is-tx`, `.is-2`), `.hero__stack` (`.a` 13 px label `ink` over `.b` 11 px `ink-2`), `.hero__list` (mono 24 `state-tx`, e.g. `+1 · 0808`), `.hero__text` (13 px label), `.hero__aside` (right-aligned group).
- States: `keyed` (`5454` / `AMTK NEC` over `KEYED · VIA BWI-03` / `00:03.3`) · `several-keyed` (+ list) · `idle` (`LAST KEY-UP` · `42M` in mono 48 `ink-2` · `AGO · CH54 · AMTK NEC`) · `empty-range` (`NO TRANSMISSIONS · 07:00–08:00 EST`) · `silent` (append `· SILENT` in `ink-2`).

### 5.28 Empty states
`.empty` inside `.br`: title in `t-panel` `ink-2` and sentence in `t-body` `ink-3`. Examples: `BANK EMPTY` / `Add channels in Feeds & Banks.`; `ALL FEEDS DISABLED · ENABLE ONE IN FEEDS & BANKS` (no dimming, no red).

### 5.29 System-down alarm
Add `.is-down` to the content container (every child dims to 20%) and append `.alarm`: one `.t-alarm` word (`NO SIGNAL` | `NO LINK`) over one `t-body` sentence in `ink`. Use it only for this state.

### 5.30 Screen-owned components (not in the shared kit)
These are built by screen designers from the tokens and motifs above. They are listed so the vocabulary stays shared.

| Component | Owner | Must use |
|---|---|---|
| Spectrum trace, waterfall, LOFAR strip | Live Ops, Feeds, System | LOFAR cells and floor through `HUD.lofarT(dbfs)` = (dBFS + 52) / 42 on the ramp, identical on every screen; M17 squelch line at the feed noise floor + 8 dB until the sim carries `squelch_dbfs`; canvas; `bg-void`; `--ramp`; `.bezel`; M3 graticule (`10 dB/div · 135 kHz/div`); M17 squelch line `dash-threshold`; TX slot = `state-tx` 1 px + `wash-tx-plot`; trace `stroke-emph` `line` + `glow-trace-1`; sweep `.sweep` |
| CTC track strip (M18) | Live Ops | 24 px rows; 7 × 7 station boxes; occupied `stroke-active` `line`; talking `state-tx`; never red. **Talking carrier:** a small vertical M6 glyph (r 1.75, 4 px pitch) before the talking train's ID and on talking detector diamonds (orange and line are equal in grayscale). **Ties:** one vertical `line-faint` tie per `routes.junctions` entry, through every route the entry names (Baltimore: NEC, Capital, Philadelphia). **Labels:** priority route name > talking train > trains > MP equation > stations; 8 px between label extents (text + 2 px knockout), 16 px when either label is set beside a tie or a tie runs between them (a tie is not separation); a label centred on a tie column is set beside it (end at x − 8, else start at x + 8); a centred station name may reach 3/4 pitch toward each neighbour node (1.5× pitch overall), else it uses routes.json `short`, else it drops; knockouts never cross a tie |
| Stringline (M19), scrubber, recording rail, clip player | History | `HUD.svg.ruler`; selected string `stroke-active` `state-select`; playback = 2 px `ink` line with a 5 px downward triangle cap; recording rail 2 px. **FEEDS lane** (rev 2, accepted) under the REC rail, in the Stats feed-uptime vocabulary: past faults on different feeds within 6 px share one hollow triangle whose base sits 2 px above the tick band; live faults and stale feeds carry their glyph at the now end (fault triangle on the lane, stale rings level with their text line), one bracketed live label block. A rail-tick data block stays in the margin-rail column, ≥ 8 px left of the time-ruler labels (ne, nw, else a flagpole), so the ruler is always complete. `?train=` without `?range=` opens that train's own row and its hour (`?train=MARC 410` = `?tx=tx-039`) |
| Ridgeline (M20), heatmap, top talkers, detector board, decoder quality, feed uptime | Stats | Ridges filled `bg-void`; heatmap `--ramp`; ≤ 3 series; past faults `fault-past` glyph + `dash-stale`. Keyed (rev 2, accepted): each channel live now gets a 2 × 11 px `state-tx` tick at the now-line on its ridge (M22's live minute idea) |
| HOST card, feed cards, feed inspector, bank lever rows | Feeds & Banks | `.kv`, `HUD.c.kv(…, {na:"RTL_TCP"})`, `HUD.c.lever`, M12 `SAME FREQ · DIFFERENT FEEDS` dimension bracket |
| Map layers (graticule, shore, coverage M5/M23, rails, MP ticks, stations, detectors, feeds, trains) | Map | `.hud` SVG classes (§10); `HUD.svg.regMark`, `dataBlock`, `mpTag`, `ping`, `glyph` |

---

## 6 Motion

### 6.1 Easing tokens
`--ease-instrument: cubic-bezier(0.2, 0, 0, 1)` (default) · `--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)` (re-pack, panel moves) · `--linear` (sweeps, playheads, scrolling) · `step` = `steps(n, end)` (numeric tick-ups, transcript reveal).

### 6.2 Duration tokens

| Token | ms | Token | ms |
|---|---|---|---|
| `--t-instant` | 0 | `--t-settle` | 400 |
| `--t-micro` | 80 | `--t-build` | 600 |
| `--t-flash` | 120 | `--t-ping` | 1200 |
| `--t-tick` | 240 | `--t-sweep` | 8000 |
| `--t-commit` | 250 | `--t-ember` | 120 000 |
| | | `--t-cool` | 600 000 |

### 6.3 Key-up choreography (identical everywhere, P6); t from the squelch crossing

| t (ms) | Phase | Element: change | Easing |
|---|---|---|---|
| 0 | Detect | Squelch line solid · audio opens · glyph → `squelch` · frame `idle` → `squelch` · meter bar wakes (`state-idle`) | instant |
| 250 | Commit | Frame → `tx-flash` (`data-commit` runs `hud-tx-flash`, `tx-hot` → `tx` over 120 ms) · glyph → `tx` · tile `.has-wash` · meter bar → `state-tx` | `ease-instrument` |
| 250–490 | Lock | AAR steps 24 → 20 → 16 → 13 px in place, 40 ms per step inside the 120 ms flash (13 px from +370 ms); MHz, sparkline and status hide; **the timer slot stays empty while the AAR steps; the whole `MM:SS.t` string appears on one frame at +370 ms (never a partial string)** and counts in 0.1 s steps from t = 0. This resolves the commit overlap (the 32 px timer at x ≈ 58–192 against a 24 px AAR at x 8–104). Reduced motion: the 13 px AAR and the timer are present from the commit frame | `step` over `t-tick` |
| 250–650 | Connect | CTC block → `state-tx` · map ping (M14) on every receiving feed · waterfall/spectrum TX slot outline + `wash-tx-plot` · hero slot updates · header chip on History | `ease-instrument` |
| as data arrives | Populate | Waveform runs (`state-tx`) · transcript row with CH tag `state-tx` + M24 decode bar | `linear` |
| release + 0–400 | Release hold | Nothing changes for `t-settle` (re-key continues the same TX, no new flash) | n/a |
| release + 400 | Settle | Frame → brackets · timer → home (AAR back to 24 px) · waveform freezes, turns `line` · ember underline appears · status `LAST 0S` · transcript tag → `ink` on final | 400 ms `ease-instrument` |
| release + 2 min | Cool 1 | Ember → `recent-dim`; `LAST` in `ink-3` | 400 ms |
| release + 10 min | Cool 2 | Ember gone → idle | 400 ms |

**Kerchunk:** squelch closes before 250 ms → the diagonal glyph holds 2 s, then reverts. There is no transcript row. **Carrier only:** ≥ 250 ms with no speech still commits TX; its row is `CARRIER ONLY`. **Muted:** everything except the flash.

### 6.4 Fault motion
Onset: the red frame (or fault chip frame) pulses **twice at 1 Hz**, opacity 1 → 0.35 → 1 (`hud-fault-pulse`, set `data-onset`), then holds steady. ACK: frame and wash fade out once over 400 ms. Nothing else moves. There is no alternation.

### 6.5 Build-on (`HUD.buildOn()`, *brief §7.4*)
On app start and route change only. `.is-building` on `<html>` for 700 ms:

| Layer | Classes | Window |
|---|---|---|
| Frames draw (bracket arms grow 0 → 8 px via `@property --arm`; fade) | `.frame`, `.br`, `.bezel` | 0–200 ms, +20 ms per tile (`--i`, capped at 20) |
| Graticule / rulers fade in | `.b-grid`, `.ruler`, `.graticule` | 150–350 |
| Labels appear (opacity, no slide) | `.label`, `.t-micro`, `.t-label`, `.t-tile`, `.t-panel`, `.tile__label`, `.tile__foot`, `.b-label` | 300–450 |
| Values tick in from blank (`steps(4)`) | `.mono`, tile readouts, `.hero__big`, `.b-value` | 400–600 |

It never plays on data updates, bank or tab switches (those use the 400 ms re-pack), background-tab return, or reconnect. **Shutdown** (300 ms): `.is-shutdown` blanks values, then dims labels to `ink-3`, then the frames go `dash-offline`. `?build=0` disables build-on for screenshots.

### 6.6 Continuous-motion budget
At most **one ambient** motion per screen: the Live Ops sweep (`.sweep`, 8 s linear, `line` at 6%, 120 px tail; `.is-paused` while any channel is squelch-open or TX) or the History playhead. Map, Stats and Admin have none. Data motion moves at the data rate (waterfall 2 rows/s, spectrum 10 fps with α = 0.2 smoothing at idle, LOFAR 1 row/30 s, map trains every 5 s with a 400 ms glide). The header clock is the only per-second idle tick.

### 6.7 Reduced motion
Under `prefers-reduced-motion: reduce` (unless `data-motion="full"`), or `?motion=reduced` / `data-motion="reduced"`: every CSS animation and transition is off; `.sweep` is hidden; `HUD.buildOn`, `HUD.reveal` and `HUD.firePings` no-op; the fault pulse is steady from the first frame. Data (waterfall, spectrum, meters, waveform) still updates.

### 6.8 M24 transcript reveal
`HUD.reveal(rowEl, ageS)`: words in `.w` spans appear at 30 ms per word, capped at 400 ms total. There is no reveal for rows older than 60 s, for partial→final, or under reduced motion.

---

## 7 Accessibility checklist (reviewed per frame)

1. **Grayscale test:** a grayscale screenshot still shows the talker (vertical glyph, 2 px frame, timer), the faulted object (triangle, `FAULT` label), recent vs stale (underline vs dashed frame), and defects (boxed tag).
2. Text ≥ 4.5:1 on its real background; `ink-3` never in a wash; `state-idle-dim` never text.
3. Text never below 11 px. Hit areas ≥ 24 × 24 (levers 16 visible / 24 hit).
4. Focus (rounded ring), selection (square brackets) and playback (triangle-capped line) are distinct by geometry.
5. Tiles are `role="button"` with a full `aria-label` (built by `resolveTile`). The log is `aria-live="polite"`, finals only (Stage 3).
6. No flashing over 1 Hz; the fault pulses twice and then holds.

---

## 8 Mockup conventions

### 8.1 Files
`design/mockups/<screen>.html` with screens `live-ops`, `history`, `stats`, `feeds`, `map`, `login`, plus `motion-keyup.html` and `components.html` as needed. Each page links `_shared/hud.css` and `_shared/hud.js` and keeps page-local CSS minimal. Page-local classes are prefixed with the screen (`.lo-`, `.hi-`, `.st-`, `.fb-`, `.mp-`).

### 8.2 URL parameters (read by `hud.js`)

| Param | Values | Effect |
|---|---|---|
| `state` | `listening` · `keyed` · `fault` · plus screen extras (`fault-acked`, `loading`, `empty`, `reconnecting`, `nolink`) | `HUD.state`; `<html data-state>`; default scenario |
| `size` | `1920` (default) · `1440` | Stage 1920 × 1080 or 1440 × 900; `<html data-size>` |
| `motion` | `full` · `reduced` | Overrides the OS setting |
| `build` | `0` | Skip build-on (use for screenshots) |
| `live` | `1` | Clock ticks; screens may animate replays |

Every frame must be reachable as a URL, e.g. `live-ops.html?state=keyed&size=1440`.

### 8.3 Stage
`<div id="stage"></div>`, then `HUD.shell("#stage", {...})`. The stage is exactly the canvas size, with `overflow: hidden`. Screenshot with a window of the same size:
```
"/Applications/Chromium.app/Contents/MacOS/Chromium" --headless=new --hide-scrollbars \
  --window-size=1920,1080 --virtual-time-budget=3000 \
  --screenshot=design/screens/<screen>-<state>[-1440].png \
  "file:///Users/andy/Code/sdrviz/design/mockups/<screen>.html?state=keyed&build=0"
```
Screenshots go under `design/screens/` only.

### 8.4 Data (P3: every number from data)
Chromium blocks `fetch` on `file://`, so `HUD.load(path)` resolves a repo-relative path (`data/sim/scenarios/keyed.json`) in this order:
1. `window.SDRVIZ_DATA[path]` (already registered);
2. an inline `<script type="application/json" data-path="…">` in the page;
3. a **JS twin** `ROOT/<path>.js`, injected as a `<script>`, which must contain `(window.SDRVIZ_DATA = window.SDRVIZ_DATA || {})["<path>"] = {…};`;
4. `fetch(ROOT/<path>)` (works over http);
5. otherwise it rejects. `HUD.fail(err, el)` shows a neutral `MOCKUP DATA MISSING` panel (never red).

Rev 2: before step 3, `HUD.load` also reads the generator's own twins: `data/sim/scenarios/<name>.json` → `data/sim/scenarios/<name>.js` (`window.SDRVIZ_SCENARIOS[name]`), and `data/sim/{routes,trains,transmissions,stats,health,banks}.json` → `data/sim/day.js` (`window.SDRVIZ_DAY[key]`). So `HUD.loadScenario()` and `HUD.loadSim()` work on `file://` with no page-local loader.

Shortcuts: `HUD.loadScenario(name = HUD.state)`, `HUD.loadSim("trains")`, `HUD.loadSeed("places")`. The generator's own twins (`scenarios/<name>.js`, `day.js`) satisfy this since rev 2 (below). Seed files still have no twins, so a page may inline what it needs (the specimen inlines the four seed files between `<!--SEED:BEGIN-->` markers).

`hud.js` does not interpret scenario contents. Screens pass the moment to the shell themselves, e.g. `HUD.shell("#stage", { clock: scn.meta.clock_local, zone: scn.meta.zone || "EST", … })` (2026-11-08 is after the DST change, so EST).

### 8.5 SIM tagging
Every screen's title block shows `SIM` (default). Every simulated identity (train, feed, SIM transmission in the inspector) carries `HUD.c.tag.sim()`. Seed rows show no `SIM`.

### 8.6 Change control
Screen designers may not edit `_shared/`. If a component is missing a state, compose it in page-local CSS with a `/* REQUEST: … */` comment and report it to the lead; the lead folds it into `_shared` and the spec.

---

## 9 `hud.js` API reference

| Member | Signature | Notes |
|---|---|---|
| `HUD.state`, `.size`, `.motion`, `.live`, `.params` | values | From the query string; mirrored to `<html data-*>` |
| `HUD.ROOT` | URL string | Repo root resolved from the script location |
| `HUD.fmt.*` | `freq aar ch num dbfs snr mp mpParts clock parseClock hm dur total age pct trainId blank` | §2.4 |
| `HUD.FEEDS`, `HUD.feedName(id)` | `feed-bwi` → `BWI-03` | |
| `HUD.ROLES`, `HUD.role(r)` | `crew` → `CRW` … | `POL` removed (decision #13) |
| `HUD.SCREENS` | `[{id, name, file}]` | Nav order |
| `HUD.BAND`, `HUD.chToMhz`, `HUD.mhzToCh` | | AAR band ch 07–97 |
| `HUD.RAMP`, `HUD.rampColor(t)` | | §1.5 |
| `HUD.load(path)`, `loadScenario`, `loadSim`, `loadSeed`, `fail` | Promise | §8.4 |
| `HUD.resolveTile(state, ch)` | → `{frame, glyph, ember, status, wash, reason, aria}` | §5.5 |
| `HUD.c.glyph pips meter spark levers lever tile chip tag.sim tag.defect dataBlock mpTag mpInline titleBlock kv field check toggle btn tabs txRow inspector` | → HTML string | §5 |
| `HUD.svg.glyph regMark ping dataBlock mpTag freqRuler ruler waveform` | → SVG string | §5 |
| `HUD.parseDetector(text, prefix)` | → `{mp, axles, mph, defect}` | Seed fallback |
| `HUD.shell(stage, opts)` | → `.hud-content` | §5.1 |
| `HUD.startClock(el, t, zone)` | | Frozen unless `?live=1` |
| `HUD.mount(el, html)`, `HUD.fitEmbers(root)` | | Sizes ember underlines to labels after fonts load |
| `HUD.buildOn(root)`, `HUD.reveal(row, ageS)`, `HUD.firePings(root)` | | §6 |
| `HUD.snap(v)`, `HUD.esc(s)` | | Half-pixel snap; HTML escape |
| `HUD.headerChips(scn, { txChip })` | → chip array | rev 2 · §5.1, §5.20 |
| `HUD.statusFrom(scn, fallback)` | → status opts | rev 2 · §5.1 |
| `HUD.speaker(row, given)` | → `{ who, full }` | rev 2 · §5.12 |
| `HUD.lofarT(dbfs)` | → 0..1 | rev 2 · §5.30 |
| `HUD.c.tile(ch, { …, wave })` | | rev 2 · `wave` = M15 SVG in the TX band (§5.6) |

---

## 10 `hud.css` class index

- **Stage/shell:** `.hud-stage .hud-header .hud-header__left .hud-header__right .hud-mark .hud-screen-name .hud-nav .hud-clock .hud-content .cols12 .hud-status .hud-status__msg .is-fault .hud-status__ack .span-tiles .span-log`
- **Frames:** `.frame[data-frame] .br .br--line .br--idle .sel .is-selected .bezel .dashed .dashed--offline`
- **Glyph:** `.glyph[data-g] .is-dim`
- **Tile:** `.tile .tile--standard|compact|strip .tile__glyph __label __ember __status __aar __mhz __spark __timer __meter __levers __foot __pips __pips2 __reason .tile-grid`; attributes `data-frame data-tx data-ember data-coverage data-fault data-selected data-focused data-muted data-solo data-levers`
- **Meters:** `.meter-svg .spark-svg .wave-svg .pips .pips-n`
- **Readouts/tags:** `.aar .aar-mhz .tag-sim .tag-defect .tag-role .mp-tag .mp-inline .title-block .kv .is-na .na .datablock .is-lg`
- **Controls:** `.chip[data-chip] .levers .lever .lever-aar .btn .btn--primary .btn--sm .disclosure .field .field__label .field__input .field__input--text .field__unit .field__error .field__hint .check .toggle .tabs .tab .tab--bare`
- **Transcript:** `.txlog .txlog__head .txrow[data-row] [data-live] [data-offbank] [data-det] [data-defect] .c-time .c-ch .c-feed .c-role .c-who .c-text .lo .w .decode-bar .decode-lbl .play .not-rec .who-inline .txrow-empty`
- **Panels:** `.inspector .inspector__head .inspector__kind .inspector__sec .hero .hero__big .hero__stack .hero__list .hero__aside .hero__text .panel .panel__head .empty .is-down .alarm`
- **SVG (`svg.hud`):** strokes `.s-hair .s-emph .s-active .s-hero`; stroke colors `.k-grid .k-faint .k-line .k-ink .k-idle .k-idle-dim .k-tx .k-tx-hot .k-recent .k-stale .k-offline .k-fault .k-fault-dim .k-select`; dashes `.d-stale .d-offline .d-threshold .d-measure`; glow `.glow-1 .glow-2`; fills `.f-void .f-line .f-ink .f-tx .f-fault .f-idle .f-wash-tx-plot`; text `.tx-lab .tx-lab2 .tx-term .tx-num .tx-num2 .tx-data .tx-hero`; `.ping .is-primary .is-firing`
- **Motion:** `.sweep .is-paused .is-building .is-shutdown`; keyframes `hud-fault-pulse hud-tx-flash hud-ping hud-sweep hud-arm hud-fade hud-value`
- **Rev 2 folds (§15 of hud.css):** `.tile__wave .show-wave` · compact/strip suffix rules · `.tile--strip[data-muted]::before` · `.txrow[data-det] .fld .sep` · `.lever-wrap .is-tx .is-stale .is-off` · `.hatch-rest` · `.k-ink3`
- **Type/color utilities:** §2.3

---

## 11 Interpretations, deviations and rulings

1. **Offline glyph tone.** The `×` glyph is drawn in `state-stale` (5.12:1), not `state-offline` (2.11:1), so the glyph meets 3:1 on its own. The dotted frame stays `state-offline`.
2. **Fault tile wash.** Brief §3.2 calls `state-fault-dim` "the 6% wash" while §3.6 defines `wash-fault` as `state-fault` at 6%. Tiles and chips use `wash-fault`. `state-fault-dim` is used only for the map hatch.
3. **Tile footer truncation.** 184 px cannot hold `AMTRAK · ROAD/DISPATCHER · VIA BWI-03` plus pips. Rule: `VIA` replaces the use text during TX/recent. When pips, `MUTED` or `SOLO` are present, the left text shortens to `VIA <feed>` or the railroad alone.
4. **Compact TX + channel fault.** Row 2 cannot fit the AAR, the reason and a 24 px timer. The reason moves to row 1's status slot, which is empty during TX.
5. **Lever placement.** Standard tile: x 128–200, y 72–96, beside the 120 px meter. Compact: row 1 right, hiding the status while shown.
6. **Meter and sparkline scales.** The meter is 2 px/dB (120 px), with majors every 10 dB and minors every 5 dB. The sparkline full scale is 30 s per minute, laid out as 59 past columns + 4 px gap + current column.
7. **Ruler labels (rev 3, director).** Majors carry MHz numerals; channel numerals (active-bank and off-bank) win every collision. At every ruler height, a MHz numeral whose text box comes within 4 px of a channel numeral's box is dropped (brief Do #12). This applies to the Live Ops ruler (32 px at 1920, 24 px at 1440), the System front wall, and the Feeds inspector mini-spectrum ruler (40 px, which passes its off-bank numbers in as `extraLabels`). Off-bank numerals that would touch each other slide sideways by up to 8 px to keep the same 4 px gap. Audited on Live Ops listening, keyed and fault at 1920 and 1440, System no-link and reconnecting, and Feeds keyed and fault: no ruler text within 4 px of another.
8. **No text glow.** Glow is applied to strokes only (TX frames, waveform, spectrum trace). A promoted-warning hero glow, if a screen needs one, uses an SVG text stroke underlay at 3× / 18%, never CSS blur.
9. **Live log feed column.** Brief §9.1.4's row format omits the feed, while §9.0.3 requires `BWI-03 +2`. The Live Ops log includes a 72 px feed column.
10. **Seed counts after decision #13.** `NEC Corridor` = 8 channels; the `POL` role is removed.
11. **Clock.** Frames freeze at the scenario moment; UTC = EST + 5 h (2026-11-08 is after DST ends).
12. **Build mark.** `BUILD MOCK-S2` until the repo has commits and a real hash.
13. **Acked front-wall message. RULED (director, rev 3): keep what is rendered.** Brief §9.1.7 defines the frozen front-wall message while a fault is unacknowledged (13 px `state-fault`). After ACK the red triangle and the red `LND-02 · FAULT · LINK LOST` label stay, because that is the fault label (§8.9 acked look: glyph and label stay red, frame and wash drop). Only the appended ` · ACK'D` suffix is `ink-2`, matching the acked chip.
14. **M23 fault hatch in grayscale. RULED (director, rev 3): accepted.** The unacknowledged-fault coverage hatch is drawn at −45° (`\`) in `state-fault-dim` at the same 8 px pitch; the rest hatch is +45° (`/`) `line-faint`. On ACK it returns to the rest hatch. Implemented on the Map (geo discs) and the Feeds coverage thumbnail; `map-grayscale.html?state=fault` shows LND-02 reading by pattern.
15. **Baltimore junction.** `routes.junctions` names `r-nec`, `r-capital` and `r-phila` at Baltimore (the Capital Sub reaches the Philadelphia Sub through Camden and the Howard Street Tunnel), so the CTC tie through Camden's box matches the data.
16. **Generator labels the screens recompute.** `gen_sim.py` `LAST` age labels carry seconds (`1M 10S`); screens recompute from `age_s` with `HUD.fmt.age` (`1M`). `spark_60m` is 12 five-minute bins; Live Ops derives 60 per-minute values from `day.js`. Both are known gaps (§13.4).
17. **System link-down frames are Live Ops (rev 3).** `system.html?state=reconnecting|no-link|empty-bank` load `live-ops.js` as a library (`<html data-lo-module>` → `window.LiveOps`) and call its hero, front-wall, tabs, tiles, log and CTC builders, then dim (`.is-down`, no-link only). The one System input is `W.link = { dropAge }`: waterfall rows newer than the drop and LOFAR rows newer than it stay `bg-void` above a `dash-offline` `state-stale` edge (no fake rows), the sweep stops, and every tile's status reads `AGE` from the drop (brief §8.6). Empty bank swaps only the hero text and the tile panel. `loading` and `connecting` (every value blank) are layout reference only; the build renders them from the same Live Ops components with blank values.
18. **Map feed inspector ACTIONS (rev 3).** A faulted feed's Map inspector carries the same ACTIONS block as the Live Ops feed inspector (brief §8.3): `ACK` primary, or `ACK'D` disabled once acked, plus `OPEN IN FEEDS & BANKS`. Shared row class `.insp-btns`. Frames: `map.html?state=fault&select=LND-02` and `map.html?state=fault-acked&select=LND-02`.
19. **History hero hierarchy (rev 3, P4).** One 48 px figure per hero: the range `13:07–14:07`. TRANSMISSIONS and AIRTIME are secondary at 32 px (`.hero__big.is-sm`, shared with Stats `56`/`16` and Feeds `22S`).

---

## 12 Revision log

| Issue | Date | Change |
|---|---|---|
| 1 | 2026-11-08 | First issue: tokens, grids, 30 components, motion, mockup conventions, API. Specimen verified by headless screenshots (`design/screens/spec-y*.png`). |
| 2 | 2026-11-10 | Consistency pass (lead). Folded into `_shared`: nav anchored at grid column 3 (§4.1, §5.1); compact lever offset; M15 tile waveform slot `.tile__wave` (§5.6); compact/strip shared-frequency suffix and muted strip tag; detector `.fld`/`.sep` (§5.12); `HUD.speaker`; `HUD.resolveTile` acked-fault → stale frame (§5.5 known-gaps note removed); derived MP with native prefix (§5.14); ruler labels at h ≥ 32 (§5.17, §11.7); bank lever states (§5.19); `tx` chip on every non-Live-Ops screen and acked single-object chip wording (§5.20); `HUD.headerChips`, `HUD.statusFrom`, `NO OPEN EVENTS` (§5.1); `HUD.lofarT`; `HUD.fmt.total` rounds first; `HUD.load` reads the generator's twins (§8.4); `.hatch-rest`, `.k-ink3`. Rulings: key-up Lock row (§6.3); CTC label/tie/talking-carrier rules and `short` names (§5.30); History FEEDS lane and Stats live tick accepted (§5.30); Map rules (§4.5); Feeds & Banks split (§4.4). Open for director: §11.13, §11.14. Generator: route-point `short` names, Baltimore junction names `r-capital` (§11.15); only `routes.json` and `day.js` changed. Contact sheet `design/index.html`. Handoff §13. |
| 3 | 2026-11-10 | Director REVISE (lead). Ruler: channel numerals win, MHz numeral dropped within 4 px at every height, `freqRuler({ extraLabels })` (§5.17, §11.7). Totals: `HUD.fmt.total` / `gen_sim total_label` own every airtime total, `HH:MM:SS` column labels (§2.4). History hero: one 48 px figure, secondaries 32 px `.hero__big.is-sm` (§11.19). `HUD.fmt.trainId` on every screen (§2.4). Map feed inspector ACTIONS + `fault-acked&select=LND-02` frame (§11.18). Rulings recorded: §11.13 kept as rendered, §11.14 −45° fault hatch on Map and Feeds thumbnail (§4.5). System reconnecting / no-link / empty-bank built by the Live Ops builders (§11.17). Login field `autofocus` state: 1.5 px underline, no ring (§5.21). Generator: only the History `airtime_label` / `hero` strings changed. |

---

## 13 Handoff to front-end (Stage 3, Svelte)

The mockups are reference, not code to port: rebuild each component from this spec, read its numbers from `data/sim/` the way the mockup does, and check the result against the frame URLs in `design/index.html`. `_shared/hud.js` is the behavioural reference for the shared kit (formatters, `resolveTile`, the builders); page-local JS is the reference for the screen-owned components. Every frame/state is a URL; `&build=0` skips the build-on.

### 13.1 Conventions
- One Svelte component per spec component; props mirror the `HUD.c.*` options. State resolution (`resolveTile`, `headerChips`, `statusFrom`, `speaker`, `fmt.*`, `lofarT`) lives in plain TS modules (`$lib/hud/*.ts`), not in components, so it is unit-testable against the mockup output.
- Tokens: port `hud.css` §1–§3 custom properties verbatim into `$lib/styles/tokens.css`; components use tokens only (no literal colours). Geometry in §4–§5 is binding at 1920 × 1080 and 1440 × 900.
- Screen components own their canvas/SVG drawing; shared components never read scenario JSON directly, only props.

### 13.2 Shared kit → Svelte components

| Spec | Mockup builder / class | Svelte component | Consumes (`data/sim/…`) |
|---|---|---|---|
| §5.1 shell, header, nav, status line | `HUD.shell`, `HUD.headerChips`, `HUD.statusFrom` | `AppShell.svelte`, `HeaderNav.svelte`, `HeaderChips.svelte`, `StatusLine.svelte` | `scenarios/<s>.header.{feeds_chip, feeds_chip_state, asr_chip, disk_chip, host_chip}`, `.faults[]{acked}`, `.degraded[]`, `.system.decoder{state, queue}`, `.active_transmissions[]{aar, off_bank}`, `.status_line[]`, `.clock`, `.tz.name` |
| §5.18 M10 title block | `HUD.c.titleBlock` | `TitleBlock.svelte` | `.clock`, screen scope (bank / route / mode / feed), `sim` |
| §5.2 M6 glyph | `HUD.c.glyph`, `HUD.svg.glyph` | `PositionGlyph.svelte` (HTML + SVG modes) | derived state |
| §5.5–5.7 channel tile (standard / compact / strip) | `HUD.c.tile`, `HUD.resolveTile` | `ChannelTile.svelte` + `$lib/hud/resolveTile.ts`; `TileGrid.svelte` | `.channels[id]{label, aar, aar4, freq_mhz, railroad, use, coverage{state, pips[]}, state, channel_fault{reason, acked, onset}, tx{elapsed_s, feed_id}, last_heard{age_s}, spark_60m}`, `.views[bank].tile_ids`; waveform from the live audio envelope |
| §5.4 M7 AAR readout | `.aar` | `AarReadout.svelte` | `.channels[id].{aar4, freq_mhz}`, suffix from shared frequency (`heard_by`) |
| §5.8 M16 meter | `HUD.c.meter` | `LevelMeter.svelte` | live level; floor = `.feeds[id].noise_floor_dbfs` |
| §5.9 M22 sparkline | `HUD.c.spark` | `Sparkline.svelte` | 60 per-minute airtime values (today: derive from `day.js` transmissions; gap §13.4) |
| §5.10 M25 pips | `HUD.c.pips` | `CoveragePips.svelte` | `.channels[id].coverage.pips[]{feed_id, state}` |
| §5.11 M15 waveform | `HUD.svg.waveform`, `.tile__wave` | `Waveform.svelte` | audio envelope (live) / clip envelope (History) |
| §5.12 transcript row + log | `HUD.c.txRow`, `HUD.speaker` | `TranscriptRow.svelte`, `TranscriptLog.svelte`, `$lib/hud/speaker.ts` | `.transcript.rows[]` (Live Ops), `.history.rows[]` (History): `{clock, aar, label, feed_label, receptions[], role_tag, speaker, train_id, state, words[]{w, conf}, transcript, duration_s, detector{mp_label, axles, mph, defect, defect_text}, live, off_bank, sim}` |
| §5.13 M8 data block | `HUD.svg.dataBlock`, `HUD.c.dataBlock` | `DataBlock.svelte` (SVG + HTML `lg`) | `.trains.positions[]{train_id, data_block[2], talking, sim}` |
| §5.14 M9 milepost tag | `HUD.c.mpTag`, `HUD.svg.mpTag` | `MilepostTag.svelte` | `routes.json` `points[]{prefix, mp, mp_approx, mp_label}`; `trains.positions[].mp_label` |
| §5.15 M4 registration mark | `HUD.svg.regMark` | `RegMark.svelte` | — |
| §5.16 M14 ping | `HUD.svg.ping`, `HUD.firePings` | `PingRing.svelte` | `.active_transmissions[].receptions[]{feed_id}` at commit |
| §5.17 M2 rulers | `HUD.svg.freqRuler`, `HUD.svg.ruler` | `FrequencyRuler.svelte`, `TickRuler.svelte` | `.feeds[id].hears`, active bank `frequency_ids` |
| §5.19 M21 levers | `HUD.c.levers`, `HUD.c.lever`, `.lever-wrap` | `LeverRow.svelte`, `BankLever.svelte` | bank membership (`banks.json`), mute/solo/record state, `.channels[id].{tx, coverage}` for lever states |
| §5.20 chips | `HUD.c.chip` | `Chip.svelte` | as §5.1 |
| §5.21–5.24 buttons, inputs, check, toggle, tabs | `HUD.c.btn/field/check/toggle/tabs` | `Button.svelte`, `Field.svelte`, `Checkbox.svelte`, `Toggle.svelte`, `Tabs.svelte` | — |
| §5.25 key/value + N/A | `HUD.c.kv` | `KeyValue.svelte` | `.feeds[id].telemetry`, `.telemetry_na`, `.system.{host, decoder, disk}` |
| §5.26 inspector | `HUD.c.inspector` | `Inspector.svelte` (slot per section) | per object |
| §5.27 hero strip | `.hero` | `HeroStrip.svelte` | `.views[bank].hero`, `.history.{range, totals, hero}`, `.stats.today.{totals, busiest}` |
| §5.28–5.29 empty, alarm | `.empty`, `.alarm` | `EmptyState.svelte`, `SystemAlarm.svelte` | `scenarios/system.json` |

### 13.3 Screen-owned components

| Screen | Svelte components | Consumes |
|---|---|---|
| Live Ops | `SpectrumTrace.svelte` (canvas), `Waterfall.svelte` (canvas), `LofarStrip.svelte` (canvas, `lofarT`), `FrontWallMessage.svelte`, `BankTabs.svelte`, `CtcStrip.svelte` (+ `$lib/ctc/labelPass.ts`) | `.feeds[displayed]{noise_floor_dbfs, hears}`, `.lofar_60m{row_s, rows, row0, cells[feed][ch]}`, `day.js` transmissions/receptions for the waterfall, `.views[bank]{displayed_feed, off_bank_active}`, `routes.json{routes[].points[]{place_id, name, short, kind, route_mi, mp_label, equation}, junctions[]}`, `.ctc[route]{trains[]{train_id, route_mi, talking}, detectors_talking[]}` |
| History | `Stringline.svelte` (SVG), `RouteTabs.svelte`, `MarginRail.svelte`, `TimeScrubber.svelte`, `FeedsLane.svelte`, `TranscriptTable.svelte`, `ClipPlayer.svelte` | `.history{range, totals, rows[], trains[]{stops[], routes[]}, scrubber_start_t, scrubber_airtime_per_min}`, `trains.json`, `transmissions.json` (custom ranges, `?tx=`/`?train=`), `.stats.rolling_24h.feed_uptime`, `seed/places.json` (off-route places) |
| Stats | `Ridgeline.svelte`, `ChannelHourHeatmap.svelte`, `TopTalkers.svelte`, `DetectorBoard.svelte`, `DecoderQuality.svelte`, `FeedUptime.svelte`, `RangeTabs.svelte` | `.stats.today{channels, totals, busiest, top_channels, top_talkers, detectors, decoder, feed_uptime, hour_labels, ten_min_bins_start_t}`, `stats.json.day` (yesterday), `.stats.rolling_24h` |
| Feeds & Banks | `HostCard.svelte`, `FeedCard.svelte`, `FeedInspector.svelte` (spectrum, waterfall, sample-rate chart, coverage thumbnail, telemetry), `BankLeverRows.svelte`, `MembershipTable.svelte`, `BankEditor.svelte`, `Gauge.svelte` (non-dB M16) | `.feeds[]` (all fields), `.system.host`, `.banks[]`, `banks.json`, `seed/frequencies.json`, `routes.json` (coverage thumbnail), `health.json` |
| Map | `MapCanvas.svelte` (SVG layers), `CoverageDisc.svelte` (M5/M23), `TrainMark.svelte`, `FeedSite.svelte`, `SchematicMap.svelte`, `CoverageStrip.svelte`, `OnAirList.svelte`, `MapInspector.svelte`, `$lib/map/{project, labelPlacer, blockPlacer, schematicLayout}.ts` | `.map{feeds, stations, detectors, trains_tracked, corner_readout}`, `.trains.positions[]`, `.active_transmissions[]{train_id, place_id, receptions[]{feed_id, dist_km, snr_db}}`, `.feeds[]{lat, lon, coverage_radius_km, state}`, `seed/places.json`, `routes.json`, `data/geo/{rail,water}.geojson` |
| System | `LoginPanel.svelte`, `ConnectingOverlay.svelte`; reconnecting / no-link / empty-bank are the Live Ops screen with a `link` prop (`{ dropAge }`) and `.is-down` dimming (§11.17): one front wall, one CTC strip | `scenarios/system.json`, `scenarios/listening.json` |
| Motion | `$lib/motion/keyup.ts` (§6.3 timeline as data), `buildOn.ts`, `reveal.ts` | — |

### 13.4 Known gaps (build from the spec, not from the mockup, where they differ)
1. **Generator labels.** `gen_sim.py` `LAST` age labels carry seconds (`1M 10S`); the spec says `LAST` drops seconds after the first minute. Format from `age_s` with the §2.4 rules; don't print `age_label` for `LAST`.
2. **Sparkline bins.** `channels[].spark_60m` is 12 five-minute bins; M22 needs 60 per-minute values. Live Ops derives them from `day.js`; the generator should emit 60.
3. **Squelch threshold.** There is no `squelch_dbfs` in the sim; the mockups draw M17 at the feed noise floor + 8 dB (marked ASSUMPTION). Kerchunk rows carry no `rssi_dbfs` (the motion study assumes squelch + 2 dB).
4. **No detector defect row in a scenario log window.** Only `tx-064` (14:20:40) has a defect; the Live Ops grayscale test cannot show the boxed `DEFECT` tag in-frame (the component sheet does).
5. **Generator scenarios not yet emitted:** `loading`, `reconnecting`, `nolink`, `empty-bank` (System keeps local constants); `rtl_tcp` tuner type; `host_temp_c` for the agent (renders `NOT REPORTED`); receiver-parameter defaults; bank `short` codes; `feeds_hero` ranks stale above fault in the fault state (Feeds ranks it itself: fault > offline > stale).
6. **Seed twins.** `data/seed/places.json` and `frequencies.json` have no JS twins; History and Feeds inline them between markers; Map reads `map-fixtures.js` (`tools/build_map_fixtures.py`, re-run after `gen_sim.py`; in sync as of rev 2).
7. **`HUD.svg.dataBlock`** lacks `{ glyph, l2Class, from, flip, knockout }` and the vertical flagpole; Map mirrors the geometry locally (`blockGeom`, `blockSvg`). Build `DataBlock.svelte` with those options.
8. **`HUD.c.txRow`** expects seed-shaped rows; scenario rows use `clock / aar / role_tag / state`. History rebuilds the row with the same classes and extra columns (AAR, channel, duration). `TranscriptRow.svelte` should accept the scenario shape and a column set.
9. **Freq ruler off-bank labels:** `HUD.svg.freqRuler` now takes `extraLabels`; Feeds still computes the 8 px sideways nudge locally. Put the nudge inside `FrequencyRuler.svelte` with the 4 px rule.
10. **System states** reconnecting, no-link and empty-bank now render from the Live Ops builders (§11.17). `system.js` still draws its own blank shell for `loading` and `connecting` (layout reference only); build them from the Live Ops components with blank values.
11. **Map at 1440 keyed:** the BWI-03 primary link label finds no clean slot (dropped rather than overlapped); `select=VRE 301` reports one leader within 2 px of a block. Both are audit-visible.


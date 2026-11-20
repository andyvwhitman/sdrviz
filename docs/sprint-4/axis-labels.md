# E-2 spec: spectrograph axis labels (channel + frequency on 45° tails)

**Status:** APPROVED for build, 2026-11-20, gmunk-director. **Decision:** 64. **Supersedes:** M2's channel and MHz
numerals on the ruler (spec 5.17). The M2 tick rhythm stays except as amended here.
**Sources:** `docs/sprint-4/axis-brief.md`, `axis/round1-review.md`, `axis/round2/` (frames, `notes.md`,
`_engine.mjs` as the reference implementation, `tests.txt`). Round 2 reproduced every predicted fixture and swept
widths 344 to 2560 with 0 collisions.
**Implements in:** `frontend/src/screens/live-ops/freqRuler.ts` (pure layout, unit-tested),
`FrequencyRuler.svelte` (SVG render), `SpectrumTrace.svelte` (right-margin dB numerals), `Waterfall.svelte` /
`FrontWall.svelte` (scale strip, column-mark clipping). Band arithmetic only from `$lib/hud/band.ts`
(CH n = 160.110 + 0.015·n MHz, CH07 to CH97).

## 1. What it is
Each labelled channel gets a short 45° tail from its tick, then `54 160.920` reading bottom-up, left to right. When
two neighbouring labels would touch, the run becomes a **bracket**, an M12 dimension rule across the members with one
two-line label: `20–25` on the tail and `160.410` beside it. That's the whole vocabulary: one tail shape, two label
forms. The 45° tail exists **only** here (owner, 2026-11-20). Every other stroke in the app stays orthogonal.

Layout depends only on width, screen class, the labelled set and the extras. **Keyed, selected and stale never
move anything.** They change colour and stroke.

## 2. Screen classes and constants

| | Desktop | Phone portrait | Phone landscape |
|---|---|---|---|
| When | Live Ops desktop layout | handset spectrum layer, wall < 600 px wide | handset spectrum layer, wall ≥ 600 px wide |
| `f` font px (JetBrains Mono) | 11 | 13 | 13 |
| `G` clear gap, rotated frame | **4** | **5** | **5** |
| `tick` labelled tick height | 8 | 6 | 6 |
| `t` tail run (45°, length t·√2) | 4 | 4 | 4 |
| `ruleY` bracket rule height | 5 | 4 | 4 |
| `H` ruler height (`--ruler-h`) | **68** | **76** | **76** |
| `M` right label margin | **56** | **0** | **66** |
| Scale strip under the waterfall | **14** | **18** | **18** |
| Derived: single clear pitch √2·(cap+G) | 17.0 | 20.5 | 20.5 |
| Derived: bracket → next item, from first member | 35.7 | 42.6 | 42.6 |

Font metrics: `adv = 0.6·f` (advance), `cap = 0.73·f` (digit ink height), `lead = 1.2·f` (bracket line pitch).
Measured in round 2: single yTop 64.35 / 71.86, bracket yTop 50.35 / 55.32, single run from tick 50.67 / 59.15,
bracket run 55.34 / 64.67 (11 / 13 px). The single sets the height and the bracket sets the margin.

**Plot width** = wall inner width − `M`. The spectrum, waterfall and scale strip end at the plot's right edge. The
ruler's text may continue into the margin. In landscape the margin sits **inside** the safe area: plot = viewport −
`insetL` − `insetR` − 2·8 − 66 (≈ 726 on an 844 phone). Never shrink `M` to fit insets. The plot gives way, so CH96
stays labelled. The fixtures are identical from 690 to 734 px.

## 3. Geometry
Coordinates: x from the plot's left edge, **y up from the ruler's axis line** (the line between ruler and waterfall).
In SVG, `svgY = H − y`. Rotated frame for collision tests: `u = (x + y)/√2` along the text, `v = (y − x)/√2` across
it. All labels are parallel, so every test is an axis-aligned box test in (u, v).

`X(ch) = round((ch − 7)·(width − 1)/90) + 0.5`, the true slot centre (unchanged).

**Single** at `x = X(ch)`:
- Tick: `(x, 0) → (x, tick)`, 1 px.
- Tail: `(x, tick) → (x + t, tick + t)`, 1 px.
- Text `54 160.920`: two runs in one `<text>`, channel then a single space then the frequency (`toFixed(3)`), rotated
  −45° about its origin. The origin sits on the tail line at `(x + t, tick + t)`, then **raised 1.5 px perpendicular
  (up-left)**, `(−1.06, +1.06)` in y-up, so the glyphs sit just above the line. The tail line extended is the label's
  baseline, and the selected underline is drawn **on** that line.
- Ink box: `u ∈ [uS, uS + 10·adv]`, `v ∈ [vS, vS + cap]`, with `S = uv(x + t, tick + t)`.

**Bracket** for members `m₁ … mₖ` (k ≥ 2), with `x0 = X(m₁)` and `x1 = X(mₖ)`:
- Rule: `(x0, ruleY) → (x1, ruleY)`, 1 px. Member ticks `(X(m), 0) → (X(m), tick)` pass through it and act as the
  end stubs. Non-member slots inside `[x0, x1]` are clipped to **3 px** (decade ticks too; the scale strip carries
  the decades).
- Tail from the first member: `(x0, tick) → (x0 + t, tick + t)`.
- Line A `20–25` (en dash U+2013, two-digit padded): origin as a single's, at `(x0 + t, tick + t)`, raised 1.5 px.
  Ink box `u ∈ [uS, uS + 5·adv]`, `v ∈ [vS, vS + cap]`.
- Line B: the **first member's** frequency `160.410`, origin `(x0 + t + lead·√2, tick + t)`, so it sits level with
  line A and one line pitch down-right of it. Raised 1.5 px on its own baseline. Ink box `u ∈ [uS + lead, uS + lead +
  7·adv]`, `v ∈ [vS − lead, vS − lead + cap]`. Its lowest ink is at y ≈ tick + t, 7 px above the rule on desktop.
- A bracket may span non-members (phone portrait). Members go through the rule and non-members stay under it. That's
  the honesty contract, and test R4 enforces it.

**Bare tick** (a labelled channel with no label: phone portrait dead zone, or an extra that doesn't fit): 12 px, 1 px
`line`, M2's banked tick.

**Other ticks (M2, unchanged):** every slot 4 px `line-faint`; heard by the displayed feed 8 px `line-faint`; every
10th channel 8 px `line`.

## 4. Layout algorithm (`freqRuler.ts`)

```ts
interface AxisInput {
  width: number;            // plot width, CSS px
  cls: 'desktop' | 'portrait' | 'landscape';   // picks f, G, tick, ruleY, H, M from §2
  labelled: number[];       // active bank ∩ heard by the displayed feed
  extras: number[];         // off-bank keyed channels; the selected channel if it is not labelled
}
// Re-run only when width, cls, labelled or extras change. Never per frame; never on key, select or stale.

const boxesSingle  = (x) => [box(uS, uS + 10*adv, vS, vS + cap)]              // S = uv(x + t, tick + t)
const boxesBracket = (x) => [box(uS, uS + 5*adv, vS, vS + cap),               // line A
                             box(uS + lead, uS + lead + 7*adv, vS - lead, vS - lead + cap)]   // line B
const collide = (A, B) => A.some(a => B.some(b =>
  a.u0 < b.u1 + G && b.u0 < a.u1 + G && a.v0 < b.v1 + G && b.v0 < a.v1 + G))
const xRight = (bs) => max(bs.map(b => (b.u1 - b.v0) / SQRT2))
const yTop   = (bs) => max(bs.map(b => (b.u1 + b.v1) / SQRT2))

// pass 1: singles and brackets, left to right
L = sortedUnique(labelled); items = []; i = 0
while (i < L.length) {
  s = L[i]
  if (i === L.length - 1 || !collide(boxesSingle(X(s)), boxesSingle(X(L[i+1])))) {
    items.push({ kind: 'single', members: [s] }); i++; continue
  }
  j = i + 1
  while (j < L.length && collide(boxesBracket(X(s)), boxesSingle(X(L[j])))) j++
  items.push({ kind: 'bracket', members: L.slice(i, j) }); i = j
}

// pass 2: right edge (only bites when M = 0, i.e. phone portrait)
bare = []
while (items.length && xRight(boxesOf(items.at(-1))) > width + M) bare = items.pop().members.concat(bare)

// pass 3: extras, additive; never moves a bank item
placed = items.map(boxesOf); extraSingles = []; bareExtras = []
for (e of sortedUnique(extras)) {
  if (L.includes(e)) continue
  b = boxesSingle(X(e))
  inSpan = items.some(it => it.kind === 'bracket' && X(it.members[0]) <= X(e) && X(e) <= X(it.members.at(-1)))
  if (inSpan || placed.some(p => collide(p, b)) || xRight(b) > width + M) bareExtras.push(e)
  else { extraSingles.push({ kind: 'single', members: [e], extra: true }); placed.push(b) }
}
return { height: H, ticks, items, extraSingles, bare, bareExtras, scale: scaleLayout(width, f) }
```

`ticks` is the full list of 91 slots after the §3 amendments (labelled, member, clipped, bare). `items` carry their
rendered primitives (tick, tail polyline, rule, text origins, strings) so the tests in §10 run on what is drawn.

A selected frequency maps to a channel with `mhzToCh`. If it isn't a labelled channel, it becomes an extra. If it's
outside CH07 to CH97, the ruler shows nothing for it.

## 5. Right margin and the dB scale
The margin column (desktop 56, landscape 66) carries the over-running label text in the ruler row, and the spectrum's
**dB division numerals** in the spectrum row. The in-plot `REF −10 dBFS · 10 dB/div` caption is removed from the wall.
- Numerals label the gridlines, top included: `−10` (the reference) in `ink-2`, the rest in `ink-3`. Use U+2212 minus,
  not a hyphen (round 2 used `-`). 11 px desktop, 13 px landscape, left-aligned 4 px right of the plot edge, each
  centred on its gridline. The top one is top-aligned so it stays inside the bezel.
- Every division when divisions are ≥ 14 px, otherwise every other one starting at the top (`−10 −30 −50`: the
  1280 default with a 48 px spectrum).
- Phone portrait has no margin. The scale lives only in the layer's status line (`REF −10 dBFS · 10 dB/div`, §9.3),
  with no in-plot caption.
- The waterfall row of the margin stays empty.

## 6. Scale strip (the MHz numerals)
A strip under the waterfall, inside the bezel, plot width: 14 px desktop, 18 px phone.
- `step` = first of 10, 20, 30 channels with `step · pitch ≥ 7·adv + 16`. Numerals at channels with
  `(ch − 10) % step == 0` (CH10, 20 … 90 → `160.260` … `161.460`). Phone portrait uses step 20.
- Each numeral hangs from a 4 px `line` tick off the waterfall's bottom edge, `ink-3`, 11 / 13 px, centred on the
  tick. Near a plot edge the numeral slides inward and the tick stays true.

## 7. States (colour and stroke only)

| State | Single | Bracket member |
|---|---|---|
| Idle | tick + tail 1 px `line`; channel `ink` 400, frequency `ink-2` | rule, member ticks, tail 1 px `line`; line A `ink`, line B `ink-2` |
| **Keyed** | tail and channel number `state-tx`, number 700; 4 × 4 filled `state-tx` square centred on the tick, bottom edge on the axis line; frequency stays `ink-2` | member tick `state-tx` + square. If printed in line A (first or last member), only that number goes `state-tx` 700. If it's the first member, the tail goes `state-tx` too. The rule and other text stay idle. |
| **Selected** | tail 1.5 px `state-select`, continued as a 1 px `state-select` underline along the baseline under the whole label; frequency `ink` | member tick 1.5 px `state-select`. **A selected member other than the first: its tick is 2 px taller than `tick`.** First member: tail 1.5 px, and line B goes `ink` with the underline on its baseline. Last member: underline under its number in line A. |
| Keyed + selected | selected geometry in `state-tx`, plus square and 700 | the same, per member |
| Bare tick | keyed: `state-tx` + square. Selected: 1.5 px `state-select`, 2 px taller. | n/a |
| Displayed feed stale/offline | text `ink-3`, tails/rules/ticks `line-faint`; keyed hue and square suppressed; selected geometry kept in `state-select` | the same |

- Grayscale test: keyed survives by the square and the 700 weight (the font is monospaced, so the weight never moves
  anything). Selected survives by the 1.5 px stroke, the underline and the taller member tick.
- Motion: only the brief's key-up colour transition. Nothing slides, fades in or re-lays when the radio talks.
- E-2 specifies the ruler only. How the trace and waterfall look when stale is **not** part of this spec. Round 2 dimmed
  them. Don't build that from here: the wall's existing stale treatment governs.

## 8. Column marks crossing the ruler
Round 2 showed the keyed **TX slot outline and wash** running straight through neighbouring labels (`f5-land-live-ch77`:
the CH77 outline cuts `74 161.220` and `77–79`; portrait NEC: CH54's outline cuts `47 160.815`). Rule: every vertical
column mark (TX slot outline and wash, the selection marker, the hover cursor) **stops at the spectrum's bottom edge
and resumes at the waterfall's top edge**. Inside the ruler it may only occupy `0 ≤ y ≤ tick + 2`, where it meets
its own tick. On the ruler, the keyed channel is marked by its tick, square and colour.

## 9. Height and layout numbers
Folded into `docs/sprint-4/liveops-direction.md` §2 to §4 and §9.3 (updated 2026-11-20):
- Desktop wall = spectrum `clamp(48, 25% of (wall − 68 − 14), 144)` + ruler 68 + waterfall + strip 14. Minimum wall
  194.
- 1280: 216 = 48 + 68 + 86 (14 s) + 14. 1920: 317 = 59 + 68 + 176 (29 s) + 14. 2560: 446 = 91 + 68 + 273 (45 s) + 14.
- Phone portrait: spectrum 120, ruler 76, waterfall ≈ 522 (87 s), strip 18. Phone landscape: spectrum 56, ruler 76,
  waterfall ≈ 208 (35 s), strip 18.

## 10. Tests (write them against the rendered `RulerLayout` primitives, not the engine's internal boxes)
Rebuild each ink box from the rendered text origin, the string length and the font metrics. That way a render-side
regression (wrong origin, wrong rotation, a missing raise) fails the test.
- **R1 Pairwise clear.** For every fixture bank, all 91, and runs of 2 to 6 from several starts, at every integer width
  344 to 2560 (portrait under 600, both desktop and landscape above): no two text ink boxes come within `G` on both
  rotated axes, extras included.
- **R2 Coverage.** Every labelled channel appears exactly once: as a single, a bracket member or a bare tick.
- **R3 Tails.** Every tail polyline starts at `(X(ch), tick)` of its own channel (the first member for a bracket) and
  has dx = dy = `t`.
- **R4 Brackets.** The rule's ends equal `X(first)` and `X(last)`. Every member has a tick ≥ `ruleY + 3`. Every
  non-member tick inside the span is ≤ 3 px. k ≥ 2.
- **R5 Bounds.** Every ink box has yTop ≤ `H − 2` and xRight ≤ `width + M`.
- **R6 State invariance.** Render with random keyed sets, a random selected channel (labelled), and stale on and off.
  All geometry (text origins, tails, rules, item list) is identical. Only style attributes and the selected tick
  height differ.
- **R7 Extras are additive.** Adding or removing extras leaves every bank item's primitives unchanged.
- **R8 Strokes clear text.** No tick, rule or tail (including a selected member's +2 px tick) intersects any text ink
  box.
- **R9 Scale strip.** Numerals don't overlap, stay inside `[0, width]`, and each tick sits at its true `X`.
- **R10 Fixtures** (§11), exact.
- Component test for §8: with a keyed channel, no column-mark pixel lands in the ruler above `tick + 2`.

## 11. Fixtures (production banks)
`[a–b]*` is a bracket with non-member slots inside it. Plot widths: 1280 → 1114, 1920 → 1744, 2560 → ≈ 2374,
landscape 844 → ≈ 726, portrait 390 → 374.

| Width | NEC | Freight - CSX/NS | Commuter | Baltimore Harbor | Live |
|---|---|---|---|---|---|
| 1280 | 12 [16–17] 22 27 47 54 59 | [08–09] 14 20 24 28 45 56 64 66 70 82 92 96 | [08–09] 14 20 54 56 59 96 | 24 28 32 49 58 [63–64] 70 74 | 13 22 26 28 74 77 79 |
| 1920, 2560 | all singles | all singles | all singles | all singles | all singles |
| Landscape | 12 [16–17] 22 27 47 54 59 | [08–09] 14 20 24 28 45 56 [64–66]* 70 82 92 96 | [08–09] 14 20 [54–59]* 96 | 24 28 32 49 58 [63–64] 70 74 | 13 22 [26–28]* 74 [77–79]* |
| Portrait | [12–22]* 27 47 54 59 | [08–14]* [20–28]* 45 56 [64–70]* 82; bare 92 96 | [08–14]* 20 [54–59]*; bare 96 | [24–32]* 49 58 [63–70]* 74 | 13 [22–28]* [74–79]* |

All 91: 1920 and 2560 give 91 singles. 1280 gives 30 brackets of 3 (`07–09` … `94–96`) + single 97. Landscape gives
15 brackets of 6 + 97. **Portrait gives 7 brackets of 11 (`07–17` … `73–83`), bare 84 to 97.** This cell changed
from round 2 because of phone `G = 5`; no real-bank cell changed. Extras at 1280 on Freight: off-bank CH60 → a single,
nothing else moves. Off-bank CH10 → bare tick with its keyed marks (its label would collide with `08–09`).

## 12. Open checks before E-2 closes
- The owner glances at phone portrait NEC on his iPhone (47 / 54 / 59 is the tightest real set). `G = 5` was set
  because round 2's 3× raster read as marginal. If it still reads as touching, raise phone `G`, re-run R1 and R10, and
  update §11.
- Round 2 frames were drawn with `G = 4` on the phone, a hyphen in the dB numerals, an in-plot REF caption, column
  marks through the ruler, and dimmed stale plots. This spec corrects all of them. The engineer builds from this text,
  not from the frames.

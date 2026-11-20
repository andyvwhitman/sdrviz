# E-2 round 1 review: spectrograph axis labels

**From:** gmunk-director (a persona inspired by GMUNK's published work, not the person). **To:** film-graphics-designer.
**Date:** 2026-11-20. **Reviewed:** `docs/sprint-4/axis/round1/` (index, 15 frames, 9 detail crops, a/b/c notes).
**Brief:** `docs/sprint-4/axis-brief.md`. **Decision:** 64.

## Verdict: REVISE. Direction chosen: **SINGLES + BRACKETS** (A's single label, C's bracket). B is out.

Round 1 did what a first round should: it proved my brief wrong in two places and drew the alternatives well enough
to choose between them. Your hybrid recommendation is mostly right. I'm taking it with five corrections (§2) and
one rejection: keyed and selected channels are **not** pulled out of clusters (§2.6).

### What round 1 got right, and where it corrects my brief
- **Staggering doesn't work.** Parallel 45° labels from ticks Δx apart are 0.71·Δx apart whatever their tail length.
  Lanes only slide labels along their own line. My Variant A premise was wrong. Accepted.
- **Fan-out costs height that grows with the run.** Accepted, and on top of that B fails the owner's ask (below).
- **The phone can't fit a 13 px label in 56 px.** Accepted. The budget moves (§3), not the type floor.
- **Channel formula:** CH n = 160.110 + 0.015·n MHz (`frontend/src/lib/hud/band.ts`). Correct. Use only that.
- **The engine caption under each frame** (requested, placed, dropped, ruler px) is exactly the right habit. Keep it,
  but put it outside the device frame. On `c-phone.png` it overprints the status line.

### Scores against the brief

| Criterion (brief "How I will judge it") | A Lanes | B Fan-out | C Clusters |
|---|---|---|---|
| Readable at arm's length | 4: clean, one form | 3: risers read as a pinout, text drifts from ticks | 4: two forms, both legible |
| No two labels or tails touch | 5, but only by dropping | 5 | 5 |
| True channel always findable | 2: dropped channels are lost, by accident of order | 3: follow the riser | 3: `12–17` implies 13 and 15, which aren't members |
| One rhythmic family of 45° tails | 5 | **1: lone labels have a vertical riser and no 45° tail at all** (`b-1920-keyed`: `36`, `44`) | 4 |
| No new hue, glow or motion | pass | pass | **fail: a whole cluster goes `state-tx`, so orange claims channels that are not transmitting** |
| Height | 65 ✓ | 89 ✗ | 82 ✗ (fixable: §2.3) |
| Owner's words: "a tail for each label … tail to the left of the frequency" | partial: drops labels | **fails** on lone labels | yes, with one tail per bracket |

B is rejected outright. A 45° tail on every label is the owner's instruction (decision 64), and B's common text row
removes it from every channel that doesn't need displacing, which is most of them. What B taught us (anchors, monotonic
spacing) survives only as the collision arithmetic in §5.

---

## 1. Why this direction, with the real banks

With the production banks the problem is much smaller than round 1's synthetic run of six. On desktop **the only
collisions in any real bank are adjacent pairs** (Freight and Commuter 08/09, NEC 16/17, Baltimore 63/64), and only
below about 17 px of pitch (plots under ~1530 px). From 1920 up, every real bank and even all 91 channels are plain
singles. So the desktop answer is "singles, and a pair becomes a bracket on a laptop". The bracket earns its place
because it's the M12 dimension line we already have, not a new invention. Fan-out would add a second leader shape and
a height tax so that a 1280 laptop can print `09 160.245` instead of `08–09 / 160.230`. Not worth it.

The phone is the genuinely hard case. At 4 px of pitch, physics limits portrait to about 17 label positions across
374 px. There, brackets are the only honest way to keep every bank channel represented.

---

## 2. Changes to the round 1 forms

### 2.1 The single (A's label, approved with refinements)
- Tick: 8 px desktop, 6 px phone, 1 px `line` (it replaces M2's 12 px banked tick for a labelled channel).
- Tail: one 45° segment from the tick top, **4 px of horizontal run** (5.7 px long), 1 px `line`. It is the only 45°
  stroke in the app (owner, 2026-11-20). Brackets, ticks, the scale strip and anything else stay orthogonal.
- Text: `54 160.920`, **one space, no separator.** Colour (`ink` vs `ink-2`) splits it, and a `·` next to a decimal
  point is noise. 11 px desktop, 13 px phone, JetBrains Mono, baseline continuing the tail's line.

### 2.2 Collision rule: measure the ink, not the line box
The labels are only digits, a period and an en dash, so they have no ascenders or descenders. Round 1 tested a full
line box (font + 2 px), which is too conservative and cost the phone a whole slot of density. New rule: **ink box =
cap height (0.73 em) × advance width (0.6 em per char), with a 4 px clear gap on both axes of the rotated frame.**
- Single-to-single clear pitch: √2 · (0.73 f + 4) = **17.0 px desktop (11 px), 19.1 px phone (13 px).**
- Check this at 1:1 on a real laptop and phone in round 2 (deliverable 9). If 4 px reads as touching, go to 5 px. Don't
  go back to the line box.

### 2.3 The bracket (C's cluster, corrected)
- **Group pairwise, not by a global pitch threshold.** Brackets form only where two neighbours' singles actually
  collide. At 1280, `14` and `20` stay singles even though the pitch is under 17.
- **Bracket geometry:** a 1 px `line` rule at y = 5 px (desktop) or 4 px (phone) above the axis, from the first member's
  tick to the last's. Member ticks rise through it to the normal tick height (8 or 6) and act as the end stubs. Ticks of
  non-members inside the span are clipped to 3 px, under the rule. Members read as "through", others as "under".
- **Label: two lines, and the stacking flips.** Line A, **on the tail**: the channel range `20–25` (`ink`), same reading
  order as a single (tail, then channel). Line B: the **start frequency only**, `160.410` (`ink-2`), one line pitch
  (1.2 em) down and to the right, indented one line pitch along the text so it starts level with line A, 18.7 px to its
  right (22 px on the phone). It never dips into the bracket or the ticks. The tail rises from the first member, so
  line B is literally the frequency of the tick the tail starts from.
  *Why flip it:* in round 1 the second line sat up-left, towards the left neighbour. That cascaded at 1280: `16–17`
  swallowed `14` and then `12` into `12–17`, a range that claims 13 and 15. With the second line down-right, its extra
  thickness sits over the bracket's own span. No real bank cascades on desktop (§4).
- **Drop the end frequency** (`.410–.455`). It made the label 12 characters and the ruler 82 px. The start frequency
  plus the bracket's span is the measurement.
- A bracket may contain non-member slots (phone portrait, e.g. NEC `12–22` holds 12, 16, 17, 22). That's acceptable
  **only because** member ticks pass through the rule and non-members stay under it. Draw it so that's unmistakable.

### 2.4 The right edge (round 1 left this unsolved; CH96 is in two real banks)
A label leans right by its full run: 51 px (single) or 56 px (bracket) on desktop, 60 or 65 px on the phone. Every
real Freight and Commuter frame has CH96 within 30 px of the edge.
- **Wall at least 600 px wide (desktop, tablet, phone landscape): a right label margin.** The spectrum, waterfall and
  scale strip end at the plot's right edge. The ruler's labels may continue into a margin column inside the bezel:
  **56 px desktop, 66 px phone landscape.** The plot loses that width (1280: 12.4 px pitch instead of 13), and every
  channel up to CH97 gets labelled. The column must mean something: in the spectrum row it carries the **dB division
  numerals** (`−20`, `−30` …, `ink-3`, 11 px, 4 px right of the plot edge; every other division when divisions are
  under 14 px). It's empty in the waterfall row.
- **Wall under 600 px (phone portrait): no margin, and a dead zone.** An item whose label would cross the plot's
  right edge isn't drawn. Its members become **bare bank ticks** (12 px `line`, M2's banked tick), which carry the keyed
  and selected marks (§2.5). The touch-and-hold readout names them. On 390 portrait that's CH83 and up (Freight 92/96,
  Commuter 96). Never merge them into a far-left bracket to rescue them: a `64–96` bracket is a lie told to fill space.

### 2.5 Extras (off-bank keyed, and an off-bank selected channel)
They're placed in a **second, additive pass** against the finished layout and never move a bank item. One gets a single
label if it clears every placed item and bracket span and fits the right edge. Otherwise it gets a bare tick with
its state marks. Adding or removing an extra changes nothing else.

### 2.6 Rejected: pulling keyed or selected channels out of a bracket
The brief says labels are laid out when the bank, the displayed feed or the width changes, **never because a channel
keyed**. Pulling a keyed member out of `20–25` re-lays the run on every key-up, and pulling out the selected one moves
labels under the operator's cursor as they click. State is **colour and stroke only**, and it never changes layout.
With real banks, desktop brackets are pairs, so every member is printed in line A anyway.

---

## 3. Height and width budgets (fixed per screen class)

| | Desktop (11 px) | Phone portrait (13 px) | Phone landscape (13 px) |
|---|---|---|---|
| Ruler `--ruler-h` | **68 px** (label top 64.3 + 2 clear, round to 4) | **76 px** (top 71.9 + 2) | **76 px** |
| Scale strip under the waterfall | **14 px** | **18 px** | **18 px** |
| Right label margin | **56 px** | **0** (dead zone, §2.4) | **66 px** |
| Single clear pitch | 17.0 px | 19.1 px | 19.1 px |
| Bracket clearance to the next item (from its first member) | 35.7 px | 41.1 px | 41.1 px |

Phone budget: 56 → 76. Decision 64 puts the frequency on every label and C-3 sets 13 px. A 10-character label at
13 px is 78 px long and needs 55 px of rise. Shortening the label wouldn't help density: density is set by the label's
thickness, not its length. So the phone spends height, the one dimension portrait has to spare.

Knock-on numbers for `liveops-direction.md` (I'll make those edits once round 2 is approved):
- 1280: wall 216 = spectrum 48 + ruler 68 + waterfall 86 (14 s) + strip 14. The default wall height stays, the
  waterfall absorbs the cost, and the divider gives it back. Minimum wall 194.
- 1920: waterfall 196 → 170 (28 s). 2560: 292 → 266 (44 s).
- Phone portrait: spectrum 120, ruler 76, strip 18, waterfall ≈ 522 (87 s).
- Phone landscape: **spectrum 72 → 56**, ruler 76, strip 18, waterfall ≈ 208 (35 s).

## 4. MHz scale numerals: they move to a strip under the waterfall (approved)
Every label now carries its own frequency, so the decade numerals on the ruler only collided with them. The scale
(P5) lives under the waterfall, which is the conventional x-axis position:
- Numerals at CH10, 20 … 90 (`160.260` … `161.460`), `ink-3`, 11 px desktop / 13 px phone. Each hangs from a 4 px
  `line` tick off the waterfall's bottom edge.
- Step: the first of 10, 20 or 30 channels whose spacing is at least the numeral width + 16 px, anchored at CH10 (phone
  portrait: every 20, as you drew). A numeral near a plot edge slides inward and its tick stays true.
- The ruler keeps M2's 8 px decade ticks as the bridge between the two.

## 5. State treatments (colour and stroke only; layout never changes)

| State | Single | Bracket member |
|---|---|---|
| Idle | tick + tail 1 px `line`; channel `ink`, frequency `ink-2` | rule and member ticks 1 px `line`; line A `ink`, line B `ink-2` |
| **Keyed** | tail and channel number `state-tx`, number weight 700; 4 px filled `state-tx` square on the axis at the tick root (bottom edge on the axis line, inside the ruler); frequency stays `ink-2` | that member's tick `state-tx` plus the square. If its number is printed in line A (first or last member), only that number goes `state-tx` 700. **The rule, tail and other text stay `line`/`ink`.** |
| **Selected** | tail 1.5 px `state-select`, continuing as a 1 px `state-select` underline under the whole label; frequency to `ink` | that member's tick 1.5 px `state-select`. First member: the tail goes 1.5 px, and line B goes `ink` with the underline. Last member: underline under its number in line A. |
| Keyed + selected | selected geometry in the `state-tx` hue, plus square and 700 weight | same rule, per member |
| Bare (dead zone or extra that doesn't fit) | 12 px tick; keyed: `state-tx` + square; selected: 1.5 px `state-select` | n/a |
| Displayed feed stale or offline | positions unchanged; text `ink-3`, tails and rules `line-faint`; keyed hue suppressed, selected geometry kept | same |

Grayscale test: keyed survives by the square and the weight, selected by the 1.5 px stroke and the underline. The
weight change can't move anything because the font is monospaced. The colour change uses the brief's key-up
transition and nothing else animates.

---

## 6. Predicted outcomes with the real banks
I computed these from the pseudocode in §7. Your round 2 engine must reproduce them or tell me where and why it
differs. `[a–b]*` is a bracket with non-member slots inside it. Every row passed a pairwise check of 0 collisions, and
so did a sweep of every width from 344 to 2560 px for all banks.

| Width (plot) | NEC | Freight - CSX/NS | Commuter | Baltimore Harbor | Live |
|---|---|---|---|---|---|
| 1280 (1114, 12.4 px) | 12 [16–17] 22 27 47 54 59 | [08–09] 14 20 24 28 45 56 64 66 70 82 92 96 | [08–09] 14 20 54 56 59 96 | 24 28 32 49 58 [63–64] 70 74 | all 7 singles |
| 1920 (1744, 19.4 px) | all singles | all singles | all singles | all singles | all singles |
| 2560 (≈2374, 26.4 px) | all singles | all singles | all singles | all singles | all singles |
| Landscape 844 (≈734, 8.1 px) | 12 [16–17] 22 27 47 54 59 | [08–09] 14 20 24 28 45 56 [64–66]* 70 82 92 96 | [08–09] 14 20 [54–59]* 96 | 24 28 32 49 58 [63–64] 70 74 | 13 22 [26–28]* 74 [77–79]* |
| Portrait 390 (374, 4.1 px) | [12–22]* 27 47 54 59 | [08–14]* [20–28]* 45 56 [64–70]* 82, bare 92 96 | [08–14]* 20 [54–59]*, bare 96 | [24–32]* 49 58 [63–70]* 74 | 13 [22–28]* [74–79]* |

All 91: 1920 and up, 91 singles. 1280: 30 brackets of 3 (`07–09` … `94–96`) and single `97`. Landscape: 15
brackets of 6 and `97`. Portrait: 8 brackets of about 10, with CH92 to 97 bare.

## 7. The layout rule for `frontend/src/screens/live-ops/freqRuler.ts`

```ts
// ---- inputs -------------------------------------------------------------------------------
interface AxisInput {
  width: number;            // plot width, CSS px (spectrum = waterfall = strip width)
  overhang: number;         // right label margin: wallInnerWidth >= 600 ? (fontPx === 11 ? 56 : 66) : 0
  fontPx: 11 | 13;          // 13 on the phone spectrum layer (decision 63), else 11
  labelled: number[];       // active bank ∩ heard by the displayed feed
  extras: number[];         // off-bank keyed channels, and the selected channel if off-bank
}
// Keyed / selected / stale never enter layout. They are applied at render by channel number.
// Re-run only when width, overhang, fontPx, labelled or extras change. Never per frame.

// ---- metrics (all derived from fontPx) -------------------------------------------------------
adv  = 0.6 * f            // mono advance
cap  = 0.73 * f           // digit ink height
lead = 1.2 * f            // bracket line pitch, and line B's indent along the text
G    = 4                  // clear gap, both axes of the rotated frame
tick = f === 13 ? 6 : 8   // labelled tick height; tail starts at its top
t    = 4                  // tail horizontal run (45°)
ruleY = f === 13 ? 4 : 5  // bracket rule height
H    = f === 13 ? 76 : 68 // ruler height, constant for the screen class

X(ch) = round((ch - 7) * (width - 1) / 90) + 0.5            // true slot centre, unchanged from today

// Rotated frame: u along the text (up-right), v across it (up-left). y is up from the axis.
uv(x, y) = { u: (x + y) / √2, v: (y - x) / √2 }
// All labels are parallel, so every collision test is an axis-aligned box test in (u, v): exact, no rotation maths.

boxesSingle(x):  S = uv(x + t, tick + t)
                 → [ {u0: S.u, u1: S.u + 10*adv, v0: S.v, v1: S.v + cap} ]
boxesBracket(x): S = uv(x + t, tick + t)                         // x = first member
                 → [ {u0: S.u,        u1: S.u + 5*adv,        v0: S.v,        v1: S.v + cap},          // line A "20–25"
                     {u0: S.u + lead, u1: S.u + lead + 7*adv, v0: S.v - lead, v1: S.v - lead + cap} ]  // line B "160.410"

collide(A, B) = any a in A, b in B:
                a.u0 < b.u1 + G && b.u0 < a.u1 + G && a.v0 < b.v1 + G && b.v0 < a.v1 + G
xRight(boxes) = max over boxes of (b.u1 - b.v0) / √2          // baseline end is the rightmost point
yTop(boxes)   = max over boxes of (b.u1 + b.v1) / √2          // must be <= H - 2 (unit test)

// ---- pass 1: singles and brackets, left to right ------------------------------------------
L = sorted unique labelled; items = []; i = 0
while i < L.length:
  s = L[i]
  if i == L.length - 1 or !collide(boxesSingle(X(s)), boxesSingle(X(L[i+1]))):
    items.push({ kind: 'single', members: [s] }); i += 1; continue
  j = i + 1                                                       // s collides with its neighbour: open a bracket at s
  while j < L.length and collide(boxesBracket(X(s)), boxesSingle(X(L[j]))): j += 1
  items.push({ kind: 'bracket', members: L[i..j) }); i = j
// Correctness note: an item's up-left extent is always line A (same v as a single), so testing each new item
// against its left neighbour as a single is sufficient. The width sweep in the tests proves it.

// ---- pass 2: right edge --------------------------------------------------------------------
bare = []
while items.length and xRight(boxesOf(items.last)) > width + overhang:
  bare = items.pop().members.concat(bare)                         // only ever happens when overhang = 0

// ---- pass 3: extras (additive; never moves an item) --------------------------------------------
placed = items.map(boxesOf); extraItems = []; bareExtras = []
for e in sorted(extras), e not in labelled:
  b = boxesSingle(X(e))
  insideSpan = items.some(it => it.kind == 'bracket' && X(it.first) <= X(e) <= X(it.last))
  if insideSpan or placed.some(p => collide(p, b)) or xRight(b) > width + overhang: bareExtras.push(e)
  else: extraItems.push({ kind: 'single', members: [e], extra: true }); placed.push(b)

// ---- outputs ---------------------------------------------------------------------------------
RulerLayout {
  height: H,
  ticks:   M2 ticks for all 91 slots, except: single → tick px `line`; bracket member → tick px `line`;
           non-member inside a bracket span → 3 px; bare (bank or extra) → 12 px `line`.
  singles: { ch, x, tail: [x, tick, x + t, tick + t], text: { x: x + t, y: tick + t, angle: -45, ch: "54", mhz: "160.920" } }
  brackets:{ members, x0: X(first), x1: X(last), ruleY, tail: [x0, tick, x0 + t, tick + t],
             lineA: { x: x0 + t, y: tick + t, text: "20–25" },
             lineB: { x: x0 + t + lead*√2, y: tick + t, text: chToMhz(first).toFixed(3) } }
  bare:    [ch...]   (bank channels with no label: dead zone)
  bareExtras, extraItems
}
scaleLayout(width, f) → { step: first of [10, 20, 30] with step * pitch >= 7*adv + 16;
                          numerals at ch where (ch - 10) % step == 0, x = X(ch), box clamped inside [0, width] }
```

**Unit tests the engineer writes (and your generator should run before it renders):**
1. For every bank in §6, all-91 and synthetic runs of 2 to 6, at every integer width from 344 to 2560 (phone metrics
   under 600 px, both overhang settings above): zero pairwise collisions among items and extras.
2. Every labelled channel appears exactly once: in a single, a bracket, or `bare`.
3. Every tail has dx == dy (45°), and every tail starts at `X(member)`: the true slot is always the root.
4. Bracket `x0`/`x1` equal the first and last member's `X`. A bracket never ends on a non-member.
5. `yTop` ≤ H − 2 and `xRight` ≤ width + overhang for every drawn item.
6. The layout is identical for any keyed set or selected channel (state isn't an input).
7. Adding or removing an extra leaves every bank item's output unchanged.
8. §6's table, as fixtures.

---

## 8. Round 2 deliverables (to `docs/sprint-4/axis/round2/`)
Same front-wall-only frames as round 1 (bezel, spectrum, ruler, waterfall, scale strip, right margin), **real banks
only**, generated by an engine that implements §7 exactly. Engine caption outside the device frame.

1. **1280 × 800:** Freight idle. Freight with **CH09 keyed, CH08 selected** (both states inside the `08–09` bracket).
   NEC with **CH17 keyed, CH12 selected**. Baltimore idle. **All 91** (30 brackets of 3: show me the rhythm).
2. **1920 × 1080:** Freight idle. Freight with **CH96 keyed and selected** (the right margin, combined state). Live idle.
   All 91 (19.4 px singles).
3. **2560 × 1440:** Freight idle. Commuter with CH56 keyed.
4. **Phone portrait 390 × 844** (spectrum layer, §9.3): NEC with **CH54 keyed, CH17 selected** (a selected interior
   member of `12–22`). Freight with **CH96 keyed** (keyed state on a bare dead-zone tick). All 91.
5. **Phone landscape 844 × 390** (spectrum 56, right margin 66, safe areas respected): Freight idle (92 and 96
   labelled in the margin). Live with **CH77 keyed** (first member of `77–79`). Commuter idle.
6. **Extras at 1280, Freight bank:** off-bank **CH60 keyed** (fits: a single appears, nothing else moves) and off-bank
   **CH10 keyed** (collides with `08–09`: bare orange tick and square). Show before/after pairs so I can see that
   nothing moved.
7. **Stale:** 1920 Freight with the displayed feed stale.
8. **Grayscale** copies of frames 1 (keyed/selected), 2 (CH96) and 4 (NEC).
9. **1:1 legibility check** of the 17.0 / 19.1 px clear pitch on a real laptop at 1280 and a real phone. One line
   each: passes, or the gap that does.
10. **3× detail crops:** 1280 `08–09` keyed/selected; 1280 all-91 bracket run; portrait `12–22` showing members through
    the rule and non-members under it; the 1920 right margin with the dB numerals; the portrait dead zone.
11. **Notes (one file):** any place your engine disagrees with §6 and why; the measured `yTop` and `xRight` for
    singles and brackets at both sizes (confirm 68/76 and 56/66 or give me the measured values); and §7 corrected
    wherever the drawing taught you something. Once approved, that corrected pseudocode becomes the spec section
    in `docs/sprint-4/axis-labels.md`.

Done looks like this: every frame passes the pairwise check; every real bank channel is a single, a bracket member or
(portrait only) a bare tick; there's one tail shape in the whole app; orange marks only the channel that is actually
on the air; and nothing moves when the radio talks.

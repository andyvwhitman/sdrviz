# sdrviz — Creative Brief

**From:** gmunk-director (creative director persona; inspired by GMUNK's published work, not the person)
**To:** film-graphics-designer and the screen subagents
**Date:** 2026-11-08 · **Revision:** 2 · **Status:** Re-issued for Stage 2 design. It resolves the 28 designer issues; see §15, Revision notes.
**Companion file:** [`mood-board.html`](mood-board.html) has the palette, type, strokes and motif samples rendered as specimens. Open it next to this file. **Where the board and this brief disagree, the brief wins.** The board is a specimen sheet and is corrected to match the brief.

**Read first:**
- [`docs/decisions.md`](../decisions.md). These are the user's locked decisions, and this brief does not override any of them.
- Research: [01 film work](../research/01-gmunk-film-work.md), [02 collaborators](../research/02-collaborators.md), [03 outside inspiration](../research/03-inspiration.md), [04 corridor radio](../research/04-corridor-radio.md).
- Seed data: `data/seed/`. Mockup fixtures: `data/sim/` (§9.0, to be generated in Stage 2).

**How to read this brief:**
- Research claims are cited inline with their source URL and keep the research team's confidence labels: *self-reported* (the designer's own account), **[UNVERIFIED]**, **[S]** secondary or **[U]** uncertain.
- Anything stated without a citation is **my direction as art director**. It is a design decision, not a fact.
- Words in `code` are token, component or file names that the spec and the code should use verbatim.
- Numbers shown in examples are **format examples** unless they cite a seed row (`tx-039`). Mockups must compute every displayed value from `data/seed/` or `data/sim/` (P3).

---

## 0. The one-paragraph version

sdrviz is a **Wayside Listening Table**. It is a light table for the railroad, built in the spirit of Vika's console in *Oblivion*. It sits beside the Northeast Corridor and listens.

- **Idle:** it is nearly dark. It shows pale-cyan hairlines on near-black, one slow functional motion, and real numbers.
- **When a crew keys up:** that one channel flashes warm orange. The readout ticks, the waveform draws, and the words land on the log as soon as they are decoded.
- **After key-up:** the orange cools to an ember and fades back to quiet over ten minutes, like phosphor after a radar sweep.

Nothing is decoration. Each line is a scale, a boundary, a position or a state. Someone should be able to keep it open for eight hours and feel calmer at the end, not worn out.

---

## 1. Concept and narrative: what this instrument *is*

### 1.1 In-world premise
- **The fiction:** the console belongs to an unnamed corridor watch service. Its job is to *witness* the railroad, never control it.
- **What it hears:** four listening posts (`ALX-01`, `LND-02`, `BWI-03`, `BAY-04`; fictional per [04 §3](../research/04-corridor-radio.md)) each feed it one slice of VHF, 160.215–161.565 MHz, the AAR band ([qsl.net/n4jri](https://www.qsl.net/n4jri/aar_ch.htm)).
- **What it does with that:** turns the slices into light, words and positions on the line.
- **Its operator:** an observer, not a dispatcher. The observer's questions are *who is talking, where are they, what did they say, and is my equipment healthy*. The observer can act on only one of those: the equipment. That is why red belongs to equipment alone (P2).

Oblivion's Light Table is the direct precedent:
- It was a fixed operator console made of a main map, vitals and resource monitors, and "Rogue Signal" analysis windows. An operator watched it for long shifts ([gmunk.com/OBLIVION-GFX](https://gmunk.com/OBLIVION-GFX), *self-reported*).
- Its graphics were built as **seamless loops with start-up and shut-down animations** for live on-set playback ([Pushing Pixels, Joseph Chan](https://www.pushing-pixels.org/?p=9032), *self-reported*).
- sdrviz is that same object made real. Every panel has an idle loop, an arming build-on, and a defined shutdown or offline state.

### 1.2 The instrument's name and voice
- **On-screen product mark:** `SDRVIZ` set in display type. The sub-line is `WAYSIDE LISTENING TABLE · NEC DC–BAL`.
- **Title block designation:** `WLT-1`. It appears in the title block (§6, motif M10) the way a drawing carries a sheet number.
- **Voice:** terse, factual, in uppercase for labels and sentence case for transcripts.
  - Write it the way an instrument would: `CH54 · AMTK NEC · KEYED 00:07.4`.
  - Never write it the way an app would: "Amtrak is talking now!".
  - No exclamation marks anywhere.
  - Empty states are statements, for example `NO TRAFFIC · 42M SINCE LAST KEY-UP`.
- **Canonical worked example** (used throughout this brief and the board; from seed row `tx-039`): `MARC 410` on `CH54` (`5454`, 160.920), heard by `BWI-03` at `07:15:00`, saying "410 approach medium, Odenton, track 2." Odenton is `NEC 113.6` at 39.0869 N · 76.7065 W (`data/seed/places.json`). So its data block reads `MARC 410` / `NEC 113.6 · CH54`.

### 1.3 The three moods (the whole design rests on these)

| Mood | When | Look and feel |
|---|---|---|
| **Listening** | Nothing is transmitting | Dark cockpit. Hairlines only, with dim cyan armed marks. One ambient motion is allowed per screen (§7.5). The brightest thing on screen is text. |
| **Keyed** | One or more channels transmitting | Only the keyed elements change. They turn orange, the critical value is promoted, and the waveform runs. Everything else stays where it is. |
| **Fault** | A feed, the decoder, storage or the host has failed | Red appears on the faulted object *only* (§8.9 says what the object is for system faults), plus one line in the status bar. Red is **present tense**: an acknowledged fault drops its red frame, and a cleared fault leaves no red behind. No red full-screen field unless the whole system is down (§8.4). |

This is the "dark cockpit" principle: a healthy panel is quiet rather than green, and only change brightens ([Lean Enterprise Institute](https://www.lean.org/the-lean-post/articles/the-dark-cockpit-what-aviation-can-teach-lean-leaders/) **[S]**, via [03 §3.7](../research/03-inspiration.md)).

---

## 2. Design principles

These are numbered so reviews can cite them ("violates P3"). Each one names its precedent.

**P1. Listen first. Quiet is the default state.**
- The idle screen should average very low luminance.
- Healthy is shown as dim and steady, never green. We have no green at all ([03 §3.7](../research/03-inspiration.md)).
- Brightness is a budget, and only change spends it.

**P2. Hue means state, and only state.**
- Cyan means armed/idle, orange means transmitting, red means fault (decision #7). Selection, recency, staleness and offline are shown by luminance, stroke pattern and geometry, never by a new hue.
- **Red means "act now on your own equipment".** It is never used for information the observer cannot act on. A reported railcar defect is *railroad* information, so it is not red (§9.1.5).
- **Red is present tense.** An acknowledged fault keeps its red glyph and label but loses its red frame (§3.5). Past faults in History, Stats and timelines are drawn in `state-stale` with a hollow triangle, never in red.
- Railroads, feeds and banks are told apart by glyph, label and line pattern, never by color. *The Expanse* gave each faction its own color; that is the cautionary case ([Pushing Pixels, Rhys Yorke](https://www.pushing-pixels.org/?p=18324), via [03 §1.7](../research/03-inspiration.md)).
- Oblivion reserved red for alerts ([Fuzzy Math](https://fuzzymath.com/blog/evaluating-interface-design-of-oblivion)). That same critique flags red reused for a non-alert radar target as a mistake, and we will not repeat it.

**P3. Real data or nothing.**
- Every number on screen is a real value of its kind: frequency, AAR channel, dBFS, SNR, sample rate, milepost, clock time.
- No lorem ipsum hex dumps and no fake scrolling code. Josh Nimoy insisted the *Tron: Legacy* terminal used real `ps | grep` and `kill` ([Core77](https://www.core77.com/posts/18933/josh-nimoy-on-the-secrets-behind-the-special-effects-in-tron-legacy-18933)).
- Jayse Hansen: "all the text is related to the scene" ([Pushing Pixels](https://www.pushing-pixels.org/?p=7447), *self-reported*).
- **In the mockup, "real" means computed from data files, never typed into a drawing.** The data files are the seed (`data/seed/`, researched or hand-written fiction) plus deterministic simulated fixtures (`data/sim/`, §9.0.6). Anything from `data/sim/` carries `sim: true`. The mockup shows a `SIM` tag in `ink-3` on every screen's title block, and on any individual object whose identity is simulated (a train, a feed).

**P4. One dominant datum per screen.**
- *Tron: Ares* made the 29-minute derez timer "the most important piece of data in the entire system" ([gmunk.com/TRON-Ares-Computer-Vision](https://gmunk.com/TRON-Ares-Computer-Vision), *self-reported*).
- Each sdrviz screen names its hero value in §9 and gives it a **dedicated hero slot**. That value is the largest type on the screen (48 px).
- When a warning arises at screen level, the critical value **moves to center**, as the Bubbleship HUD moved the radiation distance to center ([Fuzzy Math](https://fuzzymath.com/blog/evaluating-interface-design-of-oblivion)). Inside a tile, promotion means the right readout zone (§7.3), because the tile's left edge is its identity.
- Unlike Oblivion's equal-weight light table (same critique), the primary panel gets more area.

**P5. Ornament must read as function.**
- Tick rulers, registration marks, range rings, coordinate readouts and title blocks are allowed **because they carry scale or position**.
- Cut "greeble" for the quick read. GMUNK: "we had to take out a lot of greeble so the point of the graphics was understood quickly" ([Pushing Pixels](https://www.pushing-pixels.org/2011/06/01/visual-effects-of-tron-legacy-and-beyond-conversation-with-gmunk.html)).
- Hansen's warning against "a bunch of circles and random text" ([Pushing Pixels](https://www.pushing-pixels.org/?p=7447)) is the test. If you can't say what a circle measures, delete it.

**P6. One choreography, every time.**
- A key-up looks identical on every channel, every screen and every day, so it reads as a state change rather than an effect.
- Precedents:
  - Cantina's neutral-to-battle HUD mode change ([ProVideo Coalition](https://www.provideocoalition.com/Marvels_The_Avengers_Taking_the_HUD_to_new_heights/), via [03 §1.3](../research/03-inspiration.md)).
  - *Ares*' single logic: "Scan, track, connect, populate, animate" ([gmunk.com](https://gmunk.com/TRON-Ares-Computer-Vision)).
- The sdrviz motion grammar is in §7.

**P7. Speak the railroad's own visual language.**
- **Mileposts in the railroad's own count, not lat/long:** `NEC 113.6`, `BAA 6.7`, `CFP 95.8` (§4, §9.0.4; [03 §5.4](../research/03-inspiration.md)).
- **4-digit AAR readouts:** `5454` ([RadioReference forum](https://forums.radioreference.com/threads/aar-freq.204594/) **[S]**).
- **CTC track diagrams** ([Wikipedia: CTC](https://en.wikipedia.org/wiki/Centralized_traffic_control)).
- **Stringline graphs** ([FRA](https://railroads.dot.gov/sites/fra.dot.gov/files/fra_net/2009/rr0902.pdf)).
- **Position-light geometry**, native to the ex-PRR NEC ([railroadsignals.us](https://railroadsignals.us/signals/pl)).
- These are what make sdrviz *this* corridor's instrument rather than a generic sci-fi skin.

**P8. Keep radio conventions intact.**
- Frequency rises left to right. dB is on a vertical axis. The waterfall scrolls down.
- Perception's John LePore: for real products, "if it's not broken, don't fix it" ([Pushing Pixels](https://www.pushing-pixels.org/?p=12751)).
- Put the novelty in the rendering, not in breaking the conventions.

**P9. Subtract until it breaks, then add one back.**
- Kosinski repeatedly chose "a cleaner, simpler look so the sequence wouldn't age quickly" ([gmunk.com/TRON-Opening-Titles](https://gmunk.com/TRON-Opening-Titles), *self-reported*).
- The *Tron: Legacy* Throneship glass got simpler with every iteration ([gmunk.com/TRON-Throne-Room](https://gmunk.com/TRON-Throne-Room)).
- Equally, Tufte-style over-stripping can hurt findability: a 2007 study found viewers preferred the standard chart over the minimal one ([R Journal 2015](https://journal.r-project.org/articles/RJ-2015-003/RJ-2015-003.pdf), via [03 §4.5](../research/03-inspiration.md)). Corner brackets and frames are *earned redundancy*, so keep them.

**P10. Built for hours, served by a Raspberry Pi.**
- **The client is a desktop browser** on the LAN: current Chromium, Firefox or Safari on an ordinary laptop or desktop. The Pi (and later the CPU-only box, decision #4) is the *server*. A Pi kiosk browser is **not** a v1 client target. Budgets are in §10.8.
- Simple, deterministic SVG and Canvas renderers. No heavy generative engines.
- Lewandowski called standalone code-art apps "overly ambitious … beyond the design phase" ([Motionographer](https://motionographer.com/2011/06/06/tron-legacy-in-depth-with-david-lewandowski/)).
- No full-screen blur. Glow is a cheap two-stroke trick (§3.4), never a CSS `filter: blur` over large areas.

---

## 3. Palette: semantic color tokens

**Basis:**
- Decision #7: cyan = idle/armed, amber/orange = transmitting, red = fault, white and pale-cyan hairlines on near-black.
- The film-derived values in [01 §7.7](../research/01-gmunk-film-work.md) are eye estimates (**[ESTIMATE]**). No source publishes film hex values. The tokens below are my **final values**, adjusted from those estimates and checked for contrast.
- Contrast ratios were computed with the WCAG 2.x relative-luminance formula against `bg-void`, `bg-panel` and the washes in §3.6.
- Text tokens must meet **4.5:1** ([WCAG 2.2 SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)).
- State strokes and glyphs must meet **3:1** ([WCAG 2.2 SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).
- Tokens marked *decorative* are below 3:1 on purpose. They may never be the only carrier of meaning.

### 3.1 Surfaces and ink

| Token | Hex | vs void | vs panel | Use |
|---|---|---|---|---|
| `bg-void` | `#04070A` | — | — | Page background, and the surface of every plot (spectrum, waterfall, ridgeline, map). Near-black with a cold cast. Never pure `#000`. |
| `bg-panel` | `#081015` | — | — | Panel interior. Barely lifted: panels are drawn by line, not by fill. |
| `bg-raised` | `#0C171D` | — | — | Popovers, the inspector ("Rogue Signal" window), menus. |
| `grid` | `#12232B` | 1.25 | 1.19 | *Decorative.* Graticule, layout grid, waterfall cell lattice. |
| `line-faint` | `#2C4A55` | 2.13 | 2.02 | *Decorative.* Minor ticks, inactive frames, map shoreline fill-edge. |
| `line` | `#9CC9D6` | 11.29 | 10.72 | The house hairline: panel brackets, rail lines, rulers. |
| `ink` | `#E4F1F5` | 17.50 | 16.62 | Primary text and the hero datum. Not pure white, which reduces halation on dark ground (§10.3). |
| `ink-2` | `#8FAFBA` | 8.66 | 8.23 | Secondary text, units, column headers. |
| `ink-3` | `#67868F` | 5.18 | 4.92 | Tertiary text: tick numerals, timestamps in dense tables. **Floor for any text.** On `bg-raised` it measures 4.66. Inside a TX wash it is promoted to `ink-2` (§3.6). |

### 3.2 State tokens (the semantic set)

| Token | Hex | vs void | Meaning | Carried by (always pair hue with geometry) |
|---|---|---|---|---|
| `state-idle` | `#4FCBE6` | 10.59 | **Idle / armed.** Monitored, squelch closed, ready. Also the glyph and bracket tone of **squelch-open** (the first 250 ms, §7.3). | Position-light glyph horizontal (M6); cyan only on the *mark*, not the whole frame. In squelch-open: diagonal glyph, brackets brighten from `state-idle-dim` to `state-idle`. |
| `state-idle-dim` | `#2F7D91` | 4.29 | Armed frame tone at rest. Passes 3:1 for strokes. **Never used for text** (3.86:1 on `bg-raised`). | Tile corner brackets at idle. |
| `state-tx` | `#FF8A2B` | 8.58 | **Transmitting.** Squelch open for ≥ 250 ms and audio flowing (one threshold, §7.3). **Exclusive.** Nothing else in the product may be orange. | Glyph vertical; solid frame; promoted readout; running waveform. |
| `state-tx-hot` | `#FFD3A6` | 14.54 | The 120 ms phosphor "flash" at TX commit, and the core line of the glowing TX stroke. | Flash only; never resting. |
| `state-recent` | `#B9773F` | 5.55 | **Recently active.** The ember. Key-up ended less than 2 min ago. | Glyph returns to horizontal; frame returns to brackets; a 2 px *ember underline* under the channel label; `LAST 48S` readout. |
| `state-recent-dim` | `#6E4A2C` | 2.58 | *Decorative.* The far end of the ember, from 2 to 10 min after release. | Underline only, with the `LAST 4M` readout in `ink-3`. |
| `state-stale` | `#71838C` | 5.12 | **Stale.** A feed is connected but has delivered no samples within its window (30 s), or a channel has lost *all* of its feeds to stale (§9.0.2). Also the tone of *degraded* system chips (`ASR BACKLOG`, `DISK 87%`, `HOST 81°C`) and of *past* faults. | Glyph hollow; frame **dashed 4/4**; values greyed with an age readout `AGE 1M 12S`. |
| `state-offline` | `#3A474E` | 2.11 | *Decorative stroke.* **Offline**, which has two causes with different labels: `DISABLED` (the user switched it off; never alarming) and `RECONNECTING` (link dropped less than 60 s ago). Always paired with a text label in `state-stale` (5.12). | Glyph crossed (×); frame **dashed 1/5 (dotted)**; values blanked to `— — —`, never zero. |
| `state-fault` | `#FF4A3D` | 6.06 | **Fault.** Act now on your own equipment: device error, link lost for over 60 s, no samples for over 5 min, sustained clipping, stuck squelch, decoder down, disk full or write error, host over-temperature or under-voltage (escalation rules in §8.9). | Glyph replaced by a filled triangle-in-bracket; frame solid while unacknowledged; label `FAULT · <reason>`. |
| `state-fault-dim` | `#7A2620` | 2.04 | *Decorative.* The 6% wash behind an *unacknowledged* faulted tile, and the map coverage hatch for a faulted feed. | Wash/hatch only. |
| `state-select` | `#F5FBFD` | 19.33 | **Selected.** Luminance, not hue. Also the focus ring, which is told apart by geometry (§10.4). | Outer selection brackets (§3.5); selected stringline. |

**Why these exact choices:**
- **Orange, not yellow-amber, for TX.**
  - Aviation reserves amber/yellow for *caution* ([14 CFR 25.1322](https://www.faa.gov/sites/faa.gov/files/2022-11/25.1322.pdf)). Researcher (c) flagged that TX is a normal, frequent event ([03 §3.7](../research/03-inspiration.md)).
  - So TX is pushed to a warm, saturated `#FF8A2B`. This is close to the Clu orange estimated in [01 §3.2](../research/01-gmunk-film-work.md) (`#FF8A1E` **[ESTIMATE]**), which keeps decision #7 ("amber/orange") intact.
  - **There is no caution color in sdrviz.** Degraded conditions are either *stale* (grey, dashed) or *fault* (red). That makes the system binary and honest: a red frame always means act now.
- **Orange vs red.** They are close in luminance (contrast between them is 1.42:1), so hue alone would fail colorblind users. They are kept apart by geometry, which is mandatory:
  - TX = vertical three-dot glyph plus a running waveform.
  - Fault = filled triangle, static.
  - A fault never animates continuously (§7.6).
- **Ember for "recent".** "Warm = has spoken" is one idea expressed in three luminance steps (`tx-hot` → `tx` → `recent` → `recent-dim`). It is the radar phosphor's flash-then-afterglow cascade ([GE Techni-Talk 1952](https://worldradiohistory.com/Archive-Company-Publications/GE-Techni-Talk/GE-Techni-Talk-1952-08-09.pdf), via [03 §3.1](../research/03-inspiration.md)), mapped onto our TX hue.
  - The ember is never used as a frame or fill, only as an underline and a small readout. It cannot be confused with live TX, which always has a solid frame and a moving waveform.
- **No green, purple or pink anywhere.**

### 3.3 Data-visualization ramps

- **Waterfall / heatmap (single hue, lightness only).**
  - Stops: `#04070A` → `#0A1F28` → `#124A5A` → `#2C8FA8` → `#7FD8EC` → `#E8FBFF`.
  - Strong signal reads "hot" by brightness alone.
  - **No Turbo, Jet, viridis or plasma.** Rainbow maps would spend every hue and break P2 ([Google Research on Turbo](https://research.google/blog/turbo-an-improved-rainbow-colormap-for-visualization/), [03 §3.6](../research/03-inspiration.md)).
  - Clamp the lower color limit just below the noise floor and the upper just above the strongest signal ([RFAnalyzer docs](https://demantz.github.io/RFAnalyzer/fft.html)). Auto-track the floor with a slow (≥ 10 s) time constant so the field stays calm.
- **TX overlay on the waterfall and spectrum.**
  - The currently keyed channel slot gets a 1 px `state-tx` outline and a `wash-tx-plot` (12%) wash, composited *on top of* the monochrome waterfall. No text sits on a plot wash.
  - Color means state, never power ([03 §3.6](../research/03-inspiration.md)).
- **Series in charts (Stats).**
  - Separate series by lightness steps of the cyan ramp (`ink`, `line`, `state-idle-dim`) and by dash pattern (solid, 6/3, 1/3).
  - Maximum three series per chart. More than that becomes a small-multiples grid.

### 3.4 Opacity and glow rules
- A glow is a second stroke underneath: same path, 3× width, same hue at 18% opacity. No blur filter. On TX only, add a third stroke at 6× and 6%.
  - This approximates *Tron: Legacy*'s "white-hot core line with a cyan halo" ([01 §3.2](../research/01-gmunk-film-work.md), observation) at near-zero cost.
- **Only three things may glow:** TX elements, the spectrum trace, and the hero datum during a promoted warning. Idle cyan never glows (P1).

### 3.5 State precedence and combinations (channel tiles, rows, map objects)

A tile is drawn as five independent **layers**. Each layer resolves its own winner, top to bottom in each list:

| Layer | Precedence (first match wins) | Notes |
|---|---|---|
| **Frame** | unacked `fault` (solid 1 px red + `state-fault-dim` wash) → `tx` (solid 2 px orange + `wash-tx-surface`) → `squelch` (brackets in `state-idle`) → `stale` (dashed 4/4) → `offline` (dotted 1/5: reconnecting or disabled) → idle brackets (`state-idle-dim`) | An **acked** fault drops out of the frame layer, so the next match draws: `tx` if transmitting, otherwise `stale`. |
| **Glyph (M6)** | `fault` triangle (acked or not) → `tx` vertical → `squelch` diagonal → `offline` × → `stale` hollow → idle horizontal | The fault triangle stays red until the condition clears. |
| **Status readout** (top right; §9.1.3) | promoted TX timer (it occupies the right zone instead) → `RECONNECTING` / `NO FEEDS` → `AGE …` → `LAST …` → nothing | Short readouts only (≤ 12 characters), so they never collide with the label. |
| **Fault reason** (footer line) | `FAULT · <reason>` in `state-fault`, acked or not, replacing the railroad/use text | The reason needs its own slot: `FAULT · SQ STUCK` (≈ 106 px of mono) plus a label like `CSX BE DISP` won't fit the top row of a 200 px tile. Under a channel fault the TX timer still shows in the promoted zone, in `state-tx`, so TX stays visible. On compact tiles the reason replaces MHz and meter on row 2. |
| **Ember underline** | shown whenever the channel is in `recent` or `recent-dim`, *regardless of the frame* | Recent + stale is a real combination: the ember is history and stays true. |

**Overlays** never replace a layer:
- **Selected:** an *outer* set of 14 px, 1.5 px `state-select` corner brackets drawn **4 px outside** the tile edge, so they never collide with a TX or fault frame. No fill.
- **Focused (keyboard):** the 1.5 px focus ring (§10.4) at 2 px offset with a 2 px radius. Selection is square brackets and focus is a rounded outline, so the two never read as each other.
- **Muted:** TX still shows in full (the instrument still witnesses it), but without the `tx-hot` flash, plus a `MUTED` tag in `ink-2` in the footer and the M lever pip lit. The level meter draws as a 1 px outline instead of a filled bar.
- **Soloed:** an `SOLO` tag in `ink` in the footer. Non-soloed channels show no tag; the header `SOLO n` chip explains why they are silent (§8.8).
- **Partial coverage:** coverage pips (§9.0.2) in the footer, right-aligned.

**Required combination frames** for the component sheet: selected + TX, selected + fault, recent + stale, TX + channel fault (acked and unacked), muted + TX, partial coverage + TX.

### 3.6 Wash tokens and text on washes

| Token | Value | Use |
|---|---|---|
| `wash-tx-surface` | `state-tx` at **6%** | Behind a keyed tile and a keyed transcript row. Measured over `bg-panel`: `ink` 15.55, `ink-2` 7.70, `ink-3` 4.60, `state-stale` 4.55. |
| `wash-tx-plot` | `state-tx` at **12%** | The keyed slot on spectrum and waterfall only. No text may sit on it. |
| `wash-fault` | `state-fault` at **6%** | Behind an unacknowledged faulted tile. `ink-3` 4.71. |
| `wash-select` | none | Selection has no fill (§3.5). |

- **Rule:** text inside any wash uses `ink-2` or brighter. `ink-3` is not allowed inside washes, even though it passes at 6%, because a 4.60 margin is too thin.
- **No surface wash may exceed 8%.**

---

## 4. Typography

**All Google Fonts, all SIL OFL** (each family sits in the `ofl/` tree of [github.com/google/fonts](https://github.com/google/fonts/tree/main/ofl)).

**Blender is not used:**
- The Oblivion UI face was identified as Blender by Nik Thoenen, and that identification is secondhand ([ProVideo Coalition](https://www.provideocoalition.com/hud-and-gui-graphics-in-oblivion/), [Typewolf](https://www.typewolf.com/blender)).
- Blender is a commercial face with unconfirmed web licensing ([02, ranked §1](../research/02-collaborators.md)).
- We use open fonts with the same squared, engineered feel instead.

| Role | Family | Weights | Use | Fallback stack |
|---|---|---|---|---|
| **Display** | [Rajdhani](https://fonts.google.com/specimen/Rajdhani) | 500, 600 | Screen titles, panel titles ≥ 13 px, product mark, the single-word alarm (`NO SIGNAL`, §8.4). Uppercase, tracking +0.08 to +0.16 em. Its squared bowls are the nearest open cousin to Blender. | `"Barlow Semi Condensed", "DIN Alternate", "Arial Narrow", sans-serif` |
| **Label / UI** | [Barlow Semi Condensed](https://fonts.google.com/specimen/Barlow+Semi+Condensed) | 400, 500, 600 | Micro-labels (11–12 px uppercase, +0.10 em), buttons, column headers, map labels, milepost prefixes. Holds up at small sizes where Rajdhani breaks down. | `"Barlow", "Roboto Condensed", "Arial Narrow", sans-serif` |
| **Reading** | [Barlow](https://fonts.google.com/specimen/Barlow) | 400, 500 | **Transcript text**, long-form help, form values in admin. Sentence case. 15 px / 1.45 line height. | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| **Data** | [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) | 400, 500 (variable) | Every number: MHz, AAR readout, timecodes, dBFS, MP, coordinates, IDs. Tabular by nature; distinct 0/O and 1/l/I. Width ≈ 0.6 em per glyph: plan 6.6 px per character at 11 px and 28.8 px at 48 px. | `"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace` |

**Rules:**
- **Numbers are always mono.** Labels are never mono. This one rule produces most of the "instrument" read: compare Coleran's *Bourne* ops screens, which are disciplined timestamped tables ([03 §1.6](../research/03-inspiration.md)).
- **Transcripts are sans (Barlow), with mono metadata columns.** That gives the ops-console feel without making people read paragraphs in monospace for hours.
- **Load only the weights listed.** That is 9 font files in total. Use `font-display: swap`, and self-host through the build step for the app, since the Pi may not have internet access. Google Fonts' CDN is fine for the mockup.

**Scale** (px, on a 4 px rhythm where possible):
`11 · 12 · 13 · 15 · 18 · 24 · 32 · 48 · 72`

| Step | Use |
|---|---|
| 11 | Floor. Micro-labels, tick numerals, lever letters, milepost tags. Nothing smaller, ever (§10.2). |
| 12 | Table metadata, units. |
| 13 | Panel titles (display), tile labels. |
| 15 | Transcript body, form text. |
| 18 | Tile readouts (MHz); AAR readout on compact tiles. |
| 24 | Section heroes, AAR readout on standard tiles; promoted timer on compact tiles. |
| 32 | Promoted TX readout inside a standard tile. |
| 48 | Screen hero datum, in its hero slot only. |
| 72 | The one alarm word, only in the system-down state (§8.4). |

**Formatting conventions (non-negotiable):**
- **Frequency:** `160.920` (3 decimals, no unit in tiles; `MHz` in `ink-2` where context needs it).
- **AAR readout:** `5454` (TX/RX pair as railfans read it; [03 §5.5](../research/03-inspiration.md)). Single form `CH54` in compact contexts.
- **Milepost:** always the railroad's own count with its prefix: `NEC 113.6`, `BAA 6.7`, `CFP 95.8`, `BA 11.6`, `BAK 80.4`, `QL 131.5`. One space between the prefix and the number. Where no sourced MP exists, show derived track miles with `≈` and no prefix (`≈ 4.2`) in `ink-3` (§9.0.4).
- **Clock time:** 24 h in the selected zone with its abbreviation: `14:07:33 EST` (or `EDT`). The default zone is the corridor's local time (America/New_York). A header toggle switches every clock on every screen to `UTC`. There is no `LOCAL` label.
- **Durations** (how long something lasted): under 1 h, `mm:ss.s` (`00:07.4`); totals, `hh:mm:ss` (`01:52:40`).
- **Ages** (how long ago; `LAST`, `AGE`, `SINCE`): compact units, coarsening as they grow, so readouts don't tick in unison (§7.5):
  - under 60 s: whole seconds, `48S`
  - 1–60 min: whole minutes, `4M` (the `AGE` form adds seconds under 10 min: `AGE 1M 12S`)
  - 1–24 h: `1H 12M`
  - over 24 h: `2D 3H`
- **Levels:** `−42.1 dBFS`, `SNR 18 dB`. Use a true minus sign (U+2212).
- **Separators:** middle dot ` · ` between fields; never pipes or slashes.

---

## 5. Stroke and grid system

### 5.1 Layout grid
- **Base unit 4 px; layout unit 8 px.** Every edge, bracket and label baseline snaps to 8, with sub-alignment on 4.
- **Primary canvas 1920 × 1080.** It must also work at 1440 × 900 (minimum supported) and 2560 × 1440 (scale up density, not size).
- 12 columns, 24 px gutters. **Outer margin: 32 px left and right, 16 px between the header or status line and the content.** Vertical gaps between stacked panels are 16 px. Gaps between cells inside a panel, such as tiles, are 8 px.
- Asymmetric layouts are preferred (Müller-Brockmann, [03 §4.1](../research/03-inspiration.md)): flush-left, ragged-right labels.
- Panels are cells in a **square-packed hierarchy**. Every panel is a rectangle subdivided into smaller rectangles, never rotated and never hexagonal. This is our version of *Ares*' square-packing lattice ([gmunk.com](https://gmunk.com/TRON-Ares-Computer-Vision), *self-reported*) and of the Disc Game bracket that collapses as rounds change ([gmunk.com/TRON-Disc-Game](https://gmunk.com/TRON-Disc-Game)). The tile grid re-packs when banks change.

### 5.2 Stroke weights

All strokes use `vector-effect: non-scaling-stroke` and are snapped to the half-pixel so 1 px lines stay crisp.

| Token | Width | Use |
|---|---|---|
| `stroke-hair` | 1 px | Default for everything: brackets, rulers, rail lines, graticule, table rules. |
| `stroke-emph` | 1.5 px | Selection brackets, focus ring, NEC main line on the map, spectrum trace. |
| `stroke-active` | 2 px | TX frame, occupied CTC block, the stringline of a selected train, playback progress line, ember underline. |
| `stroke-hero` | 3 px | The single hero arc on a ring meter; nothing else. |

Sub-pixel strokes (0.5 px) are **forbidden**. They shimmer and vanish on 1× displays. Use `grid` color at 1 px instead.

### 5.3 Dash patterns (state carriers)

| Token | `stroke-dasharray` | Meaning |
|---|---|---|
| solid | none | Live, normal |
| `dash-stale` | `4 4` | Stale; acked fault frame |
| `dash-offline` | `1 5` | Offline (dotted): reconnecting or disabled |
| `dash-threshold` | `2 3` | Thresholds: squelch line, coverage radius, planned/predicted |
| `dash-measure` | `6 3` | Second data series; dimension extension lines; decode placeholder bar (M24) |

### 5.4 Corners and frames
- Panels are drawn with **corner brackets, not full boxes**. The default arm length is 8 px.
  - This is Oblivion's style, observed in the reels ([01 §2.2](../research/01-gmunk-film-work.md); watch [vimeo.com/64377100](https://vimeo.com/64377100)).
- Full 1 px frames in `line-faint` are permitted only around **canvases** (spectrum, waterfall, map). There they act as a hard bezel, so the canvas reads as hardware ([03 §2, Andor](../research/03-inspiration.md)). Full frames are also the TX and fault state carriers on tiles (§3.5), and the `DEFECT` tag (§9.1.5).
- No rounded corners anywhere. The one exception is the 2 px radius on keyboard focus rings, for visibility.
- **45° chamfers** are allowed on exactly one element type: tab/bank/route selectors. They give a single Tron note without spreading.

---

## 6. Motif library: the functional accents

Every motif here has a *job*. The mood board renders a sample of each. IDs (`M1`…) are for specs and reviews.

| ID | Motif | Job | Spec |
|---|---|---|---|
| **M1** | **Corner brackets** | Panel bounds without boxing | 8 px arms, `stroke-hair`, `state-idle-dim` at idle; see §3.5 per state. Selection is an *outer* 14 px bracket set, 4 px outside. |
| **M2** | **Tick ruler** | Scale: frequency axis, time axis, milepost axis, map scale bar | Major tick 8 px, minor 4 px, `line` / `line-faint`. Numerals only on majors (`ink-3`, mono 11). Frequency ruler: a tick every AAR channel (15 kHz), majors every 10 channels. Channels **in the active bank** that the displayed feed hears get a 12 px `line` tick and a number. Other channels that feed hears get an 8 px `line-faint` tick with no number (§9.1.2; Rams-era dial scale: [03 §4.3](../research/03-inspiration.md); channel grid: [03 §3.6](../research/03-inspiration.md)). |
| **M3** | **Graticule** | The *only* grid behind a plot | Scope-style divisions with minor ticks on the centre axes only, and the per-division scale in a corner. For the AAR band at 10 divisions that is `10 dB/div · 135 kHz/div` (1.350 MHz / 10). Tektronix 8 × 10 is the reference ([TekWiki](https://w140.com/tekwiki/wiki/154-0633-14), via [03 §3.5](../research/03-inspiration.md)). |
| **M4** | **Registration mark** | Marks a fixed physical location (feed site) or a panel origin | Circle r = 6 with a crosshair extending 4 px past it. 1 px `line`. Drawn at feed sites on the map, and at the top-left origin of each canvas. |
| **M5** | **Range rings** | Coverage distance from a feed | Concentric rings every 5 km, labelled at 10 km steps (`10 KM`) where they cross north. The outermost ring is the nominal `coverage_radius_km` from `places.json` (`dash-threshold`). |
| **M6** | **Position-light state glyph** | Channel/feed state without relying on color | Three dots, r = 2.5, pitch 6 px. **Horizontal = idle/armed · Diagonal = squelch open, not yet committed to TX (the first 250 ms, or a kerchunk that never reaches 250 ms) · Vertical = TX · Hollow = stale · Crossed = offline (reconnecting or disabled) · Triangle = fault.** Based on the PRR position light, which signals by *arrangement* rather than color ([railroadsignals.us](https://railroadsignals.us/signals/pl), [Railway Signaling 1925](https://jonroma.net/media/signaling/railway-signaling/1925/The%20Position%20Light%20Signal.pdf), via [03 §5.3](../research/03-inspiration.md)). Past faults: hollow triangle in `state-stale`. |
| **M7** | **AAR readout** | The channel identity | `5454` in JetBrains Mono 500, 24 px, with MHz beneath in 12 px `ink-2`. If the frequency is shared by two channels in the system (161.070: `csx-landover` and `ns-bayview`), the readout gains a feed suffix in 12 px `ink-2`, for example `6464 LND-02` and `6464 BAY-04` (§9.0.3). |
| **M8** | **Data block + leader** | Tracked trains and feeds on the map | Position glyph, a 1 px leader (default 24 px at 45°, repositionable to 8 compass offsets; §10.9), and a two-line mono tag: `MARC 410` / `NEC 113.6 · CH54`. Based on the FAA ERAM full data block ([FAA JO 7110.65 §5-14](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_14.html); [POSCON docs](https://forums.poscon.net/docs/support/manuals/eramv1/data-blocks/) **[S]**). |
| **M9** | **Milepost tag** | Location in the railroad's unit | A 32 × 48 px post: 1 px `line` rectangle with three stacked lines, all 11 px. Prefix in Barlow Semi Condensed 500 `ink-3` (`NEC`, `BAA`, `CFP`, `BAK`), integer in mono `ink` (`113`), decimal in mono `ink-2` (`.6`). It fits 3 prefix letters and 3 digits with 4 px padding. In tables and data blocks use the inline form `NEC 113.6`. Echoes the physical post ([03 §5.4](../research/03-inspiration.md)). |
| **M10** | **Title block** | Every screen's bottom-right corner: who/what/when | Drafting title block: `WLT-1` · screen name · scope (bank, route, feed) · clock in the selected zone (`14:07:33 EST`) · build hash and `SIM` when fixtures are in use. On the Map it gains a fifth cell, `© OpenStreetMap contributors` (§9.5). 1 px `line-faint` rules, labels 11 px `ink-3`, values mono `ink-2`. From technical drawing practice ([03 §4.7](../research/03-inspiration.md) **[U]**). |
| **M11** | **Coordinate readout** | Cursor position on map/plots | Map: `39.0869 N · 76.7065 W · NEC 113.6` at the canvas edge (nearest route MP within 250 m of the cursor, else lat/long only). Updates on pointer move, mono 11 `ink-2`. On plots: `160.9200 MHz · −71.4 dBFS`. |
| **M12** | **Dimension line** | Measure a span | Extension lines `dash-measure`, arrowheads as 4 px ticks (not filled arrows), centered value. Uses: selected channel bandwidth on the spectrum (`12.5 kHz`), distance between two clicked map points, the `SAME FREQ` bracket in admin. |
| **M13** | **Listening sweep** | "The system is listening" during idle | A slow linear scan line across the **spectrum trace area only** (not the waterfall), `line` at 6% peak opacity, gradient tail 120 px. Period 8 s. It is Live Ops' one ambient motion (§7.5). Pauses on user interaction and while any channel is TX or squelch-open. Draws on the Oblivion radar sweep (reel observation, [01 §2.4](../research/01-gmunk-film-work.md)) and *Ares* "scanning pulses" ([gmunk.com](https://gmunk.com/TRON-Ares-Computer-Vision)). |
| **M14** | **Ping ring** | A feed just heard a key-up (map) | A single ring from the feed's registration mark, r 6 → 40 px, `state-tx` 60% → 0, 1200 ms. Fires once per TX commit for **every** receiving feed. Never loops. |
| **M15** | **Waveform strip** | Live and archived audio shape | Hairline min/max envelope, 1 px, `state-tx` while live and scrolling right-to-left; at release it freezes, turns `line`, and *becomes* the clip thumbnail in History. One object from live to archive ([03 §6](../research/03-inspiration.md)). |
| **M16** | **Level meter** | Per-channel audio/RF level | Horizontal 2 px bar on a tick scale (−60 to 0 dBFS, majors every 10 dB). During squelch-open and TX: VU ballistics, about 300 ms rise and fall ([Wikipedia: VU meter](https://en.wikipedia.org/wiki/VU_meter)), plus a 1 × 8 px peak-hold tick that holds 1.5 s, then falls at 20 dB/s (PPM-style pairing; [03 §6](../research/03-inspiration.md); published PPM figures disagree, **[S]**). **Squelch closed: no bar.** A static 1 × 4 px `state-idle-dim` floor tick marks the noise floor, updated every 10 s with no tween. |
| **M17** | **Squelch line** | Shows *why* audio started | A `dash-threshold` hairline across the channel's spectrum slot at the channel's squelch level. It goes solid when the signal crosses it. **This is the only threshold**: crossing it opens audio and starts squelch-open; TX commits if it stays open for 250 ms (§7.3) ([03 §6](../research/03-inspiration.md) **[U]**). |
| **M18** | **CTC track strip** | The line as a diagram | One 24 px row per route (§9.0.4), schematic: stations evenly spaced, not to scale. Interlocking/station boxes 7 × 7 with 11 px names. Occupied blocks are `stroke-active` `line`; a block whose train is *talking right now* turns `state-tx`. A route junction shows a 1 px vertical tie between rows. An MP-equation mark, `CFP≈ \| NEC 135.7`, sits where a route changes count. **Never red for occupancy**: red is fault ([Wikipedia: CTC](https://en.wikipedia.org/wiki/Centralized_traffic_control), [03 §5.1](../research/03-inspiration.md)). |
| **M19** | **Stringline** | Trains × time × radio, for one route | X = track position along the selected route, with M2 ticks labelled in the native MP (so NEC numbers *fall* left to right). Y = time (down = later). Each tracked train is a 1 px string. A transmission with a `train_id` is a 6 px perpendicular tick on its string. A detector transmission is a located open diamond at the detector's MP. Any other transmission is a tick on the **margin rail** at the left, grouped by channel. The now-line is `state-idle`, never red ([FRA](https://railroads.dot.gov/sites/fra.dot.gov/files/fra_net/2009/rr0902.pdf), [railweb.ch](https://www.railweb.ch/funnel/zch_disp/time_dis/time_dis.htm), via [03 §5.2](../research/03-inspiration.md)). |
| **M20** | **Ridgeline** | Long-horizon rhythm (Stats hero) | Stacked hidden-line hairline traces, white on black. Craft's CP 1919 plot, later inverted by Saville for *Unknown Pleasures* ([Scientific American](https://www.scientificamerican.com/article/the-pulsar-chart-that-became-a-pop-icon-turns-50-joy-division-rsquo-s-unknown-pleasures)). Each ridge is filled with the plot surface, `bg-void`, to occlude the ridges behind it, and the plot sits on `bg-void`. |
| **M21** | **Lever row** | Per-channel mute / solo / record | Square 16 × 16 toggles with 11 px letters, on a 24 × 24 hit area. Each has an indicator pip above it (lit = on, `ink`). From CTC pushbutton machines ([Railway Signaling 1959](https://jonroma.net/media/signaling/railway-signaling/1959/Pushbutton%20console%20for%20CTC.pdf)). |
| **M22** | **Sparkline** | 60-minute activity per channel | 64 × 14 px, a 1 px column per minute (60 columns plus a 4 px gap) with height = seconds of airtime; the current minute in `state-tx` if live. Updated once a minute. Tufte's word-sized graphic ([03 §4.5](../research/03-inspiration.md)). |
| **M23** | **Coverage hatch** | Feed coverage area on the map | 45° hatch at 8 px pitch, 1 px `line-faint`, clipped to the coverage ring. Unacknowledged faulted feed: hatch in `state-fault-dim`. Based on Oblivion's radiation zones ([Fuzzy Math](https://fuzzymath.com/blog/evaluating-interface-design-of-oblivion)). |
| **M24** | **Decode bar + reveal** | Transcript arriving | **While decoding:** a 1 px `dash-measure` `ink-3` bar whose length is proportional to the clip duration (8 px per second, capped at the column width), with `DECODING` in 11 px `ink-3`. No fake glyphs: we don't know the word count yet. **On final text:** a cosmetic reveal that steps word by word, 30 ms per word, capped at 400 ms in total, using `step`. Rows older than 60 s when their text arrives (backlog) appear with no reveal. Partial hypotheses (future streaming) are covered in §9.7. This is a much-reduced echo of the Throne Room's chaos-to-order decoding ([gmunk.com/TRON-Throne-Room](https://gmunk.com/TRON-Throne-Room), *self-reported*). |
| **M25** | **Coverage pips** | How many of a channel's feeds are healthy | One 3 × 7 px tick per feed that hears the channel, 3 px apart: filled `line` = healthy, 1 px hollow `state-stale` = not healthy. Shown only when coverage is partial, followed by `3/4 FEEDS` in 11 px `ink-2`. Tiles, transcript rows (in the feed column tooltip) and the inspector use it. |

**Not in the library, on purpose:** hexagon grids, random hex dumps, rotating decorative rings with no scale, fake progress bars, glitch noise as ambience, lens flares, scan-line CRT overlays, film grain, placeholder "scramble" glyphs. Researcher (c) floated a BR2049-style analog texture on stale panels ([03 §1.1](../research/03-inspiration.md) **[U]**). **Rejected**: it fights Oblivion's cleanliness, and stale is already carried by dash and luminance.

---

## 7. Motion principles and timings

Motion is choreography. It is quiet when idle and alive when the radio talks.

### 7.1 Easing tokens

| Token | Curve | Use |
|---|---|---|
| `ease-instrument` | `cubic-bezier(0.2, 0, 0, 1)` | Default. Fast out, precise settle (a needle that knows where it's going). |
| `ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Re-packing layouts, panel moves. |
| `linear` | `linear` | Sweeps, playheads, scrolling waveform and waterfall (physical time must look physical). |
| `step` | `steps(n, end)` | Numeric tick-ups, and the transcript reveal. Digits *click*, they don't tween. |

### 7.2 Duration tokens

| Token | ms | Use |
|---|---|---|
| `t-instant` | 0 | Squelch-open (diagonal glyph) at the frame the squelch opens. |
| `t-micro` | 80 | Hover, press, focus. |
| `t-flash` | 120 | `state-tx-hot` flash at TX commit; bracket snap. |
| `t-tick` | 240 | Readout count-up and promotion. |
| `t-commit` | 250 | Squelch must stay open this long before TX commits. |
| `t-settle` | 400 | Release hold, then TX → recent (frame retracts to brackets). |
| `t-build` | 600 | Max total screen build-on (all staggers included). |
| `t-ping` | 1200 | Map ping ring. |
| `t-sweep` | 8000 | Listening sweep period. |
| `t-ember` | 120 000 | `state-recent`, measured from release. |
| `t-cool` | 600 000 | Fully cooled to idle, **measured from release**: 2 min `recent`, then 8 min `recent-dim` (10 min in total; configurable). |

### 7.3 The key-up choreography (same everywhere: P6)
This is our "scan, track, connect, populate, animate" ([gmunk.com](https://gmunk.com/TRON-Ares-Computer-Vision)), rewritten for radio. Times are measured from the squelch crossing.

1. **Detect** (t = 0): the squelch line goes solid (M17). Audio opens immediately and is never delayed. The glyph snaps to diagonal, the brackets brighten to `state-idle`, and the meter wakes. That is squelch-open (`t-instant`).
2. **Commit** (t = 250 ms, if still open): the tile hue becomes `state-tx`, the glyph turns vertical, and the frame strokes draw at `state-tx-hot`, then settle to `state-tx` while the brackets extend into a full frame (`t-flash`, `ease-instrument`). If the squelch closes before 250 ms, nothing else happens. The diagonal holds for 2 s, then reverts. That was a kerchunk, and it gets no transcript row (§9.7).
3. **Lock** (250–490 ms): the elapsed-time readout is promoted into the tile's **right readout zone** at 32 px (standard tile) or 24 px (compact). It counts in `step` increments of 0.1 s, starting from the squelch crossing, so the timer includes the commit wait.
4. **Connect** (250–650 ms): at the same moment on every screen, the CTC block turns orange, the map pings every receiving feed (M14), the waterfall and spectrum slot get their TX outline, and the hero slot updates.
5. **Populate** (as data arrives): the waveform strip runs, and a transcript row appears in the log with the channel tag in `state-tx` and the M24 decode bar.
6. **Release** (on squelch close): hold 400 ms (`t-settle`) so short gaps between words don't flicker the state. Then the frame retracts to brackets, the readout returns to its home slot, the waveform freezes, and the label gains the ember underline. The transcript tag settles from orange to `ink` once the row has final text.
7. **Cool**: 2 min `state-recent`, then 8 min `recent-dim`, then idle. The decay is stepped, not continuous, so it doesn't shimmer (three discrete states, 400 ms transitions).

**Hysteresis:**
- Re-key within the 400 ms hold continues the same TX. It does not replay the flash.
- A squelch-open with no audio content (carrier only, ≥ 250 ms) still commits TX: a carrier is a transmission. Its transcript row is `CARRIER ONLY` (§9.7).

### 7.4 Screen build-on
The order is frame → grid → labels → data, as in the Oblivion reels (observation, [01 §2.4](../research/01-gmunk-film-work.md); *confirm by watching* [vimeo.com/67778891](https://vimeo.com/67778891)).

| Layer | Start–end (ms) |
|---|---|
| Brackets and bezels draw (stroke-dashoffset) | 0–200 |
| Graticule and rulers fade 0 → 1 | 150–350 |
| Labels appear (opacity, no slide) | 300–450 |
| Live values tick up from blank | 400–600 |

- Tiles stagger by 20 ms each, and the stagger is capped so the whole build finishes by `t-build` = 600 ms.
- **When it plays:** on app start (after login or reload) and on every route change between the five screens, because both are user-initiated.
- **When it never plays:** on data updates, in-screen tab or bank switches (those use the 400 ms re-pack), returning to a background browser tab, or reconnecting after a drop.
- **Shutdown or offline:** the reverse in 300 ms. Values blank first, then labels dim to `ink-3`, and the frame goes `dash-offline`.

### 7.5 Continuous motion budget
Motion falls into three classes. Only the first is budgeted.

| Class | What | Rule |
|---|---|---|
| **Ambient** (budgeted) | Listening sweep (Live Ops), playhead while playing (History) | **At most one per screen.** Map and Stats and Admin have none. |
| **Data motion** (not budgeted, but rate-limited) | Waterfall scroll, spectrum trace, LOFAR strip, level meters during TX, waveform, trains, map pings | Must move at the rate of physical data, never faster. **Waterfall** at 2 rows/s (60 s visible in 120 px). It keeps scrolling at idle, because freezing it would lie, but with the clamped floor an idle band reads near-black. The **spectrum trace** updates at 10 fps and, at idle, is smoothed with an exponential average (α = 0.2) so noise doesn't boil. **LOFAR strip**: 1 row per 30 s. **CTC trains** move block to block in discrete steps. **Map trains** update every 5 s with a 400 ms `ease-in-out` glide. **Idle meters** do not move (M16). |
| **Readouts** (granularity rules) | Header clock, `LAST`, `AGE`, `SINCE` readouts, sparklines | The header clock is the **only** element that ticks every second while idle. `LAST`/`AGE` follow the age format in §4: seconds only in the first minute, then whole minutes. Each tile's minute boundary falls at a different moment because each key-up happened at a different time, so tiles never tick in unison. The idle hero (`LAST KEY-UP 42M AGO`) uses the same rule. Sparklines update once per minute, on the minute. |

- Count-ups: 240 ms using `step`, only when a value *changes meaningfully*.
- **Done criterion:** on an idle Live Ops screen, the only things moving are the sweep, the waterfall, the smoothed spectrum, and the header clock's seconds.

### 7.6 Fault motion
- On fault onset, the red frame pulses **twice at 1 Hz** (opacity 1 → 0.35 → 1), then holds steady. No other fault motion exists.
- That stays well under the WCAG limit of three flashes in any one-second period ([WCAG 2.2 SC 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)). A steady red is enough signal for hours; a blinking one is torture.
- **No alternation.** Revision 1 alternated the fault and normal readouts every 3 s, after the Oblivion motorcycle fuel/speed alternation ([Fuzzy Math](https://fuzzymath.com/blog/evaluating-interface-design-of-oblivion)). That cycle runs forever, so it is **withdrawn**. The fault reason gets its own slot instead: the tile's footer line (§3.5). The normal readout stays where it is, so both are visible at once with no motion.
- Acknowledging a fault (§8.9) removes the frame and wash with a single 400 ms fade. Nothing animates afterwards.

### 7.7 Reduced motion
- Under `prefers-reduced-motion: reduce` ([WCAG 2.2 SC 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)):
  - No build-on, sweep, ping ring or transcript reveal.
  - The fault pulse becomes steady from the first frame.
  - The `tx-hot` flash is skipped; state changes are instant.
  - Map trains jump instead of gliding. Re-packs are instant.
  - Waterfall, spectrum, meters and waveform still update, because they are data, not animation.
- Provide the same as a user setting (`Motion: Full / Reduced`) in the app header.

---

## 8. Global structure (all screens)

### 8.1 Shell
- **Header bar (40 px):**
  - Left: product mark `SDRVIZ` and the screen name.
  - Centre: screen nav. Five tabs with chamfered corners, active = `ink` with a 2 px underline, inactive = `ink-3`.
  - Right: **system chips**, then the audio chip (§8.8), clock `14:07:33 EST` (click toggles `UTC`), and the motion toggle.
- **System chips** (bracketed, mono 12). These chips *are* the on-screen objects for system-level health (§8.9):
  - `FEEDS 4/4` (always shown)
  - `ASR OK` (always shown)
  - `DISK 87%` and `HOST 81°C` (shown only when not nominal)
  - `SOLO 1` (shown only when a solo is active)
  - `RECONNECTING` (shown only while the backend link is down, §8.6)
- **Status line (24 px, bottom):** one line of the latest system event in `ink-2`, or in `state-fault` while it is an unacknowledged fault. Acknowledged faults show as a count in `ink-2` (`1 ACK'D FAULT`). It also holds the title block (M10) at bottom-right.
- **No side nav.** Screens are a fixed set (decision #9). The login screen (§8.5) sits outside the shell.

### 8.2 The "front wall" and "consoles"
On Live Ops, the top band is a shared overview (the band) and the area below holds the per-channel consoles. This is the Apollo MOCR group display plus console split ([Space Center Houston](https://spacecenter.org/restoring-apollo-mission-control/), via [03 §3.4](../research/03-inspiration.md)).

### 8.3 Inspector ("Rogue Signal" window)
- Clicking any carrier, tile, train, feed or system chip opens a bracketed analysis window on `bg-raised`. It is our version of the Oblivion Light Table's standalone signal analysis windows ([gmunk.com/OBLIVION-GFX](https://gmunk.com/OBLIVION-GFX)).
- It is a HUD within a HUD, with a tighter 4 px sub-grid ([Cantina, Age of Ultron](https://cantinacreative.com/film/avengers-age-ultron), via [03 §1.3](../research/03-inspiration.md)).
- One inspector at a time, docked right, 480 px wide, full content height. `Esc` closes it.
- **It always overlays and never pushes.** Layout never reflows under it, so "Live Ops never rearranges" holds:
  - On Live Ops it covers the right of the transcript log. The log keeps running underneath, and the inspector header shows `LOG +3` when rows arrive unseen.
  - On the Map, if the selected object would sit under the inspector, the map pans it into view over 400 ms (`ease-in-out`). The map does not re-fit.
  - It carries the selected object's full controls: M/S/R levers, `ACK` for faults, and the bank membership list (§10.9).

### 8.4 System-down state (the only full-field alarm)
- **Trigger:** every *enabled* feed is in `fault`, **or** the backend has been unreachable for ≥ 15 s. Disabled feeds never count. Stale and reconnecting feeds do not trigger it on their own.
- **Look:** the content area dims to 20%. One centred word sits over one sentence of cause in Barlow 15 `ink`. The word is `NO SIGNAL` (all feeds faulted) or `NO LINK` (backend unreachable), in 72 px Rajdhani 600 `state-fault`.
- **If every feed is disabled**, that is the user's choice, not an alarm. Show a neutral statement in the content area: `ALL FEEDS DISABLED · ENABLE ONE IN FEEDS & BANKS` in 15 px `ink-2`. No dimming, no red.
- Precedents: Evangelion's typography-as-alarm ([Fonts In Use](https://fontsinuse.com/uses/28760/neon-genesis-evangelion)) and the *2001* single-readout field ([03 §2](../research/03-inspiration.md)).
- It is used for this state only. Overuse ruins it.

### 8.5 Login (decision #11: single-user password)
- `bg-void`, no shell. One bracketed panel, 400 px wide, optically centred (slightly above centre).
- Inside: `SDRVIZ` (48 px display), `WAYSIDE LISTENING TABLE · NEC DC–BAL`, then `WLT-1 · AUTHORIZATION` as an 11 px label above one underline-only password field, and an `ENTER` button.
- A static M2 frequency ruler (160.215–161.565) runs along the bottom edge of the viewport. It is the only ornament, and it does not move.
- A wrong password shows `Password not accepted.` in `state-fault` 13 px beneath the field (the form-validation rule in §9.4). No shake animation.
- Submitting the form is a user gesture, so audio arms on login (§8.8).

### 8.6 Connecting, first data and reconnecting
- **App start:** the shell builds on (§7.4) with every value blank (`— — —`) and the status line reading `CONNECTING · BACKEND`. Values tick in when the first snapshot arrives. If that takes more than 5 s, the status line reads `WAITING FOR FIRST DATA · 6S` in `ink-2`.
- **Backend link drop** (WebSocket closed): a `RECONNECTING` chip appears in the header immediately (dotted brackets, `ink-2`). Live values freeze in place, every tile's status readout shows `AGE …` counting from the drop, and the waterfall stops (no fake rows). Reconnect with backoff (1, 2, 4, 8 s, capped at 8 s). No dimming and no red until 15 s, then §8.4 `NO LINK`. A drop of under 15 s should leave no trace beyond the chip and a status-line entry.
- **Gaps:** when data resumes after a drop or after a background tab returns, the waterfall and LOFAR strip insert one `dash-offline` row labelled `GAP 3H 12M` in 11 px `ink-3`. They never back-fill.

### 8.7 Empty states
- **Empty bank:** the tile area shows one bracketed panel with `BANK EMPTY` (13 px display, `ink-2`) and `Add channels in Feeds & Banks.` (15 px Barlow, `ink-3`), with a link.
- **No transmissions in range** (History, Stats): `NO TRANSMISSIONS · 07:00–08:00 EST` in the hero slot. Axes and rulers still draw; empty is a valid measurement.
- **Empty log at startup:** `NO TRAFFIC SINCE 14:02 EST` as the log's only row, in `ink-3`.

### 8.8 Audio (decision #11: live Opus over WebSocket, mixed with Web Audio)
- **Arming.** Browsers keep an `AudioContext` suspended until a user gesture ([Chrome autoplay policy](https://developer.chrome.com/blog/autoplay)). On any load without a fresh gesture (a reload with a remembered session):
  - The header audio chip reads `AUDIO · CLICK TO ENABLE` (bracketed, `ink`, static).
  - **Any** click or keypress on the page resumes the context.
  - While silent, the hero slot appends `· SILENT` in `ink-2` to a keyed talker line, so the observer knows sound is missing.
  - After arming, the chip reads `AUDIO ON`. A click on it toggles master mute (`AUDIO MUTED`).
- **Mix policy.** All audible live channels mix with equal weight. When two or more are open, each gets −6 dB to keep headroom. There is no priority ducking in v1.
- **Playback vs live.** While a History clip plays, live audio ducks by −18 dB over 120 ms and restores over 400 ms after the clip stops. Live audio is never paused, because it cannot be replayed live.
- **Which channels are audible:** channels in the active bank, minus muted channels. Off-bank channels are silent unless soloed (§9.0.5).
- **Solo is global**, not per bank. If the solo set is not empty, only soloed channels play, whatever bank is active. The set survives bank switches. The header `SOLO n` chip clears it with one click. Mute is per channel, global and persistent.

### 8.9 Fault lifecycle, escalation and acknowledgement
**Acknowledge (ACK):**
- Any unacknowledged fault can be acknowledged from its object's inspector (`ACK` button), with the `A` key on a focused faulted object, or from the fault list that opens from the status line (`ACK ALL`).
- **Acked look:** the red glyph and red `FAULT · <reason>` label stay, because the fault is still true. The red frame and wash go (§3.5). The status line moves the item to the `ACK'D` count, and the header chip shows the count in `ink-2`: `FEEDS 3/4 · 1 ACK'D`.
- An acked fault stays acked until its condition clears. A new onset after clearing is a new, unacknowledged fault. A different fault reason on the same object is also new.
- When a fault clears, red disappears from the live UI completely. History and Stats keep it as a `state-stale` hollow-triangle mark (red is present tense, P2).

**Feed escalation** (thresholds configurable; defaults below):

| Condition | State | Label |
|---|---|---|
| Samples flowing at ≥ 90% of the nominal sample rate | ok | — |
| Connected, no samples for 30 s, or sample rate < 90% for 30 s | `stale` | `STALE · NO SAMPLES` / `STALE · RATE 84%` |
| Stale for 5 min | `fault` | `FAULT · NO SAMPLES 5M` |
| TCP closed or connection refused | `offline` | `RECONNECTING` |
| Reconnecting for 60 s | `fault` | `FAULT · LINK LOST` |
| Driver reports a device error, or ADC clipping is sustained for 10 s | `fault` | `FAULT · DEVICE` / `FAULT · CLIPPING` |
| User disabled it | `offline` | `DISABLED` (never escalates, never alarms) |

**Channel-level faults** (the only reasons a *channel* tile turns red): squelch open continuously for 10 min (`FAULT · SQ STUCK`), and over-deviation clipping on that channel for 10 s (`FAULT · OVERDEV`). Feed faults do **not** turn channel tiles red (§9.0.2).

**System objects and their faulted treatment:**

| Object | Where it lives | Degraded (`state-stale`) | Fault (`state-fault`) | Knock-on treatment |
|---|---|---|---|---|
| **Decoder** (Moonshine worker, decision #5) | Header chip `ASR`; transcript log header | `ASR BACKLOG 12`: queue > 10 clips or latency > 30 s | `ASR FAULT`: worker crashed or silent for 30 s | The log header gains a red triangle and `DECODER DOWN · SINCE 14:02`. New rows show `No transcript · decoder down.` in `ink-3`, with audio still playable. They are re-queued, and they decode in place (with no reveal) when the decoder returns. |
| **Storage** (Opus clips + SQLite, decision #11) | Header chip `DISK`, shown from 85% full | `DISK 87%` | `DISK FAULT · NOT RECORDING`: ≥ 97% full or a write error | History's scrubber has a 2 px recording rail beneath it, `line-faint` while recording. While recording is failing, the failing span is `state-fault`. After the fault clears, that span becomes `dash-stale` labelled `NOT RECORDED`. Affected rows show `NOT RECORDED` in place of the play control. |
| **Host** (backend Pi or box) | Header chip `HOST` (shown only when not nominal); a `HOST` card at the top of the Feeds admin list | `HOST 81°C`: SoC ≥ 80 °C, or throttling active | `HOST FAULT · 85°C`: SoC ≥ 85 °C, or under-voltage | Raspberry Pi documentation: Arm cores are throttled progressively from 80 °C, and the hard limit is 85 °C ([raspberrypi.com docs](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html), stated for Pi 4; Pi 5 thresholds **[UNVERIFIED]**). |

---

## 9. Per-screen direction

### 9.0 Data model the screens are designed against

This section is design-facing, not a schema. It settles the questions the screens depend on. The front-end lead turns it into types in Stage 3.

#### 9.0.1 Monitored, banked, audible
- **Monitored channel:** any channel in `frequencies.json` that at least one *enabled* feed lists in `hears`. The system records and decodes **every** monitored channel.
- **Bank:** a named *view and listening set*. A channel can be in several banks or none. Banks never decide what is recorded.
- **Active bank:** the bank selected on Live Ops. It decides which channels get tiles, which are audible (§8.8) and which get labelled ruler ticks.
- **Off-bank channel:** monitored but not in the active bank. It includes the nine seed channels that belong to no bank (`csx-bf-disp`, `csx-police`, `csx-benning`, `csx-ind-switch`, `csx-coal-pier`, `ns-mow`, `canton-1`, `tpr-road`, `tpr-mow`).

| Surface | Active-bank channel | Off-bank channel |
|---|---|---|
| Tile | yes | no |
| Hero slot | yes | no; counted on the right as `+1 OFF-BANK · 8686` in `ink-2` |
| Transcript log | yes | yes, by default (filter chip `BANK ONLY`). Its channel tag is `ink-2` rather than `ink`, and its row has no TX wash. |
| CTC strip, map, stringline | yes | yes. Place has nothing to do with banks. |
| Spectrum/waterfall TX overlay | yes, if the displayed feed hears it | yes, if the displayed feed hears it. The spectrum is a measurement. |
| Ruler ticks | 12 px labelled | 8 px `line-faint`, unlabelled |
| Audio | yes (unless muted) | no (unless soloed) |
| Ridgeline / heatmap (Stats) | yes | yes. Stats covers every monitored channel. |

#### 9.0.2 Channels and feeds
- A channel is heard by every feed whose `hears` list includes it. `amtk-nec-road` is heard by all four.
- **Channel coverage state** is derived:
  - **ok:** all of its feeds are healthy.
  - **partial:** at least one healthy feed and at least one that isn't. The tile keeps its normal look and adds coverage pips (M25) with `3/4 FEEDS`.
  - **stale:** no healthy feeds and at least one stale. Frame `dash-stale`, `AGE` counting from the last sample.
  - **offline:** every feed is reconnecting, disabled or faulted. Frame `dash-offline`, with the label `NO FEEDS`.
- **Red stays on the feed.** A faulted feed counts as "not healthy" in pips and coverage, but no channel tile turns red because of it. The feed chip, the feed card and the map registration mark carry the red.

#### 9.0.3 One key-up, several feeds
- A **transmission event** is one key-up on one channel. When two or more feeds open squelch on the same channel with starts within 500 ms, they are **one event with several receptions** (`receptions[]`: `feed_id`, `snr_db`, `rssi_dbfs`).
- **Primary feed** = the reception with the highest SNR, measured over the first 250 ms (the commit window). It is locked for the event's duration, with no mid-transmission switching. The primary feed's audio is what plays live, what is archived, and what is decoded.
- **Display:** tiles show `VIA BWI-03` in the footer during TX and recent. Transcript rows show the feed column as `BWI-03 +2`. The inspector lists all receptions with their SNR. On the map, every receiving feed pings (M14), and the primary feed's ring is drawn at 1.5 px.
- **Shared frequency** (161.070 is `csx-landover` at `LND-02` and `ns-bayview` at `BAY-04`, about 35 mi apart; [04 §2](../research/04-corridor-radio.md)): a carrier is resolved to a channel through the receiving feed's `hears` list, so each feed sees exactly one channel per frequency. If two feeds that hear *different* channels on the same frequency both open, those are two events. Both tiles show the M7 feed suffix (`6464 LND-02`, `6464 BAY-04`), so their identities never look the same.
- The seed's single `feed_id` per transmission is treated as the primary. The SIM generator adds secondary receptions (§9.0.6).

#### 9.0.4 Routes and mileposts (resolves the MP system)
- **Decision:** we use **(a) the railroad's native milepost counts, as published, with their prefixes**. We never renumber. NEC numbers come from Amtrak's Philadelphia-based count and so **fall** from Washington Union Station (`NEC 135.7`) through Odenton (`NEC 113.6`) and Baltimore Penn (`NEC 95.7`) to Perryville (`NEC 59.5`) (`places.json`; [Wikipedia NEC infrastructure list](https://en.wikipedia.org/wiki/List_of_Northeast_Corridor_infrastructure)). The local `0.0 Washington` count in `places.json` is **not displayed**.
- **Routes.** An axis is a *route*: an ordered chain of segments, each in its own native count. Axis distance is track miles. Where segments join, an **MP-equation mark** shows both counts (`CFP≈ | NEC 135.7`), as railroads do in timetables at a change of count.

| Route id | Name | Segments (native count) | Left → right | Main users |
|---|---|---|---|---|
| `r-nec` | `NEC · RF&P` | CSX RF&P `CFP` Quantico (CFP 78.9) → Alexandria (CFP 105.1) → Washington; then Amtrak `NEC` 135.7 → 95.7 Baltimore Penn → 59.5 Perryville | Quantico → Perryville | Amtrak, MARC Penn, VRE Fredericksburg, Auto Train |
| `r-capital` | `CSX CAPITAL SUB` | `BAA`, Washington end → Hyattsville (BAA 33.7) → Laurel (BAA 21.7) → St. Denis (BAA 6.7) → Camden | Washington → Baltimore | MARC Camden, CSX |
| `r-metro` | `CSX METROPOLITAN SUB` | `BA`, Washington → Kensington (BA 11.6) → Gaithersburg (BA 22.6) | Washington → Gaithersburg | MARC Brunswick, CSX |
| `r-manassas` | `NS · VRE MANASSAS` | NS count (not in seed), Manassas → Alexandria | Manassas → Alexandria | VRE Manassas, NS |
| `r-phila` | `CSX PHILADELPHIA SUB` | `BAK`, Bayview (BAK 89.6) → White Marsh (BAK 80.4) → Belcamp (BAK 68.2) | Baltimore → Belcamp | CSX |

- **Left-to-right rule:** the route endpoint with the smaller x on the rotated map (§9.5) goes on the left. That keeps every axis consistent with the map (south-west left, north-east right, DC left of Baltimore), and so it covers RF&P and VRE traffic south of DC.
- **Missing MPs.** Some junction MPs are not in the seed, for example the CFP count at Washington and the NS count. They are derived from route geometry length (§9.5 GeoJSON) and shown as `≈` values in `ink-3` until sourced. This is honest about provenance (P3).
- Minor lines (Landover Sub `QL`, Old Main Line `BAC`, Baltimore terminal trackage) appear on the map but are not routes in v1. Their detectors place on the map only. Their transmissions go to the margin rail of the nearest route.

#### 9.0.5 Trains (resolves the missing train model)
- **Tracked trains are passenger only:** Amtrak, MARC and VRE. Decision #9 names exactly those for dummy positions, and only they have real position APIs to replace the dummies later. Freight trains are **never positioned**: they get no map glyph, no CTC occupancy and no string. Their transmissions are margin-rail ticks labelled with their symbol (`Q409`). Detector transmissions are located by the detector's MP.
- **Dummy schedule:** `data/sim/trains.json` (owner in §9.0.6). Each train run has `train_id` (for example `MARC 410`), `operator`, `line`, `direction`, and `stops[]` of `{place_id, route_id, mp, t}`. Positions are interpolated linearly in track miles between stops; there is no dwell modelling beyond equal arrive and depart times.
- **Seed consistency is mandatory.** Every seed transmission whose speaker names a passenger train (`tx-039` MARC 410 at Odenton 07:15:00, `tx-042` MARC 418 at Martin State 07:58:40, `tx-034` Amtrak 2153 at Gunpowder 06:33:45, and the rest) must match a train that is at that place at that time, and gains its `train_id`.
- **Positions may be invented** for the mockup. All are `sim: true`, and every train data block carries the `SIM` tag until real APIs arrive.
- `N TRAINS TRACKED` (Map hero) is computed: tracked trains whose run spans the current time.

#### 9.0.6 Mockup fixtures: `data/sim/` (resolves seed density)
**Decision: the designer may synthesize denser traffic, and must do it in a generator, not by hand.**

- **Owner:** the **film-graphics-designer** writes `tools/gen_sim.py` in Stage 2, because the mockups need it first. It is Python, standard library only, deterministic (fixed seed `1919`), run with `python3 tools/gen_sim.py`. From Stage 3 the front-end lead owns it, and the fake backend (decision #1) replays `data/sim/` as-is, so mockup and app show the same day.
- **Inputs:** `data/seed/` read-only. The seed fixes in §13 remain the front-end lead's.
- **Outputs:**
  - `data/sim/routes.json` (§9.0.4)
  - `data/sim/trains.json` (§9.0.5)
  - `data/sim/transmissions.json`: the 92 seed rows verbatim with `sim: false`, plus SIM rows; all rows gain `receptions[]`, `train_id` (nullable), `transcript_state`, `confidence` and `words[]` (§9.7).
  - `data/sim/health.json`: the feed, decoder, disk and host state timeline.
  - `data/sim/scenarios/{listening,keyed,fault}.json`: the frame-defining moments for the 15 mockup frames.
- **Density targets** (directional, **[U]**; my estimate of a plausible weekday, not a measured figure):
  - About 1,200 transmissions per day and 1.5–2.5 h total airtime across all channels.
  - Hourly profile: 00–04 at 0.4× base, 05–09 and 15–19 at 2.5× on passenger-hosted channels (`amtk-nec-road`, `csx-road`, `csx-rfp-road`, `ns-road`, dispatcher desks), freight and yard channels flat at 0.8–1.2×.
  - At least 8% of rush-hour transmissions overlap another channel's.
  - The ridgeline and heatmap must show the rushes rising at least 2× over midday in the busiest 8 channels.
- **Scripted moments:**
  - `keyed`: 14:07:20–14:07:41 EST, overlapping key-ups on `CH54` (a MARC Penn train) and `CH08` (a CSX crew), with a third key-up on an off-bank channel.
  - `fault`: `BAY-04` stale from 14:05:10, and `LND-02` `FAULT · LINK LOST` from 14:06:00, unacknowledged.
  - Listening: 03:40 EST, with nothing keyed and the last key-up 42 min earlier.
- **SIM transcripts** come from templates per role (detector, signal call, dispatcher instruction, yard move). They use real place names, signal names and MPs from the seed, and invented train symbols. No real crew names.

#### 9.0.7 Speaker roles
Tags are 3-letter mono: `CRW` crew · `DSP` dispatcher · `OPR` operator or tower (`speaker_role: operator`, e.g. K Tower, Washington Terminal) · `DET` detector · `YDM` yardmaster · `MOW` maintenance of way · `POL` police · `UNK` unknown. No icons.

---

Each screen gets one sentence that states its job (Territory's "one screen, one story point": [It's Nice That](https://www.itsnicethat.com/articles/nicer-tuesdays-december-2017-territory-studio-170118), via [03 §1.1](../research/03-inspiration.md)). Each also names its hero datum (P4) and hero slot, its idle, keyed and fault behavior, and what "done" looks like for the mockup.

### 9.1 Live Ops
**Job:** *"Who is talking right now, and what are they saying?"*

#### 9.1.1 Hero slot
A **64 px hero strip** directly beneath the header, spanning the full content width.
- **Keyed (left, over the tile columns):** `5454` (mono 500, 48 px, `state-tx`), then `AMTK NEC` (13 px label, `ink`) over `KEYED · VIA BWI-03` (11 px, `ink-2`), then the timer `00:07.4` (mono 48 px, `state-tx`). This takes about 520 px, so it fits at 1440 too.
- **Several keyed:** the longest-running active-bank channel takes the hero. The others follow as a 24 px mono list in `state-tx`: `+2 · 0808 · 2828`.
- **Idle:** `LAST KEY-UP 42M AGO · CH54 · AMTK NEC`, with the age in mono 48 `ink-2` and the rest at 13 px.
- **Right (over the log columns):** `+1 OFF-BANK · 8686` when relevant, `· SILENT` when audio is not armed (§8.8), and the displayed feed selector (§9.1.2).

#### 9.1.2 Front wall
- One feed at a time. **Decision:** the front wall shows the **displayed feed's** own 2.4 MS/s stream. Selector chip: `FEED · LND-02 ▾`.
  - Each bank has a **home feed** that is selected when the bank becomes active. Seed defaults: NEC → `LND-02`, Freight → `BAY-04`, Commuter → `LND-02`, Baltimore Harbor → `BAY-04`. They are editable in admin.
  - There is no auto-follow in v1: the front wall changing feeds on its own would be motion the observer did not ask for.
  - **Rejected alternatives:**
    - A max-hold composite. It hides which feed heard what, and it misstates the noise floor.
    - Four stacked strips. At 1920 × 1080 each would be about 56 px tall, which is unreadable. Per-feed spectra live in Feeds admin instead.
  - Ruler ticks and squelch slots are drawn for the channels **the displayed feed hears** (§9.0.1 table). That resolves every frequency to exactly one label (§9.0.3).
  - A key-up the displayed feed does not hear shows no overlay. It still shows on its tile, the log and the CTC strip, and the selector chip shows `+1 ON BAY-04` in `ink-2`.
- **Sizes (1920 × 1080): 224 px tall.** From the top: spectrum trace 72 px, M2 frequency ruler 32 px, live waterfall 120 px (2 rows/s, so 60 s visible).
  - The spectrum and waterfall fill the width minus the LOFAR strip. They span 160.215–161.565 MHz (one 2.4 MS/s stream covers the AAR band, decision #6).
- **LOFAR strip** (the long-horizon waterfall): **right end of the front wall**, aligned with the waterfall rows, **184 × 120 px**. Frequency runs across, binned per AAR channel (91 channels × 2 px plus a 1 px bezel each side). Time runs down, 1 row = 30 s, so the strip holds **1 hour**. Each cell is the max-hold power for its channel over its 30 s. A 16 px mini ruler above it has ticks every 10 channels. Label: `LAST 60 MIN`. Its job is to show which channels were busy over the last hour as vertical stripes ([Wikipedia: LOFAR](https://en.wikipedia.org/wiki/Low_Frequency_Analyzer_and_Recorder), via [03 §3.2](../research/03-inspiration.md)). Daily rhythm belongs to Stats.
- The listening sweep (M13) runs over the spectrum trace only.
- **At 1440 × 900 the front wall is 176 px:** spectrum 56, ruler 24, waterfall 96 (48 s visible). The LOFAR strip becomes 184 × 96, which is 48 min, and its label changes to say so.

#### 9.1.3 Channel tiles (left, 7 columns)
- Bank selector tabs (chamfered, §5.4), 32 px row. Seed banks: `NEC Corridor` (9), `Freight - CSX/NS` (15), `Commuter` (8) ([04 §4](../research/04-corridor-radio.md)), plus the director-added `Baltimore Harbor` (§9.4).
- **Tiles never scroll.** The grid picks the largest variant that fits **every** tile of the active bank:
  1. **Standard 200 × 112.** Contents:
     - Top-left: M6 glyph and label (`AMTK NEC`, 13 px).
     - Top-right: the status readout (§3.5).
     - M7 AAR readout (24 px) and MHz (12 px).
     - M22 sparkline.
     - M16 meter at the 96 px baseline.
     - Footer (11 px): railroad · use (`Amtrak · road/dispatcher`) in `ink-3`, or `ink-2` inside a wash; `VIA BWI-03` while TX/recent; tags (`MUTED`, `SOLO`); `FAULT · <reason>` in `state-fault` when a channel fault exists (it replaces the use text); coverage pips (M25) right-aligned.
     - M21 levers appear in the footer zone on hover, on focus, or while the tile is selected.
  2. **Compact 200 × 56.** Row 1: glyph, label, status readout. Row 2: AAR readout (18 px), MHz (12 px) and a 64 px meter. No sparkline and no use line. The promoted timer is 24 px.
  3. **Strip 384 × 28** (two columns). Glyph, AAR `CH54`, label, MHz, status readout. This is the last resort.
  - If even the strip variant doesn't fit, the tiles that fit are shown, followed by a `+N MORE · OPEN BANK` chip that lists the rest in the inspector, and admin warns about the bank's size (§9.4).
- **Capacity check (this is the arithmetic the mockup must hold):**
  - **1920 × 1080:** content height 984 − hero 64 − 16 − front wall 224 − 16 − 16 − CTC 120 = **528 px** for tabs and tiles. Minus 48 for tabs leaves 480, which holds 4 standard rows (4 × 112 + 3 × 8 = 472). The 7-column span is 1072 px, which holds 5 tiles (5 × 200 + 4 × 8 = 1032). **Capacity: 20 standard tiles.** Every seed bank fits standard.
  - **1440 × 900:** content height 804 − 64 − 16 − 176 − 16 − 16 − 120 = 396 px. Minus 48 for tabs leaves 348. The 7-column span is 792 px, which holds 3 tiles per row. Standard holds 2 rows × 3 = 6. Compact holds 5 rows × 3 = **15** (5 × 56 + 4 × 8 = 312). NEC (9), Commuter (8) and Freight (15) render compact at 1440.
- Keyed tile: the full choreography (§7.3). Tile TX wash `wash-tx-surface` (6%).
  - During TX on a standard tile, the AAR readout steps down from 24 px to 13 px in place (left), and the MHz and sparkline hide. That frees the right zone for the 32 px timer, since `5454` at 24 px plus `00:07.4` at 32 px (≈ 192 px) would not fit in 172 px. On a compact tile the AAR stays at 18 px and the 24 px timer replaces MHz and meter.
- When the tile set changes, the grid re-packs with `ease-in-out`, 400 ms (Disc Game bracket collapse).

#### 9.1.4 Transcript log (right, 5 columns)
- A disciplined timestamped table: `07:15:00 · CH54 · CRW · MARC 410 · 410 approach medium, Odenton, track 2.` Newest at top. Auto-scroll pauses when the user scrolls, with a `▲ 3 NEW` chip.
- Row states and the reveal follow §9.7 and M24. Low-confidence words render in `ink-3` (not a new hue; [03 §6](../research/03-inspiration.md)), but never inside a wash.
- Speaker role tags per §9.0.7.
- Off-bank rows per §9.0.1.
- Chrome stays out of the log area (Hansen's negative space: [03 §1.4](../research/03-inspiration.md)).

#### 9.1.5 Detector reports and defects
- A detector transmission renders as a compact structured row: `DET · BAA 6.7 · NO DEFECTS · 412 AX · 41 MPH` (seed `tx-001`).
- **A reported defect is railroad information, not our equipment's fault, so it is never red** (P2). It renders as `DET · BAA 33.7 · DEFECT · HOTBOX AXLE 183 S RAIL · 37 MPH` (seed `tx-064`), with the word `DEFECT` set as a **boxed tag**: 1 px `ink` full frame, 11 px label in `ink`, 4 px padding. It is the only boxed text label in the product, so it stands out by geometry. The row text is `ink` at weight 500.
- The tag does not fade. It is not red, so it does not dilute "act now". It persists in History and Stats as information.

#### 9.1.6 CTC track strip (bottom, full width, 120 px)
- Five 24 px rows, one per route (§9.0.4), in this order: `r-nec`, `r-capital`, `r-metro`, `r-manassas`, `r-phila`. Each row is schematic, oriented by the left-to-right rule, and has junction ties where routes meet at Washington, Alexandria and Baltimore.
- Tracked trains (passenger only) occupy their blocks; the talking train's block turns orange. Freight is not drawn. Detectors are open diamonds on their row and flash `state-tx` while they talk.
- This is researcher (c)'s #1 borrow ([03 §7](../research/03-inspiration.md)). It gives Live Ops a sense of place without stealing the Map's job.

#### 9.1.7 Faults on Live Ops
- A feed fault shows on the header `FEEDS` chip (red), the status line, and the displayed feed selector chip if that feed is displayed. Tiles show partial coverage, or stale/offline if every one of their feeds is gone (§9.0.2).
- The front wall for a faulted or stale displayed feed freezes, dims to `ink-3` labels, and shows `LND-02 · FAULT · LINK LOST` centred in the waterfall in 13 px `state-fault` while unacknowledged. It never auto-switches feeds.
- Live Ops never rearranges because of a fault.

**Done looks like:**
- Replaying `scenarios/keyed.json` (14:07:20–14:07:41) plays legibly, with the CH54 and CH08 overlap and one off-bank key-up.
- A viewer can name the talking channel in under 1 s.
- At idle, only the elements named in §7.5 move.
- Freight (15) fits as standard tiles at 1920 × 1080 and as compact tiles at 1440 × 900 with no scroll.

### 9.2 History and playback
**Job:** *"What was said, on which channel, where, between any two times?"*

**Hero slot:** the 64 px strip under the header, as on Live Ops. **Hero datum:** the selected range and its computed totals, for example `07:00–08:00 EST · 41 TRANSMISSIONS · 04:52 AIRTIME`. These figures are a format example; compute them from `data/sim/`.

**Layout:**
1. **Top: stringline (M19), about 45% of height.**
   - A **route selector** (chamfered tabs: the five routes in §9.0.4) sits above it, with `r-nec` the default. One route at a time; no normalized corridor axis and no small multiples in v1.
   - **Default viewport:** for `r-nec`, Washington Union Station (`NEC 135.7`) on the left to Baltimore Penn (`NEC 95.7`) on the right, with NEC numbers falling left to right. Drag or zoom along the axis to reach Quantico (south-west) or Perryville (north-east). Other routes default to their full length.
   - Y = time over the selected range.
   - Ticks per M19: train ticks on strings, detector diamonds at their MP, and everything else on the margin rail grouped by channel. A train that runs over two routes (VRE Manassas onto `r-nec` north of Alexandria) is drawn on each route for its portion.
   - Hover shows a data block. Click selects: the string turns `stroke-active` `state-select` and its ticks list in the table below.
   - Researcher (c) claims nobody in the SDR world does this ([03 §5.2](../research/03-inspiration.md) **[U]**). Make it the signature of the product.
2. **Middle: time scrubber.**
   - The long-horizon waterfall over a **rolling 24 h ending now** (default), binned to the available width (≈ 0.96 px/min at 1440 × 900, 1.29 px/min at 1920 × 1080; never a fixed px/min). It has a range bracket (M1 brackets as handles; §10.9 gives non-drag alternatives) and a playhead.
   - A tick ruler with hours as majors. **DST days:** the axis is elapsed real time, so a 23 h or 25 h day fills the same width. The repeated or skipped hour is marked with a dimension-line tick labelled `DST` in 11 px `ink-3`.
   - Beneath it, the 2 px recording rail (§8.9).
3. **Bottom left: transcript table.**
   - Columns: time · AAR · channel · feed (`BWI-03 +2`) · role · speaker / train · duration · text. All metadata in mono and text in Barlow.
   - Filter chips (bank, route, channel, railroad, role, feed, text search) as bracketed chips.
   - The table is virtualized (§10.8).
4. **Bottom right: clip player.**
   - The frozen waveform (M15) of the selected clip in `line`.
   - A 0–4 kHz speech spectrogram beneath it ([03 §6](../research/03-inspiration.md)), single-hue ramp.
   - Play, prev and next, 1×/1.5×/2× speed, and a download (Opus) link.

**Playback is not transmitting.**
- Orange is reserved for *live* key-ups (P2).
- The playing clip's progress is a 2 px `ink` line with a 5 px downward-pointing triangle cap as the playhead. That is distinct from selection (square brackets) and focus (rounded outline) by geometry.
- If a live key-up happens while the user is on History, it shows only as a header chip in orange. It never takes over the History view. Live audio ducks during playback (§8.8).

**Done looks like:**
- Selecting `MARC 410` on `r-nec` highlights its string and its `tx-039` tick at `NEC 113.6`, 07:15:00.
- Clicking a tick plays the clip and scrolls the table to the row.
- All 92 seed transmissions are reachable, and the seed rows are marked as seed (no `SIM` tag) in the inspector.

### 9.3 Stats / analytics
**Job:** *"What is the rhythm of this railroad's radio?"*

**Hero slot:** the 64 px strip. **Hero datum:** `AIRTIME TODAY 01:52:40` (format example, computed), with the busiest channel and its share beneath (`CH54 · AMTK NEC · 18%`).
- **Range:** Stats has its own range selector: `TODAY` (default; the local calendar day 00:00–24:00 in the selected zone), `YESTERDAY`, `7 D`, `CUSTOM`. The hero label follows it (`AIRTIME 7 D`). There is no implicit sharing with History. A `USE HISTORY RANGE` chip copies History's range into `CUSTOM` on request.
- **Day rollover:** at 00:00 `TODAY` resets without animation. The hero shows the new day's value from the first transmission.

**Layout.** There is one big figure per panel and micro-type annotations at the edges, a density gradient after Ash Thorp ([03 §1.5](../research/03-inspiration.md)). Panels in a square-packed grid:
1. **Hero: ridgeline (M20).** One ridge per monitored channel with any traffic in range, sorted by airtime, up to **16 ridges**. The rest are summed into an `OTHER (n)` ridge. x = time of day over the range, height = airtime per 10 min. The commuter rushes must rise visibly (§9.0.6 density target). Channel labels in 11 px on the left of each ridge.
2. **Channel × hour heatmap.** Single-hue ramp with mono hour columns. It is the same data as the hero, but readable precisely.
3. **Top talkers.** Horizontal hairline bars (1 px outline, 8% `line` fill) for channels and, separately, for speakers or train IDs.
4. **Detector board.** One row per detector (13 in seed: [04 §3](../research/04-corridor-radio.md)): M9 tag, last report, axles, speed, and a defect count. Counts above 0 use the boxed `DEFECT` treatment (§9.1.5), never red.
5. **Decoder quality.** Histogram of transcript confidence and median decode latency in mono. If the engine reports no confidence, the panel shows `N/A · ENGINE REPORTS NO CONFIDENCE` in `ink-3` rather than a fake histogram.
6. **Feed uptime.** A bar per feed over the range: solid `line` when ok, `dash-stale` when stale, `dash-offline` when reconnecting or disabled, and a `state-stale` hollow triangle with a `dash-stale` span for each past fault. A fault active *now* ends the bar in `state-fault` (red is present tense).

**Rules:**
- Charts have no legends where direct labels fit.
- Axes are M2 rulers, and grids are M3 graticules at most.
- No pie charts, no 3D, no gradients except the single-hue ramp.

**Done looks like:** someone glancing at the hero from across the room can tell when the rush hours are.

### 9.4 Feeds and banks admin
**Job:** *"Are my receivers healthy, and what is each one listening to?"*

**Hero slot:** the 64 px strip. **Hero datum:** `FEEDS NOMINAL 3/4`, followed by the worst current value if anything is off, for example `BAY-04 · STALE 1M 12S`. A health screen gets one hero value ([01 §7.6](../research/01-gmunk-film-work.md)).

**Layout:**
1. **Left: feed list.**
   - First card: **`HOST`**, the backend box (CPU %, SoC temperature, throttle and under-voltage flags, uptime, disk %). It is the on-screen object for host and disk faults (§8.9).
   - Then one data-block card per feed: `ALX-01 Alexandria` · state glyph · driver (`rtl_tcp`) · `2.400 MS/s` · centre `160.890` · gain · PPM · SNR · last-sample age.
   - All four seed feeds are flagged fictional, so each keeps a small `SIM` tag in `ink-3` while the fake backend runs. An `ENABLED` toggle on each card (§8.9 `DISABLED`).
2. **Centre: feed inspector (HUD within a HUD).**
   - The selected feed's own mini spectrum and waterfall, a 15-minute sample-rate stability sparkline, and its coverage range-ring thumbnail.
   - **Telemetry depends on the driver (decision #6).** rtl_tcp sends the client only a 12-byte greeting (`RTL0` magic, tuner type, tuner gain count), then raw I/Q. It reports no temperature, drops or other status ([osmocom rtl_tcp.c](https://github.com/osmocom/rtl-sdr/blob/master/src/rtl_tcp.c)).
     - **Available on rtl_tcp** (measured by our client or known from what we set): connection state, tuner type, gain (as set), centre frequency, sample rate (configured and measured), sample-rate deficit (our drop measure), noise floor, SNR, last-sample age.
     - **Not available on rtl_tcp:** device temperature, remote host CPU and temperature, USB/device-side drops. Each renders its label, then `— — —` in `ink-3`, then the tag `N/A · RTL_TCP` in 11 px `ink-3`. Its meter draws the scale in `line-faint` with no bar. Never zero, never hidden: the gap is information.
     - **Mockup:** `BAY-04` is shown with driver `sdrviz-agent · SIM`, with agent-era fields (device temperature, host CPU, device drops) filled and tagged `SIM`. The other three are `rtl_tcp` with the N/A treatment. One frame shows both.
   - **Advanced controls are kept behind a lid:** gain, squelch defaults, FFT size and PPM correction sit behind a `▸ RECEIVER PARAMETERS` disclosure, like the Braun T 1000's manual kept in its cover ([V&A](https://collections.vam.ac.uk/item/O168288), via [03 §4.3](../research/03-inspiration.md)).
3. **Right: banks.**
   - Each bank is a CTC-style lever row (M21), with one lever per channel and the AAR number above it. Each bank also shows its **home feed** (§9.1.2).
   - **Membership:** each channel row has a `BANKS` column of checkboxes, one per bank. A single click toggles membership. Drag between banks is a convenience on top (§10.9). A channel can belong to several banks: CH54 is in both NEC and Commuter. An `UNBANKED` group lists monitored channels in no bank.
   - **Bank size:** a bank larger than 15 shows `EXCEEDS LIVE OPS COMPACT CAPACITY AT 1440 × 900 (15)` in `ink-2`, and one larger than 20 shows the same for standard tiles at 1920 × 1080. This is information, not an error.
   - **Shared-frequency notice:** 161.070 is two different channels, CSX Landover and NS Bayview, about 35 mi apart ([04 §2](../research/04-corridor-radio.md)). The UI shows both as distinct entries tied by an M12 dimension bracket labelled `SAME FREQ · DIFFERENT FEEDS` in `ink-2`. It is informational, never red.
   - **Banks:** add the fourth bank, **`Baltimore Harbor`** (Canton, Tradepoint, Curtis Bay, Locust Point, the Bayviews, coal pier, Seawall) that researcher (d) left open ([04 §4](../research/04-corridor-radio.md)). It exercises the re-pack layout with more than three banks. This is a design decision; it does not change the data's truth.
   - Channel confidence (high/med/low, from `frequencies.json`) shows as a text tag with a source-link icon that opens the source URL. P3 applies to our own data provenance as well.

**Forms:**
- Inputs are underline-only hairlines with mono values and labels above in 11 px uppercase.
- Validation errors are `state-fault` text beneath the field, never a red box. This is the one non-equipment use of red, and it is allowed because the user can act on it immediately.
- Destructive actions (remove feed, delete bank) need an explicit typed confirmation.

**Done looks like:**
- Taking `BAY-04` stale in the fake backend shows it within one heartbeat on this screen, in the header, on the Map, and in Live Ops coverage pips, with identical treatment everywhere. Channels heard only by `BAY-04` (for example `ns-bayview`) go `dash-stale`.

### 9.5 Map: the DC–Baltimore corridor
**Job:** *"Where are my receivers, what can they hear, and where are the trains?"*

**Hero datum:** the selected train's or feed's data block, enlarged in the inspector. With nothing selected, the corner readout (top-left of the canvas, 48 px count and 13 px labels): `4 FEEDS · 37 STATIONS · 6 TRAINS TRACKED`, all computed.

**Tech (decision #10):**
- Pure SVG via d3-geo. No basemap or tiles.
- Geometry comes from pre-extracted OSM GeoJSON bundled in the repo (`data/geo/`).
- Station and detector points come from `data/seed/places.json`.
- **GeoJSON owner:** the Stage 2 **Map screen designer** subagent writes `tools/extract_geo.py`. It runs one Overpass extract over the data extent (below) for rail lines (`railway=rail`, with names and operators), coastline and river banks, simplifies the result, and commits `data/geo/*.geojson` with an `ATTRIBUTION.md` (ODbL). The front-end lead's map subagent inherits it in Stage 3.

**Canvas:** the full content area, 1856 × 984 px at 1920 × 1080 and 1376 × 804 at 1440 × 900, with a 1 px `line-faint` bezel. The inspector overlays it (§8.3).

**Extent:**
- **Default view = decision #9 exactly:** `fitExtent` to the union of two `d3.geoCircle()` polygons of radius 20 mi (0.2895°), centred on Washington Union Station and Baltimore Penn Station. That is about 20 mi south of DC to about 20 mi north of Baltimore, ending around Edgewood (`NEC 75.1`).
- **Data extent is wider:** lat 38.50–39.60 N, lon 77.50–76.05 W (Quantico, Manassas, Aberdeen, Perryville), so routes run to their ends ([04 header](../research/04-corridor-radio.md)). That is intended: the default view honours #9, and panning reaches the route ends. The Belcamp detector, Aberdeen and Perryville sit outside the default view.

**Projection:**
- `d3.geoConicConformal().parallels([38.3, 39.45]).rotate([77, -37.6667])`. These are the NAD83 / Maryland State Plane Lambert parameters ([epsg.io/26985](https://epsg.io/26985)). `rotate` here only sets the central meridian (−77°) and the origin latitude. It is a spherical rotation and does **not** turn the view.
- **The view is turned with `projection.angle(θ)`**, d3's post-projection planar rotation ([d3-geo projection docs](https://d3js.org/d3-geo/projection)). The docs give no sign convention, so **compute θ, don't hard-code it**:
  1. With `angle(0)`, project Union Station and Baltimore Penn.
  2. Take the chord's screen angle, φ = `atan2(dy, dx)`.
  3. Set the angle so the chord becomes horizontal, then re-fit.
  4. Assert that Baltimore Penn lies to the right of Union Station and within ±2% of canvas height of it. Flip the sign if not.
- Expected magnitude ≈ 54°, because the DC→Baltimore chord bears about 36° east of north. That is my calculation from the station coordinates, **[U]**. It supersedes revision 1's "about 30°".
- The result reads like the CTC strip and stringline: DC on the left, Baltimore on the right. A minimal north tick shows orientation; it will point up and to the left.

**Zoom:** d3-zoom `scaleExtent([1, 8])`, where k = 1 is the default fit. Label tiers:
- **k < 2:** terminals (13 px), MARC and VRE station names by priority, MP ticks every 5 mi unlabelled, feed data blocks.
- **k ≥ 2:** M9 milepost tags every 5 mi, detector labels, all station names.
- **k ≥ 4:** MP ticks every 1 mi with inline labels (`NEC 113`).

**Layers, bottom to top:**
1. **Graticule** every 0.1°, 1 px `grid`, with coordinate numerals at the canvas edges (M11 style, mono 11 `ink-3`).
2. **Shorelines** (Potomac, Anacostia, Patapsco, Chesapeake edge), 1 px `line-faint`. No water fill, or at most a 2% `line` fill. The line *is* the shore (Nostromo vector approach: [03 §2](../research/03-inspiration.md)).
3. **Coverage:** per feed, range rings (M5) plus a clipped hatch (M23). Overlaps simply overprint, and the hatch density makes multi-coverage readable for free.
4. **Rail lines:**
   - NEC at `stroke-emph` `line`; other lines at `stroke-hair` `line`.
   - Lines are told apart by **label and dash, never hue**: freight-only lines dashed `6 3`.
   - Each line is labelled once along its path in 11 px uppercase tracked (`NORTHEAST CORRIDOR`, `CSX CAPITAL SUB`).
5. **Mileposts:** small perpendicular ticks on route lines per the zoom tiers.
6. **Stations:** a 6 px perpendicular bar across the line (CTC-style interlocking mark), with the name in 11 px. Terminals (Washington Union Station, Baltimore Penn) at 13 px display.
7. **Detectors:** a small open diamond with its MP. It pings orange when it talks.
8. **Feed sites:** registration mark (M4) with an ATC data block (M8): `LND-02 · SIM` / `18 KM · SNR 22`, plus its glyph. A ping ring (M14) fires on every TX commit it receives.
9. **Trains** (tracked passenger trains, §9.0.5):
   - The position glyph is a 4 × 10 px rectangle oriented along the track, with a traveling-linework tail: a bright head fading over 600 m of past track. This draws on *Tron: Legacy*'s "traveling linear linework" ([gmunk.com/TRON-Disc-Game](https://gmunk.com/TRON-Disc-Game)).
   - Data block: `MARC 410 · SIM` / `NEC 113.6 · CH54`. The leader offset is remembered per train.
   - The train turns `state-tx` while its crew is talking.
10. **Cursor readout** (M11), scale bar as an M2 ruler in both km and mi, and the title block (M10).
11. **Attribution:** `© OpenStreetMap contributors` in 11 px `ink-3`, permanently at the canvas's bottom-left inside the bezel, and in the Map title block's fifth cell. Both link to [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright), which requires that credit.

**Modes:**
- A `GEO / SCHEMATIC` toggle. Schematic redraws the same network as a Beck-style 0°/45° diagram with evenly spaced stations and enlarged DC and Baltimore terminals. The geo-to-schematic transition is a 600 ms `ease-in-out` morph of the same paths ([Wikipedia: Tube map](https://en.wikipedia.org/wiki/Tube_map), via [03 §4.2](../research/03-inspiration.md)).
- **No continuous radar sweeps on the map.** Map motion comes only from trains moving and pings firing (§7.5). This is a deliberate restraint call: sweeping several rings at once would be greeble.

**Stale or fault feed:**
- Stale: the feed's rings go `dash-stale`.
- Unacknowledged fault: the hatch turns `state-fault-dim` and the registration mark turns `state-fault`. Acked: the mark stays red and the hatch returns to `line-faint`.
- On transition, the coverage contour contracts inward over 800 ms to its dashed state. This is a heavily simplified nod to the Rectifier Globe's infection-from-contour motion ([gmunk.com/TRON-Rectifier-Globe](https://gmunk.com/TRON-Rectifier-Globe)), which was itself "greatly simplified to ensure a quick read".

**Done looks like:**
- The corridor is recognizable with no basemap.
- All four feeds, 37 stations and 13 detectors are placed from seed data.
- Pan and zoom stay smooth on the desktop client (§10.8).
- Labels never collide at the default zoom: use a simple greedy label placer, and drop lower-priority labels rather than overlapping them.

### 9.6 Login, loading, empty
See §8.5–§8.7. One frame each in the deliverables (§12).

### 9.7 Transcript row states

| State | When | Text column | Notes |
|---|---|---|---|
| `decoding` | Clip finished, ASR working | M24 dashed bar + `DECODING` | Channel tag in `state-tx` while live. |
| `final` | Text arrived | Barlow 15 `ink`, cosmetic reveal (M24) | Words with confidence < 0.6 in `ink-3` (not inside a wash). |
| `partial` (future streaming) | Engine streams hypotheses | Partial text in `ink-3`, replaced **in place, with no animation**, at most 4 times/s | On final, the text switches to `ink` with one 120 ms fade, and the reveal is skipped. Revisions never animate. |
| `carrier_only` | Squelch ≥ 250 ms, no speech detected | `CARRIER ONLY · 00:00.6` in `ink-3` | Single-line row; audio playable. |
| `kerchunk` | Squelch < 250 ms | — | No row. Diagonal glyph only (§7.3). Counted in Stats as blips. |
| `no_transcript_decoder_down` | Decoder fault | `No transcript · decoder down.` `ink-3` | Re-queued; decodes in place later (§8.9). |
| `failed` | ASR error on this clip | `Decode failed · audio kept.` `ink-3` + `RETRY` chip | Never red: one bad clip is not an equipment fault. Repeated failures raise `ASR FAULT`. |
| `undecodable` | Non-voice or digital audio (CSX and NS also license NXDN, per the `frequencies.json` mode note), or unintelligible audio (encrypted police, for example) | `Not decoded · non-voice audio.` `ink-3` | We do not claim to know it is digital or encrypted. All seed channels are logged as NFM. |
| `not_recorded` | Storage fault | `NOT RECORDED` in place of play | §8.9. |

- **Confidence data:** seed rows have no confidence. The SIM generator adds `confidence` (0–1 per transcript) and `words[]` (with per-word `conf`) to every row. Seed rows keep `sim: false` and list their generated fields in `sim_fields: ["confidence", "words", "receptions", "train_id"]`, so provenance stays field-accurate.
- Moonshine streams partial hypotheses, but per-word timing and confidence events are unconfirmed ([conffab](https://conffab.com/?p=10078), [arXiv 2602.12241](https://arxiv.org/html/2602.12241), as cited by the designer; **[UNVERIFIED]** for our Pi CPU setup). Common integrations run it in batch per VAD utterance ([Pipecat Moonshine STT](https://reference-server.pipecat.ai/en/stable/api/pipecat.services.moonshine.stt.html)). **v1 is batch:** `decoding` → `final`. If the engine provides no word confidence, the `ink-3` low-confidence rule is simply off.

---

## 10. Accessibility and legibility guardrails for long sessions

### 10.1 Contrast
- All text ≥ 4.5:1 on its actual background ([SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)). `ink-3` is the floor, and it is not used inside washes (§3.6).
- State strokes and glyphs ≥ 3:1 ([SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)). Decorative tokens (`grid`, `line-faint`, `state-*-dim`, `state-offline`) may not carry meaning alone. `state-idle-dim` is never text.
- Check contrast against `bg-raised` too when placing text in the inspector.
- **Known low-contrast pairs, accepted on purpose:** `state-recent` vs `state-stale` is 1.08:1, and `state-idle-dim` vs `state-stale` is 1.19:1. These states are therefore **never** distinguished by tone. Ember = 2 px underline plus a `LAST` readout. Stale = 4/4 dashed frame, hollow glyph and an `AGE` readout. Idle = solid brackets and a filled horizontal glyph. The grayscale test (§10.4) checks exactly this.

### 10.2 Size
- No text below 11 px at 100% zoom. This includes lever letters, ruler labels, ridgeline labels and milepost tags.
- The UI must survive browser zoom to 200% without loss of function. Tiles re-pack to compact or strip instead of shrinking type ([SC 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)).
- Hit targets ≥ 24 × 24 px ([SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)). Levers are 16 px visually but get a 24 px hit area.

### 10.3 Eye comfort over hours
- No pure `#FFFFFF`. The brightest token is `state-select` `#F5FBFD`, used only on thin strokes. Text is `ink` `#E4F1F5` at weight ≥ 400. Light-on-dark text halates for many viewers, so avoid hairline-weight text (Rajdhani 300 is banned) and large white fills.
- No large saturated fills. Surface washes ≤ 8% (we use 6%); plot-slot washes 12%.
- Waterfall noise floor auto-clamped and slow-tracking (§3.3), so a quiet band looks quiet, not like boiling snow.
- Idle luminance budget: a fully idle Live Ops screen should average under about 6% of max white over the content area. Measure it in the mockup with a screenshot histogram. (This is my working target, **[U]**, not a published standard.)
- **Burn-in care** for OLED or plasma-style long sessions: static chrome may drift ±1 px on a 10-minute cycle. Optional setting, off by default.

### 10.4 Never color alone
- Every state has a geometry carrier (M6 glyph, dash pattern, label text), per [SC 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).
- **Grayscale test:** a grayscale screenshot must still show which channel is talking (vertical glyph, solid 2 px frame, running waveform), which feed is faulted (triangle, `FAULT` label), which tile is recent versus stale (underline versus dashed frame), and where a defect was reported (boxed tag).
- **Focus vs selection vs playback, told apart by geometry:**
  - Focus ring: 1.5 px `state-select` outline, 2 px offset, **2 px radius**, always visible on keyboard focus and never removed.
  - Selection: outer square brackets (§3.5).
  - Playback progress: a 2 px `ink` line with a triangle playhead (§9.2).
  - A focused, selected item shows both the rounded ring and the square brackets.

### 10.5 Motion and flashing
- See §7.6 and §7.7: no more than 3 flashes per second (we use at most 1 Hz, twice), `prefers-reduced-motion` honored, and a user motion toggle.

### 10.6 Sound
- Audio master and per-channel mute are always reachable within one click.
- No UI sounds by default. The radio *is* the sound. Arming and mix rules are in §8.8.

### 10.7 Screen readers (minimum for the mockup)
- Tiles are buttons with an `aria-label` such as "Channel 54, Amtrak NEC, transmitting, 7 seconds, via BWI-03".
- The transcript log is an `aria-live="polite"` region, throttled to final transcripts only.
- Map features have a parallel list view.

### 10.8 Long-session robustness and client budgets
- **Client target:** a desktop browser (P10). Budgets: one shared `requestAnimationFrame` loop app-wide; ≤ 3,000 live SVG nodes per screen; spectrum, waterfall, LOFAR and spectrogram on Canvas 2D (no WebGL needed in v1); 60 fps target for UI motion on a 2020-era laptop with integrated graphics, with ≥ 30 fps acceptable for the waterfall.
- **Transcript log:** at most **200 rows in the DOM**, using a virtualized list. 2,000 rows are kept in memory. Older rows are reached through `OLDER IN HISTORY →` at the foot of the log.
- **History table:** virtualized; a page of 200 rows at a time.
- **Waterfall:** a canvas ring buffer exactly as tall as its pixel height (120 rows at 1920 × 1080), drawn by shifting the canvas; no per-row DOM.
- **LOFAR strip:** 120 rows (1 h). The rows are server-computed, so a reload restores the full hour.
- **Background tabs:** browsers throttle rAF in hidden tabs. On return, there is no build-on, a `GAP` row is inserted (§8.6), and the ages and readouts snap to their true values with no count-up.
- **After hours on one screen:** nothing accumulates. No growing arrays in components, and SVG pings are removed after `t-ping`. Reviewers check memory after an 8 h replay at 60× speed of `data/sim/`.

### 10.9 Interaction alternatives (WCAG 2.2 SC 2.5.7, [Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html))
- **Bank membership:** checkbox column (§9.4); with a channel row focused, the `B` key opens its bank menu. Drag is optional.
- **Map leaders:** click the leader's end knob to cycle through 8 compass offsets, `[` and `]` on a focused data block to do the same, and `0` to reset. Drag is optional.
- **Scrubber range bracket:** start and end are also typed fields (`07:00`, `08:00`) and preset chips (`LAST 1H`, `LAST 6H`, `TODAY`). Arrow keys nudge a focused handle by 1 min, or 10 min with Shift.
- **Touch path for levers:** a tap selects a tile, and a selected tile always shows its levers. The inspector carries full M/S/R controls.

---

## 11. Do / Don't

**Do**
1. Draw panels with corner brackets and let negative space do the framing.
2. Keep every number in JetBrains Mono and every label in Barlow Semi Condensed uppercase.
3. Use orange for live transmission and *nothing else*. Use red for present, actionable equipment faults (and form validation) and *nothing else*.
4. Pair every color state with a geometry state (glyph, dash, label).
5. Give each screen's hero datum its own 64 px slot, and promote values within tiles to the right readout zone.
6. Use native railroad mileposts with their prefixes (`NEC 113.6`), AAR `5454` readouts, CTC strips and route stringlines.
7. Run the identical key-up choreography everywhere: squelch-open at 0, commit at 250 ms, release hold of 400 ms.
8. Let the waterfall be a single-hue lightness ramp with the TX slot outlined in orange.
9. Compute every displayed value from `data/seed/` or `data/sim/`, and tag simulated identities `SIM`.
10. Build-on on app start and screen changes only (≤ 600 ms), then stay still.
11. Respect `prefers-reduced-motion`, and test in grayscale.
12. Label scales per division (scope-style) instead of labelling every gridline.
13. Use the two-stroke fake glow (§3.4) on TX, the spectrum trace and a promoted warning only.
14. Keep advanced receiver parameters behind a disclosure, and show `N/A · RTL_TCP` for telemetry the driver can't give.
15. Snap everything to the 8 px grid and keep strokes at integer pixel widths.
16. Make faults acknowledgeable, and let acknowledged faults drop their red frame.

**Don't**
1. Don't use green, purple, pink, or any hue for railroads, feeds or banks.
2. Don't use rainbow colormaps (Turbo, Jet, viridis or plasma) anywhere.
3. Don't use amber/orange for warnings, cautions, selection, playback or hover.
4. Don't use red for occupancy, map targets, railcar defects, past faults, or anything else that isn't a present equipment fault (the Oblivion red-radar-target mistake).
5. Don't add hexagons, random hex dumps, fake code scrolls, decorative spinning rings, glitch ambience, scramble glyphs, lens flares, film grain or CRT scan-lines.
6. Don't use blur filters or backdrop-filter over large areas (P10).
7. Don't let any element blink, pulse or alternate continuously, or flash more than 3 times per second.
8. Don't use text below 11 px, or hairline-weight text.
9. Don't use full boxes around panels (canvases and state frames excepted), rounded corners (focus ring excepted), drop shadows, or skeuomorphic bevels.
10. Don't use pie charts, 3D charts, or legends where a direct label fits.
11. Don't replay the build-on when data updates.
12. Don't show zero for unknown values. Use `— — —`.
13. Don't let playback of a historical clip look like a live key-up.
14. Don't break radio conventions (frequency left to right, waterfall scrolling down).
15. Don't embed copyrighted film stills in any deliverable. Link to them.
16. Don't scroll the tile grid, and don't let the inspector reflow the layout.
17. Don't renumber railroad mileposts or invent a corridor-wide count.
18. Don't fire the full-field alarm for disabled feeds or a short backend blip.

---

## 12. Deliverables expected from the film-graphics-designer (Stage 2)

1. `tools/gen_sim.py` and its output in `data/sim/` (§9.0.6). **Do this first**, because the frames are computed from it.
2. `docs/design/spec.md`: palette, type, components and motion, laid out like the NASA Graphics Standards Manual: numbered sections, specimens and measurements ([Design Week](https://www.designweek.co.uk/inspiration/nasa-graphics-standards-manual-by-danne-blackburn/), via [03 §4.4](../research/03-inspiration.md)). Tokens must use the names in §3, §5 and §7 verbatim, so they can become CSS custom properties 1:1.
3. One static SVG/HTML mockup per screen at 1920 × 1080, each in three states from `data/sim/scenarios/`: **Listening** (03:40), **Keyed** (14:07:30: CH54 + CH08 + one off-bank) and **Fault** (`BAY-04` stale and `LND-02` `FAULT · LINK LOST`, unacknowledged). That is 15 frames. Add:
   - The Live Ops Keyed and Fault frames at **1440 × 900** (compact tiles).
   - The **Fault frame after ACK** (Live Ops).
   - Login, first-data loading, empty bank, `RECONNECTING`, and `NO LINK`.
4. One motion study (HTML/CSS) of the key-up choreography (§7.3) on a single tile, including squelch-open → commit and a kerchunk that never commits, plus the map ping.
5. A component sheet:
   - **Tile states:** idle, squelch-open, TX (with the flash frame), recent, recent-dim, partial coverage, stale, offline-reconnecting, disabled/no-feeds, channel fault, channel fault acked.
   - **The §3.5 combination frames**, each in the standard, compact and strip variants.
   - **Every transcript row state in §9.7**, and the boxed `DEFECT` row.
   - The meter, glyph set, data block, M9 milepost tag (with prefixes), title block (including the Map version with OSM), lever, chips (system chips in nominal, degraded, fault and acked states), and inputs.
   - The `N/A · RTL_TCP` field treatment.

**The review gate.** I review against this brief and score each principle P1–P10 and each "Don't". The verdict is **APPROVED** or **REVISE**, with a numbered change list. The first thing I check is the grayscale screenshot test (§10.4); the second is that the numbers on screen match `data/sim/`.

---

## 13. Decisions I made on open research items

| Item (source) | Decision |
|---|---|
| TX amber vs aviation caution ([03 §3.7](../research/03-inspiration.md)) | TX is warm orange `#FF8A2B`; no caution color exists; degraded = stale or fault. Within decision #7. |
| Blender licensing ([02 §ranked 1](../research/02-collaborators.md)) | Not used. Rajdhani (display) + Barlow Semi Condensed (labels) + Barlow (reading) + JetBrains Mono (data), all OFL. |
| BR2049 texture on stale panels ([03 §1.1](../research/03-inspiration.md)) | Rejected (§6). |
| Fourth "Baltimore Harbor" bank ([04 §4](../research/04-corridor-radio.md)) | Add it in the mockup (§9.4). |
| Schematic corridor view ([03 §4.2](../research/03-inspiration.md)) | Yes: a Map mode, and the CTC strip on Live Ops. |
| Radar sweep usage ([01 §2.4](../research/01-gmunk-film-work.md)) | One listening sweep, on the Live Ops spectrum only; none on the map. |
| Police channels (Amtrak PD may be encrypted or separate: [04 §6](../research/04-corridor-radio.md)) | Kept in seed banks and shown like any channel. Unintelligible audio renders as `undecodable` (§9.7). Flagged to the owner (see open questions). |
| `tx-088` invented Burke detector MP, "NI dispatcher" wording ([04 audit](../research/04-corridor-radio.md)) | Data fixes, not design. Front-end lead should relabel tx-088 to a sourced NS detector and use "Landover dispatcher". |
| Auto Train 161.100 at ALX-01 ([04 audit](../research/04-corridor-radio.md)) | Not added in Stage 2; the shared-frequency UI (§9.0.3, §9.4) already handles the case if it is added later. |
| NXDN in the corridor ([04](../research/04-corridor-radio.md), `frequencies.json` mode note) | Not modelled. Non-voice audio renders as `undecodable`. |

---

## 14. Reference index

**GMUNK primary (self-reported):**
- [Oblivion GFX](https://gmunk.com/OBLIVION-GFX)
- [TRON: Legacy](https://gmunk.com/TRON-Legacy)
- [Disc Game](https://gmunk.com/TRON-Disc-Game)
- [Throne Room](https://gmunk.com/TRON-Throne-Room)
- [Rectifier Globe](https://gmunk.com/TRON-Rectifier-Globe)
- [Board Room](https://gmunk.com/TRON-Board-Room)
- [Opening Titles](https://gmunk.com/TRON-Opening-Titles)
- [Tron: Ares Computer Vision](https://gmunk.com/TRON-Ares-Computer-Vision)
- [Tron: Ares Finding Eve](https://gmunk.com/TRON-Ares-Finding-Eve)

**Reels (watch; not embedded):**
- [Oblivion GFX Montage](https://vimeo.com/64377100)
- [Oblivion FUI Process Reel](https://vimeo.com/67778891)
- [Tron: Ares GFX reel (Art of VFX)](https://www.artofvfx.com/tron-ares-gmunk-gfx-reel/)

**Interviews and critique:**
- [Pushing Pixels: GMUNK](https://www.pushing-pixels.org/2011/06/01/visual-effects-of-tron-legacy-and-beyond-conversation-with-gmunk.html)
- [Pushing Pixels: Joseph Chan](https://www.pushing-pixels.org/?p=9032)
- [Pushing Pixels: Jayse Hansen](https://www.pushing-pixels.org/?p=7447)
- [darbyfui.com: Tron: Ares](https://www.darbyfui.com/tronares) (*self-reported*)
- [Motionographer: Oblivion](https://motionographer.com/2013/04/19/bradley-g-munkowitz-oblivion-screen-graphics)
- [ProVideo Coalition: Oblivion HUD](https://www.provideocoalition.com/hud-and-gui-graphics-in-oblivion/)
- [Fuzzy Math: Oblivion critique](https://fuzzymath.com/blog/evaluating-interface-design-of-oblivion)
- [Motionographer: Lewandowski](https://motionographer.com/2011/06/06/tron-legacy-in-depth-with-david-lewandowski/)
- [Core77: Nimoy](https://www.core77.com/posts/18933/josh-nimoy-on-the-secrets-behind-the-special-effects-in-tron-legacy-18933)

**Outside references:** see [03-inspiration.md](../research/03-inspiration.md) for the full list. The ones relied on here:
- [14 CFR 25.1322](https://www.faa.gov/sites/faa.gov/files/2022-11/25.1322.pdf)
- [FAA data blocks](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_14.html)
- [CTC](https://en.wikipedia.org/wiki/Centralized_traffic_control)
- [PRR position lights](https://railroadsignals.us/signals/pl)
- [FRA stringlines](https://railroads.dot.gov/sites/fra.dot.gov/files/fra_net/2009/rr0902.pdf)
- [VU meter](https://en.wikipedia.org/wiki/VU_meter)
- [LOFAR](https://en.wikipedia.org/wiki/Low_Frequency_Analyzer_and_Recorder)
- [Pulsar plot](https://www.scientificamerican.com/article/the-pulsar-chart-that-became-a-pop-icon-turns-50-joy-division-rsquo-s-unknown-pleasures)
- [Tube map](https://en.wikipedia.org/wiki/Tube_map)
- [Braun T 1000 (V&A)](https://collections.vam.ac.uk/item/O168288)
- [RFAnalyzer](https://demantz.github.io/RFAnalyzer/fft.html)

**Technical (revision 2):**
- [d3-geo projection (`angle`, `rotate`, `fitExtent`)](https://d3js.org/d3-geo/projection)
- [osmocom rtl_tcp.c](https://github.com/osmocom/rtl-sdr/blob/master/src/rtl_tcp.c)
- [Raspberry Pi thermal control](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html)
- [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay)
- [OSM copyright and attribution](https://www.openstreetmap.org/copyright)
- [Pipecat Moonshine STT](https://reference-server.pipecat.ai/en/stable/api/pipecat.services.moonshine.stt.html), [conffab on Moonshine](https://conffab.com/?p=10078), [arXiv 2602.12241](https://arxiv.org/html/2602.12241) (designer-supplied; not re-read by the director)
- [NEC infrastructure list](https://en.wikipedia.org/wiki/List_of_Northeast_Corridor_infrastructure)

**Standards:**
- [WCAG 2.2 contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- [three flashes](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)
- [animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
- [dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
- [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [EPSG:26985](https://epsg.io/26985)
- [Google Fonts OFL repo](https://github.com/google/fonts/tree/main/ofl)

**Corridor data:**
- [AAR channel list](https://www.qsl.net/n4jri/aar_ch.htm)
- [Broadcastify Baltimore](https://www.broadcastify.com/listen/feed/43356)
- [Broadcastify Franconia](https://www.broadcastify.com/listen/feed/34638)

---

## 15. Revision notes

**Revision 2, 2026-11-08.** This revision resolves the designer's 28 review issues. The brief wins over the board, and the board has been corrected to match.

| # | Issue | Resolution (where) |
|---|---|---|
| 1 | Milepost system contradictory | Native railroad counts with prefixes; NEC falls left to right; local 0.0 not shown. Canonical example is now `MARC 410` / `NEC 113.6 · CH54` at Odenton, from seed `tx-039` (§1.2, §4, §9.0.4, M8, M9, M11, board). |
| 2 | One axis vs many counts; RF&P south of DC | Five routes, each a chain of native-count segments with MP-equation marks. One route per stringline via a route selector; one CTC row per route; a left-to-right rule taken from the rotated map (§9.0.4, M18, M19, §9.2). |
| 3 | Seed can't support examples | Designer generates deterministic `data/sim/` in Stage 2, flagged SIM, and owns it until Stage 3. Density targets and scripted 14:07 overlap given. Examples relabelled as format examples or re-pointed to seed rows (P3, §9.0.6). |
| 4 | No train model | `trains.json` (SIM) from the same generator, passenger trains only (decision #9). Freight never positioned. Seed passenger rows must match (§9.0.5). |
| 5 | Channel vs feed | Coverage derived (ok / partial / stale / offline) with M25 pips. Feed faults stay on the feed. One event, several receptions; primary = best SNR, locked; its audio plays and is decoded (§9.0.2–3). |
| 6 | Which spectrum | The displayed feed, with per-bank home feeds and a selector. Composite and stacked strips rejected. Shared-frequency tiles get a feed suffix (§9.1.2, M7). |
| 7 | Squelch vs TX threshold | One threshold. Squelch-open (diagonal, audio flowing) for the first 250 ms, then TX commits; a kerchunk never commits (M6, M17, §7.3, §3.2). |
| 8 | State matrix | Five-layer precedence (frame, glyph, status, fault reason, ember), plus overlays for selection, focus, mute, solo and coverage; required combination frames (§3.5, §12). |
| 9 | Faults over hours | ACK interaction and acked look; feed escalation table; offline split into `DISABLED` and `RECONNECTING`; alarm requires enabled feeds faulted or a backend link down ≥ 15 s; reconnecting state (§8.4, §8.6, §8.9). |
| 10 | System faults have no home | Header chips are the objects (`ASR`, `DISK`, `HOST`) plus a log header mark, History recording rail and Feeds admin `HOST` card (§8.1, §8.9). |
| 11 | Fault alternation is perpetual | Alternation withdrawn; the fault reason has its own slot; two pulses, then steady (§7.6). |
| 12 | Motion budget conflicts | Three classes (ambient budgeted at 1, data rate-limited, readouts granular); sweep on the spectrum only; idle meters static; age format coarsens (§7.5, §4, M13, M16). |
| 13 | Decode-resolve unbuildable | Accepted: duration-proportional bar, then a cosmetic per-word reveal; partials replace in place with no animation (M24, §9.7). |
| 14 | Transcript states incomplete | Full state table; SIM adds confidence fields; `OPR` and `UNK` tags; NXDN and encrypted audio render as `undecodable` (§9.7, §9.0.7). |
| 15 | Layout doesn't fit | Re-derived arithmetic; standard / compact / strip variants; never scroll; tile 200 × 112 (§9.1.3, §5.1). |
| 16 | Hero slot | 64 px hero strip on every data screen; tile promotion is right-aligned (§9.1.1, P4, §7.3). |
| 17 | Off-bank channels | Monitored = heard by an enabled feed; per-surface table (§9.0.1). |
| 18 | Audio | Arming state, equal mix at −6 dB, −18 dB live duck during playback, global solo (§8.8). |
| 19 | Login, loading, empty, inspector | §8.5–§8.7; inspector always overlays (§8.3). |
| 20 | Map projection and extent | `rotate` only sets the central meridian; the view turns with a computed `angle()`. Default view = decision #9 via two 20 mi `geoCircle`s, with a wider data extent. Canvas size and zoom tiers set. OSM attribution placed. GeoJSON owned by the Map designer (§9.5). |
| 21 | M9 too narrow | 32 × 48 tag with a prefix line (M9). |
| 22 | Board breaks brief | Brief wins; board corrected (11 px floor, CTC 2 px, ridgeline on `bg-void`, `135 kHz/div` now in M3, washes 6% / 12%, Populate bar orange, demo loops labelled, idle meter static). |
| 23 | Contrast gaps | Surface wash 6%; no `ink-3` inside washes; `idle-dim` never text; low-contrast state pairs accepted because geometry carries them (§3.6, §10.1). |
| 24 | Time formats | Local zone with abbreviation and a UTC toggle everywhere; durations vs ages formats; `t-cool` is 10 min from release; DST and rollover rules; Stats has its own range; scrubber width is adaptive (§4, §7.2, §9.2, §9.3). |
| 25 | Long-session robustness | DOM caps, ring buffers, gap rows, build-on policy, LOFAR = 1 h strip specified; the client is a desktop browser (§10.8, §9.1.2, P10). |
| 26 | Interaction accessibility | Non-drag alternatives; touch path for levers; focus / selection / playback told apart by geometry (§10.9, §10.4). |
| 27 | rtl_tcp telemetry | Verified that rtl_tcp sends only a greeting plus I/Q; `N/A · RTL_TCP` treatment; `BAY-04` shown as `sdrviz-agent · SIM` (§9.4). |
| 28 | Defects in red | Defects are railroad information, never red: boxed `DEFECT` tag. "Red is present tense" added to P2 (§9.1.5, P2). |

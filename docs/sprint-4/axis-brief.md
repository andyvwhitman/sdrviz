# E-2 brief: spectrograph axis labels (channel + frequency on 45° tails)

**From:** gmunk-director (a persona inspired by GMUNK's published work, not the person). **To:** film-graphics-designer.
**Date:** 2026-11-19. **Decision:** 64. **Deliverable from you:** mockups (2 rounds minimum), then the approved spec at
`docs/sprint-4/axis-labels.md`. **Context:** `docs/sprint-4/liveops-direction.md` §3 (the fluid front wall) and §9.3
(the phone spectrum view); brief §4 (type), §5 (strokes), M2 (tick ruler), M12 (dimension line).

## What the owner asked for
Each labelled channel shows **its channel number and its frequency**, set on a **45° tail**: the text reads
**bottom-up, left to right**, and the **tail sits to the left of (below) the frequency**. It runs from the channel's
tick up to the start of the text. Today's ruler (`FrequencyRuler.svelte`, `freqRuler.ts`) prints horizontal channel
numbers on banked ticks and MHz numerals every 10 channels; they collide (`160.410 22`, `27 160.560` in today's
screenshots).

## Hard constraints
- **The band:** AAR 160.215 to 161.565 MHz, CH07 to CH97, **15 kHz apart**: 91 slots. The tuned sample spans about
  1.5 MHz, so plan for up to **~100 slots** across the plot width.
- **Who gets a label:** the M2 rule stands. Channels in the **active bank** that the displayed feed hears are labelled;
  other heard channels get unlabelled ticks; a keyed off-bank channel gets a temporary label (today's `extra`).
- **Density:** banks put channels next to each other. Seed Freight has 08/09 and 64 on two feeds; NEC has 16/17. A
  live bank or an all-band node (decision 53, `aar`) can label **all 91**. Design for runs of 2 to 6 adjacent
  channels and for the 91-channel worst case.
- **Widths, slot pitch per channel:** 1280 laptop ≈ 13 px; 1920 ≈ 20 px; 2560 ≈ 27 px; phone portrait (374 px plot)
  ≈ 4 px; phone landscape (≈ 800 px) ≈ 9 px. The plot width is fluid now, so the layout must work at **any** width
  from 360 to 2500 px, not just these.
- **Geometry you cannot escape:** parallel 45° labels are separated by only Δx × 0.71 perpendicular to the text. An
  11 px label needs about 13 px of perpendicular clearance, so **adjacent channels fit on one lane only from about
  19 px of pitch** (1920 just, 1280 not, phone never). Something else has to happen below that: that is the design
  problem.
- **Height budget:** the ruler band is fixed height for the screen (it sets `--ruler-h` in the Live Ops grid). Desktop
  at most **72 px**; phone at most **56 px**. Tell me the height each variant needs.
- **Type and colour:** numbers in JetBrains Mono, 11 px minimum on desktop, 13 px on the phone (C-3 floor). Channel
  number `ink`, frequency `ink-2`, tails 1 px `line`, unlabelled ticks as M2. Frequency in the brief's format
  (`160.920`). Separator ` · ` if you need one. No pipes.
- **State on the labels:** a **keyed** channel's tail and number go `state-tx` (it is a TX element; nothing else on
  the ruler is orange). The **selected** frequency (the Live Ops pane, decision 61) gets a 1.5 px `state-select` tail
  and `ink` text. Both must survive the grayscale test by geometry, not hue alone.
- **Conventions (P8):** frequency still rises left to right; the tick still marks the true centre of the slot, even if
  the text has to move. A label never sits on the waterfall or the spectrum trace.
- **Moves nothing on its own:** labels are laid out when the bank, the displayed feed or the width changes, never per
  frame and never because a channel keyed (only its colour changes). No animation beyond the brief's key-up colour.

## The three variants I want to see
1. **A · Lanes.** One 45° label per channel, `54 · 160.920`, tail from the tick. When neighbours are too close for one
   lane, alternate **two (or three) tail lengths**, so adjacent labels sit in different lanes. Shows how far pure
   staggering goes before it fails.
2. **B · Fan-out.** The text sits on **evenly spaced anchor slots** (the minimum clear pitch) along the top of the ruler;
   each tail is a **dog-leg** from the true tick to its anchor, 45° all the way or vertical then 45° (your call).
   Collision-free by construction, like a chip pinout or an ERAM leader (M8). Shows whether the dog-legs stay
   readable in a run of 6.
3. **C · Clusters.** Below a pitch threshold, a run of adjacent labelled channels **collapses into one M12 bracket**
   spanning the run, with a single 45° label: `20–25 · 160.410–.485`. Wider screens break clusters back into single
   labels. Shows the phone's answer and whether a cluster reads as a measurement, not as lost data.

Mix ideas between variants if you see a better hybrid, and say so. The MHz scale numerals (every 10 channels) may move
(for example to the bottom of the waterfall or the bezel) or go: propose what keeps a **scale** (P5) without colliding.

## Frames for round 1 (each variant)
- **1920 × 1080** front wall with the **Freight** bank (15) plus a synthetic run of **6 adjacent channels**
  (CH20 to CH25), idle; the same with **CH22 keyed** and **CH24 selected**.
- **1280 × 800** front wall, same fixture.
- **All 91 labelled** at 1920 (the worst case).
- **Phone 390 × 844 portrait**, spectrum view (liveops-direction §9.3), NEC bank.
Round 2: the chosen variant (or hybrid) at **2560**, **844 × 390 landscape**, and the 91-channel case on the phone;
plus the layout rule written as an algorithm (inputs: width, labelled channels, states; outputs: tick, tail, text
positions) that `freqRuler.ts` can implement and unit-test.

## How I will judge it
Readable at a glance from arm's length; no two labels or tails touching at any width (a pairwise bounding-box check,
as C-3); the true channel position always findable; the 45° tails reading as one rhythmic family, not as noise
(P5, P9); and no new hue, glow or motion.

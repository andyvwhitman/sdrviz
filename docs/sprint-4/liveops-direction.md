# LIVE OPS, FLUID: creative direction (ticket E-1)

**From:** gmunk-director, a creative director persona inspired by GMUNK's published work. It is not the person.
**To:** frontend-engineer (F-2, F-3, F-4), film-graphics-designer (E-2, and anything here marked "designer").
**Date:** 2026-11-19 · **Status:** direction for sprint 4. This file contains no code.
**Read with:**
- `docs/decisions.md` rows 53, 54 (live bank), 55 (corner mute, audio on by default), 57 to 59 (recording), and
  **61 to 64** (this sprint). Rows 61 and 62 replace row 28 for Live Ops: the fixed stage, "tiles never scroll" (brief
  §9.1.3, Don't #16) and the reserved bottom band are withdrawn for this screen.
- `docs/brief/creative-brief.md`: tokens §3, type §4, grid and strokes §5, motifs §6, motion §7, audio §8.8.
- `docs/sprint-3/frequency-direction.md`: the frequency page and its parts (identity, hero, day strip L/M/S, log
  rows, playback). The pane is built from those parts.
- `docs/sprint-3/c3-review.md`: the phone type floor (13 px data, 15 px row primaries, 44 px targets).
- `docs/sprint-4/axis-brief.md`: E-2, the spectrograph labels. Its ruler height plugs into §3 here.

Owner choices I made on the owner's behalf are marked **[PICKED]**, each with the alternative in one line.

---

## 0. The one-paragraph version

Live Ops becomes **one listening instrument with two halves**: the front wall on top shows the whole band; the lower
half is the bank (a scrolling grid of the same tiles) beside **the selected frequency's pane** (the frequency page,
folded into a column). Two hairline dividers let the owner set the proportions per device and use: a tall
waterfall on a wall monitor, a wide pane on a laptop for reading. Nothing is a fixed stage any more: everything is
real CSS pixels, so a 2560 screen gets more density, not bigger type (brief §5.1). On a phone, the same tiles become
a list, the same pane opens full screen, and the front wall is one tap away as a view-only instrument.

**Job sentence:** *"Who is talking right now, and what has this one channel been saying?"*
**Hero datum (P4):** unchanged, the hero strip's `LAST KEY-UP 12M` or the keyed `5454 · 00:07.4`. The pane's own
hero steps down to 32 px so there is still only one 48 px number on the screen.

---

## 1. What goes, what stays, what moves

| Piece today | Fate | Where it goes |
|---|---|---|
| `TranscriptLog` (all channels) | **removed** (decision 61) | Its job splits: "who is talking now" is the hero strip and the tiles; "what did they say" is the pane's log for one frequency. Delete the component and the `LOG +n` plumbing. |
| `ChannelInspector` (480 px overlay) | **retired** | TODAY → the pane's day-strip lid. FREQUENCY PAGE › → the pane's OPEN FULL PAGE. AUDIO → the pane's audio row. COVERAGE → the pane's HEARD BY line with M25 pips. RECENT → the pane's log. BANKS → dropped (managed in Feeds & Banks, decision 61). TRANSMISSION and RECEPTIONS (per-feed SNR/RSSI) → dropped from Live Ops; RECEPTIONS goes on the LATER list for the full page. |
| `FeedInspector` | **stays** | Opened from the feed selector (`INSPECT LND-02`). It now docks **over the pane column**, exactly the pane's width, and never pushes (brief §8.3). `Esc` closes it and the pane is underneath, unchanged. |
| `AudioMixer` | **moves into the pane** as one row | §5.3. Same store, same rules. The tiles keep their M/S/R levers. |
| `HeroStrip` | **stays**, full width, 64 px | Two additions: while keyed, the keyed `5454 AMTK NEC` is a button that selects that frequency into the pane; the `+2 · 0808 · 2828` list items are buttons too. Under 900 px of window height, the strip is 48 px and its numerals step down to 32 px. On the phone it is a one-line strip (§9.2). |
| `BankTabs` | **stays** over the tile column | The readout `8 TILES · STANDARD` becomes the density chip (§4.3). Tabs keep their chamfers. |
| `FrontWall` (spectrum, ruler, waterfall) | **stays**, fluid | §3. Click-to-listen (decision 54) is unchanged. |
| `geometry.ts` (absolute boxes) | **replaced** | A CSS grid (§2). The only numbers left in TS are the plot clamps and divider limits. |
| `Stage` scaling for `/live` | **gone** for this route | New route layout `"fluid"`: the AppShell header and status line at 1:1 CSS px, content fills the window. Other stage screens are untouched this sprint. |
| `PhoneOnAir` strip | suppressed on `/live` only | On the phone the hero line does that job (§9.2). |

---

## 2. Desktop layout

### 2.1 The grid
The `/live` content area is a fixed-height CSS grid filling the window between the header (44) and the status line
(28). **The page itself never scrolls.** Only two things scroll, each inside its own box: the tile area and the
pane body.

```
rows:    16 gap
         hero        64 (48 under 900 px tall)
         16 gap
         wall        --wall-h            (horizontal divider sets it)
         divider     16 (the gap itself, §4.1)
         lower       1fr
         16 gap
cols in the lower row:
         tiles       1fr                  (bank tabs 32 + 8 + scrolling tile area)
         divider     24 (the gutter itself, §4.2)
         pane        --pane-w            (vertical divider sets it)
margins: 32 px left and right (--margin-x), as today
```

The hero and the wall span the full width. The tabs sit only over the tile column; the pane has its own head.

### 2.2 Defaults
- Wall: **36% of the space below the hero** (wall + divider + lower). At 1080 tall that is about 317 px, close to
  today's 304, so the first view feels familiar.
- Pane: **clamp(400 px, 40% of the content width, 880 px)**. At 1920 that is 742 px, close to today's 760 px log.
- Ruler: the height E-2 settles on. I plan for **56 px** below; if E-2 lands elsewhere, only the waterfall changes.
- Spectrum: `clamp(48, 25% of (wall − ruler), 144)` px. The waterfall takes the rest of the wall.

### 2.3 At 1280 × 800 (laptop; also iPad landscape at 1024 to 1366)
Content 1216 × 728. Wall 216 (spectrum 48, ruler 56, waterfall 112 = 18 s). Lower 384. Pane 486. Tiles 706 = 3
columns of 230 px, standard, 3 rows for an 8-tile bank, the third row scrolled into view.

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ SDRVIZ LIVE OPS   MAP [LIVE OPS] FEEDS & BANKS SETTINGS SPOT     FEEDS 4/4 · ASR OK 20:13 ⛶ │ 44
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ LAST KEY-UP 12M AGO · CH54 · AMTK NEC                                    ⌜FEED · LND-02 ▾⌟ │ 64 hero
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐   │
│ │ spectrum ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ REF −10 dBFS · 10 dB/div    │   │ 48
│ │ ╱54 160.920 … E-2 axis labels …                                                       │   │ 56 ruler
│ │ waterfall ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   │ 112 (18 s)
│ └──────────────────────────────────────────────────────────────────────────────────────┘   │
│ ─────────────────────────────────────── ┄┄┄ ─────────────────────────────────────────────  │ 16 H divider
│ [NEC CORRIDOR 8][LIVE 0]   DENSITY STD ║ ◂ ▸                    [OPEN FULL PAGE ›]   ×    │
│ ⌜•••1 WASH TERM ⌝ ⌜•••2 K TOWER  ⌝ ⌜•3║ 1212 K TOWER                      LAST HEARD      │
│  2222             1212            1616║ 160.290 MHz · AMTRAK · TERMINAL          24M      │
│  160.440  ▁▌▁     160.290   ▁    160.3║ HEARD BY LND-02                   ••• 19:49:32    │
│  ·········  M S R ·········· M S R ···┇ AUDIO  VOL ━━━━━━■── 80   M S R   GAIN 80         │
│ ⌞AMTRAK·TERMINAL⌟ ⌞AMTRAK    MUTED⌟ ⌞A║ ▸ TODAY  ▁▌▌▁▁▌▌▌▌▁┃  FS 5M · 142 TX · LAST 24M   │
│ ⌜•••4 IVY CITY  ⌝ ⌜•••5 AMTK MOW ⌝ ⌜•6║ TRANSMISSIONS · 142 TODAY            [CONTINUOUS]  │
│  5959             2727            1717║ ─────────── TODAY · THU 19 NOV ──────────────     │
│  …                …               …   ║ ▷ 19:49:32  00:04.1          LND-02               │
│                                     ▒ ║   Into 16, 2257.                                  │
│                                     ▒ ║ ▷ 19:49:26  00:06.0          LND-02               │
│                                       ║   Amtrak 2257, K Tower, you're lined into …       │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ NO OPEN EVENTS                                  WLT-1 · LIVE OPS · BANK NEC CORRIDOR · 20:13 │ 28
└────────────────────────────────────────────────────────────────────────────────────────────┘
  ║ = V divider (24 px gutter)   ┇ = its grip   ┄┄┄ = H divider grip   ▒ = the tile area's scrollbar
```
At a pane width under 560 px the log rows use the two-line anatomy (§6.2).

### 2.4 At 1920 × 1080 (the design canvas)
Content 1856 × 1008. Wall 317 (spectrum 65, ruler 56, waterfall 196 = 32 s). Lower 563. Pane 742. Tiles 1090 = 5
columns of 211 px; 4 standard rows visible.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ header 44                                                                                                │
│ LAST KEY-UP  12M  AGO · CH54 · AMTK NEC                                              ⌜FEED · LND-02 ▾⌟   │ 64
│ ┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ spectrum 65                                                                                          │ │
│ │ ruler 56 (E-2)                                                                                       │ │
│ │ waterfall 196  · 10 S · 20 S · 30 S                                                                  │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│ ───────────────────────────────────────────────── ┄┄┄ ────────────────────────────────────────────────── │ 16
│ [NEC CORRIDOR 8][LIVE 0]           DENSITY STD ║ ◂ ▸                              [OPEN FULL PAGE ›]  ×  │
│ ⌜tile⌝ ⌜tile⌝ ⌜tile⌝ ⌜tile⌝ ⌜tile⌝             ║ 1212  K TOWER                              LAST HEARD  │
│ ⌜tile⌝ ⌜tile⌝ ⌜tile⌝                           ║ 160.290 MHz · AMTRAK · TERMINAL · WASHINGTON     24M   │
│                                                ║ HEARD BY LND-02 · BWI-03                ••• 19:49:32   │
│                                                ┇ AUDIO  VOL ━━━━━━━━━━■──── 80   LEVEL ──  M S R       │
│                                                ║ ▸ TODAY  ▁▌▌▁▁▌▌▌▌▁▁▌┃  FS 5M · 142 TX · LAST 24M     │
│                                                ║ TRANSMISSIONS · 142 TODAY                [CONTINUOUS]  │
│                                                ║ ▷ 19:49:32  00:04.1  Into 16, 2257.            LND-02  │
│                                                ║ ▷ 19:49:26  00:06.0  Amtrak 2257, K Tower, you LND-02  │
│                                                ║                      are lined into track 16.          │
│                                                ║ …                                                      │
│ status line 28                                                                                           │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 At 2560 × 1440 (wall monitor)
Content 2496 × 1368. Wall 446 (spectrum 98, ruler 56, waterfall 292 = 48 s). Lower 794. Pane 880 (the default
cap). Tiles 1592 = 7 columns of 220 px; 6 standard rows visible, so a 40-channel bank is one short scroll.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ header 44 · hero 64                                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ spectrum 98                                                                                                  │ │
│ │ ruler 56 (E-2: at 27 px per channel every banked label fits on one lane)                                     │ │
│ │ waterfall 292 (48 s)                                                                                         │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│ ──────────────────────────────────────────────────────── ┄┄┄ ─────────────────────────────────────────────────── │
│ [NEC CORRIDOR 8][FREIGHT 15][COMMUTER 8][LIVE 0]        DENSITY STD ║ ◂ ▸                 [OPEN FULL PAGE ›]  ×  │
│ ⌜t⌝ ⌜t⌝ ⌜t⌝ ⌜t⌝ ⌜t⌝ ⌜t⌝ ⌜t⌝                                         ║ identity + 32 px hero                        │
│ ⌜t⌝ ⌜t⌝ ⌜t⌝ ⌜t⌝ ⌜t⌝ ⌜t⌝ ⌜t⌝                                         ║ audio row                                    │
│ ⌜t⌝ …                                                               ║ ▾ TODAY (expanded: day strip, 64 px plot)   │
│                                                                     ║ log, one-line rows, transcript ≤ 72 ch      │
│ status 28                                                                                                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
Bigger windows add history to the waterfall, rows to the tile area and lines to the log. They never make type bigger.

### 2.6 Narrow and short desktop windows
- Live Ops switches to the **handset layout** (§9) when the window is **under 768 px wide or under 560 px tall**
  **[PICKED]** (alternative: width only, which would show a squashed desktop on a landscape phone, 844 × 390).
  The test is Live Ops' own; `viewport.phone` stays as it is for the other screens.
- Between 768 and 1023 px wide the desktop layout holds. The divider limits (§4) keep both halves usable, and the
  pane falls back to two-line rows.

---

## 3. The front wall in a box that changes size

The wall is three plots stacked in one bezel. When the horizontal divider moves, **the ruler keeps its height, the
spectrum takes its clamp, and the waterfall takes the rest.** When the window gets wider, all three stretch: the AAR
band always spans the full plot width, edge pixel to edge pixel (P8: frequency rises left to right).

### 3.1 Spectrum trace
- Height `clamp(48, 25% of (wall − ruler), 144)`. Over 144 px a trace is a lot of ink for a single line.
- The vertical scale is fixed (`REF −10 dBFS · 10 dB/div`, 6 divisions). A taller box gives taller divisions, never
  a different scale. The scale label stays at the bottom right.
- Under 64 px tall, drop the minor ticks on the centre axis (they turn into a smear).

### 3.2 Waterfall
- **Constant time density, not a stretched window** **[PICKED]** (alternative: today's 30 s stretched to any
  height, which makes fat, smeared rows on a tall box). Each 500 ms row is **3 CSS px**, so 6 px per second.
  A taller box shows more history: 112 px = 18 s, 196 px = 32 s, 292 px = 48 s, 600 px = 100 s. That is honest
  (P3): more room, more data.
- The model keeps enough rows for the tallest box it could have: capacity = ceil(window height ÷ 3), re-asked from
  the backfill when the box grows past it.
- The time labels on the left (`10 S`, `20 S` …) go every 10 s while under 60 s are visible, every 30 s above that.
- Row 0 is always the newest, at the top (P8).

### 3.3 Ruler
- Fixed height, set by E-2. Label density is E-2's problem and its brief says how it must behave at every width.

### 3.4 Redraw rules
- Each plot box has one `ResizeObserver`. It rounds to whole CSS px and sets the canvas backing store to
  `css px × devicePixelRatio`. **This is the only measurement allowed on Live Ops** (see §8).
- **While a divider is being dragged**, the spectrum and ruler redraw every frame; the waterfall canvas is
  CSS-stretched and redrawn once, on release. A full waterfall redraw at 2560 wide every frame is wasted work on a
  2020 laptop (brief §10.8).
- Window resize: redraw on the next animation frame after the size settles. History is never cleared by a resize.

---

## 4. The dividers

Both dividers live **inside gaps that already exist** (the 16 px panel gap and the 24 px column gutter), so they cost
no space and the idle screen looks exactly as it does without them.

### 4.1 Look
| State | Hairline | Grip | Cursor |
|---|---|---|---|
| Rest | 1 px `grid`, centred in the gap, running the full length | three 4 px ticks, 1 px `line-faint`, 4 px apart, perpendicular to the hairline, centred on its length (an M2 minor-tick group: it reads as a handle and as a scale mark) | default |
| Hover (`t-micro`) | `line-faint` | `line` | `row-resize` / `col-resize` |
| Dragging | `line` | `line` | the same, set on `<body>` so it holds when the pointer outruns the gap; `user-select: none` while dragging |
| Keyboard focus | as hover, plus the 1.5 px rounded focus ring around the whole gap (brief §10.4) | | |
| At a limit while dragging | the hairline turns `dash-threshold` (2/3) for as long as the pointer pushes past the limit | | `not-allowed` is **not** used |

- **Readout while dragging** (P5: the gesture shows what it measures): a small plate (`bg-void`, mono `--fs-11`
  `ink-2`) beside the grip:
  - horizontal: `WALL 317 · WATERFALL 32 S`;
  - vertical: `PANE 742 · 5 COLUMNS`.
  It appears on pointer-down and goes 120 ms after release. Keyboard steps show it for 1 s.
- No orange, no glow, no fill. A divider is chrome.

### 4.2 Hit area
- Horizontal: 24 px tall. That is the 16 px gap plus 4 px into the wall bezel and 4 px into the tabs row, pointer
  only, with no visual change to them.
- Vertical: the 24 px gutter.
- Both meet the 24 × 24 px minimum (brief §10.2). Plot clicks (listen, decision 54) start 4 px inside the bezel, so
  they never collide with the divider.

### 4.3 Limits and defaults
| | Default | Min | Max |
|---|---|---|---|
| Wall height (H divider) | 36% of (wall + divider + lower) | spectrum 48 + ruler + waterfall 64 (≈ 168) | everything but 240 px for the lower half |
| Pane width (V divider) | clamp(400, 40% of content width, 880) | 360 | content width − 24 − 216 (one tile column plus the scrollbar) |

- **Double-click** on a divider resets it to the default. So does `Enter` on a focused divider.
- **Density chip** (replaces `8 TILES · STANDARD`, right end of the tabs row): `DENSITY STD` / `DENSITY CMP`, a
  bracketed toggle, remembered per device **[PICKED]** (alternative: automatic only). Under it, an automatic rule
  still applies: when the tile area is shorter than two standard rows (232 px), tiles render compact whatever the
  chip says, and the chip shows `CMP` in `ink-3` with `AUTO`.

### 4.4 Keyboard
- Each divider is `role="separator"`, `tabindex="0"`, `aria-orientation`, `aria-valuemin/max/now` in px and an
  `aria-valuetext` that matches the readout ("Wall 317 pixels, waterfall 32 seconds").
- Arrows move 8 px; Shift + arrow moves 64 px; `Home` and `End` go to the min and max; `Enter` resets.
- `Esc` during a pointer drag cancels it, back to where the drag started.
- Drag is never the only way (WCAG 2.5.7): the keyboard does all of it.

### 4.5 What persists
One localStorage key per browser, `sdrviz.liveops.v1`, wrapped in try/catch (private windows):
`{ wall: 0.36, pane: 0.40, density: "std", strip: false }`.
- The sizes are stored as **fractions**, not px, so a laptop that docks to a big monitor keeps its proportions.
  They are clamped to §4.3 every time they are applied (load, resize).
- `strip` is the pane's day-strip lid (§5.4). The log's `CONTINUOUS` keeps its own existing key.
- Writes happen on pointer-up and on keyboard steps, not on every pointer move.
- "Per device" here means per browser. That is enough. A server-side layout per user does not exist (decision 40).

---

## 5. The pane

### 5.1 Anatomy (top to bottom)
The pane is a flex column, `container-type: inline-size`: a fixed **bar**, then **one scroll box** holding everything
else. Inside the scroll box exactly two things pin, both at **token** offsets (§5.8):

| Part | Height | Pinned? | Content |
|---|---|---|---|
| **Bar** | 32 (44 phone) | outside the scroll box | left: `◂ ▸` (previous and next frequency in bank order, §7.2); right: `OPEN FULL PAGE ›` as a bracketed chip, a real `<a href="/frequency/:id">` so Cmd-click opens a tab, then `×` (clear selection, same as `Esc`). Phone: §9.2. |
| **Identity line** | `--fq-line-h`: 48 (44 phone) | **sticky, top 0** | one line: AAR (mono `--fs-24`, `--fs-18` phone), name (Rajdhani, same size), ember underline under the name; at the right the hero: `LAST HEARD` label + age, or the M6 vertical glyph + `KEYED` + the timer in `state-tx`. Hero number **32 px** in the desktop pane, **24 px** on the phone. `NOT IN THIS BANK` tag after the name when it applies. |
| **Identity detail** | ≈ 44 | scrolls away | line 2: MHz · railroad · use (+ line at ≥ 560 px of pane); at its right `••• 19:49:32` (idle) or `VIA BWI-03` (keyed). Line 3: `HEARD BY LND-02 · BWI-03` with M25 pips when coverage is partial. |
| **Audio** | 32 (44 phone) | scrolls away | §5.3 |
| **Day-strip lid** | 32 closed | scrolls away | §5.4 |
| **Log head** | 40 | **sticky, top `--fq-line-h`** | `LogHead.svelte` (F-0): `TRANSMISSIONS · 142 TODAY`, the bucket-jump chip, `CONTINUOUS`. |
| **Log** | the rest | scrolls | `Log.svelte` and `LogRow.svelte`. |

`Identity.svelte` gets a `pane` variant that renders exactly this split: the identity line as one element, the
detail as a second (no crumb, no lid).

**Container width, not window width.** Every switch in the pane (one-line or two-line rows, the line-of-route field,
pitch of the day strip) reads the pane's inline size through container queries, not `@media`. The same component
must look right at 360 px on a desktop and 390 px on a phone. This is the single most important engineering rule in
this document.

### 5.2 States
| State | What the pane shows |
|---|---|
| **None selected** | The watermark (§5.5). No bar, no head. |
| **Selected, idle** | All of §5.1. Hero `LAST HEARD 24M`. Log newest first. |
| **Selected, keyed** | Hero turns to the M6 vertical glyph, `KEYED`, the timer in `state-tx` at 32 px, `VIA BWI-03`. The ON AIR row tops the log in `wash-tx-surface` (frequency-direction §6.4). The lid's current bucket is orange (M strip when closed, L strip when open). The tile keys at the same instant (P6). Nothing else in the pane is orange. |
| **Recording not started** (banked, no recordings yet) | Identity and the live hero work (they come from the live store). The lid reads `▸ TODAY · NO RECORDINGS YET`. The log shows its existing empty state: `NOTHING RECORDED ON 160.290 YET` and the sentence. |
| **Not in any bank** (removed from its bank while selected, or a `?select=` to an unbanked id) | Lid: `NOT RECORDED · NOT IN ANY BANK`. The audio row is replaced by one line, `NOT DECODED · ONLY BANK CHANNELS ARE DECODED` with, for admins, `ADD IT IN FEEDS & BANKS ›` (decision 53: no bank, no audio, no recording). The log shows its not-in-bank sentence and any old recordings. |
| **In a bank, not the active one** (after a bank switch, §7.3) | A `NOT IN THIS BANK` micro-tag (`--fs-11` label `ink-3`) after the name. The audio row's status reads `NOT AUDIBLE · NOT IN THE ACTIVE BANK · SOLO TO HEAR` (brief §8.8: solo is global). Everything else is normal. |
| **Unknown id** | One bracketed plate inside the pane: `UNKNOWN FREQUENCY · <id>` and `CLEAR`. |
| **Loading** | Identity fills at once from the live snapshot (the channel is known); values from the API show `— — —` until they arrive. No spinner. |
| **Link down** | The hero age keeps counting from the drop (brief §8.6); the log stops refreshing. The shell chip says `RECONNECTING`. |

### 5.3 The audio row (was the inspector's AUDIO section)
One 32 px row: `AUDIO` label, the volume slider (as today: 1 px rail, 8 × 14 thumb), the value in mono, the level
meter **only while keyed** (squelch closed means no bar, M16), then the **M21 levers** `M S R`, the same component
the tiles use. Its status text (`OUTPUT GAIN 80`, `NOT AUDIBLE · …`, `AUDIO STARTS ON YOUR FIRST CLICK`) sits under
the row in `--fs-11` `ink-3` only when it says something other than the plain gain. At a pane width under 480 px the
slider shortens to 120 px. On the phone it is a 44 px row with 44 px levers.

### 5.4 The day-strip lid (collapsed by default)
- **Closed (default)**: one 32 px row: `▸ TODAY`, then the **M-size strip** (`MiniStrip`, 192 × 24, now line,
  orange current bucket while keyed), then `FS 5M · 142 TX · LAST 24M`. A glance, not a chart. The whole row is the
  toggle (a `<button aria-expanded>`), so in this place `MiniStrip` renders as a plain element, not a link (give it
  an optional `href`).
- **Open**: `▾ TODAY` and the **L-size `DayStrip`** at pane width, with a **64 px plot** (not 96; the pane is a
  column, not a page), its ruler, `FS`, now line, scrub readout, `‹ ›` day steppers, and click-to-jump into the
  pane's log. It also carries the `TODAY · 7 DAYS` range switch, so the week grid shows **in the same slot**,
  exactly as on the phone page (`range` prop, frequency-direction §2.2). Bucket pitch follows the pane:
  `floor((pane − 48) / 96)`, so 486 px gives 4, 742 px gives 7.
- Open or closed is remembered per device (`strip` in §4.5), not per frequency.
- No ABOUT, notes or sources in the pane. They are one click away on the full page.

### 5.5 The watermark (nothing selected)
Centred in the pane box, both ways:
- an **M4 registration mark**, 48 px, 1 px `line-faint`: an empty reticle, nothing locked. It is the only ornament,
  and it says what the pane does: it targets a selection;
- 16 px below it, `NO FREQUENCY SELECTED` in Barlow Semi Condensed 600 `--fs-15`, tracking `--track-label`, `ink-3`;
- 8 px below that, `Select a tile, or press 1–9.` in Barlow `--fs-13` `ink-3`. On a touch device:
  `Tap a channel.`
- The pane's corner brackets (M1) stay, so the column still reads as an instrument bay, empty.
- Nothing moves in it. No pulse, no sweep.

### 5.6 Motion in the pane
- **Selection change: instant swap**, no build-on (brief §7.4: in-screen switches never replay it). Changed digits
  click in with `step` over `t-tick`; the first 8 log rows fade in at a 20 ms stagger, capped at 160 ms.
- Expanding the lid: the head grows in one 160 ms `ease-in-out` height change; the strip writes itself left to right
  in 250 ms (`linear`), the page's build reduced. Reduced motion: instant.
- Key-up, release, ember, transcript reveal, playhead: exactly as on the page (frequency-direction §10).
- Idle done-criterion: with nothing keyed and nothing playing, the pane changes only when the hero age rolls its unit.

### 5.8 What stays pinned (the pane, and the frequency page on a phone)
**Decision: pin two lines, 88 px (84 on a phone). Everything else scrolls away with the log, in the document's own
scroll, with no JavaScript** **[PICKED]** (alternatives: (a) collapse the block to a one-line header by a scroll
listener, which swaps heights under the reader's thumb, fights scroll anchoring and needs a measured threshold, the
F-0 failure again; (b) keep pinning the whole block, which leaves a 390 × 844 phone about 330 px of log, and none
with ABOUT open).

- **Pinned:** the identity line (who, and the live datum: `LAST HEARD 24M` or the orange timer) and the log head
  (count, jump chip, `CONTINUOUS`). Those are the two things a reader needs while scrolling a log: which channel
  this is and whether it is talking now, and the controls of the list.
- **Not pinned:** identity detail, HEARD BY, ABOUT (page) or audio (pane), the day strip or week grid. They are at the
  top when the reader arrives, and they leave as soon as the reader goes into the log. Scrolling back to the top
  brings them back. That *is* the "collapse once the log scrolls", done by the scroll itself.
- **The numbers:** at 390 × 844 the frequency page pins 44 (header) + 44 + 40 = 128 px, which leaves about 690 px of
  log once scrolled, roughly 12 rows instead of 5. ABOUT open costs nothing once scrolled past.
- **Offsets are tokens.** `--fq-line-h` is a constant (48 px, 44 px on a phone), and the log head sticks at
  `top: var(--fq-line-h)` inside the pane's scroll box, or at `calc(var(--header-h) + var(--fq-line-h))` on the
  page. No height is measured.
- **The pinned line has a `bg-void` fill and a 1 px `grid` bottom rule**; the log head likewise, so rows never show
  through.
- **Rows scrolled into view** (`J/K`, `?at=`, bucket jump) use `scroll-margin-top` from the same tokens
  (`--fq-line-h` + 40 px log head + 8, plus `--header-h` on the page). Replace `LogRow`'s current
  `var(--fq-top) + 52px`.
- **The `▲ N NEW` chip** sits just under the log head: `position: sticky`, top = the log head's token offset + 48,
  inside the log. Constant, not measured.
- **The frequency page on a phone gets the same split** (this is the lead's 425 px report): under 900 px wide, the
  page's `.fq__top` stops being sticky; the identity line pins at `--header-h`, `LogHead` at
  `--header-h + --fq-line-h`. The phone hero steps from 32 to 24 px to fit the one line; `LAST HEARD` and the clock
  time move to line 2. The desktop page (900 px and wider, 800 px and taller) keeps its current pinned block and right
  rail; it is not part of this change.

### 5.9 Playback in the pane
- `player` stays the app-wide singleton. One clip at a time. Live audio ducks −18 dB while a clip plays.
- **Changing the selection stops playback** (and continuous play) **[PICKED]** (alternative: keep playing a clip
  whose row is no longer on screen, which leaves no control to stop it but `Esc`).
- A bank switch does not change the selection, so it does not stop playback.
- The pane owns the frequency page's keys while focus is inside it: `J/K`, `Space/Enter`, `← →` seek, `C`, `T`.
  Outside the pane they are not bound (the tile grid uses arrows, §7.1). `Esc` stops playback first, then clears the
  bucket jump, then clears the selection: one layer per press.

---

## 6. Reuse from the frequency page

| Part | File | In the pane | On the phone pane |
|---|---|---|---|
| Identity | `Identity.svelte` | new `variant="pane"`: the pinned identity line + the detail that scrolls away (§5.8); no crumb, no lid; hero 32 px | same split; line 2 without `line`; hero 24 px (the phone page moves to the same split, §5.8) |
| Day strip **L** | `DayStrip.svelte` | open lid only; plot 64 px, FS gutter 48 px; range switch included | plot 56 px (its phone size), gutter 0 |
| Day strip **M** | `MiniStrip.svelte` | closed lid; 192 × 24; `href` optional | same |
| Day strip **S** | not built | not used. M fits the lid row at 360 px and up. S stays "define only". | not used |
| Week grid | `WeekGrid.svelte` | behind the range switch in the open lid; cell pitch from the container (13 at < 480 px, 16 above) | 12 / 13, as the page |
| Log head | `LogHead.svelte` (F-0) | as is, in the pane head | as is |
| Log and rows | `Log.svelte`, `LogRow.svelte` | as is; **one-line rows at ≥ 560 px of pane, two-line below**, by container query | two-line, 44 px tap rows |
| Player | `player.svelte.ts` | as is | as is |
| Stores | `LogStore`, `ActivityStore` | created per selected id; destroyed on change | same |
| Refresh rules | in `frequency/Screen.svelte` today | **extract** the key-up refetch, the pending poll and the minute refresh into one small module the page and the pane both call. No copy-paste. | same |

The pane is one component, `FrequencyPane.svelte` (F-2), with no knowledge of whether it is in a column or full
screen. The full page keeps its own layout and uses the same parts.

The full page's crumb changes with F-1: `FREQUENCIES / K TOWER` becomes **`LIVE OPS / K TOWER`**, linking to
`/live?select=<id>`, so the trip out and back lands on the same pane.

---

## 7. Selection rules

### 7.1 Ways to select
| Input | Result |
|---|---|
| Click or tap a tile (not on a lever) | selects it into the pane and focuses it. Clicking the selected tile again does nothing (no toggle-off: a mis-click must not empty the pane). |
| `1`–`9`, `0`, two digits within 800 ms | **selects** that tile (today they only focus it) **[PICKED]** (alternative: focus only; a digit is deliberate enough to load the pane) |
| Arrow keys in the tile grid | move focus only, by the live column count. `Enter` or `Space` selects the focused tile. `M S R` work its levers, `F` opens its full page (unchanged). |
| `[` and `]` anywhere on Live Ops (not in inputs) | select the previous / next frequency in bank order, wrapping; the grid scrolls it into view (`block: "nearest"`). The pane bar's `◂ ▸` do the same. This is "scroll through the bank's frequencies" without touching the mouse. |
| Hero strip keyed name, or an item in its `+2` list | selects that frequency |
| Double-click a tile | opens its full page (unchanged) |
| `Esc` (nothing playing, no bucket jump, no menu open) or the pane's `×` | clears the selection: watermark |
| Click on empty space | **nothing** (today it closed the inspector; the pane is not an overlay) |
| Click on the spectrum or waterfall | unchanged: admin click-to-listen (decision 54). It does not select. |

- The selection lives in the URL, `?select=<frequency id>` (drop `?inspect=` for channels; feeds keep it). The full
  page link and Back both preserve it.
- **On load with no `?select=`, restore the last selection on this device** **[PICKED]** (alternative: always open
  on the watermark). A screen left open for hours comes back the way it was left.
- The selected tile wears the outer selection brackets (brief §3.5) as today. The spectrograph marks the selected
  channel's label too (E-2 asks for it).
- **No auto-follow.** A key-up never moves the selection (P1: no motion the observer did not ask for). The hero
  strip already names the talker and is one click from selecting it.

### 7.2 Bank order
Prev/next and digits use the bank's tile order (`views[bank].tile_ids`), the order shown. Tiles never re-sort.

### 7.3 Bank switch
- **The selection is kept** **[PICKED]** (alternative: clear to the watermark). The pane is about a frequency, not a
  bank: a clip keeps playing and the log keeps its place while the owner looks at another bank.
- If the selected frequency is not in the new bank, the pane shows `NOT IN THIS BANK` (§5.2) and no tile wears
  brackets. Selecting a tile in the new bank replaces it.
- The tile area scrolls to the top on a bank switch, unless the selected tile is in the new bank, in which case it
  scrolls that tile into view.

---

## 8. The tile area: reflow and scroll

- Columns: `grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))`, gap 8 px. **Tiles stretch to fill the
  row** **[PICKED]** (alternative: fixed 200 px tiles with a ragged gap at the right). The flush right edge sits on
  the divider, and the tile internals already anchor left and right, so nothing inside moves but the free space
  between the readouts. Heights stay 112 (standard) and 56 (compact). Strip (384 × 28) is retired on desktop.
- Arrow-key navigation reads the live column count from the grid, not from `geometry.tileCols`.
- **The tile area scrolls vertically, inside its own box.** Thin scrollbar, `line-faint` thumb, always laid out
  (not overlay) when the content overflows, so the overflow is visible at rest.
- The tabs row does not scroll with the tiles.
- **Never auto-scroll on a key-up.** Instead, when a keyed tile is out of view, an edge chip pins to that edge of the
  tile area: `▲ CH54 KEYED` or `▼ CH54 KEYED` (vertical glyph, `state-tx` text, `bg-void` plate). Click scrolls the
  tile into view. With several, `▼ 2 KEYED`. It goes at release.
- Selection by `[ ]`, digits or the hero scrolls the tile into view (`nearest`).
- Empty bank and empty live bank: today's `EmptyState` plates, centred in the tile area.
- Re-pack on bank change: the 400 ms `ease-in-out` (brief §5.1), unchanged.

### 8.1 The stuck-sticky lesson
F-0 happened because a sticky bar took its `top` from a **measured** height that went stale. On Live Ops:
- **The screen itself has no sticky.** It is a fixed-height grid, and every region that scrolls is its own
  `overflow: auto` box (tile area, pane scroll box, phone layers).
- **Sticky is allowed only at token offsets**: `0`, `--header-h`, `--fq-line-h`, and sums of those. That covers the
  pane's identity line and log head (§5.8) and the phone's tabs + hero-line block (§9.1).
- **No measured offsets.** No `bind:clientHeight` or `ResizeObserver` value may feed a `top`, `margin`, `height` or
  CSS variable that positions another element. The one exception is canvas pixel sizing (§3.4), which positions
  nothing. When F-2 lands, `--fq-top` should have no users left except the desktop page's right rail.
- A pinned element has a fixed height in CSS (it may not wrap to a second line). If its content can grow, it
  truncates or drops fields from the right, never grows.
- F-6 checks: open and close the lid, switch range, drag both dividers and resize the window, then confirm no
  element in the pane overlaps another (pairwise bounding-box script, as in C-3).

---

## 9. The phone (handset layout: under 768 px wide or under 560 px tall)

`/live` stops showing the plate. Route `phone: "page"`, inside `PageShell`. The phone home stays SPOT (C-3 #1); the
phone menu lists LIVE OPS as a real destination now, and the `WiderScreen` plate loses its Live Ops case.

### 9.1 Portrait list (390 × 844)
```
┌──────────────────────────────────────┐
│ SDRVIZ  LIVE OPS            20:13  ≡ │ 44 header
├──────────────────────────────────────┤ ┐
│ [NEC CORRIDOR 8][FREIGHT 15][COMM…   │ │ 44 bank tabs, scroll sideways inside this row only
│ LAST KEY-UP 12M · CH54   [SPECTRUM]  │ │ 44 hero line + the spectrum button
├──────────────────────────────────────┤ ┘ one sticky block, top: var(--header-h)
│ ⌜••• 1 WASH TERM      LAST 1H │M│S│R│ │ 64 tile row
│ ⌞2222  160.440                │ │ │ │ │
│ ⌜••• 2 K TOWER         24M    │M│S│R│ │
│ ⌞1212  160.290       MUTED    │ │ │ │ │
│ ┏▮ 7 AMTK NEC       00:07.4   │M│S│R┓ │ keyed: solid 2 px state-tx frame + 6% wash
│ ┗5454  160.920                │ │ │ │┛ │
│  …                                   │ document scroll
├──────────────────────────────────────┤
│ BANK NEC CORRIDOR · 8 CH          🔈 │ 28 status line + corner mute
└──────────────────────────────────────┘
```
- **The tile row** is the compact tile, styled as on desktop (same five layers, glyph, frames, washes, ember,
  selection brackets, `MUTED` / `SOLO` tags, coverage pips), stretched to the full width (16 px gutters), **64 px
  tall**:
  - row 1: glyph, index, label (`--fs-15`), and the status readout (`LAST 24M`, or the 24 px orange timer while
    keyed), right-aligned against the levers;
  - row 2: AAR (`--fs-18`) and MHz (`--fs-13`);
  - right: the three **M21 levers as 44 × 64 px cells**, letters at `--fs-13`, pips above the letters.
  - A tap on a lever toggles it and never selects. A tap anywhere else selects.
- Rows are one column in portrait, and `repeat(auto-fill, minmax(320px, 1fr))` in landscape (two columns at 844).
- **The hero line** replaces the 64 px hero strip: idle `LAST KEY-UP 12M · CH54` (age in mono `--fs-18`); keyed
  `▮ 5454 AMTK NEC 00:07.4` in `state-tx`, the timer at `--fs-18`. It is the phone's "who is talking". `+2` when more
  are keyed. A tap on the keyed name opens its pane. `PhoneOnAir` is not shown on `/live`.
- **`[SPECTRUM]`**: bracketed chip, 44 px tall, at the right of the hero line.
- The feed selector is not on the phone list. The spectrum view names its feed (§9.4).
- Floors per C-3: data 13 px, row primaries 15 px, targets 44 px, no horizontal page scroll at 360 and 390.

### 9.2 Tap → the pane, full screen
- A tap pushes a history entry and sets `?select=<id>`. The pane opens as a full-screen layer under the header
  (`position: fixed`, top `--header-h`, to the status line). The list stays mounted underneath, `inert`, so **its
  scroll position survives** the round trip.
- **Back**: the layer's bar starts with `‹ NEC CORRIDOR` (the bank's name, 44 px target). It calls
  `history.back()` when the layer pushed the entry, otherwise it clears `?select=`. The system back gesture and
  the browser Back do the same. A reload with `?select=` opens the layer directly; Back then goes to the list.
- The bar's right end: `OPEN FULL PAGE ›`. No `◂ ▸`, no `×` on the phone (Back is the close).
- Below the bar it is the same `FrequencyPane` (§5) at 390 px, in one scroll box: the 44 px identity line with the
  24 px hero (pinned), the detail, the 44 px audio row, the lid (closed by default), the log head (pinned under the
  identity line), then the log. About 650 px of log once the reader scrolls in (§5.8). Two-line log rows, 44 px play
  targets.
- While the layer is open, the document does not scroll underneath (`overflow: hidden` on the root).
- Opening is instant; the layer has no slide (a slide is motion that carries no data).

### 9.3 The spectrum view (`[SPECTRUM]`, view only)
- Pushes a history entry, `?view=spectrum`. A full-screen layer like the pane. Back closes it.
- **View only:** no click-to-listen, no feed switching, no levers. A touch-and-hold on a plot shows the M11 cursor
  readout (`CH54 · 160.920 MHz · −71.4 dBFS`) while the finger is down, and nothing else.
- It uses the same `SpectrumTrace`, ruler and `Waterfall` components, sized to the layer by the same rules as §3.
- **Portrait (390 × 844):**
  ```
  ┌──────────────────────────────────────┐
  │ ‹ LIVE OPS   FEED LND-02   20:13:25  │ 44 bar (the PageShell header hides on this layer)
  │ ┌──────────────────────────────────┐ │
  │ │ spectrum 120                     │ │
  │ │ ruler (E-2 phone form)           │ │
  │ │ waterfall, the rest ≈ 560 px     │ │ ≈ 93 s at 6 px/s
  │ │                                  │ │
  │ └──────────────────────────────────┘ │
  │ REF −10 dBFS · 10 dB/div      🔈     │ 28
  └──────────────────────────────────────┘
  ```
  Plot width 374 (8 px margins: the bezel is the frame). 91 channels at about 4 px each. Only bank channels are
  labelled, per E-2.
- **Landscape (844 × 390):** the bar is 32 px; no status line (the corner mute floats at the bottom right). Spectrum
  72, ruler E-2's, waterfall the rest (about 230 px, 38 s). Respect `env(safe-area-inset-left/right)` for the notch.
- The layer follows the device's rotation. No orientation lock (iOS does not allow it outside fullscreen).
- The keyed channel's TX slot outline and wash show as on desktop (P6). Selected channel marked per E-2.
- No pinch zoom this sprint (LATER).

### 9.4 Navigation summary
| From | Action | To | Back returns to |
|---|---|---|---|
| list | tap a row | pane layer | list, same scroll |
| list | `SPECTRUM` | spectrum layer | list |
| pane layer | `OPEN FULL PAGE ›` | `/frequency/:id` | pane layer |
| full page | crumb `LIVE OPS / K TOWER` | `/live?select=id` (pane layer) | full page |
| phone menu | `LIVE OPS` | list | previous screen |

---

## 10. Colour, type and motion rules (only what is new)

- Orange only for a keyed channel: tile, hero, pane hero, ON AIR row, current bucket, edge chip, TX slot. A
  screenshot with nothing keyed has no orange.
- Dividers, watermark, density chip and readouts: `grid`, `line-faint`, `line`, `ink-2`, `ink-3` only.
- One 48 px number on the desktop screen (the hero strip). The pane's hero is 32. The phone has none over 24.
- The idle done-criterion of brief §7.5 still holds, with the pane added: sweep, waterfall, smoothed spectrum, the
  header clock, and age readouts rolling their units. Nothing else moves.
- Grayscale test additions: the selected tile (outer brackets) vs the focused tile (rounded ring) vs a focused
  divider (rounded ring around the gap); the watermark is readable; a keyed tile in the phone list reads by glyph and
  frame.

---

## 11. Build order (cut from the bottom; each step ships alone)

1. **Fluid desktop frame (F-3 core).** Route layout `"fluid"` for `/live`; AppShell at 1:1; the §2.1 grid at the §2.2
   defaults (no dragging yet); plots sized by ResizeObserver with the §3 rules (constant-density waterfall);
   transcript log and `geometry.ts` boxes removed; tile grid `auto-fill`, scrolling; the pane column shows the
   watermark. Done: works from 1024 to 2560 wide, no page scroll, no horizontal scroll.
2. **The pane (F-2).** `FrequencyPane` with the bar, `Identity` pane variant, the audio row, `LogHead`, `Log`,
   container queries, the §5.8 pinning (identity line + log head at token offsets) and the same split on the phone
   frequency page, the shared refresh module; selection by tile click, digits, `Esc`, `?select=` and the
   restored last selection; `ChannelInspector` deleted; `FeedInspector` docked over the pane. **Steps 1 and 2 alone
   meet decision 61.**
3. **The dividers.** Drag with pointer capture, limits, `dash-threshold` at the limit, double-click and `Enter`
   reset, keyboard, `sdrviz.liveops.v1`. Done: decision 62.
4. **Phone list and pane (F-4 core).** Handset test (§2.6), the sticky tabs + hero line block, 64 px tile rows with
   44 px levers, the full-screen pane layer with Back and preserved scroll. Done: decision 63 minus the spectrum.
5. **The day-strip lid.** Closed M strip, open L strip at 64 px with the range switch and week grid, remembered.
6. **Phone spectrum view.** Portrait and landscape layers, view only, touch-and-hold readout.
7. **Polish.** `[ ]` keys and `◂ ▸`; hero keyed name selects; keyed edge chips in the tile area; the density chip;
   the divider readout plate; the waterfall's 10 s / 30 s labels; the full page's `LIVE OPS /` crumb (if F-1 has
   not done it).

---

## 12. What "done" looks like for F-6

- Screens at **1280 × 800, 1920 × 1080, 2560 × 1440**, each: watermark; K TOWER selected idle; a keyed selected
  channel; the lid open; a divider mid-drag with its readout. Plus one at 1024 × 768.
- Phone at **390 × 844**: list idle, list with a keyed row, pane layer (lid closed and open), spectrum portrait;
  **844 × 390**: list and spectrum landscape. No horizontal scroll; the C-3 floors met; every target 44 px.
- Divider sizes survive a reload and a window resize, and clamp at both ends; double-click resets.
- The §8.1 overlap script passes after lid, range, dividers and resize.
- The selected frequency survives a bank switch, a reload and a round trip to the full page.
- Pinning (§5.8): at 390 × 844, on the frequency page and in the phone pane, after scrolling into the log the pinned
  stack is the header + identity line + log head (128 px on the page) and nothing else; with ABOUT open, the same.
  In the desktop pane at 1280 × 800 with the lid open, scrolling the log leaves the identity line and log head only.
- Idle for five minutes with K TOWER selected: only the §10 elements change.
- The grayscale test of §10 passes.

## LATER
- RECEPTIONS (per-feed SNR, RSSI, distance for a transmission) on the full page.
- A previous/next control in the phone pane.
- Pinch zoom on the phone spectrum's frequency axis.
- The bottom schematic (old decision 28's band): if the owner asks for it, it becomes a third region under the lower
  half with its own horizontal divider, not a reserved gap.
- Feeds & Banks, Settings and the Map go fluid with the same divider component (decision 62).

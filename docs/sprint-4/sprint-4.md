# Sprint 4: Live Ops and the frequency pane, fluid everywhere

Started 2026-11-19. Owner decisions 61-64 in docs/decisions.md.

Goal: Live Ops becomes the one place to listen, read and replay. The all-channel transcript pane is replaced by
the selected frequency's pane; the `/frequency` index goes; Live Ops is a fluid layout on every device with
draggable dividers, and works on a phone.

Ground rules: never touch ports 8100/5173/8130/8150/5190/5191; pythonic/simple; small tested steps; agents per role
(GMUNK on Opus, designer and engineers on Sonnet). Each finished block is tested in a clean worktree, pushed,
deployed and checked on the live site (decision 60); a block that breaks production is reverted.

## E. Design (GMUNK first)

| ID | Ticket | Done when |
|---|---|---|
| E-1 | **Direction: fluid Live Ops.** Desktop: hero, spectrum + waterfall on top; horizontal divider; lower half = bank tabs + scrolling tile grid, vertical divider, frequency pane. Divider sizes remembered per device, double-click resets, keyboard operable, min/max sizes. Pane: watermark "NO FREQUENCY SELECTED"; selected = identity + live/last-heard hero, OPEN FULL PAGE button at the top, collapsible day strip (collapsed by default), that frequency's transmissions with transcript and play. No banks section (banks are managed in Feeds & Banks). Phone: portrait default, bank tabs over a scrolling list of the same tiles with M/S/R; tap → same pane full screen with back; a SPECTRUM button → view-only spectrograph scaled for portrait and landscape. What happens to the hero, the AudioMixer and the old ChannelInspector. | docs/sprint-4/liveops-direction.md |
| E-2 | **Spectrograph axis labels.** Along with the channel number, show the frequency: a 45° tail per label, reading bottom-up left to right, each tail to the left of its frequency (owner's sketch). GMUNK iterates with the film-graphics designer (mockups, at least 2 rounds) and checks a frontend engineer's build. Must survive dense banks (channels 15 kHz apart), both stage widths, and the phone view. | Approved mockup + spec in docs/sprint-4/axis-labels.md |

## F. Build

| ID | Ticket | Done when |
|---|---|---|
| F-0 | **Stuck "TRANSMISSIONS · N TODAY" bar** on the frequency page (phone, sometimes desktop): its sticky `top` uses `--fq-top`, a measured height of the block above, which goes stale when that block changes height. Make the offset always right (measure with ResizeObserver, or restructure so no measured offset is needed). | Bar never sits mid-page: scripted scroll checks at 390 and 1920 after toggling TODAY/7 DAYS, ABOUT and day steps. |
| F-1 | **Remove the `/frequency` index** and its links (menu FREQUENCIES, plate link); `/frequency` redirects to `/live`. Keep `/frequency/:id`. | Tests; no dead links. |
| F-2 | **Shared frequency pane** component (reuses the detail page's Identity, DayStrip, Log, player): watermark state, OPEN FULL PAGE, collapsible day strip (default collapsed, remembered), no banks. Used by Live Ops desktop and full screen on the phone. | Vitest + screenshots. |
| F-3 | **Fluid Live Ops desktop**: drop the fixed stage for Live Ops; CSS grid with the two draggable dividers (per-device sizes in localStorage, double-click reset, arrow keys); spectrum/waterfall/ruler scale to their box; tile grid reflows its columns and scrolls; transcript pane removed; tile click selects into the pane. | Works from 1024 to 2560 wide; GMUNK review. |
| F-4 | **Phone Live Ops** (replaces the plate): bank tabs, scrolling tile list styled as desktop with M/S/R, tap → full-screen pane with back, SPECTRUM button → view-only spectrograph (portrait and landscape). | Screens at 390×844 and 844×390. |
| F-5 | **Axis labels** built per E-2. | GMUNK approves the build. |
| F-6 | **GMUNK review** of the whole of Live Ops (desktop + phone); fix the must-fix list. | APPROVE. |

Later: Feeds & Banks, Settings and the Map desktop go fluid too (owner likes "fluid everywhere").

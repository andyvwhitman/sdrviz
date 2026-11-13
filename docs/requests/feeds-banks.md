# Requests from `feeds-banks` (P4: `screens/feeds/`, `screens/system/`)

Shared-kit gaps, shared-file changes and backend gaps found while building Feeds & Banks, login and the
system states. Each entry says what this package did meanwhile, so nothing here blocks it.

## 1. Wiring the lead has to do

| # | Change | Why |
|---|---|---|
| W1 | `/live` must render `LinkGate`. Easiest: make `screens/live-ops/Screen.svelte` render `<LinkGate />` (`import { LinkGate } from "../system"`) instead of `<LiveOps />`. `LinkGate` imports `LiveOps` from `../live-ops` itself, so there is no cycle. | Without it the loading, connecting, reconnecting, no-link and empty-bank states never show. Preview-only harness: `screens/system/gate/Screen.svelte` is `<LinkGate />` and is not reached by the router (its glob is one level deep). |
| W2 | `link` store: a dev hook to force a status (`link.force(status, dropAgeS)`), read by `AppShell`. | `?force=reconnecting\|no-link` only changes the wall. The header still shows no RECONNECTING chip and the status line still shows the scenario text, where the mockup shows `RECONNECTING` and `NO LINK · BACKEND UNREACHABLE · SINCE 03:39:38 · RETRY 5 IN 1S`. |
| W3 | `?force=loading\|connecting` has the same gap: the mockup status line reads `WAITING FOR FIRST DATA · 6S` / `CONNECTING · BACKEND` and the chips read `FEEDS — — —`. | Same hook as W2. |
| W4 | `link` store: expose `socketOpen` (the socket is open, no snapshot yet). | `linkStatus()` has no "loading" outcome (first data wait), so `LinkGate` can only reach `loading` through `?force=`. |

## 2. Shared-kit gaps

| Missing | What this package did | Proposal |
|---|---|---|
| `FrequencyRuler`, `RegMark` in `$lib/components` (spec 13.2 lists both as kit) | `screens/system/{FrequencyRuler,RegMark}.svelte` + `ruler.ts` (ported from `HUD.svg.freqRuler`, with the off-bank label nudge of 13.4 #9). The live-ops package built its own pair too. | Move one implementation to `$lib` and delete the other two. `ruler.ts` has the nudge and the 4 px collision rule, unit-tested through the inspector. |
| `SpectrumTrace`, `Waterfall`, `LofarStrip` are screen-owned by Live Ops (spec 13.3), not kit | The feed inspector draws its own small SVG versions (`SpectrumPlot`, `LofarPlot`, `SampleRateChart`, `CoverageThumb`); the trace is live from `spectrum.watch(feedId)` frames, with the deterministic idle ripple until the first frame. | Fine as is: the plots are 570 px SVG figures, not the 1656 px canvases. |
| `Field` has no `autofocus` state (1.5 px underline, caret, no ring; spec 5.21) | `LoginPanel` writes the label/input/caret markup by hand with `data-focus="auto"`. | Add `autofocus` to `Field` (`data-focus="auto"`, the caret span, `bind:value`) and use it from `LoginPanel`. |
| `Select` (underline select, spec 5.22 mentions `unit: "▾"` only) | `feeds/SelectField.svelte`, a native `<select>` in the field vocabulary. | Add `Select.svelte` to the kit. |
| `KeyValue` has no `blank` tone and no gauge slot | Blank values go in as `children` with `.fb-blank`; agent telemetry rows with a `Gauge` are hand-written `.kv` markup in `FeedInspector`. | `KeyValue`: `blank?: boolean` (ink-3 value) and `gauge?: Snippet`. |
| `LevelMeter` is dB only (-60..0) | `feeds/Gauge.svelte` (M16 anatomy for CPU %, temperature, disk %, agent telemetry). | Generalise `LevelMeter` with `min/max/major/minor/thresholds` and delete `Gauge`. |

## 3. Backend gaps

| # | Gap | Effect here |
|---|---|---|
| B1 | `GET /feeds/{id}` returns the live view: `gain_db`, `ppm`, `noise_floor_dbfs` are the **measured** values (and `null` while the feed has no samples), but `PUT /feeds/{id}` takes the **configured** ones. The configured values are not readable. | The edit form falls back to defaults for `null`, and saving a healthy feed writes the measured gain (38.6) back as the set gain. Needs `gain_db_set`, `ppm_set`, `noise_floor_set` (or a `GET /feeds/{id}/config`). The `AS SET` column of the inspector has the same ambiguity. |
| B2 | (screen-side workaround now in `screens/feeds/liveFeed.svelte.ts`; shared reducer still preferred) `lofar_row` messages are not folded into `live.state.lofar_60m` (`reduce.ts` leaves them to "their own store"). | The inspector waterfall is the last snapshot and only advances when a snapshot is pushed. Live Ops has its own `lofarModel`; a shared reducer for both would fix it. |
| B3 | `FeedBase.driver_sim` exists but the feed view does not return it (only `sim`). | The `SIM` tag on the inspector's DRIVER row is inferred: a simulated feed with the `sdrviz-agent` driver (the mockup tags only that one). |
| B4 | `POST /auth/login` is rate limited (429 after a few attempts per minute). | The login panel shows `Password not accepted.` for a 429 too. A distinct line (`Too many attempts, try again in a minute`) would be kinder; the backend `detail` already says it, `LoginPanel` only maps 401 text. Left as is. |
| B5 | `GET /frequencies` returns `confidence: "medium"`, the mockup prints `MED`. | Mapped in `MembershipTable` (`medium` and `med` both read `MED`). |

## 4. Deviations from the mockups (deliberate)

- **Membership header:** `CHANNELS · BANK MEMBERSHIP` became `CHANNELS` plus two pressed chips, `BANK MEMBERSHIP` and `CATALOGUE`, so the frequency catalogue editor has a home in the banks column.
- **Bank editor:** extra TILE ORDER row (reorder with `‹ ›`, `REMOVE`, add from the catalogue), `ACTIVATE` and `CLOSE` in the head, `SAVE` disabled until something changes. It opens on Baltimore Harbor like the mockup.
- **Inspector head:** `EDIT` button (opens the feed form), and `RECEIVER PARAMETERS` opens the same form. `+ NEW FEED` under the feed cards.
- **1440 x 900:** the mockup's own 1440 frames overflow (inspector sections overlap the status line, the banks column is clipped at x 1440). The app reproduces them as drawn instead of inventing a reflow. Needs a designer ruling before a real 1440 layout is built.
- **Loading / connecting wall:** drawn by `ConnectingOverlay` (graticule, rulers, boxes, route names from `GET /geo/routes`), because Live Ops' own blank wall (`link={{ state: "loading" }}`) is a coarser approximation of the mockup. Live Ops still draws reconnecting, no-link and empty-bank.
- **Status line on Feeds:** with no open event the mockup's last-event readout (`LND-02 · RECOVERED · 14:06:58 EST`) is set through `shell.statusFallback` from the per-feed health events. With open events the shell prints every `status_line` entry, where the mockup prints only the newest unacknowledged one (fault frame: mockup `LND-02 · FAULT · LINK LOST · SINCE 14:06:00`, app adds `BAY-04 · STALE ...`). That rule lives in `statusFrom` (shared).

## 5. Revision 2 notes

- B1 ruling: the feed Edit form disables gain, ppm and noise floor until the backend exposes the set values.
- B6 `feed` deltas are sent only when state, label, acked or enabled change, so a silent feed's `last_sample_age_s` and `in_state_label` ("1M 12S") are frozen between deltas. The Feeds screen now counts the age on the sim clock itself (`silentAge`); `in_state_label` is still static. Preferred fix: a 1 Hz `feed` delta while a feed is faulted or stale, or `since_t` fields.
- Bank codes: the screen derives them from the bank name (NEC, FRE, COM, BAL) as the design does; the backend `short` (FRT, HBR) is ignored. Decide which is canonical.

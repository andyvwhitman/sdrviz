# sdrviz frontend

Svelte 5 (runes) + Vite + TypeScript (strict). Plan: `../docs/build-plan.md`. Design reference: `../design/spec.md`
(section 13 is the handoff) and `../design/mockups/`.

## Run

```sh
cd frontend
npm install            # once; screen packages must not run it concurrently
npm run dev            # http://localhost:5173, proxies /api and /ws to the backend on :8100
npm run check          # svelte-check, TS strict
npm test               # vitest (includes parity tests against design/mockups/_shared/hud.js)
npm run build          # dist/ (the backend mounts it as static files)
npm run gen:api        # regenerate src/lib/api/schema.gen.ts from the running backend's /openapi.json
```

Package preview servers use ports 5174 to 5178 (`npx vite --port 5174`); they share the same proxy.
`SDRVIZ_BACKEND=http://127.0.0.1:9999 npm run dev` points the proxy somewhere else.

## URL parameters

Read once at boot by `src/lib/params.ts`; they carry across nav links (`carryGlobals`).

| Param | Effect |
|---|---|
| `scenario=listening\|keyed\|fault\|fault-acked` | `POST /api/sim/jump` before the socket opens |
| `freeze=1` | with `scenario`: jump with `speed: 0`, so frames are deterministic |
| `speed=N` | sim clock multiplier |
| `size=1920\|1440` | stage size; default 1440 below 1700 px window width |
| `build=0` | skip build-on motion |
| `motion=full\|reduced` | overrides the OS preference |
| `gray=1` | grayscale filter on the stage |
| `force=<state>` | dev override for the system states (owned by the system screen) |

Mirrored to `<html data-size data-motion data-state data-gray>`; `<html data-ready="1">` is set after the first
`snapshot` (or, on `/login`, once the session is known).

## Layout

```
src/
  main.ts  App.svelte  routes.ts  app.css
  lib/
    styles/       hud.css ported verbatim and split by spec section (tokens.css is the single source of colour)
    hud/          pure TS: fmt, roles, band, ramp, speaker, tile (resolveTile, tileInputFrom), chips (headerChips,
                  statusFrom), dataBlock (geometry); tests incl. parity with the mockup hud.js
    api/client.ts typed fetch client, one function per REST row; 401 sends the user to /login
    ws/           protocol.ts (byte-exact frames), client.ts (reconnecting socket), link.ts (link states, backoff),
                  connection.ts (wires socket to stores)
    stores/       *.svelte.ts runes stores, see below
    components/   shell and kit components (see below)
    types/        live.ts (LiveState), api.ts
    router.svelte.ts  time.ts  params.ts  boot.ts  motion/buildOn.ts
  screens/<dir>/  one directory per package; put Screen.svelte here and the route picks it up
scripts/shot.sh   headless Chromium screenshot helper
```

### Adding a screen

Drop `src/screens/<dir>/Screen.svelte` (default export is the component). `routes.ts` finds it with
`import.meta.glob`; until then the route renders `StubScreen`. Dirs: `live-ops`, `history`, `stats`, `feeds`, `map`,
`system` (`/login` loads `system/Screen.svelte`). A screen renders into `<main class="hud-content">`; the shell
(header, nav, chips, status line, title block) is already around it. Tell the shell about the screen with the `shell` store:

```ts
import { shell } from "$lib/stores/shell.svelte";
shell.scope = ["BANK", bank.name.toUpperCase()];   // title block
shell.statusFallback = recordingReadout(live.state.system); // status line when no event is open (Stats, History, Map)
```

The shell resets both on every route change. Header chips and the status line are built from `live.state` by
`headerChips` / `statusFrom` (one set on every screen, `txChip` on all but Live Ops). Route navigation:
`router.go("/history?train=MARC%20410")`, `router.setQuery({ tx: "tx-039" })`, `router.query("tx")`.
`/kit` (dev builds only) shows the shared components on live data.

### Stores

| Store | What |
|---|---|
| `live` | `live.state: LiveState \| null`, updated in place by deltas (`stores/reduce.ts`); `live.on("keyup", fn)` for any message type |
| `link` | `link.status`: `connecting \| live \| reconnecting \| no-link`; `link.dropAgeS` (backoff 1/2/4/8 s, NO LINK after 15 s) |
| `session` | `authenticated`, `login(pw)`, `logout()` |
| `prefs` | REST-backed, optimistic: `value`, `muted`/`solo`/`record` sets, `toggle(list, channelId)`, `update(patch)` |
| `levels` | `levels.last[channelId]` (M16) and `levels.envelope(id)` (M15, read `levels.version` first) |
| `spectrum` | `watch(feedId)`, `latest`, `frames()` ring for the waterfall |
| `audio` | header chip state only; the Web Audio engine is not built yet |
| `ui` | motion mode and UTC toggle |
| `shell` | what a screen tells the shell |

### Components (`$lib/components`)

Shell: `Stage` (scale-to-fit), `AppShell`, `HeaderNav`, `HeaderChips`, `StatusLine`, `TitleBlock`, `StubScreen`.
Kit: `ChannelTile` (standard, compact, strip; all five state layers; `wave` snippet), `TileGrid`, `LevelMeter`,
`Sparkline`, `CoveragePips`, `Waveform`, `PositionGlyph` (+ `PositionGlyphSvg`), `Chip`, `LeverRow`, `BankLever`,
`TranscriptRow` (scenario row shape; `columns="log" | "history"`), `DataBlock` (HTML) and `DataBlockSvg`
(geometry from `$lib/hud/dataBlock`: `glyph`, `l2Class`, `from`, `v`, `flip`, knockout), `MilepostTag` (+ `MilepostTagSvg`),
`SimTag`, `DefectTag`, `Button`, `Tabs`, `Field`, `Checkbox`, `Toggle`, `KeyValue`, `EmptyState`.

Props mirror the `HUD.c.*` options. A channel tile is built like this:

```svelte
<ChannelTile identity={identityFrom(c, sharedFrequencySuffix(c, live.state.channels, feedName))}
             state={tileInputFrom(c, { feeds, displayedFeed, selectedId, muted: prefs.muted, solo: prefs.solo })}
             onselect={...} onlever={(k) => prefs.toggle(...)} />
```

Not built yet (kit package): `Inspector`, `HeroStrip`, `SystemAlarm`, `RegMark`, `PingRing`, `FrequencyRuler`, `TickRuler`,
`SpectrumTrace`, `Waterfall`, `LofarStrip`, `TranscriptLog`, `lib/motion/{keyup,reveal}.ts`, the audio engine. Fix
gaps in `lib/` through the lead (`docs/requests/<key>.md`), not locally.

## Wire contract assumptions (confirm against the backend)

- `snapshot` is accepted either flat (`{type, ...LiveState}`, which is what `app/live/protocol.py` `message()` produces) or as
  `{type, state}`.
- `keyup` carries the new transcript row as `row` (a `TxRow` in state `decoding`); without it a row is built from the message fields.
- `Prefs` is `{active_bank, displayed_feed, muted[], solo[], record[], volumes{}}` (`types/api.ts`); adjust when `schemas.py` is final.
- Binary frame layouts are byte for byte from build-plan 3.4 and covered by `ws/protocol.test.ts`.

## Screenshots

```sh
scripts/shot.sh "http://localhost:5173/live?scenario=keyed&freeze=1&build=0" ../build-screens/live-keyed.png 1920
SHOT_BUDGET_MS=20000 scripts/shot.sh <url> <out.png> 1440   # fast-forward timers (reconnect / NO LINK frames)
```

`--virtual-time-budget` works with the WebSocket (checked), so no `data-ready` polling is needed.
One difference from the mockup shell: the audio chip reads `AUDIO · CLICK TO ENABLE` until a user gesture, where the
mockups hard-code `AUDIO ON`.

# sdrviz — Stage 3 Build Plan

Author: frontend-engineer lead. Date: 2026-11-10. Inputs: `docs/decisions.md` (locked), `design/spec.md` (approved; §13 is the handoff), `design/mockups/`, `data/{sim,seed,geo}/`.

Goal of Stage 3: a semi-functional app. The Svelte front end is complete for all five screens plus the system states, driven by a fake FastAPI backend that replays the generated sim day. Every seam the real DSP and transcription workers will use later (REST resources, WebSocket event types, audio wire format, `SourceDriver` and `Transcriber` interfaces) is built to its final shape now. Replacing the fake means swapping the replay engine, not the contract.

---

## 1. Repo layout

```
sdrviz/
  Makefile                      install · dev · backend · frontend · test · check · shots
  .gitignore                    data/audio/ data/db/ build-screens/ node_modules/ dist/ .venv/ __pycache__/ .DS_Store
  backend/
    requirements.txt            runtime + test deps, pinned (pip, venv at backend/.venv)
    pyproject.toml              TOOL CONFIG ONLY: [tool.ruff], [tool.pytest.ini_options]; no [project]
    app/
      main.py                   create_app(), lifespan (db init, seed, start replay engine), static mount for frontend/dist
      config.py                 Settings (pydantic-settings, env prefix SDRVIZ_): password, secret, data_dir, sim start/speed, port
      auth.py                   password check, session dependency, ws auth helper
      db.py                     SQLModel engine + session dependency; first-run seed
      models.py                 SQLModel tables (see 3.1)
      schemas.py                pydantic API models (request/response); the REST contract
      routers/                  auth.py system.py sim.py prefs.py frequencies.py banks.py feeds.py
                                transmissions.py stats.py trains.py geo.py live.py (REST snapshot + /ws/live)
      services/                 stats.py (aggregates), search.py (FTS5), history.py (summary/hero)
      sim/                      clock.py  loader.py  live_state.py  engine.py  events.py  spectrum.py  scenarios.py
      live/                     hub.py (pubsub per client), protocol.py (message + binary frame encode), audio_stream.py
      audio/                    synth.py (say + ffmpeg), cache.py, build.py (CLI: python -m app.audio.build)
      interfaces.py             Protocols: SourceDriver, Transcriber, EventSource (the real-pipeline seams)
    tests/
  frontend/
    package.json  vite.config.ts  svelte.config.js  tsconfig.json  index.html
    scripts/shot.sh             headless-Chromium screenshot helper (see 8)
    src/
      main.ts  App.svelte  routes.ts
      lib/                      SCAFFOLD-OWNED (shared kit; see 5)
        api/  ws/  stores/  hud/  audio/  components/  motion/  styles/  types/  time.ts  router.ts
      screens/                  PACKAGE-OWNED, one directory each (see 6)
        live-ops/  history/  stats/  feeds/  map/  system/
  data/
    sim/ seed/ geo/             existing, read-only
    audio/                      generated clips (gitignored)
    db/sdrviz.sqlite            created on first run (gitignored)
  docs/  design/  tools/        existing
  build-screens/                scratch screenshots (gitignored)
```

Ports: backend 8100 (`uvicorn app.main:app --port 8100`); scaffold dev server 5173; package preview servers 5174 to 5178. Vite proxies `/api` and `/ws` to `http://127.0.0.1:8100`.

Python rules: type hints everywhere, `dataclass`/pydantic over dicts, `pathlib`, small modules, `ruff` (format + lint) clean, `pytest`. Frontend rules: Svelte 5 runes (`$state`, `$derived`, `$props`, `$effect` only where an effect is the honest tool), TS strict, no literal colours (tokens only), component props mirror the `HUD.c.*` options, pure logic in `$lib/hud/*.ts` with vitest tests.

`requirements.txt` (versions pinned by the backend scaffold at install time): `fastapi`, `uvicorn[standard]`, `sqlmodel`, `pydantic-settings`, `itsdangerous` (signed session cookie), `pytest`, `httpx`, `ruff`. No other runtime dependencies without a written reason. `frontend`: `svelte`, `vite`, `@sveltejs/vite-plugin-svelte`, `typescript`, `svelte-check`, `vitest`, `d3-geo` (+ types), `@fontsource/*` for Rajdhani, Barlow, Barlow Semi Condensed, JetBrains Mono (self-hosted, exactly the spec 2.1 weights), `openapi-typescript` (dev).

---

## 2. Cross-cutting conventions

**App URL parameters** (read once by the scaffold at boot, every screen inherits them; they mirror `hud.js` 8.2):

| Param | Effect |
|---|---|
| `scenario=listening\|keyed\|fault\|fault-acked` | Before opening the WebSocket the client calls `POST /api/sim/jump {scenario}`. The backend sets the clock to the scripted moment (03:40:00, 14:07:30, 14:06:22, 14:06:36) and applies the scenario's active bank. |
| `freeze=1` | Jump with `speed: 0`, so the clock does not advance. Screenshots are deterministic. Without it the day plays on from the jump point. |
| `speed=N` | Clock multiplier (default 1). Dev only. |
| `size=1920\|1440` | Force the stage size. Default: 1440 if viewport width < 1700, else 1920. |
| `build=0` | Skip build-on motion. |
| `motion=full\|reduced` | Overrides the OS preference. |
| `gray=1` | Grayscale test: CSS `filter: grayscale(1)` on the stage. |
| `force=<state>` | Dev override for system states (see `system`). Owned by the `system` code. |

Per-screen params are listed under each package (`select`, `inspect`, `tx`, `train`, `mode`, `range`, `route`).

**Stage.** `.hud-stage` is exactly 1920 x 1080 or 1440 x 900 (spec 4.1), scaled uniformly with `transform: scale()` to fit the window (letterboxed on `bg-void`). A window of exactly stage size renders 1:1, which is what screenshots use. Layout inside the stage is the binding geometry of spec 4.

**Time.** Sim records carry a day-relative `t_offset_s` plus an ISO-8601 `started_at`. All conversion goes through `$lib/time.ts` and `backend/app/sim/clock.py`. The real backend drops `t_offset_s`; only these two modules change. The recorded day is treated as cyclic (a 24 h window at 03:40 wraps to the previous evening), exactly as `tools/gen_sim.py` `window_rows` does.

**Errors.** REST: FastAPI default `{detail}`; 401 anywhere redirects the client to `/login`. WS: close code 4401 means unauthenticated, 4000 means server restart; the client reconnects with the spec 8.7 backoff (first data wait, backoff, cap, `no_link_after_s` from `scenarios/system.json`).

**Code ownership rule (spec 8.6 carried over).** A package edits only files it owns. A missing shared-kit behaviour goes into `docs/requests/<package-key>.md` (each package owns exactly one such file); the lead folds it into `$lib` and tells the package. Backend gaps go in the same file.

---

## 3. Backend design

### 3.1 Persistence (SQLite via SQLModel, `data/db/sdrviz.sqlite`)

Seeded automatically on first start from `data/seed/` and `data/sim/` (idempotent: skipped when tables are non-empty; `python -m app.db reset` re-seeds).

| Table | Source | Notes |
|---|---|---|
| `Frequency` | `seed/frequencies.json` | id, label, freq_mhz, aar_channel (derived, validated against `(f-160.110)/0.015`), railroad, use, line, mode, confidence, notes, sources (JSON) |
| `Bank`, `BankFrequency` | `sim/banks.json` | ordered membership, `home_feed`, `short` (gap 13.4.5: derive until the generator emits it) |
| `Feed` | `scenarios/*.feeds[]` + `health.json` | id, short, name, site, lat, lon, coverage_radius_km, driver (`rtl_tcp`\|`agent`\|`file`), host, port, center_mhz, sample_rate_msps, gain_db, ppm, enabled |
| `FeedEvent`, `FeedAck` | `health.json` events/acks | state history; ACK writes a row |
| `Transmission` | `sim/transmissions.json` (1265 rows) | id, t_offset_s, started_at, frequency_id, aar_channel, feed_id, speaker_role, speaker, duration_s, train_id, place_id, transcript, transcript_state, confidence, decode_latency_s, `words` (JSON), `receptions` (JSON), `detector` (JSON), source (`SEED`\|`SIM`), sim (bool); kerchunks in the same table with `kind="kerchunk"` |
| `TransmissionFts` | FTS5 virtual table over transcript + speaker + train_id | keyword search (`q=`); created with raw DDL, queried with `MATCH`, prefix search `term*` |
| `Prefs` | single row | active_bank, muted[], solo[], record[], volume{channel: 0..1}, displayed_feed |

Not in the DB (read from files, held in memory): `trains.json` (136 trains with stops), `routes.json`, `health.json` series, `data/geo/*.geojson`, `seed/places.json`, scenario JSON used for golden tests and jump metadata.

### 3.2 Replay engine

- `SimClock`: `sim_t = base_t + (monotonic() - anchor) * speed`, wraps at 86400. Default start is the current local time-of-day so the app is alive whenever you open it; `SDRVIZ_SIM_START=14:06:00` overrides. `jump(scenario | clock, speed)` re-anchors.
- `live_state.build(t) -> LiveState`: ports `tools/gen_sim.py` `snapshot()`, `coverage()`, `feed_view()`, `row_view()`, `Health.state()` into typed modules (port, do not import the generator). `LiveState` is the scenario JSON shape without `summary`, `generator`, `history`, `stats`, `map` (map is derived client-side from `feeds`, `trains`, `active_transmissions` plus `/api/geo`). **Golden test:** `build(t)` at the four scenario moments must equal `data/sim/scenarios/<name>.json` for every key the front end consumes (`header`, `status_line`, `faults`, `degraded`, `feeds`, `system`, `channels`, `views`, `active_transmissions`, `transcript`, `trains`, `ctc`, `lofar_60m`). Bookkeeping keys are ignored.
- `ReplayEngine` (asyncio task, 10 Hz): diffs `build(t)` against the previous tick and emits events (3.4) through the `Hub`: key-up when a transmission starts, key-down when it ends, `words` as the transcript decodes (state `decoding` until `decode_latency_s`, then `draft` words reveal, then `final`), feed state changes, ACK echoes, 1 Hz tick and trains, 10 Hz level, 4 Hz spectrum for watched feeds, LOFAR row every `row_s`.
- `interfaces.py` defines `EventSource` (what the engine implements and the real pipeline will implement: yields typed events), `SourceDriver` (rtl_tcp / agent / file: `start()`, `stop()`, `iq_blocks()`, `telemetry()`), `Transcriber` (`transcribe(clip) -> TranscriptResult`, `hints: list[str]`). The fake implements `EventSource` only; the other two are Protocols with a docstring and a stub, nothing more.
- Scripted truth: faults, acks and stale episodes come from `health.json` events, so playing the day from 14:05:00 reproduces BAY-04 stale, LND-02 reconnecting then fault, ACK at 14:06:31, recovery at 14:06:58. A user ACK (`POST /api/feeds/{id}/ack`) is applied on top and persisted.

### 3.3 REST contract (all under `/api`, session cookie required except where noted)

| Method + path | Purpose | Body / query | Response |
|---|---|---|---|
| `POST /auth/login` (public) | single-user login | `{password}` | 204 + `Set-Cookie: sdrviz_session` (signed, HttpOnly, SameSite=Lax); 401 `{detail}` |
| `POST /auth/logout` | | | 204 |
| `GET /auth/session` (public) | | | `{authenticated: bool, sim: true}` |
| `GET /system` | host, decoder, disk, version | | `{host, decoder:{state, queue}, disk, version, sim}` (the `system` block of LiveState) |
| `GET /live/state` | the current `LiveState` (same object the WS sends as `snapshot`) | | `LiveState` |
| `GET/PUT /prefs` | active bank, mute/solo/record, volumes, displayed feed | `Prefs` | `Prefs` |
| `GET /sim`, `POST /sim/jump` (fake only) | clock control | `{scenario?: str, clock?: "HH:MM:SS", speed?: float}` | `{scenario, clock, speed}` |
| `GET /frequencies`, `POST`, `GET/PUT/DELETE /frequencies/{id}` | frequency CRUD | `Frequency` | `Frequency` (409 on delete if a bank references it, unless `?force=true`) |
| `GET /banks`, `POST`, `GET/PUT/DELETE /banks/{id}` | bank CRUD incl. ordered `frequency_ids` | `Bank` | `Bank` |
| `POST /banks/{id}/activate` | set active bank | | `Prefs` (and WS `snapshot`) |
| `GET /feeds`, `POST`, `GET/PUT/DELETE /feeds/{id}` | feed CRUD (config + live health merged on read) | `Feed` | `FeedView` |
| `POST /feeds/{id}/ack` | acknowledge the open fault | `{reason?}` | `FeedView` |
| `GET /feeds/{id}/health` | `series_1m` (noise floor, sample rate, gain...), events, acks | `?minutes=60` | `FeedHealth` |
| `GET /feeds/{id}/waterfall` | backfill for the spectrum watcher | `?rows=120` | `application/octet-stream`, rows x bins int8 dBFS, headers `X-Bins`, `X-Row-Seconds`, `X-Center-MHz`, `X-Span-MHz` |
| `GET /lofar` | LOFAR history, all feeds | `?minutes=60` | `{row_s, rows, row0_t, cells: {feed_id: {channel_id: number[]}}}` |
| `GET /transmissions` | history query | `start, end` (ISO), `frequency_id`, `aar`, `feed_id`, `role`, `train_id`, `place_id`, `bank_id`, `state`, `min_duration`, `defect=true`, `q` (keyword; FTS5), `order=asc\|desc`, `limit` (<=500), `cursor` | `{items: Transmission[], total, next_cursor}` |
| `GET /transmissions/summary` | same filters: totals, hero strings, `airtime_per_min` | | `HistorySummary` (the scenario `history.{range, totals, hero, scrubber_*}` shape) |
| `GET /transmissions/{id}` | one row incl. words, receptions, detector | | `Transmission` |
| `GET /transmissions/{id}/audio` | the clip | HTTP Range supported | `audio/webm; codecs=opus`; generated on first request (3.5) |
| `GET /transmissions/{id}/waveform` | peaks for the clip player | `?bins=240` | `{duration_s, peaks: number[0..1]}` |
| `GET /stats` | analytics | `?range=today\|yesterday\|rolling_24h` | `StatsView` (the `stats.json` `day` shape; today is aggregated from the table up to the sim clock so it matches `scenario.stats.today`; yesterday is the full recorded day) |
| `GET /trains` | train runs for the stringline | `?start&end&route&q` | `{items: Train[]}` (trains.json record: stops, routes, direction) |
| `GET /trains/live` | positions now (also pushed on WS) | | `TrainPosition[]` |
| `GET /geo/rail`, `/geo/water` | GeoJSON passthrough (ETag, `Cache-Control: max-age`) | | `application/geo+json` |
| `GET /geo/places`, `/geo/routes` | `seed/places.json`, `sim/routes.json` | | JSON |

`schemas.py` is the single definition; `openapi-typescript` regenerates `frontend/src/lib/api/schema.gen.ts` from `/openapi.json` (`npm run gen:api`). The typed client (`$lib/api/client.ts`) is a thin `fetch` wrapper with one function per row above.

### 3.4 WebSocket `/ws/live`

Cookie-authenticated handshake. Text frames are JSON `{type, ...}`; binary frames start with a fixed big-endian header.

Server to client, text:

| `type` | When | Payload |
|---|---|---|
| `hello` | on connect | `{protocol: 1, sim: {scenario, speed, clock_s}, server_time}` |
| `snapshot` | after hello, on jump, bank activate, feed CRUD, and as a 30 s keyframe | full `LiveState` |
| `tick` | 1 Hz | `{t, clock, clock_tenths}` (the client interpolates between ticks; header clock is `clock`) |
| `channel` | channel state change | `{id, state, tx, last_heard, coverage, channel_fault, status_readout}` |
| `keyup` | squelch opens | `{tx_id, channel_id, aar, feed_id, receptions[], role, role_tag, speaker, train_id, place_id, off_bank, t}` plus the new transcript row in state `decoding` |
| `keydown` | squelch closes | `{tx_id, channel_id, duration_s, t}` |
| `words` | decode progress | `{tx_id, state: "decoding"\|"draft"\|"final", words: [{w, conf}], transcript, confidence, detector?}` |
| `level` | 10 Hz, active channels only | `{t, levels: {channel_id: {db, peak}}}` |
| `feed` | feed health change, ACK | `{feed_id, state, label, since, acked, in_state_s, ...FeedView}` |
| `faults` | whenever the fault or degraded set changes | `{faults[], degraded[], header, status_line}` (server owns fault bookkeeping; the client derives chips from it with `headerChips`) |
| `trains` | 1 Hz | `{positions: TrainPosition[], ctc}` |
| `lofar_row` | every `row_s` | `{t, cells: {feed_id: {channel_id: dbfs}}}` |

Server to client, binary (`byte0 = kind`):

| kind | Frame | Layout |
|---|---|---|
| 1 | audio chunk | `u8 kind=1, u8 codec, u8 aar_channel, u8 flags, u32 tx_seq, u32 offset_ms`, then payload. `codec 0` = PCM s16le, mono, 8000 Hz (fake). `codec 1` = Opus (reserved for the real backend; client decodes with WebCodecs `AudioDecoder` behind the same `AudioSource` interface). `flags` bit0 = first chunk of the key-up, bit1 = last chunk (squelch tail). 100 ms chunks. |
| 2 | spectrum frame | `u8 kind=2, u8 flags, u16 n_bins, f32 center_mhz, f32 span_mhz, u32 t_ms`, then `n_bins` int8 dBFS. 4 Hz, 1024 bins, only for the watched feed. The client scrolls these into the waterfall (backfill from `GET /feeds/{id}/waterfall`). |

Client to server, text: `{op:"audio", channels:[channel_id...]}` (subscribe to audio; `[]` stops it; mute and solo are client-side gains, so the server sends everything subscribed), `{op:"watch", feed_id}` (spectrum), `{op:"ping"}`.

Audio choice (the simplest that Web Audio mixes with per-channel volume, mute, solo): binary PCM chunks over the existing socket, scheduled by the client onto a buffer-source chain per channel, each channel with its own `GainNode` into a master `GainNode`. No codec, no extra connection, trivially testable. Deviation from decision 11 ("live Opus over WebSocket"): the wire codec byte already reserves Opus, so moving to Opus is an `AudioSource` implementation swap. Clips for History stay Opus.

Meters and waveforms do not depend on audio being enabled: M16 and M15 are fed from the `level` messages (the client keeps a rolling envelope per channel).

### 3.5 Fake audio (generated, cached, lazy)

- Output in `data/audio/` (gitignored): `<tx-id>.webm` (Opus, `-c:a libopus -b:a 16k -application voip`, 16 kHz input), `<tx-id>.pcm` (8 kHz s16le, used for the live stream), `<tx-id>.peaks.json`.
- Pipeline (`audio/synth.py`): `say -v <voice> -r <wpm> -o tmp.aiff "<transcript>"` then one `ffmpeg` call: resample to 16 kHz, `atempo` toward the row's `duration_s` (clamped 0.6 to 1.6; pad or trim the rest), `highpass=300, lowpass=3000`, `acompressor`, `alimiter`, mixed with `anoisesrc` (pink, amplitude about 0.03) at low level, a 120 ms squelch tail (noise burst with `afade` out) appended, encode to Opus. Voice by role (crew, dispatcher, yardmaster, detector: robotic voice, MOW) from the installed `say -v '?'` en_US list with graceful fallback. Kerchunks: a 90 ms noise burst, no speech.
- Lazy: nothing is rendered at startup. A background thread pre-renders the next 5 simulated minutes from the sim clock (so key-ups never wait), and `GET .../audio` renders on demand under a per-id lock. `python -m app.audio.build --all` warms the whole day (about 1265 clips) for demos.
- Portability: `say` and `afconvert` are macOS only. If `say` is missing, try `espeak-ng`; if neither exists, synthesise a tone-burst pattern and log one warning. Linux and Pi still work.

### 3.6 Auth

Single user. `SDRVIZ_PASSWORD` (default `sdrviz` in dev, logged at startup) compared with `secrets.compare_digest`; Starlette `SessionMiddleware` with `SDRVIZ_SECRET`. A `require_session` dependency on every router except `auth` and `GET /auth/session`; the WS handshake checks `websocket.session` and closes 4401. Login limited to 5 attempts per minute (in memory). Replaceable by a stored hash later without changing the contract.

---

## 4. Build order and gates

```
Phase A  (parallel)   A1 backend scaffold          A2 frontend core scaffold
Phase B               B1 frontend kit scaffold   (starts when A2 reports tokens + stage + router done)
Gate G1               backend serves hello+snapshot, REST resources; shell renders 5 empty routes; kit matches the component sheet
Phase C  (parallel)   5 packages: live-ops · history · stats · feeds-banks · map
Phase D               integration pass (lead): nav/chips/status parity across screens, 1440 pass, grayscale pass, reduced motion, designer review
```

Backend milestones inside A1 (each ends with the app running): M1 skeleton + auth + REST reading JSON and seed (no DB); M2 SQLModel DB + seed + CRUD + FTS search; M3 `SimClock` + `live_state` + golden tests + `/ws/live` hello/snapshot/tick/channel/keyup/keydown/words/level/feed/trains/lofar; M4 spectrum frames + waterfall backfill; M5 audio synth, clip endpoint, live audio frames. Packages start at G1 with M1 to M3 done; M4 and M5 may land while packages run (live-ops spectrum and audio, history playback and the feeds inspector spectrum are built against the contract and verified once their milestone lands).

Per-package definition of done:
1. Every mockup URL listed for the package has an app screenshot at the same size, viewed next to the mockup shot (`build-screens/<key>/<frame>.png` and `<frame>-mock.png`); differences are fixed or listed in the report with a reason.
2. `npx svelte-check --workspace src/screens/<dir>` and `npx vitest run src/screens/<dir>` clean.
3. No literal colours or font families in package CSS (tokens and `var(--...)` only); no files edited outside the owned paths.
4. Works live, not only frozen: with the clock running, the screen reacts to WS events without console errors for 2 minutes.
5. A short report: what was built, deviations from the mockup, entries added to `docs/requests/<key>.md`.

Review chain from the agent definition: first pass to film-graphics-designer (numbered feedback), refined passes to gmunk-director. The lead consolidates feedback per package before it goes back.

---

## 5. Scaffold work (not a package)

### A1 backend scaffold (owns `backend/**`, backend Makefile targets, `.gitignore`)
Everything in section 3, in the milestone order above. Tests: `pytest` for the auth flow, CRUD round trips, FTS search, transmissions filters, golden `live_state` at the four scenario moments, WS handshake and a recorded-event sequence test (play 14:05:50 to 14:07:10 at speed 30 and assert the fault, ACK and recovery events appear in order), the audio endpoint returns a decodable Opus file (`ffprobe`).

### A2 frontend core scaffold (owns `frontend/` config, `src/main.ts`, `App.svelte`, `routes.ts`, `lib/{api,ws,stores,router,time,styles,types}`, `scripts/shot.sh`, frontend Makefile targets)
- Vite + Svelte 5 + TS strict, vitest, svelte-check, fonts via `@fontsource`.
- `lib/styles/tokens.css`: spec 1 to 3 custom properties ported verbatim from `design/mockups/_shared/hud.css` (colour, type scale, strokes, dashes, glow, ramp, easing, durations). `lib/styles/`: the class index of spec 10 (frames, glyph, tile, txrow, chips, SVG utility classes, motion keyframes) split into `frames.css tile.css text.css controls.css svg.css motion.css`, all consuming tokens.
- `Stage.svelte`: sizes, scale-to-fit, `data-state` / `data-size` / `data-motion` attributes, `gray=1`, the 12-column grid and `.span-tiles` / `.span-log`.
- Router: `lib/router.ts`, about 40 lines on the History API; routes `/login /live /history /stats /feeds /map`; each route lazily `import()`s `screens/<dir>/Screen.svelte`; query string preserved; guard redirects to `/login` when `GET /auth/session` says unauthenticated. A broken screen cannot break another route.
- Stores (`*.svelte.ts` with runes): `session`, `liveState` (applies `snapshot` and each delta type to one reactive `LiveState`), `link` (`connecting|live|reconnecting|no-link` with the backoff), `levels` (rolling envelope per channel for M15, last level for M16), `spectrum` (watch/unwatch, frame ring), `prefs` (REST-backed, optimistic).
- `lib/ws/client.ts`: reconnecting WebSocket, JSON and binary decode (`protocol.ts` mirrors 3.4 byte for byte, with unit tests built from hand-made frames); `lib/api/client.ts` typed fetch wrapper.
- Bootstrap sequence: read URL params, `POST /sim/jump` if `scenario`, load session, open WS, set `<html data-ready="1">` after the first `snapshot` (the screenshot script waits on it).
- `scripts/shot.sh <url> <out.png> [size]`: wraps the Chromium headless command with `--virtual-time-budget`; verified early that the WS connection plus `freeze=1` produce a rendered frame under virtual time (if virtual time stalls on the socket, fall back to `--timeout` and `data-ready`, and document it in the script header).

### B1 frontend kit scaffold (owns `lib/hud`, `lib/components`, `lib/motion`, `lib/audio`, the `/kit` route)
Everything in spec 13.2 plus the shared canvases, built to the component sheet:
- `lib/hud/*.ts` (pure, vitest, parity-tested against `design/mockups/_shared/hud.js` by loading it in a node `vm` sandbox with a stub `window` and comparing outputs on scenario data): `fmt` (freq, aar, ch, num, dbfs, snr, mp, clock, hm, dur, total, age, pct, trainId, blank), `resolveTile`, `speaker`, `headerChips`, `statusFrom`, `lofarT`, roles, feed names, band (AAR channel maths).
- Components: `AppShell`, `HeaderNav`, `HeaderChips`, `StatusLine`, `TitleBlock`, `PositionGlyph`, `AarReadout`, `ChannelTile` (standard, compact, strip) + `TileGrid`, `LevelMeter`, `Sparkline`, `CoveragePips`, `Waveform`, `TranscriptRow` (scenario row shape + a column-set prop, gap 13.4.8) + `TranscriptLog`, `DataBlock` (with `glyph, l2Class, from, flip, knockout`, flagpole: gap 13.4.7), `MilepostTag`, `RegMark`, `PingRing`, `FrequencyRuler` (4 px and 8 px sideways rules: gap 13.4.9), `TickRuler`, `LeverRow`, `BankLever`, `Chip`, `Button`, `Field`, `Checkbox`, `Toggle`, `Tabs`, `KeyValue`, `Inspector` (slot per section), `HeroStrip`, `EmptyState`, `SystemAlarm`; shared canvases `SpectrumTrace`, `Waterfall`, `LofarStrip` (Live Ops and the Feeds inspector both use them; spec 5.30).
- Motion: `lib/motion/{keyup,buildOn,reveal}.ts` (6.3 timeline as data, 6.5, 6.8) and reduced-motion handling.
- Audio engine `lib/audio/engine.svelte.ts`: `enable()` (user gesture, AudioContext resume), per-channel `GainNode` into master, mute/solo/volume derived from `prefs`, `AudioSource` implementations (`PcmSource` now), subscribes via `{op:"audio"}`. Exposes `enabled`, `soloCount`, `activeChannels` for the header chip. Because mute and solo live in `prefs`, tiles, levers and the chip always agree.
- A `/kit` dev route (not in the nav) rendering the component sheet states, reviewed against `components.html?state=tiles|tiles-small|combos|combos-2|rows|rows-1440|instruments|controls|readouts`.
- Gap fixes per spec 13.4 (LAST age without seconds, squelch at floor + 8 dB constant, acked fault drops to the stale frame in `resolveTile`).
- Sparkline data: A1 adds `spark_60m` with 60 per-minute values to each channel in `LiveState` (a deliberate improvement over the 12-bin scenario value, gap 13.4.2), so the golden tests ignore `spark_60m`.

---

## 6. Build packages (disjoint ownership)

Each package owns `frontend/src/screens/<dir>/**` (components, screen-local `lib/`, colocated `*.test.ts`, `Screen.svelte` as the route entry) and `docs/requests/<key>.md`. Anything the spec lists as `$lib/<x>` for a screen-owned module (`$lib/ctc/labelPass.ts`, `$lib/map/*`) lives inside the owning package instead. Packages consume stores and kit components only; they never read sim JSON directly (always REST or WS).

Mockup base: `file:///Users/andy/Code/sdrviz/design/mockups/`. App base: `http://localhost:<port>`.

### P1 `live-ops` (dir `screens/live-ops/`, preview port 5174)
Mockups: `live-ops.html?state=listening|keyed|fault|fault-acked&build=0`, `live-ops.html?state=keyed&inspect=amtk-nec-road&build=0`, `live-ops.html?state=fault-acked&inspect=feed-lnd&build=0`, `live-ops.html?state=listening|keyed|fault&size=1440&build=0`, `live-ops-grayscale.html?state=keyed|fault&build=0`, `motion-keyup.html` (frozen frames `?t=0.1&tb=0.05`, `?t=2.0&tb=0.5`).
Routes: `/live?scenario=<s>&freeze=1&build=0` (all four), `/live?scenario=keyed&select=amtk-nec-road&inspect=amtk-nec-road&freeze=1`, `/live?scenario=fault-acked&inspect=feed-lnd&freeze=1`, each at `&size=1440`, plus `gray=1`.
Scope: `LiveOps` screen per spec 4.3: hero strip; front wall with kit `SpectrumTrace` + `FrequencyRuler` + `Waterfall` + `LofarStrip` wired to the `spectrum`, `levels` and LOFAR stores; `FrontWallMessage`; `BankTabs` with the off-bank extra label; tile grid 5x4 standard or 3x5 compact driven by `views[bank].tile_ids`; transcript log with the "new rows" and `LOG +n` behaviour; `CtcStrip` + `labelPass.ts` with the label priority and separation rules of spec 5.30. Selection (`?select`, click), focus, levers (mute, solo, record) wired to the `prefs` store. **Audio mixer UI:** lever behaviour on tiles, solo dims the others, muted tile treatment, and an `AUDIO` section in the tile inspector (volume slider styled from tokens, mute, solo, record toggles, level meter), with all state going through `prefs` and the kit audio engine; the header audio chip itself is kit. **Inspector:** channel inspector (recent transmissions, coverage by feed, frequency facts) and feed inspector (opened from the feeds hero or chip), using the kit `Inspector`. Key-up choreography on tile and log row driven by WS `keyup`/`keydown`/`words`. Exports from `screens/live-ops/index.ts` a `LiveOps` component that accepts `link?: { state: "loading" | "connecting" | "reconnecting" | "no-link" | "empty-bank"; dropAge?: number }` and renders the blank or dimmed wall (`.is-down`) per spec 11.17; `system` consumes it.

### P2 `history` (dir `screens/history/`, preview port 5175)
Mockups: `history.html?state=listening|keyed|fault|fault-acked&build=0`, `history.html?state=fault&gray=1&build=0`, `history.html?state=keyed|fault|fault-acked&size=1440&build=0`, `history.html?state=listening&train=MARC%20410&build=0`, `history.html?state=listening&tx=tx-039&build=0`, `history.html?state=listening&tx=tx-085&build=0`.
Routes: `/history?scenario=<s>&freeze=1&build=0`, `/history?scenario=listening&train=MARC%20410&freeze=1`, `/history?scenario=listening&tx=tx-039&freeze=1`, `/history?scenario=listening&tx=tx-085&freeze=1`, each at `&size=1440` where the mockup has one.
Scope: `History` screen per spec 4.4 and 5.30: route tabs (`RouteTabs`), `Stringline` SVG (M19) from `GET /trains`, `MarginRail`, `TimeScrubber` with recording rail and the `FeedsLane`, `TranscriptTable` (kit `TranscriptRow` with the history column set; keyword search box `q=` against FTS; filters: channel, feed, role, train, state, defect), hero strip from `GET /transmissions/summary`, `ClipPlayer` playing `/api/transmissions/{id}/audio` with `<audio>` and drawing the `/waveform` peaks (play, pause, seek, speed, loop; keyboard `space`, `j/k`). Playback cursor on the stringline and scrubber (2 px `ink` line, triangle cap). Selection by `?tx=` / `?train=`, written back to the URL (`history.replaceState`) so frames stay reachable. Custom ranges re-query the API; no client-side filtering beyond what is loaded.

### P3 `stats` (dir `screens/stats/`, preview port 5176)
Mockups: `stats.html?state=listening|keyed|fault|fault-acked&build=0`, `stats.html?state=listening&range=yesterday&build=0`, `stats.html?state=keyed|fault&size=1440&build=0`, `stats.html?state=fault&gray=1&build=0`.
Routes: `/stats?scenario=<s>&freeze=1&build=0`, `/stats?scenario=listening&range=yesterday&freeze=1`, `size=1440` and `gray=1` variants.
Scope: `Stats` screen per spec 4.4: `RangeTabs` (`today`, `yesterday`, `rolling_24h`; reads `?range`), hero strip, `Ridgeline` (M20, per-channel 10-minute bins, keyed live tick at the now-line from the `liveState` store), `ChannelHourHeatmap` (ramp), `TopTalkers`, `DetectorBoard`, `DecoderQuality`, `FeedUptime` (past faults with the `fault-past` glyph and `dash-stale`), all from `GET /stats?range=`. Refetch on range change and every 60 s while on `today`. Ridges filled `bg-void`, at most 3 series, no literal colours.

### P4 `feeds-banks` (dirs `screens/feeds/` and `screens/system/`, preview port 5177)
Mockups: `feeds.html?state=listening|keyed|fault|fault-acked&build=0`, `feeds.html?state=fault|keyed&size=1440&build=0`, `feeds.html?state=fault&gray=1&build=0`; `system.html?state=login|login-error|loading|connecting|empty-bank|reconnecting|no-link&build=0`, `system.html?state=no-link&gray=1&build=0`.
Routes: `/feeds?scenario=<s>&freeze=1&build=0` (four) and `size=1440` / `gray=1` variants; `/login`, `/login?force=error`; `/live?scenario=listening&force=loading|connecting|reconnecting|no-link|empty-bank&freeze=1` (the system states render the Live Ops wall through P1's `LiveOps link=` prop).
Scope, Feeds & Banks per spec 4.4 (cols 1-3 feed list, 4-7 feed inspector, 8-12 banks): `HostCard`, `FeedCard`, `FeedInspector` (kit `SpectrumTrace`/`Waterfall`/`LofarStrip`, sample-rate chart from `GET /feeds/{id}/health`, coverage thumbnail with the M23 hatch rule, telemetry `KeyValue` with `N/A · RTL_TCP`), feed CRUD (add/edit/delete forms with validation, ACK button wired to `POST /feeds/{id}/ack`, enable toggle), `BankLeverRows`, `MembershipTable`, `BankEditor` (create, rename, reorder, add/remove frequencies from `GET /frequencies`, set active bank), `Gauge` (non-dB M16), M12 `SAME FREQ · DIFFERENT FEEDS` bracket, plus a frequency catalogue editor (list, edit, add, delete) in the banks column. System: `LoginPanel` (400 px panel, bottom frequency ruler, `POST /auth/login`, error state, autofocus underline), `ConnectingOverlay`, `LinkGate.svelte` (decides loading / connecting / reconnecting / no-link / empty-bank from `link` and `liveState`, honours `?force=`; wraps `/live`). The reconnecting, no-link and empty-bank states depend on P1 exporting `LiveOps` with `link`; build login, loading, connecting, feeds and banks first and wire those three after P1 lands (or against a throwaway local stub, deleted afterwards).

### P5 `map` (dir `screens/map/`, preview port 5178)
Mockups: `map.html?state=listening|keyed|fault|fault-acked&build=0`; `map.html?state=<each>&mode=schematic&build=0`; `map.html?state=keyed&select=BWI-03|MARC%20433|VRE%20301&build=0`; `map.html?state=fault|fault-acked&select=LND-02&build=0`; `map.html?state=keyed|fault&size=1440&build=0`; `map.html?state=keyed&mode=schematic&size=1440&build=0`; `map.html?state=keyed&motion=1&t=0|400|900&build=0` (ping); `map-grayscale.html?state=keyed|fault&build=0`.
Routes: `/map?scenario=<s>&freeze=1&build=0`, `&mode=schematic`, `&select=BWI-03` etc., `size=1440`, `gray=1`; ping frames `/map?scenario=keyed&freeze=1&motion=1&t=400`.
Scope: `Map` screen per spec 4.5: `MapCanvas` (`d3-geo` Mercator fitted to the Quantico to Perryville extent, default view 20 mi south of DC to Edgewood per decision 14, pan/zoom, no basemap; layers: graticule, shore from `/geo/water`, rail from `/geo/rail`, MP ticks, stations and detectors from `/geo/places` + `/geo/routes`), `CoverageDisc` (M5/M23 incl. the unacked-fault -45 degree hatch), `FeedSite`, `TrainMark` + kit `DataBlock` with `blockPlacer.ts`, `labelPlacer.ts` (name priority, terminals never drop, leaders `ink-3`, link labels placed after blocks), `project.ts`, `SchematicMap` + `schematicLayout.ts` (Beck 0/45/90 degrees, rises 138/172/112 px), `CoverageStrip`, `OnAirList`, `MapInspector` (feed, train, place; ACTIONS rows for the feed inspector), corner readout, selection pans to the uncovered canvas, ping on key-up via kit `PingRing` and the WS `keyup` reception list (`dist_km`, `snr_db`). Placers are pure TS with vitest cases built from the mockup audit (`html[data-audit]`: no unnamed terminal, no leader collisions).

---

## 7. Disjointness check

| Path | Owner |
|---|---|
| `backend/**`, `.gitignore`, `Makefile` (A2 owns the frontend targets) | A1 |
| `frontend/` config, `src/{main.ts,App.svelte,routes.ts}`, `lib/{api,ws,stores,router,time,styles,types}`, `scripts/` | A2 |
| `lib/{hud,components,motion,audio}`, `/kit` route | B1 |
| `screens/live-ops/**`, `docs/requests/live-ops.md` | P1 |
| `screens/history/**`, `docs/requests/history.md` | P2 |
| `screens/stats/**`, `docs/requests/stats.md` | P3 |
| `screens/feeds/**`, `screens/system/**`, `docs/requests/feeds-banks.md` | P4 |
| `screens/map/**`, `docs/requests/map.md` | P5 |
| `docs/**` (other), `design/**`, `data/sim|seed|geo` | lead / read-only |

`screens/<dir>/Screen.svelte` is created as a placeholder by A2 and handed over to the package at G1. Packages share one `node_modules` and may not add dependencies; a needed dependency goes in the requests file.

## 8. Screenshot workflow

`scripts/shot.sh 'http://localhost:5174/live?scenario=keyed&freeze=1&build=0' build-screens/live-ops/keyed.png` runs Chromium headless at 1920x1080 (1440x900 when `size=1440`), waits for `data-ready`, and writes the PNG. The mockup twin is shot with the same script against `file:///.../mockups/...`. Always view both with Read.

## 9. Risks and open points

1. **Golden `live_state` port** is the largest backend risk (about 400 lines of generator logic). The M3 gate is the golden test; if a field cannot be matched, fall back to deriving it from the nearest scenario file and flag the field in the report.
2. **Headless screenshot under virtual time with WebSockets**: tested first in A2; documented fallback.
3. **Safari and audio**: clips are WebM/Opus (not Ogg) because Ogg Opus support in Safari is recent; live audio is plain PCM. Chrome and Firefox are the verified targets.
4. **Stats "today" aggregation** must reproduce `scenario.stats.today` closely; the backend ports `channel_stats`/`summary_stats` from the generator. Acceptable only if the screen looks identical at the four scenario moments.
5. **Decision 11 deviation**: live audio is PCM on the wire (the codec byte reserves Opus). Needs a nod at the next check-in.
6. **Fake-only endpoints** (`/api/sim/*`, `?scenario=`, `force=`) are isolated in `routers/sim.py` and `lib/api/sim.ts` so they delete cleanly.

# sdrviz backend (fake)

FastAPI + SQLModel/SQLite. It replays the generated sim day (`data/sim/`, made by `tools/gen_sim.py`) as if it
were live: a REST API, a `/ws/live` WebSocket, fake audio. Every seam the real DSP and transcription workers will
use is built to its final shape; replacing the fake means swapping `app/sim/engine.py`, not the contract.
Plan and contract: `docs/build-plan.md` section 3.

## Run

```sh
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

.venv/bin/uvicorn app.main:app --port 8100 --reload     # the app, http://127.0.0.1:8100/docs for OpenAPI
.venv/bin/pytest                                          # tests (about 12 s)
.venv/bin/ruff check . && .venv/bin/ruff format .         # lint + format
.venv/bin/python -m app.db reset                          # drop and re-seed the database
.venv/bin/python -m app.audio.build --all                 # pre-render all ~1265 clips (optional, a few minutes)
.venv/bin/python -m app.audio.build tx-001 sim-0456       # or just some
```

First start creates `data/db/sdrviz.sqlite` and seeds it from `data/seed/` and `data/sim/`. Audio clips are
rendered into `data/audio/` on demand (and a background thread renders the next 5 simulated minutes). Both
directories are gitignored. Fake audio needs `ffmpeg` and `ffprobe` on the PATH, plus macOS `say` (falls back to
`espeak-ng`, then to tone bursts; one warning is logged).

If `frontend/dist` exists it is served at `/`, so one process serves the whole app on port 8100. In development
the Vite dev server proxies `/api` and `/ws` here.

## Settings (environment, prefix `SDRVIZ_`)

| Variable | Default | Meaning |
|---|---|---|
| `SDRVIZ_PASSWORD` | `sdrviz` | The single user's password (a warning is logged while it is the default) |
| `SDRVIZ_SECRET` | `dev-secret-change-me` | Signs the session cookie |
| `SDRVIZ_SIM_START` | current local time of day | Where the replay clock starts, `HH:MM:SS` |
| `SDRVIZ_SIM_SPEED` | `1.0` | Clock multiplier (0 freezes it) |
| `SDRVIZ_PRERENDER_AUDIO` | `true` | Background pre-render of the next 5 simulated minutes |
| `SDRVIZ_DATA_DIR` / `DB_PATH` / `AUDIO_DIR` | `<repo>/data`, derived | Locations |

## What is where

```
app/main.py            create_app(), lifespan, session middleware, static mount
app/runtime.py         Runtime: db, world, health, clock, hub, engine, audio, prefs (one per app)
app/models.py          tables: Frequency Bank Feed FeedEvent FeedAck Transmission Prefs (+ FTS5 table)
app/db.py              engine, schema, first-run seed, `python -m app.db reset`
app/routers/           one module per resource; sim.py is the fake-only part (delete with the fake)
app/services/          stats.py (aggregates), search.py (filters + FTS5 + paging), history.py (summary)
app/sim/               clock, live_state (the LiveState port of gen_sim.py), engine (replay), spectrum, trains, health
app/live/              hub (fan-out), protocol (wire formats), audio_stream (PCM chunks)
app/audio/             synth (say + ffmpeg), cache, prefetch, build (CLI)
app/interfaces.py      Protocols for the real pipeline: EventSource, SourceDriver, Transcriber
tests/                 golden test against data/sim/scenarios/*.json, clock, replay engine, REST, WebSocket, audio
```

## Contract notes (where the plan left room)

All REST is under `/api` and needs the `sdrviz_session` cookie except `POST /auth/login` and `GET /auth/session`.
Interactive docs: `/docs`.

* **LiveState** (`GET /api/live/state`, and `snapshot.state` on the socket) is the scenario JSON shape minus
  `summary`, `generator`, `history`, `stats`, `map`. The port reproduces `data/sim/scenarios/*.json` exactly
  (tests/test_golden.py) except: `channels[].spark_60m` has 60 per-minute bins (spec gap 13.4.2), and train
  milepost labels may differ by 0.1 where `trains.json` rounds times. Extras: `scenario`, `speed`, `banks[].short`,
  `views[bank].short`, `feeds[].host/port`. `displayed_feed_admin` is scripted for the four scenarios and derived
  (worst feed, else displayed feed) otherwise.
* **WebSocket** `/ws/live`: cookie auth; an unauthenticated client is accepted and closed with 4401 (so the
  browser can read the code); server shutdown closes with 4000. Text frames are `{type, ...}`:
  `hello`, `snapshot` (**the LiveState is under `state`**), `tick` (also carries `speed`), `channel`, `keyup`
  (carries `tx_seq` and the full transcript row under `row`), `keydown`, `words` (`draft` then `final`, or one
  message with `carrier_only` / `undecodable` / `failed`), `level`, `feed` (a FeedView with `feed_id`), `faults`,
  `trains`, `lofar_row`, and `pong`. `channel` is sent when a channel's state, coverage, readout or last key-up
  changes; the age in a `LAST ...` readout is not re-sent every second (count it from `last_heard.end_t`).
  Client ops: `{op:"audio", channels:[frequency_id...]}`, `{op:"watch", feed_id}`, `{op:"ping"}`.
* **Binary frames** (big-endian) are exactly as in the plan: audio `>BBBBII` (kind 1, codec 0 = PCM s16le mono
  8 kHz, aar channel, flags bit0 first / bit1 last, `tx_seq`, `offset_ms`) then 1600 bytes per 100 ms chunk;
  spectrum `>BBHffI` (kind 2, flags, n_bins 1024, centre MHz, span MHz, t_ms) then 1024 int8 dBFS at 4 Hz for the
  watched feed. Audio is paced by the key-up's elapsed sim time, so it is only meaningful at speed 1.
* **Clock**: `POST /api/sim/jump {scenario?, clock?, speed?}`. A scenario also activates its bank and forgets
  user acknowledgements; `speed: 0` freezes the clock (used for screenshots). A jump without `speed` plays at the
  configured speed. Every jump pushes a fresh `snapshot`.
* **History**: `start`/`end` are ISO-8601 (naive means EST). The day repeats, so a window that crosses midnight
  returns the previous evening's rows shifted into it (`t_offset_s` negative, `started_at` on 2026-11-09).
  `next_cursor` is opaque. List rows include `words`. Kerchunks are in the table (`kc-*`) but never listed.
* **Dense LOFAR** (`GET /api/lofar`): `cells[feed_id][frequency_id]` is `rows` values (dBFS, `null` for silence),
  oldest first, `row0_t` is the start of row 0. The snapshot's `lofar_60m` keeps the sparse generator shape
  (`cells[feed][aar] = [[row, dbfs], ...]`, row 0 newest).
* **Acknowledge**: `POST /api/feeds/{id}/ack` returns 409 unless the feed has an unacknowledged fault at the sim
  clock. The ack is stored at the sim time, so it is undone by jumping back before it.
* **Frequencies**: `aar_channel` is derived from `freq_mhz` ((f - 160.110) / 0.015) and may be omitted; a
  disagreeing value is a 422. Deleting a channel in a bank is a 409 unless `?force=true`.

## Deviations from the plan

* `Bank.frequency_ids` is an ordered JSON column, not a `BankFrequency` table.
* The Opus clip cache holds `<id>.webm` and `<id>.pcm`; waveform peaks are computed from the PCM on request
  instead of a `.peaks.json`.
* `LiveState`, `FeedView`, `StatsView` are plain JSON-shaped dicts (a line-for-line port of the generator), so
  OpenAPI types them as free-form objects; the resources (Frequency, Bank, Feed config, Prefs, Transmission) are typed.
* Feed `driver` is the generator's `rtl_tcp` / `sdrviz-agent` plus `driver_sim`, not `rtl_tcp|agent|file`.

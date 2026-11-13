# sdrviz

A radio-scanner operations console for the railroad corridor between Washington DC and Baltimore, drawn as a
film-style heads-up display. Five screens: Live Ops, History, Stats, Feeds & Banks, Map. The backend is a
fake: it replays a generated day of traffic, transcripts, audio and feed health over REST and a WebSocket,
shaped like the contract the real DSP and transcription workers will use later.

Stack: Svelte 5 + Vite + TypeScript (frontend), FastAPI + SQLModel/SQLite (backend). Locked decisions are in
`docs/decisions.md`, the plan and API contract in `docs/build-plan.md`, the design in `design/spec.md`.

## Setup

```sh
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd ../frontend && npm install
```

Fake audio needs `ffmpeg` and `ffprobe` on the PATH (and macOS `say`, else `espeak-ng`, else tone bursts).

## Run

Two terminals:

```sh
cd backend && .venv/bin/uvicorn app.main:app --port 8100 --reload
cd frontend && npm run dev          # http://localhost:5173, proxies /api and /ws to :8100
```

Log in with the password `sdrviz` (set `SDRVIZ_PASSWORD` to change it). Other backend settings are in
`backend/README.md`. To serve everything from the backend alone, run `npm run build` in `frontend/`.

## Scenario URLs

Add these to any screen URL to jump the simulated clock to a scripted moment:

- `?scenario=listening` (03:40, quiet), `keyed` (14:07, a voice on air), `fault` (a feed has dropped),
  `fault-acked` (the same fault, acknowledged)
- `&freeze=1` stops the clock so the frame stays still; `&speed=10` runs it faster
- `?force=loading|connecting|reconnecting|no-link|empty-bank` shows a system state on `/live`
- `?size=1440` forces the small stage, `?gray=1` grayscale, `?motion=reduced`, `?build=0` skips the build-on

The clock is shared by every browser connected to the backend.

## Checks

```sh
cd frontend && npm run check && npm test
cd backend && .venv/bin/pytest && .venv/bin/ruff check .
```

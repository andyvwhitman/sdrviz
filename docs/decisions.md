# sdrviz — Planning Decisions

Decided 2026-11-08.

| # | Topic | Decision | Notes |
|---|-------|----------|-------|
| 1 | Phase 1 scope | Semi-functional UI mockup + fake Python backend | Fake backend replays synthetic traffic, transcripts, audio, feed health. Replaced piece by piece later. |
| 2 | Frontend | Svelte 5 + Vite (TypeScript) | SVG for HUD chrome, Canvas/WebGL for spectrum/waterfall. |
| 3 | Backend | FastAPI + Uvicorn | REST + WebSockets; DSP and transcription run as separate Python worker processes later. |
| 4 | Hardware | Raspberry Pi serves IQ and hosts the prototype backend; later a CPU-only Linux box runs the backend for one or more Pi SDR boxes | No GPU anywhere. |
| 5 | Transcription | Moonshine (edge-optimized), behind a pluggable `Transcriber` interface | Railroad vocabulary hints; engine swappable by config. |
| 6 | IQ source | rtl_tcp now; custom `sdrviz-agent` (rich telemetry) later | Behind a `SourceDriver` interface; plus a file-replay driver for dev/mockup. One 2.4 MS/s stream covers the AAR band. |
| 7 | Visual direction | Oblivion base + Tron accents as semantic color | Cyan = idle/armed, amber/orange = transmitting, red = fault; white/pale-cyan hairlines on near-black. |
| 8 | Agent team | Phased, standard size (~12–15 agents), stop for user review after each stage | Stage 1 research → Stage 2 design → Stage 3 build. |
| 9 | Screens | Live Ops, History & playback, Stats/analytics, Feeds & banks admin, Map | Map: 20 mi south of DC → 20 mi north of Baltimore; feed locations, coverage, dummy train positions (Amtrak, MARC, VRE; real APIs later). |
| 10 | Map tech | Pure SVG / d3-geo, no basemap | Rail lines, shorelines, stations from pre-extracted OSM GeoJSON bundled in the repo. |
| 11 | Defaults | Single-user password login; SQLite via SQLModel; Opus clips on disk; live Opus over WebSocket mixed with Web Audio; npm + pip (venv + requirements.txt; changed from uv at user request 2026-11-09) | |
| 12 | Seed data | Research subagent compiles corridor frequencies from public sources, with source links, plus realistic dummy transcripts | Reviewed at the stage-1 check-in. |

## Agent team structure

- **GMUNK lead** (art director): researchers for (a) Oblivion / Tron: Legacy / Tron: Ares work, (b) collaborators and co-designers, (c) outside inspiration, (d) corridor frequency and seed-data research. Produces the creative brief; reviews design work and refined builds.
- **Film graphics designer lead**: screen subagents for Live Ops, History/Stats, Feeds/Banks admin, and Map. Produces SVG/HTML mockups and a design spec (palette, type, components, motion). Iterates with GMUNK.
- **Front-end lead**: build subagents for the Svelte app shell and components, the FastAPI fake backend, and the map. First pass reviewed by the designer, refined passes by GMUNK.

## Stage 1 check-in (2026-11-08)

| # | Topic | Decision |
|---|-------|----------|
| 13 | Police channels | Dropped entirely: removed from seed frequencies, banks, feed coverage and transmissions. The brief's references to police are void. |
| 14 | Map extent | As the director set it: default view about 20 mi south of DC to Edgewood MD; bundled geometry Quantico VA to Perryville MD. |

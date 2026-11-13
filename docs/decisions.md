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

## Transit pages (2026-11-13)

Design: docs/transit-pages-architecture.md; persona input in docs/personas/.

| # | Topic | Decision |
|---|-------|----------|
| 15 | D1 page addresses | Station, route and trip pages open over the map, addressed by map query parameters (`/map?page=station&id=…`, `/map?page=route&id=…&date=…`, `/map?page=trip&source=…&train=…&date=…`). No router change; the map stays the home of all transit views. |
| 16 | D2 station grouping | Curated list (repo file) of cross-agency stations for the DC corridor keyed on Amtrak codes (WAS, BAL, BWI, NCR, ALX, Rockville, Silver Spring, College Park, Odenton, Aberdeen, Wilmington); every other stop is its own station; distance/name heuristics only produce suggested merges for review. Revisit option 4 (editable in Settings) in phase 2. |
| 17 | D3 passing times | Non-stop pass times estimated by interpolating along the route shape between the bracketing stops (plus live delay; refined from a fresh live position). Passing rows must be unmistakably different from stopping rows: a "PASSES · DOES NOT STOP" label (never in the departures/arrivals columns' normal style), the time always shown as approximate ("~14:32"), and never mixed into the rider's departures list without that marking. |
| 18 | D4 actuals and history | Record actual arrival/departure times (and passes) in a SQLite table, kept forever (no pruning). Watch growth; add a backup/export plan for the table. |
| 19 | D5 full-day schedules | For both Amtrak and MARC: the agency's official static GTFS gives every scheduled train for any date; all of its realtime is overlaid by train number + service date (Amtrak: Amtraker positions/delays/tracks; MARC: GTFS-RT trip updates, vehicle positions and service alerts). Unmatched realtime trains show as "Added"; scheduled trains without realtime show "schedule only". Pull in as much official Amtrak and MARC information as is available to populate services and realtime. |
| 20 | Amtrak's copy of MARC trains | Drop Amtrak GTFS routes 42985 and 42948 ("Commuter Rail": MARC Penn Line and CTrail Shore Line East trips that honour Amtrak tickets) through a per-source "exclude routes" setting, visible and reversible in Settings. Each agency is the only source for its own trains; a cross-honour badge (matching by train number + date) can be added later on top. |
| 21 | Station groups scope (phase 1 start) | Start now. Curated seed = every station Amtrak shares with MARC or VRE in the DC area: WAS, NCR, BWI, BAL, ABE, RKV, HFY, MRB, ALX, MSS, BCV, WDB, QAN, FBG (Amtrak codes as keys; one group per station, `st:<code>`). D2's non-shared names (Silver Spring, College Park, Odenton) stay single-agency stations; Wilmington dropped (out of area). Heuristic matches only appear as suggested merges in Settings. Backend first, then the map/station window switch to group ids. |
| 22 | Stale threshold | Per-source "stale after" setting (seconds), editable in Settings beside each feed. Defaults: MARC 120 s, Amtrak 360 s, VRE 120 s. The backend reports it per vehicle so the train card subheader, train list, markers and boards all use the same value. |
| 23 | D6 layout | One panel at a time, docked on the right of the map (replaces the separate floating train and station windows). Opening a station from a train (or a train from a station, or a route from either) swaps the panel's content in place. Each panel (station, route, trip) has a maximize button: the page then overlays the page area between header and footer with a small border showing the map beneath; it never covers header or footer. Esc, or a click on that border, closes the overlay and the panel it came from. Addressed per D1 as `/map?page=station|route|trip&id=…` plus `&full=1` when maximized. A multi-board wall stays a phase 2 idea. |
| 24 | D7 saved items | Deferred: no pins, saved trains/stations, "My stuff", recents or watches. Nothing of the kind exists in the code (checked 2026-11-13). Revisit later if wanted. |
| 25 | D8 radio on transit pages | Deferred: no radio information on station, trip or route panels. Radio is set up on Live Ops and keeps playing whatever page is open. |

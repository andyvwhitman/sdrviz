# Sprint 6: quirks, one shell, own sessions, API docs

Started 2026-11-20. Owner decisions 72-79 in docs/decisions.md. All design decisions referred to GMUNK (direction in
docs/sprint-6/direction.md); the owner asked for the sprint to run to the end without stopping.

Ground rules as Sprint 5: never touch ports 8100, 5173, 8130, 8150, 5190, 5191; pythonic and small tested steps; one
agent per lane in its own worktree; clean-worktree tests, push, deploy, verify on production.

## Findings before the sprint

- **Mirroring between clients (73):** `Prefs` is one row (`id=1`) on the server, and `listen_feed` lives in it, so
  picking a node on the phone repoints Live Ops on the laptop. The live snapshot is built once for that feed and
  broadcast to everyone. Fix: the node listened to belongs to the connection (a ws op and a query param), the snapshot
  is built per listened feed, and any other viewing preference moves to the browser.
- **"1436:xx.x" key timer:** the client computes a key-up's age as `wrapDay(now - then)` on the sim day
  (`frontend/src/lib/time.ts` `cyclicAge`). When `then` is ahead of the client's idea of now by more than the 120 s skew
  allowance, the age wraps to almost a day: 1436 min is a key-up stamped about 4 min "in the future". Root-cause the
  clock the key-up time comes from (real node key-ups against the sim clock) and make the server the one clock.
  **Root cause (lane A):** the key-up stamp was never the problem: the server stamps every key-up, node or replay, with
  its own clock and ignores the node's `t`. The client's clock was: a server with `SDRVIZ_SIM=false` (nodes only)
  sent no `tick` at all (only the replay engine and the rtl_tcp radio did), so the page's clock was anchored on a
  snapshot and then ran on `performance.now()`, which stops while a laptop sleeps or a phone is locked. After a 4 minute
  pause the page was 4 minutes behind, a new key-up was stamped "ahead" of it, and `cyclicAge` wrapped it to 1436 min.
  Fix: the runtime sends `tick` every second in every mode, `keyup` carries the server's `now`, the page re-anchors on
  both, and `keyAge` can never turn a future stamp into almost a day. Tests: `backend/tests/test_server_clock.py`,
  `frontend/src/lib/time.test.ts`. Protocol notes: docs/sprint-6/api-changes.md.

## Lanes

| Lane | Tickets | Files (mostly) |
|---|---|---|
| D | GMUNK direction for all of the below | docs/sprint-6/direction.md |
| A | **Sessions and clock**: per-connection listen feed (backend + client), viewing prefs to the browser, two-client test; the key timer root cause and fix with tests | backend ws/live/prefs, frontend stores/ws, time.ts |
| B | **Shell**: one top bar (Map's) and one footer on all pages; SPOT layout; footer key-up strip (72); floating and top-bar key-up markers removed; SPOT arrows drawn by the app, and an emoji sweep (77) | App/shell components, Spot |
| C | **Live Ops and Frequencies**: tile orange text, density toggle gone, 2-wide default, identical detail arrows, feed name opens an SDR feed dropdown (74); node column out of Frequencies (76) | screens/live-ops, screens/frequencies |
| E | **Feeds**: SDR/TRANSIT tabs, resizable 1/3 : 2/3 list/detail, + NEW FEED placement, BACKEND out (75) | screens/feeds |
| F | **Map leaders** (78): 45° leaders, quadrant chosen per marker from its neighbours | screens/map |
| G | **API docs** (79): docs/api/*.md for outside developers (auth, REST, WebSocket, node protocol, Mermaid diagrams), a Docs page in the app rendering them, linked from Settings | docs/api, a docs screen, Settings link |
| R | GMUNK review of the deployed whole; fix the must-fix list | docs/sprint-6/review.md |

## Release

Merge lanes to main, clean-worktree tests (frontend check, vitest, build; backend pytest), push, deploy, then verify
on production: two browsers listen to different nodes independently, the footer key-up strip on a real key-up, no
page errors and no sideways scroll at 1920/1280/390.

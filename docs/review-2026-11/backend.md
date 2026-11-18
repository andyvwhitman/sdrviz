# Backend review, 2026-11-17

Reviewer: backend engineer. Scope: `backend/`, `deploy/`, API docs. Read-only pass: no app code changed.
Checks run: `pytest -q` (3 sequential full runs: 327 passed each, about 36 s), `ruff check` and `ruff format --check` (clean),
live pokes against a private copy of the review database on port 8172 (a fake node enrolled and connected; the
owner's review backend on 8171 was only read from). Everything below marked "verified" was reproduced.

Effort: S under an hour, M a few hours, L a day or more.

## Ranked findings

### 1. Login and node-auth rate limits are global behind Caddy (availability) - HIGH, S

- `backend/app/routers/auth.py:11`, `backend/app/nodes/session.py:356`, `backend/app/auth.py:31-53`,
  `deploy/api/Dockerfile:35`.
- Problem: both limiters key on `request.client.host`. uvicorn is started without `--proxy-headers` /
  `--forwarded-allow-ips`, and its default trusted proxy is `127.0.0.1` only. Caddy reaches the api container from
  a docker network address, so every visitor, and every node, appears as the same client (Caddy).
- Failure scenario: anyone sends 5 wrong passwords in a minute and nobody, including the owner, can log in for a
  minute (repeat forever with one curl loop). Worse, `NodeRegistry.authenticate` checks `limiter.blocked(client)`
  before it looks at the secret (`nodes/service.py:236`), so 5 bad hellos make every node, even with a valid secret,
  get close code 4429. The logs also never show a real client address.
- Fix: run `uvicorn ... --proxy-headers --forwarded-allow-ips='*'` (safe here: the api port is not published, only
  Caddy can reach it, and Caddy sets `X-Forwarded-For`). Add a test that builds the app with an `X-Forwarded-For`
  header and checks two clients get separate budgets. Also count only failures for login (see 5).

### 2. One shared password is full admin, including outbound requests from the server - HIGH, M

- `backend/app/main.py:35` (`PROTECTED` all use the same `require_session`), `routers/transit.py:41-62`,
  `routers/radio.py:25`, `routers/nodes.py`.
- Problem: `deploy/README.md` and `.env.example` call it "the one shared viewer password", but a viewer session can
  also: create, rekey and revoke nodes; send `set_server` (move every node to another server) and `restart`;
  add transit sources whose `static_url` / `rt_*_url` / `api_key` are any URL (the server then fetches it: SSRF to
  the docker network or cloud metadata; the exception text lands in `status.error` as an oracle); set the rtl_tcp
  host (the server opens TCP connections to it); delete banks, frequencies and feeds.
- Failure scenario: the password is shared with a friend; a leaked or guessed viewer password hands over the node
  fleet and gives network reach from the server.
- Fix: two roles. Keep `SDRVIZ_PASSWORD` for viewing and add `SDRVIZ_ADMIN_PASSWORD`; the login body picks the role
  (`session["role"]`), and a `require_admin` dependency guards `nodes`, `transit` write routes, `radio/settings`,
  `feeds`/`banks`/`frequencies` writes and `sim`. Reject private, loopback and link-local addresses in source URLs
  (resolve then check) and cap `_download` size. Until then, say plainly in the README that the password is the
  admin password.

### 3. Session cookie is not `Secure`; no Origin check on state-changing requests - MEDIUM, S

- `backend/app/main.py:61` (`https_only=False`).
- Problem: the cookie has `SameSite=Lax` but no `Secure`. Caddy sends HSTS, which covers repeat visits, but the first
  `http://` request still sends the cookie in clear. Separately, POST/DELETE routes with no body (`/nodes/{id}/revoke`,
  `/rekey`, `/banks/{id}/activate`, `/transit/sources/{id}/refresh`, `DELETE /banks/{id}`) have no CSRF token or
  Origin check. `Lax` blocks other sites, but not sibling subdomains of `andyvwhitman.com` (same site), and `/ws/live`
  has no Origin check either.
- Fix: `https_only=settings.public_url.startswith("https")`. Add a small middleware that rejects non-GET requests
  and WebSocket upgrades whose `Origin` host differs from `Host`. One test each.

### 4. Server starts in production with the default password and secret - MEDIUM, S

- `backend/app/main.py:48` only logs a warning for `password == "sdrviz"`; the default `secret`
  (`dev-secret-change-me`) is not checked at all, and `.env.example` ships `change-me`.
- Failure scenario: a copy of `.env.example` is deployed; anyone can forge a session cookie (the secret is in the
  repo) without even needing the password.
- Fix: when `public_url` starts with `https://`, refuse to start if `password` or `secret` is a known default or the
  secret is shorter than 32 characters.

### 5. Limiter memory, login body size, success counted as attempt - MEDIUM/LOW, S

- `backend/app/auth.py:31-53`, `backend/app/schemas.py:14`.
- `_attempts` is a `defaultdict` that gains a key for every address ever seen (even `blocked()` creates one) and never
  shrinks. `allow()` records the attempt before the password is checked, so 5 correct logins a minute also lock out.
  `LoginIn.password` has no `max_length`, so an unauthenticated multi-megabyte body is parsed and compared.
- Fix: `pop` empty deques, record only failures (`allow` becomes `blocked` then `record` on failure),
  `password: str = Field(max_length=256)`, and `request_body { max_size 64KB }` for `/api/*` in the Caddyfile.

### 6. Bank push can silently skip nodes (newest commit) - MEDIUM, S

- `backend/app/runtime.py:162-177`, `backend/app/nodes/session.py:269-286`.
- Problem A: `_send_channels` suppresses only `NodeOffline`. `NodeSession.command` calls `self.send`, which raises
  `RuntimeError` (or `WebSocketDisconnect`) when the socket is already closing; that exception escapes the `for`
  loop, so nodes after the first broken one never get the new list. Nobody reads the task result
  (`run_coroutine_threadsafe(...)` future is dropped, runtime.py:172), so the failure is invisible.
- Problem B: `command()` catches `asyncio.CancelledError` (session.py:278) and turns it into a "timeout" result. A
  cancelled caller (client disconnect on `POST /nodes/{id}/commands`, or the background task cancelled in
  `run()`'s `finally`) keeps running and then writes a node event on a dead session.
- Problem C: `self._bank_channels` is set before sending (runtime.py:154) and a `timeout` or `failed` ack is never
  retried, so one lost ack leaves the node on an old list until the next bank edit. (On reconnect the list is
  re-sent, so it self-heals only that way.)
- Problem D: compare-and-set of `_bank_channels` and scheduling happen on worker threads with no lock. Two edits
  racing can schedule the older list after the newer one. I fired 20 parallel `POST /banks/live/channels` at a
  connected node: it converged on the right 29 channels (8 commands for 20 edits), so this is theoretical, not seen.
- Fix: in `_send_channels` catch `Exception`, log per node, continue; in `command()` let `CancelledError` propagate
  (catch only `TimeoutError`); in `_push_bank_channels` hop to the loop with `loop.call_soon_threadsafe` and do the
  compare and send there, sending `self._bank_channels` at send time (not a captured copy); log a warning on a
  non-`acked` result. Tests: a node whose socket is closed does not stop the next node; a `failed` ack is logged.

### 7. `POST /api/banks/live/channels` accepts values that cannot work - MEDIUM, S

- `backend/app/routers/banks.py:50-53, 73-92`.
- Verified: `feed_id` is never validated. With `bank-live` absent, `{"aar_channel":54,"feed_id":"bogus"}` returns 200
  and creates the bank with `home_feed: "bogus"`; `activate` then makes `/api/live/state` carry `displayed_feed:
  "bogus"` while `/api/feeds/bogus` is 404. (`PUT /banks` does validate this at banks.py:25; the new route skips
  `checked()`.) The bank's home feed also dangles when its node is revoked (`delete_feed` guards it, revoke does not).
- Verified: `aar_channel` is `1..255`, but the AAR band is 1..97 (node pipeline drops anything outside its window,
  `node/pipeline.py:86`). `aar_channel=255` created `live-ch255` at 163.935 MHz and got 200; the node acks `ok` and
  decodes nothing, the UI shows it as listened to. Each such click also leaves a permanent placeholder row.
- Fix: `Field(ge=1, le=97)`; 422 when `feed_id` is not in `rt.world.feeds`; when a bank's home feed disappears,
  repoint it to the first existing feed in `reload_world` (or treat a dangling home as unset in `live_state`).

### 8. Node REST edge cases - MEDIUM/LOW, S

- `backend/app/routers/nodes.py:58-61, 84-91`, `backend/app/nodes/service.py:224-227`.
- Verified: `POST /api/nodes/node-nonexist/commands` returns 409 "Node is not online"; the doc and the router's own
  `except NodeNotFound` say 404. `send_command` never raises `NodeNotFound`.
- `PATCH` preset to `banks` while no bank holds a channel builds `ChannelsIn(channels=[])`, which fails
  `min_length=1` with an unhandled `ValidationError` (confirmed in a shell): 500. Skip the push when the list is empty
  (as `_push_bank_channels` already does).
- Fix: look the node up first (raise `NodeNotFound`), then check online. Guard the empty list.

### 9. Transit caches are rebuilt in place while worker threads read them - MEDIUM, S

- `backend/app/transit/amtraker.py:131-155`, `backend/app/transit/gtfs_provider.py:416-419, 467-484, 856-862`.
- `match_trips` does `self._matched = {}` and then fills that same dict; sync route handlers (worker threads) read
  `_matched` for boards and trips in the meantime and see a train as unmatched for a moment (boards lose their live
  estimate for one request, or `trip()` falls back to the schedule). `passing_at` sets `self._passing_at[id] = found`
  then returns `self._passing_at[id]`; `on_static_loaded` (event loop) calls `.clear()` between the two lines: a rare
  `KeyError`. Same shape for `_paths`, `_passes`, `_station_points`.
- Fix: build into a local dict and assign once (`self._matched = matched`); in the lazy getters return the local value
  (`found`), not a second lookup; on static load swap in fresh empty dicts instead of `.clear()`.

### 10. `reload_world` runs on worker threads and touches the replay engine - MEDIUM (sim only), M

- `backend/app/runtime.py:144-148`; callers are the sync handlers in `routers/banks.py`, `frequencies.py`, `feeds.py`.
- `reload_world` replaces `self.world` and calls `engine.resync()`, which `.clear()`s `_tracked` that the engine tick
  iterates on the event loop (`sim/engine.py:158`, `:293`). The author already knew (`routers/sim.py` makes `jump`
  `async` "so that the resync and snapshot run on the event loop"), but the CRUD routes do not. The tick catches the
  exception and skips a tick, so the damage is a dropped tick or an inconsistent snapshot, in the simulation only
  (production has `SDRVIZ_SIM=false` and the engine never starts). It also re-reads and re-parses `places.json` and
  `routes.json` from disk on every bank or frequency edit (`sim/world.py:70`).
- Fix: make the mutating handlers `async def` calling `await run_in_threadpool(...)` for the DB part and
  `rt.reload_world()` on the loop, or have `reload_world` end with `loop.call_soon_threadsafe(self.engine.resync)`.
  Cache the two JSON files in `World` creation (they never change at runtime).

### 11. The flaky test: fixed ports, so overlapping runs collide - MEDIUM (dev), S

- `backend/tests/test_node_ws.py:27` (`PORT = 8161`), `backend/tests/test_agent.py:28` (`8162, 8163`),
  `backend/tests/live_server.py`.
- Verified: three sequential `pytest -q` runs all passed. Two overlapping runs (`pytest tests/test_node_ws.py
  tests/test_agent.py` twice at the same time) gave one clean run and one `ERROR
  tests/test_node_ws.py::test_fake_node_end_to_end`; the log shows uvicorn `startup` calling `sys.exit(3)` in the
  server thread because 8161 was taken. That is the "1 failure". On this machine four reviewers and the owner run
  pytest and dev servers side by side, so overlap is the likely cause.
- The hang is the same mechanism, not reproduced: when the port is held by the other process's server, the agent
  tests connect to a foreign server with a foreign database; each wait loop (`wait_status` 15 s, `commands` timeout
  40 s, `until` 10 s, `live.recv` 10 s inside a 30 s loop) stacks up, and a failed agent test can leave the agent's
  non-daemon DSP threads alive at interpreter exit. Treat "hung" as unproven, but it points here.
- Fix: bind port 0 and read the chosen port (`LiveServer` can use `uvicorn.Server.servers[0].sockets[0].getsockname()`
  after `started`), or pick a free port with a throwaway socket in a fixture. Add `pytest-timeout` (`timeout = 120`)
  to `requirements.txt` and `pyproject.toml` so a hang fails instead of blocking.

### 12. Smaller correctness items - LOW, S each

- `transit/amtraker.py:272`: `self.motion.bearing(id) or HEADINGS.get(...)`: a due-north bearing of `0.0` is falsy and
  falls back to the coarse compass heading. Use `is not None`.
- `routers/system.py:115-122`: `git rev-parse` runs as a subprocess on every `GET /system/backend`. Cache at import.
- `routers/live.py:78`: `{"op":"audio","channels":5}` or a list-of-lists makes `c in rt.world.freqs` raise `TypeError`
  and the handler dies (authenticated clients only). Validate `isinstance(list)` and `isinstance(str)`.
- `nodes/session.py:99, 104`: background tasks are cancelled but not awaited; `self.command(channels)` on connect can end
  with "Task exception was never retrieved" if the socket drops first.
- `nodes/models.py` `NodeEvent`: no pruning; a flapping node adds rows forever (3 per reconnect). Keep the last N.
- `models.PrefsModel`: `muted`, `solo`, `record`, `volume` accept unknown ids and unbounded sizes.
- `routers/nodes.py` async handlers call blocking SQLite and `reload_world` on the event loop (`patch_node`,
  `revoke_node`, `EnrolledAck` in `session._on_text`); fine at this size, but combine with 10.
- `transit/provider.py:171-180`: `_download` has no size limit or total timeout beyond the client's 60 s.

### 13. Deploy files - LOW

- `deploy/compose.yml:29-31`: firewall and Caddy comment promise HTTP/3 (`udp 443` open in `provision.sh:94`) but only
  TCP 443 is published. Add `"${SDRVIZ_HTTPS_PORT:-443}:443/udp"` or drop the firewall rule.
- Hardening for the api container: `read_only: true` with `tmpfs: /tmp` (it writes only to `/data`), `cap_drop: [ALL]`,
  `security_opt: [no-new-privileges:true]`, a `mem_limit`. Pin `python:3.14-slim` and `caddy:2-alpine` by digest.
- `deploy/caddy/Caddyfile`: no `Content-Security-Policy` or `Permissions-Policy`; no `request_body` limit (see 5).
- `deploy/README.md` says "the one shared viewer password" and "API port 8100 is not published": both correct, and see 2.
- `setup.sh` is sound (keys only, `umask 077` for `.env`, unattended upgrades); SSH open to the world is the owner's
  recorded choice.

### 14. Dead code - LOW, S

- `backend/app/interfaces.py` (whole module, no importer), `backend/app/services/__init__.py` (empty package),
  `db.session_scope` (`db.py:57`), `routers/sim.py` and `routers/trains.py` are the replay's fake-only endpoints (the
  file says "delete with the fake"; keep until SIM goes). `Path.locate` and `.at` are used. Ruff is clean.

### 15. API and doc consistency

- `docs/node-protocol.md:17,141` still say the only preset is `aar` and that `config.channels` is "7 to 97". The default
  is now `banks` (`nodes/service.py:29`), which follows bank edits and is pushed on connect and on bank/frequency
  changes. Event kind `error` is documented (line ~110) but nothing emits it. Document the 404/409 behaviour as fixed.
- `POST /api/banks/live/channels` and `DELETE .../{n}` exist only in `docs/decisions.md` row 54; add them to a doc
  (and say that `feed_id` only counts when the bank is first created).
- `docs/transit-api.md` is accurate for the routes that exist; it has no entry for the planned `approaching` route.
- `GET /api/transit/vehicles` returns mixed time zones (`updated` in `Z`, others in `-05:00`); both are valid ISO 8601
  but a client that compares strings will be surprised. Decide one form (UTC) for the new endpoint.

## Newest commit (bb89eb7): what I poked and found

Verified working: node on `banks` receives a `channels` command on connect and after each bank edit; duplicate add
sends nothing; remove restores the previous list; 20 concurrent adds converged to the right 29 channels; unknown
`aar_channel` 0 and 256 give 422; `DELETE` of a channel in no bank is a harmless 200. Findings from the poke are 6, 7
and 8 above. Test gaps: only the live-channel routes have a push test (`test_node_ws.py:495-532`); there is none for
`PUT /banks`, `PUT/DELETE /frequencies` changing the list, for a dead socket during `_send_channels`, for an invalid
`feed_id`, for the empty-list PATCH, or for the `again` branch actually asserting "no push". Other gaps: no test of the
login limiter behind a proxy header, none for transit `vehicles()` thread-safety, none for `/ws/live` with malformed ops.

## Trainspotting page: backend plan

Goal: a standalone page. Input: a position. Output: every train that will pass (or just passed) that position, with
train number, operator and ETA. This is a service on top of what exists; most of the maths is already written.

### What the transit service already has (and I measured)

- `Vehicle` (models.py:32): lat/lon, bearing, speed, `delay_s`, `trip_id`, `position` realtime or estimated,
  `age_s`/`stale`. For 191 vehicles `GET /transit/vehicles` takes about 18 ms end to end (measured on 8171), so
  building all vehicles per request is cheap enough; no cache is needed to start.
- `GtfsProvider.legs(trip_id, day)` (gtfs_provider.py:262): the trip's stops with scheduled times and the realtime delay
  overlaid. Amtraker trains are matched to GTFS trips (`_matched`, amtraker.py:129) and their stop times arrive as the
  same legs through a synthetic `TripUpdate`, so one code path serves Amtrak, MARC, VRE, MBTA and Brightline.
- `GtfsProvider._path(trip, legs)` returns the cached `Path` of the trip's own shape (oriented in the trip's travel
  direction), `Path.project(lat, lon)` gives `(distance along, metres off)`, `Path.at(d)` gives lat/lon/bearing,
  `Path.locate(lat, lon, after)` gives the along-distance of each stop in order. `_interpolate` (gtfs_provider.py:614)
  already uses these to place a train without a position.
- `passes.pass_time(legs, PassPoint(station, after, frac))` (passes.py:55) interpolates a scheduled time between two
  bracketing stops and blends the two stops' delays. It is exactly "scheduled time at a point between stops plus the
  realtime delay"; the point does not have to be a station.
- `_shape_box(shape_id)` (gtfs_provider.py:486) is a cached padded bounding box per shape, for cheap rejection.
- Coverage: only sources with trips and vehicles (amtrak, marc, vre, mbta, brightline). The 13 `kind: "lines"` sources
  (LIRR, Metra, SEPTA, ...) have shapes and stations but no trains; for those the endpoint can only say "a line is
  here".

### Endpoint

```
GET /api/transit/approaching
    ?lat=38.97&lon=-76.70          required (-90..90, -180..180)
    &radius_km=2                   default 2, 0.1..25: how close the train's track must pass
    &ahead_min=60                  default 60, 1..360: trains arriving within this window
    &back_min=10                   default 10, 0..60: trains that passed within this window
    &scheduled=false               true adds trains not yet running (schedule only)
    &agency=MARC                   optional filter (same rule as /vehicles)
    &limit=50                      default 50, max 200
```

Auth, `RT` dependency and error style as the other transit routes; plain `def` (worker thread) like `/vehicles`.
`503` when transit is off; empty list (not 404) when nothing is near. Response:

```jsonc
{
  "generated": "2026-11-17T19:30:12Z",           // UTC, one form
  "position": {
    "lat": 38.97, "lon": -76.70, "radius_km": 2.0,
    "snap": {                                     // where the nearest line passes, null if none within 25 km
      "lat": 38.9712, "lon": -76.6988, "distance_m": 185,
      "line": "marc:11705", "line_name": "PENN - WASHINGTON", "bearing": 41.0   // track direction there
    }
  },
  "trains": [{
    "key": "marc:Train448@2026-11-17",           // trip id + service day: stable list key for the page
    "trip_id": "marc:Train448",                   // works with /transit/trips/{id}
    "vehicle_id": "marc:000012",                  // null when not running yet
    "source": "marc", "agency": "MARC",           // operator
    "train": "448", "route_name": "PENN - WASHINGTON",
    "headsign": "BALTIMORE", "origin": "UNION STATION", "destination": "PENN STATION",
    "state": "approaching",                       // approaching | at_point | passed | scheduled
    "eta": "2026-11-17T20:26:58-05:00",           // when it is nearest the position (passed: when it was)
    "eta_in_s": 3406,                              // negative once passed
    "scheduled": "2026-11-17T20:26:58-05:00",     // timetable time at that point
    "delay_s": 0, "status": "on_time",            // null / "unknown" without realtime
    "eta_basis": "realtime",                      // realtime | schedule | position
    "pass_distance_m": 185,                       // closest approach (off the line, not the radius)
    "to_go_km": 31.2,                             // along the track, null when not running
    "stopping_here": null,                        // {stop_id, name} when it has a stop within 400 m
    "between": {"from": "ODENTON", "to": "BWI RAIL STATION"},   // the stops bracketing the point
    "direction": {"bearing": 41.0, "cardinal": "NE"},
    "vehicle": {"lat": 38.80, "lon": -76.95, "speed_mph": 61.0, "age_s": 12, "stale": false,
                "position": "realtime"}            // for a "where is it now" dot; null when scheduled
  }],
  "meta": {
    "sources": [{"id": "marc", "state": "ok", "rt_age_s": 14}],
    "warming": [],                                 // sources skipped for the same reason /vehicles skips them
    "skipped": {"no_shape": 0, "unmatched": 2}     // running trains we could not place on a line
  }
}
```

Sorting: `approaching` and `at_point` by `eta`, then `passed` by most recent first. The page can group on `state`.
`include_scheduled` trains (state `scheduled`) merge in by `eta`. All times are timezone-aware and serialised once.

### ETA method (per train)

Everything is in distance along the trip's own shape, so direction and "already passed" fall out of the geometry.

1. Candidate trips. Running trains: `provider.vehicles(now)` rows that have a trip (Amtraker rows map to their GTFS
   trip through `_matched`; add a reverse map `trainID -> (trip_id, day)` built in `match_trips`). Scheduled-only trips
   (when `scheduled=true`): trips active on yesterday/today/tomorrow whose time window overlaps `[now-back, now+ahead]`
   and that are not already running (key on `(trip_id, day)`).
2. Project the point once per distinct shape, not per train: `by_shape[shape_id] = path.project(lat, lon)` after a
   bounding-box reject using `_shape_box(shape_id)` padded by `radius_km`. Keep the shape only if `off <= radius_km`.
   `d_p` (along-distance of the point) and `off` (pass distance) come from this.
3. Place the train's legs on the shape: reuse `_interpolate`'s loop (`legs = [leg for leg in legs if stop in feed.stops
   and not leg.skipped]`, `dists[i] = path.locate(stop, after)`), cached per `(shape_id, stopping pattern)` like
   `_passes`. If `d_p` is outside `[dists[0], dists[-1]]` by more than the radius the trip does not serve the point
   (it ends before or starts after): skip.
4. Bracket and interpolate: `i = bisect(dists, d_p) - 1`, `frac = (d_p - dists[i]) / (dists[i+1] - dists[i])`, then
   `pass_time(legs, PassPoint("point", i, frac))` gives the scheduled time and the blended delay; `eta = scheduled +
   delay` when the delay is not `None`, else `scheduled`. `eta_basis` is `realtime` or `schedule`. Time between two
   stops is linear in distance (the train accelerates, so inside a long leg the error is a minute or two; flag it,
   do not hide it).
5. Where is the train: project the vehicle's own lat/lon on the same path (`d_v`, with an `off` sanity check: more than
   1 km off means the position and trip disagree, fall back to the clock). Then:
   - `d_v < d_p - 150 m`: `approaching`; `to_go_km = (d_p - d_v) / 1000`.
   - `|d_v - d_p| <= 150 m`: `at_point`.
   - `d_v > d_p + 150 m`: `passed`; keep only if `eta >= now - back_min`.
   - Clamp: an approaching train never gets an `eta` earlier than `now + to_go / 160 mph`; if the delay arithmetic says
     it should already be here, show `now` plus that floor and `eta_basis: "position"`. This is the one place the
     position beats the feed.
   - No usable position (estimated, stale, or `d_v` unknown): decide by clock: `eta > now` is approaching, else passed.
6. `stopping_here`: nearest of the trip's stops to the snapped point within 400 m (the same idea as `PASS_MARGIN_M`).
   Railfans want "stops here" versus "passes through".
7. `between`: the names of `legs[i]` and `legs[i+1]`; `direction.bearing` from `Path.at(d_p)`.

### Edge cases

| Case | Handling |
|---|---|
| Train already passed | Kept with `state: "passed"`, negative `eta_in_s`, until `back_min`; the list shows them dimmed. |
| Train on the line but heading away (a different trip, other direction) | Cannot happen to the wrong train: each trip has its own oriented shape, so a southbound and a northbound train are separate candidates and each has its own `d_v` vs `d_p`. |
| No realtime (source has none, trip update missing, MARC rows with `delay_s: null`) | Schedule time, `delay_s: null`, `status: "unknown"`, `eta_basis: "schedule"`. Shown, labelled "scheduled". |
| Stale position (`age_s > stale_after_s`) | Still listed from the clock and delay, `vehicle.stale: true`, no position clamp. |
| Source warming (`provider.warming`) | Skipped and listed in `meta.warming`, same as `/vehicles`. |
| Live train with no schedule match (extra section, reroute) | Cannot be placed on a shape. Listed in `meta.skipped.unmatched` count only in v1; v2 could use straight-line distance / speed with `eta_basis: "position"`. |
| Point far from any line | No `trains`; `position.snap` is the nearest line within 25 km (distance, route name) or `null`; the page says "nearest line is 7.4 km away, MARC Penn Line". The nearest-line lookup needs a small `LineIndex.nearest(lat, lon, max_km)` using the existing `_nearest` over the route polylines (bounds first). Beyond 25 km: `snap: null`. |
| Point exactly on a station | Works: `stopping_here` set, ETA equals the station's time (prototype below). |
| Shape with fewer than two points, trip without a shape, trip not in `stop_times` | Skipped, counted in `meta.skipped.no_shape`. |
| Path passes the point twice (a loop) | Take the closest approach per trip; a second pass is ignored in v1. |
| Service day edges (24:30 times, midnight) | Use `trip_day(trip, now)` for running trains and yesterday/today/tomorrow for scheduled ones, as `station_board` does. |
| Lines-only sources | No trains; counted in `meta.sources` as `kind: "lines"`. |

### Cost and what is cheap enough

- Prototype (scratchpad `be3/proto.py`, `proto2.py`, not app code) on the cached static feeds, scheduled trips only:
  MARC point at Bowie: 5 trains in 58 ms for a full scan of 176 trips; train 451 came out at 20:02:01 against a timetable
  stop time of 20:02, train 455 at 21:19:01 against 21:19. That confirms the geometry and the interpolation. Amtrak
  (1,540 trips, 147 shapes, biggest 3,553 points) naive scan: 250-310 ms for a point near Wilmington or Chicago; a point
  with no line is 1 ms.
- The naive scan is slow only because it rebuilds `legs` and re-runs `locate` for every trip. Running trains are about
  130 Amtrak plus 20 others, so the live path touches under 40 trips after the shape reject: expect 10-30 ms.
  Scheduled-only mode needs the cache of `dists` per `(shape_id, stopping pattern)` and an early time-window reject from
  the first and last stop-time seconds; with those it should be about 30 ms for Amtrak. Both are cheap enough to
  compute per request; no database and no new background job.
- Per request: one bbox test per shape (147), one numpy projection per surviving shape (about 0.3 ms each), then
  arithmetic per train. Optionally keep a 3 s LRU keyed on `(round(lat, 3), round(lon, 3), radius, ahead, back,
  scheduled)` so a page that refreshes every 10 s from several tabs costs one computation.
- Concurrency: run as a plain `def` route. Follow finding 9: do not mutate shared caches in place, so the new caches
  (`_dists_by_pattern`) are replaced on static load, not cleared.

### Where the code goes

- `backend/app/transit/approach.py`: pure functions (`ProjectedShape`, `bracket()`, `classify()`, `eta_for()`), unit
  tested without a provider, like `passes.py`.
- `GtfsProvider.approaching(point, now, radius_m, ahead, back, scheduled)`; `AmtrakerProvider` overrides the
  vehicle-to-trip lookup. `TransitService.approaching(...)` merges providers and builds `meta`.
- `models.py`: `Approaching`, `ApproachingTrain`, `ApproachPosition`; router function in `routers/transit.py`
  (declared before `/trips/{trip_id:path}`, which would swallow nothing but keeps related routes together).
- Docs: a new "Approaching trains (v1.5)" section in `docs/transit-api.md`.
- Tests (`tests/test_transit_approach.py`): straight-line shape fixture with three stops, a vehicle behind, at and
  past the point, delay applied, no realtime, point 10 km off, reversed direction trip, an unmatched Amtrak train
  counted, a warming source skipped. Reuse the fixtures in `test_transit_passes.py`.

### Effort and order

1. `approach.py` plus its unit tests (S/M).
2. `GtfsProvider.approaching` for running trains, router, API test with the existing fixture feeds (M).
3. Amtraker mapping and the nearest-line lookup (S/M).
4. `scheduled=true` with the `dists` cache (M).
5. Doc section; then the page.

### Questions for the owner

- Is "ETA to the closest point on the line" right, or does the page also want "ETA to the nearest station"? The same
  engine can answer both (`stopping_here` and the neighbouring `between` stops give the second for free).
- Should unplaceable live trains (extra sections) appear with a coarse speed-based ETA, or stay hidden?
- Radius default: 2 km suits a trackside spot; a city view may want 10 km. Which should the page open with?

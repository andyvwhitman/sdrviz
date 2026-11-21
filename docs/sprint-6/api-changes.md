# Sprint 6 lane A: API changes (sessions and the server clock)

Decision 73 (every session is its own) and the key timer fix. Lane G documents the API from this.

## The node a client listens to belongs to the connection

`Prefs.listen_feed` is gone from the server. A client keeps its choice in the browser (localStorage) and tells the
server per connection. Any role may choose; it changes nothing shared.

### WebSocket `/ws/live`

- Connect with an optional query parameter: `/ws/live?listen=<feed_id>`. An unknown or missing feed means the default
  (the first online node, else the first feed). The first `snapshot` is already for that node.
- Client op `{"op": "listen", "feed_id": "<feed id>"}`: switch this connection to another node. The server answers
  with a fresh `snapshot` **to this connection only** (`state.listen_feed` is the node it was built for, resolved to
  the default when the id was unknown).
- Every `snapshot` after a shared change (assignments, frequencies, nodes, receiver settings, a clock jump, the
  30 s keyframe) is built once per distinct listened node and sent to the connections listening to it. The channels in
  a snapshot (and so the tiles) are the listened node's enabled frequencies.
- Unchanged and shared by all: `keyup`, `keydown`, `words`, `channel`, `feed`, `faults`, `trains`, `lofar_row`,
  `level`, `tick`. A client applies `channel` patches only to channels it has.
- Hold-to-listen (`listen_hold`, `listen_release`, `listen_state`) is per connection as before. A node decodes its
  enabled assignments plus every held channel, whoever is listening to it.

### REST

- `GET /api/prefs`, `PUT /api/prefs`, `PATCH /api/prefs`: `listen_feed` is removed from the body and the answer
  (a sent `listen_feed` is ignored). The rest (`muted`, `solo`, `record`, `volume`) is still stored but the app no
  longer uses it: mute, solo, record and volume are now the browser's own too (localStorage `sdrviz.prefs.v1`).
  A viewer never gets 403 from these any more for a node switch.
- `GET /api/live/state?listen_feed=<feed id>`: the snapshot for that node (default as above).
- `POST /api/sim/jump` answers with `scenario_feed`: the node a scenario is about (null for a plain clock jump).
  The caller may choose to listen to it; the server no longer switches anybody.
- Database: the old `prefs.listen_feed` column is left in place, nullable and unused (no migration needed, older
  databases keep working).

## The server is the one clock (key timer)

- `tick` is sent once a second in every mode. With `SDRVIZ_SIM=false` (nodes only) nothing sent it before; now the
  runtime does (`Runtime.send_tick`). With the replay running, the replay engine sends it as before. The radio's
  own copy of the tick is gone. `tick` carries `speed`.
- `keyup` carries `now`: the server clock when it was sent (equal to `t`, the key-up's start). Key-up start times
  are always stamped by the server clock on arrival; the node's own `t` (epoch ms) in its `key_up` message is not used.
- Client: the sim clock is re-anchored on every `snapshot`, `tick` and `keyup.now`; the elapsed time of a key-up is
  `keyAge(now, t)` (never negative, never read as nearly a day).

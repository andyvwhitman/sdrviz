# Node protocol and node API (v1)

Contract between the server (backend), the `sdrviz-node` agent, the fake node (`tools/fake_node.py`) and the Settings UI. Design background: `docs/deployment-architecture.md`, decisions 35-39 and 49. Code: `backend/app/live/node_protocol.py` (messages, node key, frames) and `backend/app/live/opus.py`. Change this file in the same commit as any change to the contract.

Part 1 is the uplink a node speaks to `/ws/node`. Part 2 is the REST API the browser uses (`/api/nodes`, behind the session cookie like every other endpoint, JSON, times ISO 8601 with offset).

## Part 1. Uplink `/ws/node`

One WebSocket per node, node to server, `wss://<server>/ws/node` (`ws://` only for a laptop). Text frames are JSON messages `{"type": ..., ...}`; unknown fields are ignored, unknown `type` is a protocol error. Binary frames carry audio and spectrum, node to server only. Epoch times (`t`, `peer_t`, `server_time`) are milliseconds since 1970; the server does not trust the node's clock for anything except audio age and display.

### Handshake

1. The node connects and must send `hello` within 10 seconds (else close 4408).
2. `hello`: `{type, protocol: 1, agent_version, node: "<node id>", mode: "enroll"|"connect", secret}`. `mode: "enroll"` carries the enrollment secret from the node key; `"connect"` carries the permanent node secret.
3. The server answers `welcome` or closes with a code (table below).
   `welcome`: `{type, protocol: 1, node: {id, number, name}, heartbeat_s: 5, server_time, config: {channels: [<AAR channel numbers>]}, node_secret?}`.
   - `config.channels` is the node's preset as AAR channel numbers (preset `aar` = 7 to 97, all 91). The node receives these channels until a `channels` command changes them. Tuning (`center_hz`, `rate`, gain, squelch) stays on the node; it applies `tune`, `gain` and `squelch` commands and keeps them across restarts (agent config), and reports the current values in `health.tune`.
   - `node_secret` is present only in answer to `mode: "enroll"`. The node saves it (atomically, mode 0600), then sends `enrolled_ack`.
4. `enrolled_ack` `{type}`: the server then burns the enrollment secret. Until it arrives, the enrollment key stays valid (it can only be used by this node anyway).
   - Lost ack: the node reconnects with `mode: "connect"` and the new node secret. The server accepts it and treats that as the ack. If the node never saved the secret it reconnects with `mode: "enroll"` again and gets a fresh `welcome` with a new `node_secret` (the key is still within its 24 h and unburned).
5. After `welcome` both sides may send anything below at any time.

Protocol versions: the node sends `protocol: 1`. A server that does not support it closes with 4426. Within version 1, new optional fields and new message types may be added; both sides ignore fields they do not know, and the server ignores (and logs) node message types it does not know.

### Heartbeat

Both sides send `ping` `{type, t}` every 5 seconds (`t` = sender's epoch ms); the other side answers at once with `pong` `{type, t, peer_t}` (`t` copied, `peer_t` = its own clock). The sender computes RTT = now minus `t`.

- Any message from the peer counts as proof of life; a `pong` is not required to keep the link, but it is what gives the RTT.
- Server: a beat is "missed" when no `pong` arrives within 5 s of its `ping`. After 15 s with nothing received at all (3 beats) the server marks the node OFFLINE and closes the socket (4500).
- Node: the same rule against the server; after 15 s with nothing received it closes the socket and reconnects.

### Up (node to server), JSON

| type | fields | notes |
|---|---|---|
| `key_up` | `ch` (AAR channel), `freq_hz`, `tx_seq`, `t`, `snr_db`, `power_db` | A squelch opened. `tx_seq` is a node-local counter, unique per transmission since node start; the audio frames of the transmission carry the same number. |
| `key_down` | `ch`, `tx_seq`, `t` | The transmission ended; the last audio frame had FLAG_LAST. |
| `levels` | `t`, `open: [{ch, power_db, snr_db}]` | Every 100 ms while at least one channel is open. Drives the level meters (the server's `level` messages to browsers). |
| `health` | `t`, `cpu_pct` (all cores, 0-100), `temp_c` (or null), `rtl_tcp` (`connected`/`connecting`/`down`), `dropped_blocks` (since start), `audio_age_ms`, `uptime_s`, `channels` (count received), `tune` `{center_hz, rate, gain_db (null = auto), squelch_db}` | Every 5 s, and once right after `welcome`. `audio_age_ms` = average age of an audio packet (from the end of its IQ block to the socket write) over the last interval. |
| `ack` | `id`, `ok`, `error?` `{code, message}` | Answer to a command. `code`: `bad_value`, `unsupported`, `failed`. |
| `enrolled_ack` | none | See handshake. |
| `ping` / `pong` | see heartbeat | |

### Down (server to node), JSON

Every command has a string `id` (unique per server run). The node answers each with exactly one `ack` with that `id`, after it has applied the command (or refused it). The server waits 10 s for the ack (30 s for `restart` and `set_server`); no ack means the command timed out and the REST call reports it. Commands are not queued while the node is offline.

| type | fields | effect |
|---|---|---|
| `tune` | `center_hz`, `rate` | Retune rtl_tcp. `rate` must be a multiple of 48000. |
| `gain` | `gain_db` (null = automatic) | Tuner gain. |
| `squelch` | `squelch_db` | Squelch opens this far above the channel noise floor. |
| `channels` | `channels: [AAR numbers]` | Replace the received channel list (a preset change). |
| `restart` | none | Ack first, then restart the agent process (systemd brings it back; the node reconnects). |
| `set_server` | `url` (`https://host`) | Test a connection to the new address (full hello with the node secret, welcome received); if that works, save it and reconnect there, else keep the old address. The ack reports the outcome (`failed` when the test failed). |
| `ping` / `pong` | see heartbeat | |

### Binary frames (node to server)

`[node number: 2 bytes big-endian][a /ws/live frame]`. The node number is the `number` in `welcome.node`; a frame whose number differs from the connection's is dropped. The inner frame is exactly the `/ws/live` format of `backend/app/live/protocol.py` (all big-endian):

- Audio: `kind=1 (1 byte), codec (1), ch (1), flags (1), tx_seq (4), offset_ms (4)` then payload. On the uplink `codec = 1` (`CODEC_OPUS`): the payload is one Opus packet, 8 kHz mono, 20 ms (160 samples), about 12 kbit/s. `ch` is the AAR channel, `flags` bit 0 FIRST (first packet of a transmission), bit 1 LAST. `offset_ms` = start of this packet in milliseconds since the key-up (0, 20, 40, ...). The decoder is reset on FLAG_FIRST. Packets are sent as they are made; the node never buffers audio while offline (they are dropped).
- Spectrum: `kind=2, 0, bin count (2), center_mhz (float32), span_mhz (float32), t_ms (4)` then one int8 dBFS per bin, lowest frequency first, 1024 bins, about 5 per second. The server publishes them to browsers as the feed `node-<number>`.

### Server behaviour (for BE-5 and FE)

- **Status.** PENDING: created, never enrolled. ONLINE: socket up and a heartbeat in the last 15 s. OFFLINE: enrolled, no live socket. REVOKED: revoked in Settings (final until re-keyed). The socket of a revoked node is closed with 4403 at once. A second connection for the same node replaces the first (the old one gets 4409).
- **Link quality (0 to 100, null unless ONLINE).** Over a sliding 60 s window (12 beats): `rtt_score` = 100 at a median RTT of 100 ms or less, falling linearly to 0 at 2000 ms; `miss_score` = 100 x (1 - missed beats / beats sent); `reconnect_score` = max(0, 100 - 20 x reconnects in the last hour). `link_quality = round(0.4 x rtt_score + 0.4 x miss_score + 0.2 x reconnect_score)`.
- **Lag (ms, null unless ONLINE).** `lag_ms = round(median RTT / 2 + health.audio_age_ms)`: what a viewer hears is about this much behind the air, not counting the browser's own buffer.
- **Overlap.** Remote nodes and the LAN `RadioSource` feed the same channels. When two sources hear one channel, the first key-up wins and owns the channel until its key-down; the other source's audio and key-up for that channel are ignored for that transmission (decision 49).
- **Audio to browsers.** The server decodes Opus to 8 kHz s16 PCM (one decoder per channel, reset on FLAG_FIRST) and sends today's PCM audio frames on `/ws/live`: re-cut into 100 ms chunks (1600 bytes, the last one of a transmission shorter), `offset_ms` 0, 100, 200 ..., FLAG_FIRST on the first and FLAG_LAST on the last, so browsers see no change. The first chunk comes out about 100 ms after the first packet. The `tx_seq` on `/ws/live` is the server's own number (2 000 000 001 and up), not the node's. `key_up`, `key_down` and `levels` become the same `keyup`, `keydown` and `level` messages the LAN receiver produces, with `feed_id` and the reception's `feed_id` set to the node's feed (`node-<number>`).
- **Node feeds.** An enrolled, not revoked node is a feed in the world (`GET /api/feeds`, `/api/live/state`, driver `sdrviz-agent`) with id `node-<number>`, hearing the channels of its preset, so a browser can `watch` it for spectrum. The feed appears when the enrollment is acknowledged and goes away on revoke; renaming, moving or changing the preset updates it. Its waterfall backfill is empty (floor), like the LAN receiver's. Spectrum frames are forwarded only while some browser watches the feed.
- **Unknown channels.** A `key_up` on an AAR channel that is not in the frequency table is ignored (no event, its audio is dropped). Audio for a channel without an accepted key-up is dropped.
- **A dropped node.** When the socket closes (or the heartbeat is lost) every transmission the node had on air is ended with a `keydown`, its status becomes OFFLINE and an event `offline` is logged.
- **Client address.** Failed authentications are counted per `websocket.client.host`. Behind Caddy run uvicorn with `--proxy-headers` and `--forwarded-allow-ips` for the proxy so this is the real address.

### Close codes

| code | meaning | node does |
|---|---|---|
| 4400 | malformed or unexpected message | reconnect with backoff |
| 4401 | unknown node or wrong secret | stop; needs a new key |
| 4403 | node revoked | stop; needs a new key |
| 4408 | no hello within 10 s | reconnect |
| 4409 | replaced by a newer connection of this node | reconnect |
| 4410 | enrollment key expired or already used | stop; needs a new key |
| 4426 | protocol version not supported | stop until the agent is updated |
| 4429 | too many failed attempts from this address | reconnect with backoff |
| 4500 | server error, restart, or heartbeat lost | reconnect |
| 1000/1001/1006, no frame | normal close, going away, network loss | reconnect |

"Stop" means: do not retry, log the reason, keep running the rest (the service stays up and `sdrviz-node status` shows the reason) so a new key can be enrolled without rebooting.

### Reconnect backoff (node)

Delay before attempt n (n = 0, 1, 2, ...) = `min(60, 2^n)` seconds times a random factor between 0.5 and 1.0. Reset n to 0 once a connection has stayed up 30 s. Failed hellos (4429) count like any failure. While offline the node keeps receiving and decoding but drops audio.

### Node key

`sdrviz-node1.<base64url, no padding, of the JSON {"url": "https://host", "node": "<node id>", "secret": "<enrollment secret>", "v": 1}>`. Valid 24 hours, single use. Secrets are 32 random bytes, base64url (43 characters). The server stores only SHA-256 hashes (BE-4). The server writes its own address into the key from the setting `SDRVIZ_PUBLIC_URL` (default `http://localhost:8100`). The agent derives the WebSocket address from `url` (`https` to `wss`, `http` to `ws`, path `/ws/node`).

## Part 2. REST API (browser, Settings)

All under `/api`, session cookie required (401 without it). Errors: `{"detail": ...}` with 404 (unknown id), 409 (state does not allow it), 422 (validation). Keys and secrets are never returned by any GET; the node key appears once, in the answer to the call that created it.

```
Node {
  id: string                    // "node-" + 8 lowercase letters/digits, never reused
  number: number                // 1..65535, assigned once; the binary frame prefix
  feed_id: string               // "node-<number>", the spectrum feed to watch on /ws/live
  name: string
  location: { lat: number, lon: number }
  preset: string                // channel preset; "aar" = AAR 07-97 (default)
  status: "PENDING" | "ONLINE" | "OFFLINE" | "REVOKED"
  link_quality: number | null   // 0-100, only ONLINE
  lag_ms: number | null         // only ONLINE
  last_seen: string | null      // last message from the node
  agent_version: string | null  // from the last hello
  health: { cpu_pct, temp_c, rtl_tcp, dropped_blocks, audio_age_ms, uptime_s, channels, tune, peak_dbfs, fault } | null
                                // the last health message (fields as in Part 1); null until the first one since the server started.
                                // Server-added: peak_dbfs = highest key-up or level in the last minute (null if none), and
                                // fault (see A-4) when the server judges the dongle dead
  key_expires_at: string | null // while a node key is outstanding (new node, or after a re-key): when it stops working
  created_at: string
}
NodeEvent { t: string, kind: "enrolled" | "online" | "offline" | "reconnect" | "rekeyed"
                              | "revoked" | "command" | "gain" | "fault" | "error", detail: string }
```

Gain guard (A-2): when a key-up or level arrives above -4 dBFS and the node's gain (from its health) is known, the
server sends a `gain` command one R820T step lower (floor 20 dB, at most one step a minute) and records a `gain` event.

```
GET    /nodes                      -> Node[]                          (ordered by number)
POST   /nodes                      -> 201 { node: Node, key: string } (body: { name, location: {lat, lon}, preset? })
GET    /nodes/{id}                 -> Node & { events: NodeEvent[] }  (the last 50, newest first)
PATCH  /nodes/{id}                 -> Node                            (body: any of { name, location, preset })
POST   /nodes/{id}/rekey           -> { node: Node, key: string }
POST   /nodes/{id}/revoke          -> Node
POST   /nodes/{id}/commands        -> CommandResult                   (body: Command)
```

- Node ids and numbers are never reused. Tables: `node`, `node_credential` (hashes only, plus the secret of an enrollment still waiting for its `enrolled_ack`), `node_event`.
- `POST /nodes`: creates a PENDING node and a key valid 24 h. `name` 1-40 characters, `lat` -90..90, `lon` -180..180. `key` is the text to show once and offer as a file (`<name>.key`).
- `PATCH`: changing `preset` of an ONLINE node sends it a `channels` command; a node that is offline gets the list in its next `welcome`. `preset` must be a known one (422 otherwise); the only one in v1 is `aar`.
- `rekey`: new enrollment secret, 24 h. The old node secret keeps working until the new enrollment completes. On a REVOKED node it makes the node PENDING again. Answers `key` once.
- `revoke`: the node secret and any enrollment secret are deleted at once, the socket is closed (4403), status REVOKED. Revoke twice is a 200 no-op. There is no delete in v1.
- `commands`: body `{type: "tune", center_hz, rate}`, `{type: "gain", gain_db}` (null = auto), `{type: "squelch", squelch_db}`, `{type: "channels", channels}`, `{type: "restart"}` or `{type: "set_server", url}`. The server sends it to the node and waits for the ack (10 s; 30 s for restart and set_server). 409 when the node is not ONLINE. Answer 200 `CommandResult { id, type, status: "acked" | "failed" | "timeout", error: {code, message} | null }`.
- Status changes and every command are appended to the node's events. The Settings list polls `GET /nodes` (every 5 s while open); there is no push channel for it in v1.

## The agent (`sdrviz-node`)

Code: `backend/app/node/agent/` (it imports `app.node`, `app.live.protocol`, `app.live.node_protocol` and `app.live.opus`, nothing else from `app`). Commands: `sdrviz-node run [--replay file.iq]`, `enroll <key|file>`, `status`. Files in `/etc/sdrviz-node/` (or `--config-dir`, `$SDRVIZ_NODE_DIR`): `node.json`, `agent.toml`, `state.json`, `status.json`; a `*.key` file there is enrolled when the agent starts (or while it waits after a stop code) and deleted, or renamed `.key.failed` when refused. Details in `receiver/pi/README.md`.

- Everything in Part 1 is as implemented there, with these specifics. Audio: each 100 ms chunk of PCM becomes five Opus packets of 20 ms; the encoder is created at key-up. Spectrum: one row every 200 ms, always (the node does not know who watches). `dropped_blocks` counts IQ blocks whose processing took longer than the 100 ms of IQ they cover. `audio_age_ms` is the mean time from reading an IQ block to writing its audio to the socket. Queue: 300 messages per connection; when full (slow link) new messages are dropped and counted. After a stop code the agent keeps receiving and polls every 5 s for a new key file or a changed `node.json`.
- Commands persist: `tune`, `gain`, `squelch` and `channels` are written to `state.json` and win over `agent.toml` after a restart. `tune` and `gain` re-tune rtl_tcp (a second or two of silence). `channels` replaces the list (sorted, unique); until one is set the server's preset applies. `restart` is acked, then the agent exits cleanly and systemd starts it again. `set_server`: the agent connects to the new address with its node secret and waits for a welcome; only then it saves the address and reconnects there (about half a second after the ack). Failure acks `failed` (message `could not use <url>: ...`) and nothing changes. Caveat: pointing a node at the address of the server it is already connected to (another name for the same server) replaces its own live connection, so that ack may arrive as a `timeout`.
- Agent dependencies are `backend/requirements-node.txt`: numpy, PyAV, websockets and pydantic (the wire models).

## Fake node

`tools/fake_node.py --key <key>` enrolls (saving the node secret in `fake-node.json`), then streams: Opus tone transmissions on random channels (`--keyup-every`, `--keyup-length`), spectrum rows at 5 per second, `levels`, health every 5 s, heartbeats; it acks every command with `ok`. Later runs reconnect with the saved secret. The unit tests run it against a stub server.

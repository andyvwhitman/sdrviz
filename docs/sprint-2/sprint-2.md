# Sprint 2 plan (not started)

Author: product manager. Date: 2026-11-17. Inputs: owner decisions of 2026-11-16/17 (`docs/decisions.md` rows 35-48), `docs/deployment-architecture.md`, the Sprint 1 backlog (`docs/sprint-1/sprint-1.md` section 5), Pi measurement spike (2026-11-16).

## 1. Sprint goal

Make sdrviz deployable on the public web, with the deployment architecture as the backbone of the code-health and systems-design refactor (decision 33). Radios stay behind NAT. A new `sdrviz-node` agent on each Pi does the DSP and holds one outbound WebSocket to the server. The server (Caddy + FastAPI in Docker on Hetzner) never sees raw IQ. Browsers play the same 8 kHz PCM as today.

The sprint is finished when: the FFT channelizer runs all 91 AAR channels under 50% of real time on the Pi CM5; a node can be added in Settings, enrolled with a one-time key, and stream audio and spectrum to a locally run server through `/ws/node`; the Settings, Nodes screens and node health view work; the API and Caddy images build and run under Docker Compose on a laptop; and the LAN path (local rtl_tcp) still works.

Not in this sprint (see section 2 slip list): Hetzner stand-up scripts, password lockout, Alembic and Litestream. Those are written as tickets (BE-8 to BE-11) and are first in line for Sprint 3. The honest reading: this sprint ends at "works end to end on a dev machine and on the LAN". Going public needs about 4 more backend days (question 1).

Not touched (owner decisions): Live Ops layout (28), recording (44), multi-user accounts (40).

## 2. Capacity and summary

Sizes: S = up to 0.5 day, M = 1.5 days, L = 3 days. Capacity: 10 days per developer. OWNER tickets do not count against developer capacity.

| ID | Title | Assignee | Pri | Size | Depends on | Status |
|---|---|---|---|---|---|---|
| BE-1 | FFT channelizer (overlap-save) plus threaded channel work | BE | P0 | L | none | Ready |
| BE-2 | Node API and uplink protocol contract, with a fake node | BE | P0 | M | none | Ready |
| BE-3 | Split radio code into a `node/` package the backend imports | BE | P0 | S | BE-1 | Ready |
| BE-4 | Node registry, enrollment keys and node REST API | BE | P0 | M | BE-2 | Ready |
| BE-5 | `/ws/node` and the RemoteNode source feeding the live hub | BE | P0 | M | BE-3, BE-4 | Ready |
| BE-6 | `sdrviz-node` agent: uplink client, commands, enroll CLI, systemd unit | BE | P0 | M | BE-3, BE-5 | Ready |
| BE-7 | Pi service fixes in the repo: rtl_tcp unit and env, agent unit | BE | P1 | S | none | Ready |
| FE-1 | Nodes data layer, types and a fake node API | FE | P0 | M | BE-2 (contract only) | Ready |
| FE-2 | Settings, Nodes: list, status, link quality and lag | FE | P0 | M | FE-1 | Ready |
| FE-3 | Add node, key shown once (copy and download), revoke, re-key | FE | P0 | M | FE-2 | Ready |
| FE-4 | Node health view | FE | P1 | M | FE-2 | Ready |
| FE-5 | API image, Caddy image with the built frontend, Compose, `.env` | FE | P0 | M | none | Ready |
| FE-6 | Typography pass (decision 32) | FE | P1 | M | none | Ready |
| FE-7 | Dead code removal | FE | P1 | S | none | Ready |
| FE-8 | Small bugs: trip STALE neutral, PENN short name | FE | P1 | S | none | Ready |
| OWNER-1 | Hetzner account, project, API token, SSH key | OWNER | P1 | n/a | none | Ready |
| OWNER-2 | Tailscale: tailnet, auth key, install on the Pi | OWNER | P1 | n/a | none | Ready |
| OWNER-3 | Pi: rtl_tcp service fixes (sudo) | OWNER | P1 | n/a | BE-7 | Blocked (on BE) |
| OWNER-4 | Object storage bucket and keys for Litestream | OWNER | P2 | n/a | question 3 | Blocked (on decision) |
| OWNER-5 | DNS: one A record for the subdomain | OWNER | P1 | n/a | BE-11 run | Blocked (on BE) |
| OWNER-6 | Server `.env`: password and secrets | OWNER | P1 | n/a | FE-5 | Blocked (on FE) |
| OWNER-7 | Pi: install `sdrviz-node` and enroll it | OWNER | P1 | n/a | BE-6, BE-7 | Blocked (on BE) |

Slipped (written, Ready, not counted; first in line for Sprint 3):

| ID | Title | Assignee | Pri | Size | Depends on | Status |
|---|---|---|---|---|---|---|
| BE-8 | Password hardening: long password, login rate limit, lockout, production guard | BE | P0 for public | S | none | Ready (slipped) |
| BE-9 | Alembic migrations, replacing the hand-written ALTER TABLEs | BE | P1 | M | none | Ready (slipped) |
| BE-10 | Litestream sidecar and restore drill | BE | P1 | S | BE-9, OWNER-4 | Ready (slipped) |
| BE-11 | Hetzner stand-up script (hcloud CLI) and deploy script | BE | P1 | M | FE-5, OWNER-1, question 2 | Ready (slipped) |
| FE-9 | Login lockout feedback (429/423 message) | FE | P1 | S | BE-8 | Blocked (on BE) |

Totals in capacity: BE 7 tickets = 3 (BE-1) + 4 x 1.5 (BE-2, 4, 5, 6) + 2 x 0.5 (BE-3, 7) = 10 days. FE 8 tickets = 6 x 1.5 (FE-1 to FE-6) + 2 x 0.5 (FE-7, 8) = 10 days. No buffer, so the slip order is stated.

Order of work:
- BE: BE-1 first (days 1-3, the risky ticket; the LAN path keeps using the same `Channelizer.process` call, so nothing breaks while it is built). BE-2 (days 4-5). BE-3 (day 5-6), BE-4, BE-5, BE-6 (days 6-9.5), BE-7 (end). Each ticket merges to main only with tests green and the LAN path unchanged.
- FE: independent work first while BE-2 lands (about day 5): FE-5, FE-7, FE-8, FE-6. Then FE-1 (starts on the draft contract from BE-2, with its own fake), FE-2, FE-3, FE-4.
- Slip order if the sprint runs long. BE: BE-7 (the owner can edit the unit by hand from the commands in OWNER-3), then the BE-6 enroll CLI polish. FE: FE-6 (typography), then FE-4 (health view detail beyond the Nodes list).
- Commits per ticket; never push. Each ticket updates `docs/node-protocol.md` or `docs/transit-api.md` for any contract change.

## 3. Tickets

### Backend

#### BE-1  FFT channelizer (overlap-save) plus threaded channel work
- Assignee BE. Priority P0. Size L. Sources: Pi spike 2026-11-16, decision 45. Status Ready.
- Problem: `radio/dsp.py` runs on one core. The matmul `Channelizer` is 81% of the time. Measured on the CM5: 8 channels 28% of real time, 24 channels 73%, 48 channels 142%, 91 channels (whole AAR band 07-97) 273%. The node cannot decode the band today.
- Scope:
  - Replace the per-channel matmul with a fast-convolution (overlap-save) channelizer: one FFT of the IQ block shared by all channels, then per channel the frequency-domain filter and a smaller inverse FFT at 48 kS/s. Residual offsets that do not land on an FFT bin are removed by a continuous-phase rotation after decimation.
  - Keep the public interface: `Channelizer(sample_rate, center_hz, ...)`, `in_band()`, `process(iq, freqs_hz)` returning an array `(len(iq)//decim, len(freqs_hz))`, so `RadioSource` and the LAN path are untouched.
  - Spread channels over cores with a small `ThreadPoolExecutor` (numpy releases the GIL). Worker count is a setting that defaults to the CPU count, minus none. Squelch, demod and power per channel are part of the threaded unit of work.
  - Keep the old matmul class as `MatmulChannelizer` in the tests only (reference implementation).
  - Add `tools/bench_dsp.py`: synthetic IQ with N channels, prints share of real time per stage and in total.
- Out of scope: Opus (BE-6), the package move (BE-3), new squelch logic.
- Acceptance:
  - Equivalence test against `MatmulChannelizer` on a synthetic block (tones at several channel offsets plus noise), per channel after aligning the group delay: RMS error at least 60 dB below the channel's output power. Demodulated audio on a recorded or synthetic NFM burst: SNR within 0.5 dB of the old chain, and squelch open/close decisions identical.
  - Streaming test: output over many blocks is continuous (no clicks at block seams; the same RMS test over 20 consecutive blocks).
  - Benchmark on the CM5 (BE runs it over SSH, no sudo): all 91 AAR channels under 50% of real time, with demod and spectrum included; also record 8, 24, 48 channels, and the Pi temperature. Numbers in the PR and in `docs/deployment-architecture.md` section 11.
  - If 50% is missed, report the per-stage split and stop for a decision; do not add clever optimizations without asking.
  - `pytest` green; LAN live check unchanged.
- Dependencies: none.
- Notes: `backend/app/radio/dsp.py`, `radio/source.py` (`_process`), `tests/`. Simple readable code over micro-tuning (owner preference); numpy FFT is enough.

#### BE-2  Node API and uplink protocol contract, with a fake node
- Assignee BE. Priority P0. Size M. Sources: build order step 3, decisions 36-39. Status Ready.
- Problem: FE and BE must code against one agreed contract, and the agent, `/ws/node` and Settings all depend on it.
- Scope:
  - Write `docs/node-protocol.md`: the `/ws/node` handshake (`hello` with mode `enroll` or `connect`, protocol and agent version, node id, secret; `welcome` or close code with reason), heartbeat (5 s, timestamps, `pong`), JSON messages up (`key_up`, `key_down`, `health`, `enrolled_ack`, `ack`) and down (`tune`, `gain`, `squelch`, `channels`, `restart`, `set_server`), command ids and acks, error and close codes, backoff rules. Binary frames: the `/ws/live` frames from `protocol.py` with a 2-byte node number in front; audio uses `CODEC_OPUS`, one Opus packet per frame (20 ms at 8 kHz). Define how link quality (0-100, from RTT, missed beats and reconnects in the last hour) and lag (ms: half the heartbeat RTT plus audio age at the node) are computed.
  - Write the node REST API in the same document and in `docs/transit-api.md` style: `GET /api/nodes`, `POST /api/nodes` (name, location lat/lon, optional channel preset; returns node plus `key` once), `GET /api/nodes/{id}`, `POST /api/nodes/{id}/rekey` (returns `key` once), `POST /api/nodes/{id}/revoke`, `PATCH /api/nodes/{id}` (name, location, preset), `POST /api/nodes/{id}/commands` (tune, gain, squelch, restart). Node object: `id, name, location, preset, status (PENDING|ONLINE|OFFLINE|REVOKED), link_quality, lag_ms, last_seen, agent_version, health{cpu_pct, temp_c, rtl_tcp, dropped_blocks}, key_expires_at`. The key and secrets are never returned by GET.
  - Add `app/live/node_protocol.py`: pydantic models for every message, the node-prefixed frame pack/unpack, and tests that round-trip them.
  - Add `tools/fake_node.py`: a script that connects to `/ws/node` with a given key and replays synthetic key-ups, spectrum frames and health (Opus-encoded tone with PyAV), so BE-5 and the browser can be tested before the real agent exists.
  - Publish the draft contract (the markdown) at the end of day 4 so FE can start; the models and fake node follow.
- Out of scope: the implementation of the server side (BE-4, BE-5) and the agent (BE-6).
- Acceptance:
  - `docs/node-protocol.md` reviewed by FE (a comment on the PR from FE is the sign-off).
  - Model round-trip tests green; fake node frames decode with the pack/unpack code.
  - `docs/decisions.md` unchanged (decisions are already in); any contract choice not covered by a decision is listed in the PR.
- Dependencies: none.
- Notes: `backend/app/live/protocol.py` (frame format, `CODEC_OPUS` is already reserved), `live/hub.py`.

#### BE-3  Split radio code into a `node/` package the backend imports
- Assignee BE. Priority P0. Size S. Sources: build order step 2, decision 35. Status Ready.
- Problem: DSP, the rtl_tcp client and the session loop live in `app/radio/` mixed with hub publishing and event bookkeeping. The agent must run the same code without FastAPI, the database or the hub.
- Scope:
  - New package `backend/app/node/` (importable without the web app; no imports from `app.*` outside it): `dsp.py` (moved), `rtltcp.py` (moved), `pipeline.py` (new: given IQ bytes and a channel list returns per-channel PCM chunks, key-up/key-down edges, levels and a spectrum row; this is what `RadioSource._process` does today).
  - `radio/source.py` keeps its role for the LAN path but calls `node.pipeline`; `events.py` and hub publishing stay in `app/radio/`.
  - A move with import fixes and thin tests; no behaviour change.
- Out of scope: the agent loop (BE-6), packaging (question 5).
- Acceptance:
  - `python -c "import app.node.pipeline"` works with only numpy and PyAV installed (checked in a clean venv in the PR).
  - Existing radio tests pass unchanged; LAN live check: audio and spectrum from the Pi as before.
  - `git mv` used so history follows the files.
- Dependencies: BE-1 (move the new channelizer, not the old).
- Notes: `backend/app/radio/{dsp,rtltcp,source,receiver}.py`.

#### BE-4  Node registry, enrollment keys and node REST API
- Assignee BE. Priority P0. Size M. Sources: decisions 38, 39. Status Ready.
- Problem: there is no notion of a node. Settings needs to create, list, revoke and re-key nodes, and the server must verify enrollment and node secrets.
- Scope:
  - SQLModel tables `node` (id, number, name, lat, lon, preset, status, created_at, last_seen, agent_version) and `node_credential` (node id, enrollment_hash, enrollment_expires_at, node_secret_hash, revoked_at). Only SHA-256 hashes of 32-byte random secrets are stored. The tables are created with `create_all` for now; BE-9 moves them under Alembic.
  - `app/nodes/service.py`: create node (PENDING, returns key), build key `sdrviz-node1.<base64url JSON {url, node, secret, v}>` where `url` comes from a new setting `SDRVIZ_PUBLIC_URL`, verify enrollment (hash, expiry 24 h, single use), complete enrollment (create node secret, return it once, burn the enrollment secret after `enrolled_ack`; accept the new secret if the ack was lost), verify node secret (constant time), revoke (secret deleted at once), re-key (new enrollment secret; old node secret stays valid until the new enrollment completes).
  - Router `app/routers/nodes.py` with the endpoints from the BE-2 contract, behind `require_session`.
  - Failed verifications are counted per client IP (reuse `LoginLimiter` from `auth.py`).
- Out of scope: the WebSocket (BE-5), UI (FE-2, FE-3), lockout of the viewer password (BE-8).
- Acceptance:
  - Tests: key round-trip decode; expired key rejected; second use rejected; ack-lost case; revoke blocks immediately; re-key keeps the old secret until the new one completes; no endpoint ever returns a secret or hash after creation; DB holds no plain secret (assert on a dump).
  - Router tests with auth (401 without a session).
  - `docs/node-protocol.md` updated for any change.
- Dependencies: BE-2.
- Notes: `backend/app/db.py`, `models.py`, `routers/`, `auth.py`.

#### BE-5  `/ws/node` and the RemoteNode source feeding the live hub
- Assignee BE. Priority P0. Size M. Sources: build order step 4, decisions 36, 37, 47. Status Ready.
- Problem: the backend only knows the local rtl_tcp receiver. It needs to accept nodes and publish what they send exactly like the local receiver does.
- Scope:
  - WebSocket `/ws/node`: handshake from BE-2, auth through BE-4 service (enroll or connect), heartbeat with RTT and missed-beat tracking (link quality, lag), command send with ack tracking and timeouts, close on revoke, `set_server` support.
  - `RemoteNode` source: decodes Opus frames to 8 kHz s16 PCM with PyAV (one decoder per channel, reset on FLAG_FIRST), turns them into today's `audio_frame` (PCM codec) for the hub, forwards spectrum frames with the node's feed id, and turns `key_up`/`key_down` into the same `LiveEvents` calls the local receiver makes.
  - Local receiver (`RadioSource`) and remote nodes run side by side. Overlap rule: see question 4; until it is answered, the first node to key up on a channel owns it until key-down and the other is ignored for that transmission.
  - Node status (state, link quality, lag, last health) held in memory and exposed through `GET /api/nodes`.
  - Bounded queues; slow viewers still lose frames rather than stalling a node (existing `Hub` behaviour).
- Out of scope: the agent (BE-6), recording anything (decision 44).
- Acceptance:
  - Integration test with `tools/fake_node.py`: enroll, connect, audio reaches a `/ws/live` test client as PCM, spectrum arrives, key-up creates a live transmission, kill the node socket and status goes OFFLINE within 20 s, reconnect with the permanent secret works, revoke closes the socket.
  - Test that LAN `RadioSource` still publishes while a fake node is connected.
  - Heartbeat loss test (no beats for 15 s) marks OFFLINE.
  - `docs/node-protocol.md` updated.
- Dependencies: BE-3, BE-4.
- Notes: `backend/app/live/{hub,audio_stream,protocol}.py`, `radio/events.py`, `main.py`.

#### BE-6  `sdrviz-node` agent: uplink client, commands, enroll CLI, systemd unit
- Assignee BE. Priority P0. Size M. Sources: decisions 35-39. Status Ready.
- Problem: the Pi must run the receiver chain by itself and connect out to the server.
- Scope:
  - Package `app/node/agent/` with entry point `sdrviz-node` (`run`, `enroll <key|file>`, `status`). Async main loop: read IQ from rtl_tcp (127.0.0.1), run `node.pipeline`, encode Opus with PyAV per open channel, send audio and spectrum frames, events and health every 5 s (CPU, temperature, rtl_tcp state, dropped blocks).
  - Uplink client: connect to `wss://<url>/ws/node`, hello, heartbeat, reconnect with exponential backoff (1 s to 60 s, jitter), no buffering of audio while offline, commands applied with acks (tune, gain, squelch, channels, restart), `set_server` (test the new address, then save; keep the old if the test fails).
  - Config in `/etc/sdrviz-node/`: `node.json` (url, node id, node secret; mode 0600, written atomically) and an optional `agent.toml` (rtl_tcp host and port, channel list, worker count). A key file dropped into `/etc/sdrviz-node/*.key` is enrolled on start and deleted after.
  - `receiver/pi/sdrviz-node.service` (user `sdrviz`, `Restart=always`, `TimeoutStopSec=5`, hardening flags) and `receiver/pi/install-node.sh` (venv in `/opt/sdrviz-node`, pip install, unit install; the owner runs it, see OWNER-7).
  - Runs from the same repo with only numpy, PyAV and websockets dependencies (check `backend/requirements.txt` split; the agent needs its own `requirements-node.txt`).
- Out of scope: packaging beyond the install script (question 5), auto-update, TLS pinning.
- Acceptance:
  - End-to-end on a laptop: run the BE-5 server, `sdrviz-node enroll <key>` against it with a synthetic IQ source (a `--replay file.iq` option for tests), audio and spectrum visible in the browser.
  - Kill and restart the server: the node reconnects by itself within the backoff and keeps the same secret.
  - Command tests (tune, gain, squelch, restart, set_server good and bad).
  - A one-hour soak on the Pi with the real dongle: memory flat, CPU under the BE-1 number, no reconnects when the server stays up (numbers in the PR).
  - `pytest` green.
- Dependencies: BE-3, BE-5.
- Notes: `backend/app/node/`, `receiver/pi/`.

#### BE-7  Pi service fixes in the repo: rtl_tcp unit and env, agent unit
- Assignee BE. Priority P1. Size S. Sources: Pi spike, decision 46. Status Ready.
- Problem: `sdrviz-rtltcp.service` grew to 2.7 GB RSS over 4 days and takes 90 s to stop. It also listens on 0.0.0.0.
- Scope (files in `receiver/pi/`; the owner applies them in OWNER-3):
  - `sdrviz-rtltcp.service`: `TimeoutStopSec=5`, `KillMode=mixed`, `SendSIGKILL=yes`, `MemoryMax=512M` with `Restart=always` (the service restarts cleanly when it is killed), `MemoryHigh=384M`. Comment why.
  - `sdrviz-rtltcp.env`: keep `RTLTCP_ADDRESS=0.0.0.0` as the documented LAN default; add a commented `127.0.0.1` line and a note: switch only after the agent runs on the Pi and the LAN backend source is retired. (The LAN setup must keep working: the backend reaches the Pi over the network until then.)
  - `check.sh`: report RSS and restart count.
  - `receiver/pi/README.md`: the new commands.
- Out of scope: applying anything on the Pi (OWNER-3).
- Acceptance:
  - Unit passes `systemd-analyze verify` on a dev machine or the Pi (no install needed).
  - A test run on the Pi by the owner (OWNER-3): `systemctl stop sdrviz-rtltcp` returns within 5 s; with a tiny `MemoryMax` test the service is killed and restarted.
- Dependencies: none.
- Notes: `receiver/pi/*`.

### Frontend

#### FE-1  Nodes data layer, types and a fake node API
- Assignee FE. Priority P0. Size M. Sources: decisions 38, 39. Status Ready.
- Problem: the Nodes screens need typed access to the node API, and FE must not wait for BE.
- Scope:
  - `lib/types/nodes.ts` from the BE-2 contract (Node, NodeHealth, NodeKey, status enum, command bodies).
  - `lib/api/nodes.ts` (list, create, get, patch, rekey, revoke, command) and `lib/stores/nodes.svelte.ts` polling `GET /api/nodes` every 5 s while a Nodes screen is open (and not otherwise).
  - A fake node API for dev and tests: either Vite dev middleware or a handler in the existing fake server, returning PENDING, ONLINE (good and poor link), OFFLINE, REVOKED nodes, a key on create/re-key, and moving lag values. Switch on `VITE_FAKE_NODES=1`.
  - Unit tests for the store (polling start/stop, error handling) and a status helper (link quality to label, lag format).
- Out of scope: screens (FE-2 to FE-4).
- Acceptance:
  - `npm test` green; store tests cover start/stop and a failed poll.
  - The fake returns every state; documented in a comment at its top.
- Dependencies: BE-2 (draft contract; types adjust once reviewed).
- Notes: `frontend/src/lib/api`, `lib/stores`, `lib/types`.

#### FE-2  Settings, Nodes: list, status, link quality and lag
- Assignee FE. Priority P0. Size M. Sources: decisions 39, 48. Status Ready.
- Problem: there is no place to see nodes.
- Scope:
  - New "Nodes" section in Settings (`screens/settings/`), built from small components (`NodeCard.svelte`, `NodeStatusChip.svelte`, `LinkMeter.svelte`), not by growing `Screen.svelte`.
  - Each node: name, location, status chip (ONLINE / OFFLINE / PENDING, REVOKED hidden behind a "show revoked" toggle), link quality as a 5-step meter plus number, lag in ms (or s above 1000), last seen, agent version, preset. Status uses existing HUD roles: ONLINE neutral/cyan, OFFLINE dim, PENDING neutral with a clock, never ember (decision 26 and 7).
  - Empty state: "No nodes. Add one to receive from outside the LAN." The existing LAN receiver stays visible on the Feeds screen as today.
  - Works at 1440 and 1180.
- Out of scope: add/revoke/re-key (FE-3), health detail (FE-4).
- Acceptance:
  - With `VITE_FAKE_NODES=1` all four states render; poor link and high lag are visibly different from good.
  - Component tests for the status chip and lag format; screenshot at 1440 and 1180 attached to the PR.
  - No new hard-coded size constants (use the existing breakpoints module).
- Dependencies: FE-1.
- Notes: `screens/settings/*`, `lib/hud/chips.ts`.

#### FE-3  Add node, key shown once (copy and download), revoke, re-key
- Assignee FE. Priority P0. Size M. Sources: decision 38, 39. Status Ready.
- Problem: enrollment needs a safe, clear flow.
- Scope:
  - "Add node" form: name (required), location (lat/lon or pick from the map's feeds; optional free text), optional channel preset (select from the existing banks).
  - After create, a modal shows the node key once as a single selectable line with a Copy button and a Download button (file `<node-name>.sdrviz-key`, text content = the line). Shows the expiry ("valid 24 hours, single use") and the exact command: `sudo sdrviz-node enroll <key>` and the alternative of dropping the file in `/etc/sdrviz-node/`. The modal warns that it will not show again; closing needs a confirm if neither Copy nor Download was used.
  - The key lives only in component state; it is not stored in a store, URL, localStorage or logs.
  - Revoke: confirm dialog with the node name; calls revoke; node moves to REVOKED. Re-key: confirm, shows the new key in the same modal; the card says "old secret works until the new key is used".
  - PENDING nodes show "key expires in Nh" and a Re-key button.
- Out of scope: editing node details beyond name and location (PATCH can be a simple inline edit if time allows; otherwise backlog).
- Acceptance:
  - Component tests: key shown once and cleared on close; copy uses the clipboard API with a fallback to select; download makes the right filename and content; revoke and re-key call the right endpoints.
  - Manual with the fake and, once BE-4 lands, against the real API.
  - iPad Safari: copy fallback works (checked by the owner or noted as untested).
- Dependencies: FE-2.
- Notes: `screens/settings/`, a small `lib/components/Modal` if one exists (reuse, do not duplicate).

#### FE-4  Node health view
- Assignee FE. Priority P1. Size M. Sources: decision 39, build order step 7. Status Ready.
- Problem: when a node misbehaves the owner needs to see why without SSH.
- Scope:
  - A detail view opened from a node card (inside Settings, same maximize model as transit panels): link quality and lag as 30-minute sparklines from the polled history kept in the store, CPU %, temperature, rtl_tcp state, dropped blocks, reconnects in the last hour, agent version, last 20 events (online, offline, command ack/error) from the node API.
  - Command buttons that exist in the contract: restart, set gain (number field), set squelch (number field). Each shows the ack result.
  - Calm, neutral styling; red only for a real fault (temperature over 80 C, rtl_tcp down), following the HUD roles.
- Out of scope: a node map layer, alerts.
- Acceptance:
  - With the fake: sparklines move, a fault state shows red once, commands show ack and error states.
  - Tests for the history buffer and fault thresholds.
- Dependencies: FE-2.
- Notes: needs `health` and an `events` list from BE-2 (raise in the contract review if missing).

#### FE-5  API image, Caddy image with the built frontend, Compose, `.env`
- Assignee FE. Priority P0. Size M. Sources: build order step 5, decision 42. Status Ready.
- Problem: there is no container build. The FE dev owns the Caddy and frontend build; the API image is small.
- Scope:
  - `deploy/api/Dockerfile`: python slim base matching the dev Python, installs `requirements.txt`, runs uvicorn as a non-root user, data directory as a volume, healthcheck on `/api/health`.
  - `deploy/caddy/Dockerfile`: multi-stage; Node stage builds the Svelte app, Caddy stage copies `dist/`. `deploy/caddy/Caddyfile`: the site address from `SDRVIZ_DOMAIN`, automatic TLS, `/api/*` and `/ws/*` proxied to `api:8100` (WebSocket upgrade works), SPA fallback, gzip/zstd, security headers (HSTS, `X-Content-Type-Options`, frame denial), long cache for hashed assets.
  - `deploy/compose.yml`: `caddy`, `api`; volume mounts for `/data` (SQLite and caches) and Caddy's state; the Litestream service is added by BE-10. `deploy/.env.example` with every variable (`SDRVIZ_DOMAIN`, `SDRVIZ_PUBLIC_URL`, `SDRVIZ_PASSWORD`, `SDRVIZ_SECRET`, `SDRVIZ_RTLTCP_HOST` optional) and comments. `deploy/README.md`: run on a laptop with `localhost` (Caddy internal TLS), and what changes on the server.
  - The LAN setup works in the container: `SDRVIZ_RTLTCP_HOST` set reaches the Pi.
- Out of scope: the Hetzner VM and scripts (BE-11), Litestream (BE-10), CI.
- Acceptance:
  - `docker compose up --build` on a laptop: the app loads over `https://localhost`, login works, `/ws/live` connects through Caddy, a data refresh survives a container restart (volume).
  - Images contain no `.env`, no `node_modules`, no test files (checked with `docker run ... ls`).
  - README steps tried from scratch by someone else if possible.
- Dependencies: none.
- Notes: `frontend/package.json`, `backend/requirements.txt`, `backend/app/main.py` (health route exists or is added as a one-liner).

#### FE-6  Typography pass (decision 32)
- Assignee FE. Priority P1. Size M. Sources: decision 32, Sprint 1 backlog 13. Status Ready.
- Problem: names, numbers and titles differ across transit screens.
- Scope:
  - Barlow Semi Condensed uppercase for names and labels; mono for numbers and times; a small set of title sizes (token names in `app.css`) used by every transit panel (station, route, trip), the train list, the board, Settings agency titles.
  - Map tags in short uppercase form: `AMTK 20`, `MARC 523` (one `trainTag()` helper with a test).
  - Includes the new Nodes screens (use the same tokens from the start).
- Out of scope: label placement priorities (backlog 5), marker restyle.
- Acceptance:
  - No transit text left in the old fonts or sizes (grep list in the PR); `trainTag()` tests; screenshots of station, trip, route, list, Settings at 1440 and 1180.
  - `npm test` green.
- Dependencies: FE-8 first (name cleaning is touched there).
- Notes: `screens/map/*`, `screens/settings/*`, `app.css`.

#### FE-7  Dead code removal
- Assignee FE. Priority P1. Size S. Sources: Sprint 1 backlog 1 (F#27). Status Ready.
- Problem: unused components make the refactor harder to read.
- Scope: remove `LofarStrip`, `CtcStrip`, `live-ops/ctc/*`, `MilepostTagSvg` and `lib/hud/index.ts` (and fix imports); delete any unused CSS and types they leave behind. Check each is unreferenced with grep before removal. Also fix or delete `wave.test.ts` (F#30): fix if it is a one-line import, otherwise delete the test and the file it tests if unused.
- Acceptance: `npm run build`, `npm test`, `npm run check` green; bundle size noted before and after; nothing in Live Ops looks different (screenshot).
- Dependencies: none.
- Notes: `frontend/src/screens/live-ops/`, `screens/map/`, `lib/hud/`.

#### FE-8  Small bugs: trip STALE neutral, PENN short name
- Assignee FE. Priority P1. Size S. Sources: owner list. Status Ready.
- Problem: (1) the trip panel STALE text uses fault red, but stale is not a fault (decisions 26, 27). (2) FE-9's short name "PENN" lost "Baltimore" and is ambiguous with New York Penn.
- Scope:
  - STALE text and its chip in `TripPanel.svelte` (and any shared helper in `lib/hud`) use the neutral role, same as the freshness mark.
  - The name cleaner keeps the city for Penn stations: "Baltimore Penn", "New York Penn", "Philadelphia 30th Street" are not shortened to one word; add a test for each and use `short_name` from the backend when it exists.
- Acceptance: tests for both cases; screenshot of a stale trip.
- Dependencies: none.
- Notes: `frontend/src/lib/displayName.ts` and `displayName.test.ts`, `TripPanel.svelte`.

### Owner-run steps

These need the owner's accounts or sudo. Developers prepare scripts; the owner runs them.

#### OWNER-1  Hetzner account, project, API token, SSH key
- Assignee OWNER. Priority P1. Status Ready. Needed before BE-11 runs.
- Steps:
  1. Sign in at console.hetzner.cloud. Create a project named `sdrviz`.
  2. Security, SSH keys, Add SSH key: paste the output of `cat ~/.ssh/id_ed25519.pub` on your laptop (create one first with `ssh-keygen -t ed25519 -C sdrviz` if none). Name it `andy-laptop`.
  3. Security, API tokens, Generate: name `sdrviz-cli`, permission Read & Write. Copy the token once.
  4. On your laptop: `brew install hcloud`, then `hcloud context create sdrviz` and paste the token. Check: `hcloud server-type list | head` and `hcloud location list` (location `ash` must appear).
  5. Do not paste the token into chat or git. It lives in `~/.config/hcloud/cli.toml`.

#### OWNER-2  Tailscale: tailnet, auth key, install on the Pi
- Assignee OWNER. Priority P1. Status Ready.
- Steps:
  1. Sign in at login.tailscale.com (free plan is enough). Install the app on your laptop.
  2. Settings, Keys, Generate auth key: reusable off, ephemeral off, tag `tag:sdrviz`, expiry 90 days. Copy it. (If asked to create the tag first: Access controls, add `"tagOwners": {"tag:sdrviz": ["autogroup:admin"]}`.)
  3. On the Pi: `curl -fsSL https://tailscale.com/install.sh | sudo sh`, then `sudo tailscale up --auth-key <key> --hostname sdrviz-pi`.
  4. On your laptop: `ssh andy@sdrviz-pi` (or the Pi's user) over the tailnet. Check `tailscale status`.
  5. The server gets Tailscale in BE-11 using a second auth key (generate it then).

#### OWNER-3  Pi: rtl_tcp service fixes (sudo)
- Assignee OWNER. Priority P1. Status Blocked (on BE-7).
- Steps (after BE-7 is merged and the repo is on the Pi at `~/sdrviz`):
  1. `sudo cp ~/sdrviz/receiver/pi/sdrviz-rtltcp.service /etc/systemd/system/sdrviz-rtltcp.service`
  2. `sudo systemctl daemon-reload && sudo systemctl restart sdrviz-rtltcp`
  3. Check: `systemctl show sdrviz-rtltcp -p TimeoutStopUSec -p MemoryMax` shows 5 s and 512 MiB.
  4. Stop test: `time sudo systemctl stop sdrviz-rtltcp` (under 5 s), then `sudo systemctl start sdrviz-rtltcp`.
  5. Leave `RTLTCP_ADDRESS=0.0.0.0` in `/etc/sdrviz/rtltcp.env` until OWNER-7 is done. After the agent runs on the Pi: `sudoedit /etc/sdrviz/rtltcp.env`, set `RTLTCP_ADDRESS=127.0.0.1`, then `sudo systemctl restart sdrviz-rtltcp`. The LAN backend source stops working at that moment, which is expected.

#### OWNER-4  Object storage bucket and keys for Litestream
- Assignee OWNER. Priority P2. Status Blocked (on question 3).
- Steps depend on the provider chosen in question 3. For Hetzner Object Storage (the recommendation): console, project `sdrviz`, Object Storage, Create bucket `sdrviz-litestream` in the nearest location offered, private. Create S3 credentials (access key and secret) and note the endpoint URL. Hand them to the server `.env` in OWNER-6 only. Do not commit them.

#### OWNER-5  DNS: one A record for the subdomain
- Assignee OWNER. Priority P1. Status Blocked (on BE-11 run).
- Steps: after BE-11 prints the server IPv4, add at the DNS host: type `A`, name = the chosen subdomain label (for example `radio`), value = the IPv4, TTL 300. Check: `dig +short radio.<yourdomain>` returns the IP. Optional second record type `AAAA` with the IPv6. Caddy gets the certificate on the first request after the record resolves. No Cloudflare, no proxying.

#### OWNER-6  Server `.env`: password and secrets
- Assignee OWNER. Priority P1. Status Blocked (on FE-5).
- Steps:
  1. Make a password: `python3 -c "import secrets; print(secrets.token_urlsafe(24))"` (at least 24 characters; store it in your password manager).
  2. Make the session secret: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`.
  3. Copy `deploy/.env.example` to `.env` on the server (BE-11 does the copy) and set `SDRVIZ_DOMAIN`, `SDRVIZ_PUBLIC_URL=https://<subdomain>`, `SDRVIZ_PASSWORD`, `SDRVIZ_SECRET`, and the Litestream keys when OWNER-4 is done. `chmod 600 .env`.

#### OWNER-7  Pi: install `sdrviz-node` and enroll it
- Assignee OWNER. Priority P1. Status Blocked (on BE-6, BE-7).
- Steps:
  1. In the app: Settings, Nodes, Add node. Copy or download the key (shown once, valid 24 h).
  2. On the Pi: `sudo bash ~/sdrviz/receiver/pi/install-node.sh` (creates the venv in `/opt/sdrviz-node`, installs the unit).
  3. `sudo sdrviz-node enroll '<paste the key>'` (or `sudo cp ~/Downloads/<name>.sdrviz-key /etc/sdrviz-node/` then `sudo systemctl restart sdrviz-node`).
  4. `sudo systemctl enable --now sdrviz-node`; `journalctl -u sdrviz-node -f` shows `connected`. The node shows ONLINE in Settings.
  5. Then apply the 127.0.0.1 bind from OWNER-3 step 5.

### Slipped backend tickets (written, not in capacity)

#### BE-8  Password hardening: long password, login rate limit, lockout, production guard
- Assignee BE. Priority P0 for public. Size S. Sources: decision 40. Status Ready (slipped).
- Problem: the login limiter allows 5 tries per minute in memory and the default password is `sdrviz`. Public exposure needs more.
- Scope:
  - New setting `SDRVIZ_ENV=production`; in production the app refuses to start if the password is the default or shorter than 20 characters, or the secret is the default.
  - Keep the per-client rate limit; add lockout: after 10 failures in 15 minutes from a client the login returns 423 with `Retry-After` for 15 minutes (in memory is acceptable; failures counted per client IP taken from the proxy header trusted only from Caddy). Log lockouts.
  - Session cookie `Secure`, `HttpOnly`, `SameSite=Lax` in production; session lifetime 30 days.
- Out of scope: users, roles, 2FA.
- Acceptance: tests for the startup guard, rate limit, lockout, release after the window, and the cookie flags; docs in `deploy/README.md`.
- Dependencies: none. Notes: `auth.py`, `routers/auth.py`, `config.py`.

#### BE-9  Alembic migrations, replacing the hand-written ALTER TABLEs
- Assignee BE. Priority P1. Size M. Sources: decision 41. Status Ready (slipped).
- Problem: `transit/source_store.py` `migrate()` hand-writes `ALTER TABLE`; `db.py` uses `create_all`. Deploys need versioned migrations.
- Scope: add Alembic (env in `backend/alembic/`, SQLite batch mode); baseline revision = the schema today including the node tables; a second revision with the `exclude_routes` and `stale_after_s` columns and their backfills expressed as data migration (idempotent for databases that already have them: stamp them at the right revision); `app.db.upgrade()` runs `alembic upgrade head` at startup or through `python -m app.db upgrade` in the container entrypoint before uvicorn; delete `SourceStore.migrate()`.
- Acceptance: tests start from (a) an empty DB, (b) a DB made by today's code (fixture file), (c) one missing the two columns; all end at head with equal schemas. A downgrade works one step. `deploy/README.md` documents running migrations at deploy.
- Dependencies: none. Notes: `db.py`, `runtime.py`, `transit/source_store.py`, `models.py`.

#### BE-10  Litestream sidecar and restore drill
- Assignee BE. Priority P1. Size S. Sources: decision 41. Status Ready (slipped).
- Scope: `litestream` service in `deploy/compose.yml` sharing the data volume, `deploy/litestream.yml` with the bucket from env, retention and snapshot interval; `deploy/restore.sh` that restores the latest replica to a new file and checks it opens with `sqlite3 ... "pragma integrity_check"`.
- Acceptance: on a laptop with a test bucket (or MinIO in compose for the test): write rows, stop everything, delete the DB, restore, rows are back; the drill is documented in `deploy/README.md` with the date it was run.
- Dependencies: BE-9, OWNER-4.

#### BE-11  Hetzner stand-up script (hcloud CLI) and deploy script
- Assignee BE. Priority P1. Size M. Sources: build order step 6, decision 42. Status Ready (slipped).
- Scope (shell and `hcloud`, no Terraform unless question 2 says otherwise): `deploy/hetzner/up.sh` creates, idempotently, a Network `sdrviz-net` (10.0.0.0/16, subnet in `us-east`), a Firewall (inbound 80/443 only, no 22), a Volume (size parameter, default 20 GB, ext4, automount), a server in `ash` (type from question 6) with a cloud-init file that installs Docker, Tailscale (joins the tailnet with a second auth key, enables Tailscale SSH), mounts the Volume at `/srv/sdrviz`, disables password SSH; prints the IPv4 for OWNER-5. `deploy/hetzner/deploy.sh` rsyncs/pulls `deploy/` to the server over Tailscale, runs `docker compose pull/build && up -d` after migrations. `deploy/hetzner/down.sh` deletes the server and keeps the Volume and Network unless `--all`.
- Acceptance: run from scratch by the owner using OWNER-1/2; app reachable over HTTPS after OWNER-5/6; only 80/443 open (checked with `nmap` from outside); SSH works only via Tailscale; `down.sh` then `up.sh` brings the app back with data intact.
- Dependencies: FE-5, OWNER-1, OWNER-2, question 2 and 6.

### Slipped frontend ticket

#### FE-9  Login lockout feedback
- Assignee FE. Priority P1. Size S. Status Blocked (on BE-8).
- Scope: login panel shows "TOO MANY ATTEMPTS, TRY AGAIN IN N MIN" from the 423 response and `Retry-After`; disables the submit until then; plain neutral styling. Test the state helper (`gate.ts` style).

## 4. Questions for the owner

Answered PROVISIONALLY on 2026-11-17 by the lead (owner went hands-off; each answer is the recommended option and
can be overturned on review). Questions that spend money or need the owner's accounts stay OPEN; none of them
blocks Sprint 2.

- Q1 BE overflow: PROVISIONAL, accept. Sprint 2 ends working end to end on the laptop and LAN; going public
  (BE-8 to BE-11, FE-9) leads Sprint 3.
- Q2 Infrastructure as code: PROVISIONAL, shell scripts plus the `hcloud` CLI and cloud-init (Sprint 3).
- Q3 Litestream bucket: OPEN (owner account and money; Sprint 3).
- Q4 Same channel heard by two sources: PROVISIONAL, first key-up wins (BE-5 default).
- Q5 Agent install and update on the Pi: PROVISIONAL, git checkout plus venv for now.
- Q6 Server size and CPU: OPEN (owner account and money; Sprint 3).

The original questions with all options follow.


Ask one at a time, in this order. Each blocks something small; none blocks starting the sprint except 1 (scope) and 4 (BE-5 rule, has a default).

### Q1. The backend work does not fit in 10 days. What do you want to do?

Facts: committed BE work is exactly 10 days (BE-1 to BE-7). Going public also needs BE-8 (lockout, S), BE-9 (Alembic, M), BE-10 (Litestream, S), BE-11 (Hetzner scripts, M): 4 more days. FE has no spare days either.

1. Accept it (recommended). Sprint 2 ends at "works end to end on a laptop and the LAN"; Sprint 3 starts with BE-8 to BE-11 and the stand-up (about one week), then the public launch. Pro: no corners cut on the hard DSP and protocol work; the first public deploy is clean. Con: public launch is about a week later than the sprint end.
2. Extend Sprint 2 for BE by 4 working days (14 days) and keep FE at 10. Pro: launch at the end of the sprint. Con: FE idles or starts Sprint 3 work; the sprint boundary blurs.
3. Move BE-8 only into Sprint 2 and slip BE-7 (the Pi unit fixes you can do by hand from the commands in OWNER-3). Pro: the password hardening is in before anything is exposed. Con: leaves the memory/stop issue until Sprint 3 and you fix the unit by hand.
4. Give the FE developer the shell/Docker tickets (BE-10, BE-11) by dropping typography (FE-6, 1.5 days) and dead code (FE-7, 0.5 days): frees 2 days of FE time. Pro: launch about 2 days sooner. Con: infrastructure work outside the FE developer's usual area; typography (decision 32) slips to Sprint 3.
5. Cut scope inside BE-6: ship the agent without the `set_server` command and the `status` CLI (saves about half a day), and merge BE-3 into BE-1 in one pass. Pro: closer to fitting. Con: still short by about 3 days; set_server is a stated requirement.
6. Do the Hetzner stand-up by hand from a written runbook (skip BE-11 script, saves 1.5 days). Pro: the one-time stand-up does not need an automated script yet. Con: harder to rebuild; the script is also the documentation of the setup.

Recommendation: option 1, with option 3 as the fallback if you want a public link sooner.

### Q2. Infrastructure as code: shell and `hcloud`, or something bigger?

Context: the stack is one VM, one Network, one Volume, one Firewall, one DNS record outside Hetzner. You prefer simple, readable code.

1. Shell script with `hcloud` CLI plus cloud-init (recommended). About 100 lines, idempotent checks with `hcloud ... describe`, readable, no new tools. Con: no automatic drift detection; changes are edits to the script.
2. OpenTofu (open source Terraform fork) with the Hetzner provider. Declarative, shows a plan before changing, tracks state. Con: a new language (HCL) and a state file to protect (needs a backend or the Volume), more than the stack needs.
3. Terraform (HashiCorp, BSL license). Same as 2 with the largest ecosystem and examples. Con: license changes, same state-file overhead.
4. Pulumi in Python. Infrastructure written in Python, fits your language preference, real programming constructs. Con: heavier runtime and account/state backend, easy to over-engineer.
5. Ansible playbook over SSH plus the `hcloud` module. Good for configuring the VM repeatedly after it exists. Con: YAML-heavy and slow; still needs something to create the VM.
6. Manual console clicks with a written runbook. Zero code. Con: not repeatable; moving home or rebuilding after a mistake is painful.

Recommendation: option 1. Revisit option 2 if you add a second server or a relay VM (moving home).

### Q3. Where does the Litestream replica live?

Context: the database is small (transit sources, nodes, settings today; large only once recording exists). Litestream needs an S3-compatible bucket.

1. Hetzner Object Storage (recommended). Same company and billing, S3-compatible, check which locations are offered when you create it (it may be Europe only, which is fine for a backup). Con: it keeps all eggs at one provider.
2. Backblaze B2. Cheap, S3-compatible, a US region, a different company than the server (real provider independence). Con: another account and bill.
3. AWS S3. Most documented, a US region, lifecycle rules. Con: the heaviest account and IAM setup for a few megabytes.
4. Wasabi. Flat price, S3-compatible, US regions. Con: minimum monthly charge and a 90-day minimum storage rule that is irrelevant at this size.
5. Cloudflare R2. Excluded: you rejected Cloudflare anywhere.
6. A second place you already own (a NAS with MinIO, or another VPS). Free and private. Con: you run it, and it is probably at home, so a home outage and a server loss can overlap.

Recommendation: option 2 if you want independence from the host, option 1 if you want one bill. I lean to 2 because the backup should survive losing the Hetzner account.

### Q4. Two sources hear the same channel. Which wins?

Context: the backend can run the LAN receiver and one or more nodes. If two cover the same AAR channel, both key up on the same transmission. BE-5 needs a rule. Default until you answer: first to key up owns the transmission.

1. First to key up wins for that transmission (default). Simple, no comparison needed. Con: may pick the weaker signal.
2. Strongest SNR wins, decided in a short window (about 300 ms) after the first key-up. Best audio. Con: adds 300 ms to the start of audio and needs the window logic.
3. Both play as separate transmissions, each tagged with its node. Pro: nothing is hidden. Con: the log shows doubles; Live Ops tiles were not designed for it.
4. One node per bank or channel preset (set when you add the node): a channel is only decoded by the node that owns it. Pro: no overlap by construction; saves CPU. Con: manual set-up, and overlapping coverage is wasted.
5. Prefer by priority order set in Settings (node 1 over node 2). Pro: predictable. Con: another setting; a priority node that is weak still wins.
6. Merge audio from both (diversity combining). Best quality. Con: needs time alignment between nodes; far outside this sprint.

Recommendation: option 1 now, and option 2 once you have two nodes with real overlap.

### Q5. How does `sdrviz-node` get onto the Pi and get updated?

Context: you want pip and venv, no uv, and set-and-forget for a year or more.

1. `install-node.sh` creates a venv in `/opt/sdrviz-node` and `pip install`s from a git checkout of this repo on the Pi (recommended). Update: `git pull` then `pip install -U .` and restart. Pro: simplest, no packaging. Con: manual updates, needs git and network on the Pi.
2. A wheel built from the repo and copied with scp; the script pip-installs the wheel. Pro: no git on the Pi, a versioned artifact. Con: a build step before each update.
3. The server serves the wheel (`/node/sdrviz_node-X.whl`) and the agent can fetch an update when the server tells it to (`update` command). Pro: updates from Settings, true set-and-forget. Con: self-update is a security surface and more code; best added later.
4. A `.deb` package with systemd unit. Pro: native on Debian, clean install/remove. Con: packaging overhead; you would not use it more than twice.
5. pipx from a private git URL. Pro: one command. Con: pipx adds a tool, and the venv location is less obvious for the systemd unit.
6. Docker on the Pi. Pro: same image mechanics as the server. Con: USB access for rtl_tcp and a desktop Pi make this awkward, and a heavier footprint.

Recommendation: option 1 now; consider option 3 in a later sprint.

### Q6. Server size and CPU type?

Context: the API does Opus decoding (light), transit polling, SQLite and serves a small frontend. No GPU, no DSP. Check hetzner.com for current prices.

1. CX22-class (x86, 2 vCPU, 4 GB). Safe default, widest software compatibility (recommended).
2. CAX11-class (ARM, 2 vCPU, 4 GB). Usually cheaper for the same size. Con: images must be built for arm64; PyAV wheels for arm64 exist but verify; your laptop builds need `--platform`.
3. CPX11-class (x86 AMD, 2 vCPU, 2 GB). Cheaper; 2 GB is tight with Docker, Caddy, Litestream and several viewers.
4. CX32-class (x86, 4 vCPU, 8 GB). Headroom for several nodes decoding Opus and for later transcription experiments. Con: costs more for capacity unused today.
5. Dedicated vCPU (CCX13). Steady performance. Con: more than needed.
6. Start at option 1 and resize later (Hetzner can resize up; disk size is the one-way part, which is why data lives on the Volume).

Recommendation: option 1, with data on the Volume so a resize is painless.

## 5. Backlog and Later

Ranked. Items from the Sprint 1 backlog that this sprint did not take are carried over with their original numbers in brackets.

0. BE-8, BE-9, BE-10, BE-11, FE-9 (slipped, above). First in Sprint 3.
1. Break up `MapCanvas.svelte` (777 lines): view store, command channel instead of nonce props, data loader (F#23-25, Sprint 1 backlog 20). L: three tickets. Natural next refactor once the node screens are in; split before starting.
2. Break up map `Screen.svelte` (372 lines) into route/panel wiring and a data loader (F#25). M.
3. Tests: `panelStore`, `transit.svelte.ts` polling, Settings forms, and one Playwright smoke of the panel flow (F#29, 23). M. (Nodes store tests are in FE-1.)
4. Named breakpoints replace `params.size === 1440` constants everywhere (F#26, 21). M.
5. Duplicated components: RegMark x3, FeedInspector x2, glyph pairs (F#28, 22). M.
6. Cache static map data in a module-level store (F#21); coalesce pointer writes (F#22) (19). S + S.
7. Panel navigation on browser history (F#12, 2). M.
8. Footer build/simulation label from `/api/health` with version and git hash (F#10, F#35; 3). S + S. The health route is needed by FE-5 anyway.
9. Agent self-update from the server (question 5, option 3). M.
10. Multi-node UX: node layer on the map, per-node coverage, channel ownership display. M.
11. Overlap handling beyond first-wins (question 4). M.
12. Nodes: per-node history of link quality over days (needs a table; not recording of radio). M.
13. Items 4-8, 10-17, 18-29 of the Sprint 1 backlog unchanged (train labels, map insets, Union schematic, stringline, strip diagram, milepost, operator filters, markers, panel chrome, train history UI, pass time refinement, Live Ops small fixes, Settings table, accessibility, performance, closing maximized panel, small Feeds fixes, national view, panel hierarchy).
14. Sprint 1's BE-9 (not the Alembic ticket above): record actual arrivals, departures and passes in SQLite (decision 18): deferred. The owner deferred all recording until the History rebuild (decision 44). Do not schedule it. Same for train history UI that depends on it.
15. FE: Settings view of station merges with block/force actions (from Sprint 1 backlog 0b). M.

### Later (deferred by the owner)

- Recording of real radio, History and Stats rebuild (decisions 34, 44).
- Multi-user accounts, roles (decision 40).
- Saved items (24); radio on transit pages (25).
- Boston station groups; Settings-editable station groups.
- Full-width Live Ops schematic (decision 28, 33) once the owner gives the requirements.
- Moving the server home (port forward or relay VM), see `docs/deployment-architecture.md` section 10.

## 6. Risks

- BE-1 may miss 50% at 91 channels on the CM5. Mitigation: it is first; the report stops for a decision. Fallback: fewer simultaneous channels (the node only decodes channels with energy or in the preset), or a lower channel count in the default preset.
- The Pi runs a desktop, tar1090 and lighttpd; CPU share is not exclusive. BE-6's soak test measures with them running.
- Opus via PyAV on the server needs the libopus in the API image (check in FE-5; the slim base needs `libopus0`).
- Pi temperature was 72.5 C under load on the single-core spike. Threaded DSP uses more cores; BE-1 records temperature, and OWNER may need a heatsink or fan if it nears 80 C.
- A lost enrollment key must be re-keyed; there is no recovery other than re-key (by design).

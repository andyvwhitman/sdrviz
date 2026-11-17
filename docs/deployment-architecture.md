# sdrviz deployment architecture

Decided 2026-11-16/17 (decisions 35-48). Status: planned, built in Sprint 2 and 3. This is the target of the sprint 2 systems-design study (decision 33).

## 1. Goal

Make sdrviz usable from the public web, from any browser, while the radios stay at home behind NAT. Raw radio data never leaves the Raspberry Pi. The LAN setup (backend talks to a local rtl_tcp) keeps working throughout.

## 2. Components

| Component | Where | What it does |
|---|---|---|
| RTL-SDR dongle + `rtl_tcp` | Node (Raspberry Pi CM5) | Streams raw 8-bit IQ on 127.0.0.1:1234. |
| `sdrviz-node` agent | Node, systemd service | Reads IQ from rtl_tcp, channelizes, squelches, NFM-demodulates, encodes Opus, builds spectrum frames, reports health. Holds one outbound WebSocket to the server. |
| Caddy | Server, Docker | TLS (Let's Encrypt), serves the built Svelte app, proxies `/api` and `/ws` to sdrviz-api. |
| `sdrviz-api` | Server, Docker | Today's FastAPI app minus radio DSP. Adds `/ws/node`, the node registry and enrollment, and a RemoteNode source that feeds the live hub like the local receiver does. Decodes Opus once to 8 kHz s16 PCM for browsers. |
| Litestream | Server, Docker sidecar | Continuously replicates the SQLite file to an S3-compatible bucket. |
| SQLite | Hetzner Volume | All app data. Alembic migrations run at deploy. |
| Browser | Anywhere | Svelte app. Plays 8 kHz PCM exactly as today (iPad Safari safe). |

## 3. Topology

```
 Node (home, behind NAT)                          Hetzner Cloud, Ashburn (ash)
 +--------------------------------+               +-----------------------------------+
 | RTL-SDR -> rtl_tcp (127.0.0.1) |               | Cloud Firewall: 80/443 in only    |
 |        |  raw IQ ~25 Mbit/s    |               |  Caddy :443 --/api,/ws--> sdrviz-api
 |        v  (stays on the Pi)    |   one WSS     |   |  serves built Svelte app      |
 | sdrviz-node: channelize,       | ------------> |   |                  SQLite on Volume
 |   squelch, NFM, Opus, spectrum |  outbound 443 |   |                  Litestream -> S3 bucket
 | <-- commands (tune, gain...)   | <------------ |  Hetzner private Network (day one)|
 +--------------------------------+               +-----------------------------------+
                                                      ^ browsers: HTTPS + /ws/live (PCM)
                                                      ^ SSH only over Tailscale
```

No Cloudflare anywhere. The domain is a subdomain of a domain the owner already owns; DNS stays where it is and gets one A record.

## 4. Data flows and rates

| Flow | Direction | Rate | Notes |
|---|---|---|---|
| Raw IQ, rtl_tcp to agent | Pi local | about 25 Mbit/s (1.536 MS/s x 2 bytes x 8 bit) | Never leaves the Pi. Bound to 127.0.0.1 once the agent runs there. |
| Node to server, up | Internet | about 50-150 kbit/s | Opus audio only for open channels (about 12-20 kbit/s each with framing), spectrum frames, key-up/key-down events, health. |
| Server to node, down | Internet | under 1 kbit/s | Commands and heartbeats. |
| Server to browser | Internet | about 100 kbit/s per viewer | 8 kHz PCM for the subscribed channels plus spectrum for the watched feed. Unchanged from today. |
| Transit feeds | Server to agencies | polled every 30 s | Amtrak, MARC, VRE, MBTA, Brightline. |
| Litestream | Server to bucket | small, continuous | WAL segments as they change. Snapshots on a schedule. |

## 5. Node uplink protocol (summary)

One WebSocket per node to `wss://<server>/ws/node` on port 443. Full contract: `docs/node-protocol.md` (written in BE-2).

- Text frames are JSON messages with a `type`. Binary frames reuse the `/ws/live` frame format from `backend/app/live/protocol.py` (kind, codec, channel, flags, sequence, offset) with a 2-byte node number in front. Audio frames use `CODEC_OPUS` (1); spectrum frames are unchanged.
- First message from the node is `hello` with protocol version, agent version, node id and secret (or the enrollment secret). The server answers `welcome` or closes with a reason code.
- Heartbeat every 5 s in both directions with a timestamp. Round trip time and missed beats give link quality. Lag is the estimated one-way delay plus the age of the audio at the node.
- Up: `key_up`, `key_down`, `health` (CPU, temperature, rtl_tcp state, dropped blocks), `ack`.
- Down: `tune`, `gain`, `squelch`, `channels`, `restart`, `set_server`. Every command carries an id and is answered by an `ack` or an error.
- Reconnect with exponential backoff (1 s up to 60 s, with jitter). The node keeps running its DSP while offline and drops audio rather than buffering it.
- Separate HTTP clip upload is not in scope. It is only reconsidered if backlogs get big (and recording is designed).

## 6. Audio path

Node: 48 kS/s channel baseband, NFM demod, resample to 8 kHz, Opus encode (PyAV with libopus, under 1% of one core). Server: decode once per frame to 8 kHz s16 PCM and publish to the hub, which sends today's PCM frames to browsers. Browser code and the iPad Safari playback path do not change.

## 7. Node enrollment

1. Owner opens Settings, Nodes, Add node, and enters name, location and an optional channel preset.
2. The server creates the node as PENDING, generates a 32-byte random enrollment secret, stores only its hash and an expiry (24 h), and shows the node key once.
3. The key is one line: `sdrviz-node1.<base64url of JSON {url, node, secret, v}>`. It is shown as text (with copy) and as a downloadable file. It is not shown again.
4. On the Pi: `sudo sdrviz-node enroll <key>`, or drop the file into `/etc/sdrviz-node/`.
5. The agent connects to `url` with `hello{mode: "enroll"}`. The server checks hash, expiry and single use, creates a 32-byte permanent node secret, stores only its hash, and returns the secret once.
6. The agent writes the secret to `/etc/sdrviz-node/node.json` (mode 0600) and sends `enrolled_ack`. The server then burns the enrollment secret and marks the node ONLINE. If the ack is lost, the server accepts the new permanent secret on the next connection and burns the enrollment secret then.
7. The permanent secret never expires. The node reconnects forever with it. The owner wants a year or more with no re-auth.

Settings can revoke a node (secret deleted, connection closed at once) or re-key it (new enrollment key for the same node; the old permanent secret keeps working until the new enrollment completes). The server can tell enrolled nodes a new address over the live connection (`set_server`); the node tests the new address before it switches and keeps the old one if the test fails.

Node states shown in Settings: PENDING (key issued, not enrolled), ONLINE (link quality and lag shown), OFFLINE (enrolled, not connected), REVOKED (hidden unless the owner shows it).

## 8. Security model

| Surface | Control |
|---|---|
| Network | Cloud Firewall allows only 80 and 443 inbound. SSH only through Tailscale. Private Network between server resources from day one. |
| TLS | Caddy and Let's Encrypt. HSTS. Node connects only to `wss://`. |
| Viewer login | One shared password, long, read from `.env`. App refuses to start in production mode with the default password. Rate limit per client, lockout after repeated failures. No users or roles. |
| Node auth | Enrollment secret: 32 random bytes, 24 h, single use. Node secret: 32 random bytes, no expiry. Server stores only hashes. Constant-time compare. Failed `hello` attempts are rate limited per IP. |
| Node revoke | Immediate: hash deleted, socket closed. |
| Data at rest | SQLite on a Hetzner Volume. Litestream replica in a bucket with its own access key. Volume snapshots are optional. |
| Raw IQ | Never leaves the node. |
| Secrets on disk | `.env` on the server (mode 0600, not in git). `/etc/sdrviz-node/node.json` on the node (mode 0600). |

Known limit: one shared viewer password means anyone with it sees everything. That is accepted until a multi-user design exists.

## 9. Database

SQLite stays. Alembic replaces the hand-written `ALTER TABLE` code in `transit/source_store.py` and `SQLModel.metadata.create_all`. Migrations run at deploy, before the API starts. Litestream replicates continuously; a restore drill is part of the hardening ticket.

## 10. Moving home later

The same Compose file runs at home. Two ways to be reachable:

| Option | What it needs | Trade-off |
|---|---|---|
| Port forward + dynamic DNS | Router forward of 80/443, DDNS updater, ISP allows inbound | Simplest. Exposes the home IP. Fails behind CGNAT. |
| Tiny Hetzner relay VM over WireGuard | Small VM with the public IP, WireGuard to home, Caddy or a TCP proxy on the VM | Works behind CGNAT. Home IP hidden. One more machine. |

The node address can be changed from Settings without touching the Pi (`set_server`), and the node key carries the URL. The firewall, Tailscale and Litestream setup carries over unchanged.

## 11. Benchmarks (Pi measurement spike, 2026-11-16)

Node: Raspberry Pi Compute Module 5 Lite, 4 GB, 4x Cortex-A76, Debian 13, Python 3.13, numpy 2.2, PyAV 14.2 with libopus. It also runs a desktop, tar1090 and lighttpd.

Today's `dsp.py` on ONE core:

| Channels | Share of real time |
|---|---|
| 8 | 28% |
| 24 | 73% |
| 48 | 142% |
| 91 (whole AAR band, 07-97) | 273% |

Split at 48 channels per 100 ms block:

| Stage | Time per block | Share |
|---|---|---|
| Channelizer (matmul) | 113 ms | 81% |
| Demod + power | 23 ms | |
| Spectrum | 3 ms | |
| u8 to complex | 1 ms | |

Opus encode costs under 1% of one core. The Pi reached 72.5 C under load with no throttling.

Decision (45): replace the per-channel matmul channelizer with an FFT-based fast-convolution (overlap-save) channelizer, and spread channel work across cores with threads (numpy releases the GIL). Target: all 91 AAR channels under 50% of real time on the CM5, output matching today's channelizer within a stated tolerance.

## 12. The rtl_tcp service on the Pi

`sdrviz-rtltcp.service` (in `/opt/sdrviz`) grew to 2.7 GB RSS over 4 days (it buffers when clients are slow and never frees) and took 90 s to stop (it ignores SIGTERM while blocked on USB). Fixes for the node setup: `TimeoutStopSec=5`, a `MemoryMax` (with `Restart=always`) or a periodic restart, and bind to 127.0.0.1 instead of 0.0.0.0 once the agent runs on the Pi. These need the owner's sudo (OWNER ticket).

## 13. LAN compatibility

The backend can use a local rtl_tcp source (as today) and remote nodes side by side. Both feed the same hub through the same interface. Nothing in Sprint 2 removes the LAN path.

## 14. Out of scope

Recording of real radio (decided later with the History rebuild), multi-user accounts, Cloudflare in any form, separate HTTP clip upload, raw IQ to the cloud.

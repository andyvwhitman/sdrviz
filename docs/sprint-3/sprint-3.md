# Sprint 3: radio, hardening, phone, recording

Started 2026-11-17 (overnight, unattended). Owner decisions: 56-59 in docs/decisions.md.

Order (owner): **A radio → B security → C phone-first → D recording, transcription and frequency pages.**
Each block ships on its own: tests and lint green → commit → push → deploy (`setup.sh`) → check on real data
(site answers, node ONLINE and decoding, no tracebacks). A block that breaks production is reverted and redeployed.

Ground rules for the run: never touch the owner's dev servers (ports 8100, 5173, 8130, 8150, 5190, 5191); nothing on the
Pi that needs sudo (node-side changes are written and committed, installed by the owner later); pythonic, small,
tested steps; agents sized per role (GMUNK on Opus, builders on Sonnet).

## A. Radio quality and node robustness

| ID | Ticket | Done when |
|---|---|---|
| A-1 | **Channel 12 overload.** K Tower arrives at -0.8 to -2 dBFS (full scale) on SDR-01: the 8-bit ADC clips, so its audio thumps and intermod makes ghost key-ups on CH14 at the same instants. Set SDR-01's gain 36.4 → 28.0 dB (server `gain` command). | Re-capture: K Tower key-ups at or below -6 dBFS, no CH14 key-ups coinciding with CH12, other channels still heard. |
| A-2 | **Gain guard (server side, no Pi update).** When a node reports a key-up or level above -4 dBFS, step its gain down one R820T step (floor 20 dB, at most once a minute) and log a node event. Node health gains `peak_dbfs`. | Unit tests for the stepping rule; event visible in the node's detail. |
| A-3 | **Clock and keyed-time bug (owner report: keyed time reads ~1440 min).** Production runs in UTC (the container), so the app's "time of day" is 5 h ahead of Eastern, and ages wrap past midnight. Also `last_heard` is empty for every channel although nodes key up constantly. Make the app's clock Eastern (or UTC inside, converted once at the edges), fill `last_heard` from live/node transmissions, fix every age that wraps. | Live site clock matches DC time; channel ages and keyed times plausible; test across midnight. |
| A-4 | **Dongle dropout detection.** 2026-11-17 22:08 the dongle re-enumerated on USB and rtl_tcp kept a dead handle: the agent reconnected every 6 s for 40 min while health said `rtl_tcp: connected`. Server side: health says `rtl_tcp: no samples` (fault chip, node event) when the node reconnects repeatedly or delivers no blocks. Pi side (committed, owner installs): a watchdog in `receiver/pi/` that restarts `sdrviz-rtltcp` when rtl_tcp logs USB errors, plus the narrow sudoers rule for it. | Server test with a fake node that reconnects in a loop; watchdog script and install steps in receiver/pi/README. |
| A-5 | **Adjacent-channel ghosts.** At gain 28 dB K Tower (CH12, 160.290) arrives at -9 dBFS (no clipping), yet CH14 (160.320) still keys at the same instant 8 of 11 times at -36 dBFS, 27 dB down. The channel filter rejects 30 kHz by 57 dB, so the energy is the transmitter's (or dongle's) sidebands. Server side: a key-up that starts within 0.5 s of a key-up on a channel within 60 kHz that is at least 20 dB stronger on the same feed is a ghost: no event, no audio, no recording. Log a counter per channel. | Test with two simultaneous key-ups 27 dB apart; on prod, CH14 no longer keys with CH12. |

## B. Security for a public site

| ID | Ticket | Done when |
|---|---|---|
| B-1 | BE-8: login lockout (per client, now that uvicorn sees real addresses), long-password check, refuse to start in production with the default password or secret. | Tests; prod starts with its real settings. |
| B-2 | Admin role: `SDRVIZ_ADMIN_PASSWORD`. Viewers read and listen; node create/revoke/rekey/commands, sources, banks/frequency edits, settings need admin. Transit source URLs must be http(s) to a public host (no SSRF to private ranges). | Route-by-route tests; UI hides admin controls for viewers. |
| B-3 | Session cookie `Secure` behind HTTPS; Origin check on state-changing requests and on `/ws/live`. | Tests. |
| B-4 | FE-9: lockout and rate-limit messages on the login screen (429/423). | Vitest. |

## C. Phone-first site (GMUNK review finding 1)

| ID | Ticket | Done when |
|---|---|---|
| C-1 | Page-layout (responsive) versions of login, station panel, trip panel and the map below 768 px, like /spot. | Screens at 390×844 without horizontal scroll, text at token sizes. |
| C-2 | Live Ops, Feeds & Banks, Settings below 768 px: a clear "needs a wider screen" plate with links to SPOT and the map. | Screenshot. |
| C-3 | GMUNK review of the phone screens; fix the must-fix list. | GMUNK APPROVE. |

## D. Recording, transcription, frequency pages (decisions 56-59, replacing 44)

| ID | Ticket | Done when |
|---|---|---|
| D-1 | **Recorder.** Every transmission on a channel in any bank is saved as one file: the node's Opus packets written as Ogg Opus (no re-encode), LAN receiver audio encoded the same way. Path on the data volume `audio/YYYY/MM/DD/<frequency>-<tx>.ogg`. Table `recording`: id, frequency_id, aar_channel, feed_id, feed lat/lon, started_at (UTC), duration_s, audio_path, audio_bytes, audio_state (ok/expired), transcript, transcript_state (pending/done/failed/empty), engine, created_at. | A fake node's transmission yields a playable .ogg and one row. |
| D-2 | **Transcriber** behind a small interface (`Transcriber.transcribe(path) -> text`); default engine faster-whisper `small.en`, int8, CPU, with a railroad-vocabulary initial prompt (station and tower names, "clear signal", "foul time", "MP", train numbers). A background worker takes pending rows oldest first. Model cached on the data volume. Engine is a setting (later: hosted API or a Mac worker). | Tests with a stub engine; a real short clip transcribes in the container. |
| D-3 | **Retention.** Delete audio older than `SDRVIZ_AUDIO_RETENTION_DAYS` (90) or, oldest first, while the audio store exceeds `SDRVIZ_AUDIO_MAX_GB` (10). Rows stay, `audio_state=expired`. Runs hourly and at start. | Tests for both limits. |
| D-4 | **API.** `GET /api/frequencies/{id}/activity?date=` (today in 15-min buckets: count and airtime), `.../activity/week` (7 days × 24 h), `GET /api/recordings?frequency_id=&before=&limit=` (newest first), `GET /api/recordings/{id}/audio` (Ogg, behind login, range requests). | API tests; docs in docs/recordings-api.md. |
| D-5 | **Frequency page** `/frequency/:id` (GMUNK direction first): today's activity across the day, a briefer week view, the list of transmissions with transcript and a play button. Reachable from channel tiles, the inspector, Feeds & Banks and transcript rows. Phone-friendly (page layout). | GMUNK review; works on real recordings. |

Later (not this sprint): the home page summary of recordings; starring transmissions to keep audio; search.

## Outcome (2026-11-18, overnight)

All four blocks shipped to production and were checked on real data.

- **A** live: gain 36.4 → 28.0 dB (K Tower -1 → -9 dBFS, no clipping); A-2 gain guard; A-3 Eastern clock and `last_heard` (site clock matches DC; FE `cyclicAge` skew fix); A-4 "no samples" fault (Pi watchdog committed in receiver/pi/, **not installed: needs owner sudo**); A-5 ghost key-ups dropped (CH14 ghosts counted in node health).
- **B** live: lockout with Retry-After, production settings check, viewer/admin roles (single-password mode until **`SDRVIZ_ADMIN_PASSWORD` is set** in the server .env), Secure cookie, Origin check. One outage: the settings check rejected the empty admin password from compose; fixed in a067f2b within minutes.
- **C** live: phone layouts; GMUNK C-3 must-fixes 1-7 done. Open SHOULDs: plate card brackets, trip ARR · DEP header, feed sheet pan.
- **D** live: every banked transmission recorded (Ogg Opus) and transcribed by faster-whisper small.en (keeps up with K Tower's ~170 tx/hour); retention 90 d / 10 GB; recordings API; `/frequency` index and `/frequency/:id` pages.
- Also fixed: Live Ops mute/solo (a lever press re-saved stale prefs and reverted the bank; PATCH /api/prefs).

Open: iPhone check of Ogg Opus playback (Safari < 18.4 cannot play it); D-5 leftovers (word reveal, DST ticks, strip aggregation under 192 px, SIM tag); transcript accuracy on noisy calls; DNS-rebinding re-check for transit sources; Caddy request-size limit.

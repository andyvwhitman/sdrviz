# REST API

All paths are under `/api`. Every call except `/api/auth/*` needs a session cookie ([auth.md](auth.md)); the role
column below says who may call it. Bodies are JSON. Conventions (ids, times, error shapes) are in
[README.md](README.md#conventions). Examples use the host `https://dispatch.andyvwhitman.com` and a cookie jar
`cookies.txt` from a login.

Contents: [Auth](#auth) · [Frequencies and assignments](#frequencies-and-assignments) · [Feeds](#feeds) ·
[Nodes](#nodes) · [Recordings](#recordings) · [Live state](#live-state-and-system) ·
[Trains and transit](#trains-and-transit) · [Geo](#geo) · [Receiver](#receiver-settings) · [Replay clock](#replay-clock)

| Role | Meaning |
|---|---|
| any | viewer or admin |
| admin | admin only (403 for a viewer) |

## Auth

Documented in [auth.md](auth.md): `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`.

## Frequencies and assignments

A **frequency** is a radio channel in the table (an AAR channel plus a label, railroad and use). It is **assigned**
to **feeds** (nodes). A feed hears, decodes, shows live and records exactly the frequencies enabled on it. A
frequency with no enabled assignment is not received. See [data-model.md](data-model.md).

### The frequency object

```json
{
  "id": "amtk-nec-road",
  "label": "AMTK NEC",
  "freq_mhz": 160.92,
  "aar_channel": 54,
  "railroad": "Amtrak",
  "use": "road/dispatcher",
  "line": "Northeast Corridor",
  "mode": "NFM",
  "confidence": "high",
  "notes": "NEC road channel",
  "sources": ["https://www.radioreference.com/db/subcat/89592"],
  "assignments": [{"feed_id": "feed-alx", "enabled": true}, {"feed_id": "node-1", "enabled": false}]
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Required on create; slug; cannot change |
| `label` | string | Required |
| `freq_mhz` | number | Required |
| `aar_channel` | int | Derived from `freq_mhz` as `round((freq_mhz - 160.110) / 0.015)`. If you send it, it must agree (422 otherwise) |
| `railroad`, `use` | string | Required |
| `line`, `notes` | string | Default `""` |
| `mode` | string | Default `"NFM"` |
| `confidence` | string | Default `"medium"` (free text; the seed data uses `high`, `med` and `low`) |
| `sources` | string[] | Reference URLs |
| `assignments` | object[] | Output only: `{feed_id, enabled}`, `[]` when unassigned. Ignored in request bodies |

### `GET /api/frequencies` (any)

Returns an array of frequency objects in table order.

```sh
curl -b cookies.txt https://dispatch.andyvwhitman.com/api/frequencies
```

### `GET /api/frequencies/{id}` (any)

One frequency object. 404 `{"detail": "No frequency 'x'"}`.

### `POST /api/frequencies` (admin)

Body: a frequency object without `assignments` (`aar_channel` optional). `201` with the new object. Errors: 409
if the id exists, 422 on validation.

### `PUT /api/frequencies/{id}` (admin)

Replaces the frequency. The body `id` must equal the URL id (422 otherwise). 404 if unknown. Returns the object.

### `DELETE /api/frequencies/{id}` (admin)

Removes the frequency and its assignments. `204`. Recordings stay (`GET /api/recordings?frequency_id=` still works);
the per-frequency activity calls answer 404 afterwards.

### `PUT /api/frequencies/{id}/assignments/{feed_id}` (admin)

Body `{"enabled": true}` (default `true`). Creates the assignment or changes its flag, then returns the frequency.
404 for an unknown frequency or a feed that is not in the world (a node must be enrolled first). Enabled nodes are
told the new channel list at once.

```sh
curl -b cookies.txt -X PUT -H 'Content-Type: application/json' -d '{"enabled": true}' \
  https://dispatch.andyvwhitman.com/api/frequencies/amtk-nec-road/assignments/node-1
```

### `DELETE /api/frequencies/{id}/assignments/{feed_id}` (admin)

Unassigns. Returns the frequency. 404 when it was not assigned.

### `POST /api/frequencies/from-channel` (admin)

What a right-click on the waterfall does: use the table's frequency on that AAR channel (or create `live-chNN`,
labelled with the channel number twice, for example `5454`), assign it to the feed and enable it.

Request: `{"aar_channel": 54, "feed_id": "node-1"}` (`aar_channel` 1 to 97).
Response: `{"frequency": <frequency object>, "created": false}`. `created` is `false` when an existing frequency was
reused. 404 for an unknown feed (as for `PUT .../assignments/{feed_id}`); 422 for a bad channel.

### Activity per frequency (any)

Day views are **Eastern days** (America/New_York), counted from recordings. A transmission counts in the bucket it
started in. `recording_since` is the start of the oldest recording of that frequency: before it, silence means "not
recording yet". `date` is `YYYY-MM-DD` (default today); a bad date is 422.

| Call | Returns |
|---|---|
| `GET /api/frequencies/activity?date=` | Every frequency enabled on at least one feed, in one call: `{date, tz, frequencies: [{frequency_id, recording_since, buckets}]}` with 15-minute buckets |
| `GET /api/frequencies/{id}/activity?date=` | `{frequency_id, date, tz, recording_since, buckets}`: 96 buckets of 15 minutes (92 or 100 on a daylight-saving change). 404 for an unknown frequency |
| `GET /api/frequencies/{id}/activity/week?date=` | `{frequency_id, tz, recording_since, days: [{date, hours: [bucket x 24]}]}`: the 7 days ending on `date`, oldest first |

A bucket: `{"start": "2026-11-17T05:00:00.000Z", "count": 2, "airtime_s": 11.4}` (`start` is UTC).

## Feeds

A **feed** is one receiving site: a node (`node-<number>`), the LAN receiver (`feed-live`), or a replay feed
(`feed-lnd`, ...). Node feeds are created and removed automatically when a node is enrolled or revoked; do not
create them with `POST /api/feeds`.

### The feed object

```json
{
  "id": "feed-lnd",
  "short": "LND-02",
  "name": "LND-02 New Carrollton",
  "site": "Fictional mast near New Carrollton, MD",
  "lat": 38.942, "lon": -76.885, "coverage_radius_km": 20.0,
  "hears": ["amtk-nec-road", "csx-road"],
  "driver": "rtl_tcp", "host": "lnd-02.sim.local", "port": 1234,
  "sim": true, "enabled": true,
  "state": "ok", "label": "",
  "since_t": null, "since": null, "in_state_s": null, "in_state_label": null, "episode_start": null,
  "acked": false, "acked_at": null,
  "last_sample_age_s": 0.2, "last_sample_age_label": null,
  "center_mhz": 160.89, "sample_rate_msps": 2.4, "sample_rate_measured_msps": 2.3998,
  "gain_db": 38.6, "ppm": 0, "snr_db": 20.0, "noise_floor_dbfs": -46.3,
  "telemetry": null, "telemetry_na": ["device_temp_c", "host_cpu_pct"],
  "sample_rate_15m": [2.3996, 2.3993]
}
```

| Field | Notes |
|---|---|
| `hears` | Ids of the frequencies enabled on this feed (filled from assignments) |
| `driver` | `rtl_tcp`, `sdrviz-agent` (a node) or `file`; replay feeds append ` · SIM` |
| `state` | `ok`, `stale`, `fault`, `offline` or `disabled`; `label` is the human text such as `FAULT · LINK LOST` |
| `since_t`, `since`, `in_state_s`, `in_state_label` | When the non-ok state began (day offset, `HH:MM:SS`), and how long. `null` while ok |
| `acked`, `acked_at` | Whether an operator acknowledged the fault |
| `telemetry` | For a real node: its health readings; otherwise replay telemetry or `null` |
| `sample_rate_15m` | The last 15 one-minute readings in MS/s, oldest first (`null` = link down) |

The exact set of fields is produced by the server; treat unknown fields as additive.

| Call | Role | Does |
|---|---|---|
| `GET /api/feeds` | any | Array of feed objects (all feeds in the world) |
| `GET /api/feeds/{id}` | any | One feed. 404 for an unknown id |
| `POST /api/feeds` | admin | Body: `id`, `name`, `lat`, `lon`, `coverage_radius_km` required; optional `short`, `site`, `driver`, `host`, `port`, `center_mhz`, `sample_rate_msps`, `gain_db`, `ppm`, `noise_floor_dbfs`, `enabled`, `sim`. `hears` is ignored. `201` with the feed object; 409 if the id exists |
| `PUT /api/feeds/{id}` | admin | Same body; `id` must match the URL (422). 404 if the feed is not a stored feed (node feeds cannot be edited here) |
| `DELETE /api/feeds/{id}` | admin | Removes the feed and its assignments. `204`; 404 for a feed that is not stored (including node feeds: use revoke on the node) |
| `POST /api/feeds/{id}/ack` | any | Acknowledge the feed's open fault. Optional body `{"reason": "text"}`. Returns the feed. 409 `This feed has no unacknowledged fault` when there is nothing to acknowledge |
| `GET /api/feeds/{id}/health?minutes=60` | any | `minutes` 1 to 1440. Per-minute series, events, acks and fault spans (below) |
| `GET /api/feeds/{id}/waterfall?rows=120` | any | Spectrum backfill: raw bytes (below) |

Health response (shortened):

```json
{
  "feed_id": "feed-lnd", "minutes": 60, "step_s": 60, "end_t": 50850.1,
  "series_1m": {"state": ["ok"], "snr_db": [23.0], "noise_floor_dbfs": [-45.0], "sample_rate_msps": [2.3985],
                "last_sample_age_s": [0.2], "gain_db": [40.2]},
  "events": [{"t": 50760.0, "clock": "14:06:00", "state": "fault", "label": "FAULT · LINK LOST"}],
  "acks": [{"t": 50791.0, "clock": "14:06:31", "label": "FAULT · LINK LOST"}],
  "spans": [{"start_t": 50760.0, "end_t": 50818.0, "start": "14:06:00", "end": "14:06:58",
             "state": "fault", "label": "FAULT · LINK LOST", "active": false}]
}
```

The series come from the replay data; for a real node feed they are not filled in the current code (empty or floor
values). Treat this endpoint as replay-oriented.

**Waterfall.** Content type `application/octet-stream`: `rows` x 1024 signed 8-bit dBFS values, oldest row first,
lowest frequency first. Headers: `X-Bins` (1024), `X-Row-Seconds` (0.25), `X-Center-MHz`, `X-Span-MHz`. For real
node feeds and the LAN receiver the backfill is an empty floor (-127). Live rows arrive as binary spectrum frames
on [/ws/live](live-websocket.md#spectrum-frame).

## Nodes

Admin only, every call including the GETs. The node object, key handling and commands are described in
[nodes.md](nodes.md#node-rest-api). Summary:

| Call | Does |
|---|---|
| `GET /api/nodes` | All nodes, ordered by number |
| `POST /api/nodes` | Create a PENDING node and its 24 h enrollment key: `{name, location: {lat, lon}, preset?}` -> `201 {node, key}` |
| `GET /api/nodes/{id}` | Node plus its last 50 events (newest first) |
| `PATCH /api/nodes/{id}` | Change `name`, `location`, `preset` |
| `POST /api/nodes/{id}/rekey` | New enrollment key -> `{node, key}` |
| `POST /api/nodes/{id}/revoke` | Revoke; the node is disconnected |
| `POST /api/nodes/{id}/commands` | Send `tune`, `gain`, `squelch`, `channels`, `restart` or `set_server` |

## Recordings

Every transmission on a frequency enabled on the feed that heard it is saved as one Ogg Opus file and one recording
row, then transcribed. All calls are read-only and open to any role. A recording appears a moment after key-down
(when the file is complete); a transmission longer than 120 s continues as a second row. Rows are kept; the audio
file expires after the retention period (default 90 days, or when the audio store is full).

There is **no separate transcript endpoint**: the transcript is the `transcript` field of the recording row.

### The recording object

```json
{
  "id": 412,
  "frequency_id": "amtk-k-tower",
  "aar_channel": 12,
  "feed_id": "node-1",
  "node_id": "node-49m0vfe5",
  "feed_lat": 38.9231,
  "feed_lon": -77.0412,
  "started_at": "2026-11-17T19:20:04.517Z",
  "duration_s": 6.84,
  "audio_bytes": 10712,
  "audio_state": "ok",
  "audio_url": "/api/recordings/412/audio",
  "transcript": "K Tower, Amtrak 2 3 1, clear signal on track two, over.",
  "transcript_state": "done",
  "engine": "faster-whisper:small.en"
}
```

| Field | Notes |
|---|---|
| `node_id` | The node that heard it; `null` for the LAN receiver and for rows from before nodes were recorded |
| `feed_lat`, `feed_lon` | The receiver's position when it was recorded |
| `audio_state` | `ok` or `expired`. When `expired`, `audio_url` is `null` and the audio call answers 410 |
| `transcript_state` | `pending` (waiting for the transcriber), `done`, `empty` (nothing intelligible, or transcription is off), `failed` |
| `engine` | The transcriber that wrote the transcript; empty until it has run |

### `GET /api/recordings?frequency_id=&before=&limit=` (any)

Newest first, a plain JSON array. `frequency_id` optional. `limit` 1 to 200 (default 50). `before` is an ISO time:
only recordings that **started before it** (a time without an offset is read as UTC). To page, pass the last row's
`started_at` as `before`. Rows with exactly equal start times may be skipped by this scheme.

```sh
curl -b cookies.txt 'https://dispatch.andyvwhitman.com/api/recordings?frequency_id=amtk-nec-road&limit=20'
```

To follow new transmissions, poll without `before` and keep the highest `id` you have seen.

### `GET /api/recordings/{id}` (any)

One recording object. 404 `{"detail": "No recording 9"}`.

### `GET /api/recordings/{id}/audio` (any)

`audio/ogg` (Opus, mono, about 12 kbit/s). Supports `Range` requests (`206 Partial Content`) so players can seek.
410 when the audio has expired; 404 when the row or the file is missing.

## Live state and system

### `GET /api/live/state?listen_feed=` (any)

The current LiveState: the same object the WebSocket sends as `snapshot` ([fields](live-websocket.md#snapshot)).
`listen_feed` is the feed id the channel list is built for; unknown or missing means the default (first online node,
else the first feed). Useful for a one-shot read; use the socket for updates.

### `GET /api/system` (any)

Host, decoder and disk readings (the `system` block of the snapshot) plus `version` and `sim`:

```json
{"host": {"cpu_pct": 44.1, "soc_temp_c": 64.9, "throttled": false, "under_voltage": false, "uptime_s": 1865100, "state": "ok"},
 "decoder": {"queue": 1, "median_latency_s": 1.6, "state": "ok"},
 "disk": {"pct": 41.6, "state": "ok"}, "version": "0.1.0", "sim": true}
```

In replay mode the host, decoder and disk numbers are replay data, not the real server.

### `GET /api/system/backend` (any)

The backend process: `build {version, commit, python, platform, pid}`, `started_at` (epoch seconds), `uptime_s`,
`sim {enabled, speed}`, `cpu {process_pct, load_avg, cores}`, `memory {rss_bytes, peak_rss_bytes}`,
`disk {total_bytes, free_bytes, data_bytes, audio_bytes, db_bytes}`,
`websocket {clients, audio_subscriptions, spectrum_watchers}`.

### `GET /api/lofar?minutes=60` (any)

Signal-strength history per feed and frequency. `minutes` 1 to 360.

```json
{"row_s": 30, "rows": 2, "row0_t": 50820,
 "cells": {"feed-lnd": {"amtk-nec-road": [-35.2, -34.4], "csx-road": [-14.8, null]}, "node-2": {}}}
```

Each list has `rows` values in dBFS, oldest first, `null` for silence; row `i` starts at `row0_t + i * row_s` (day
offset). Fed by replay data and live key-ups.


## Trains and transit

Two separate train sources exist.

### Replay trains

| Call | Notes |
|---|---|
| `GET /api/trains?start=&end=&route=&q=` | `{"items": [train run, ...]}`: scheduled runs of the replayed day (stops with times) for the stringline. `start`/`end` are ISO times selecting runs active in the window; `route` is a route id; `q` a substring of the train id (`MARC 41`) |
| `GET /api/trains/live` | Positions now: array of `{train_id, operator, line, direction, route_id, route_mi, prefix, mp, mp_label, lat, lon, speed_mph, at_place, next_stop, next_stop_t, channel, talking, sim, data_block}` |

Both are replay data (`sim: true`) built from a recorded day, not live railroad data.

### Real trains (`/api/transit`)

GTFS and GTFS-realtime data from configured sources (Amtrak, MARC, VRE and others). Ids are namespaced
`<source>:<gtfs id>`, for example `amtrak:171-13` or `st:was` (a station group); pass them back as they came. Times
are ISO 8601 with an offset. If transit is turned off on the server, list calls return empty results and some single
lookups answer 404 or 503.

| Call | Role | Returns |
|---|---|---|
| `GET /api/transit/vehicles?bbox=w,s,e,n&agency=` | any | Array of vehicles: `{id, trip_id, source, agency, route_id, route_name, train, headsign, origin, destination, lat, lon, bearing, speed_mph, delay_s, status, next_stop, position, updated, age_s, stale_after_s, stale, delay_suspect}`. `position` is `realtime` or `estimated` (from the schedule). `status` is `on_time`, `late`, `early` or `unknown` (on time = under 120 s) |
| `GET /api/transit/lines?bbox=w,s,e,n` | any | `{lines: [{id, source, agency, route_id, name, short_name, color, kind, coords}]}`; `coords` is a multilinestring of `[lon, lat]`, simplified for the box width. `bbox` is required (422 if missing; a malformed one is 422 when transit is on) |
| `GET /api/transit/stops?bbox=w,s,e,n` | any | `{stops: [{id, source, name, code, short_name, lat, lon, kind, routes, sources}]}`, thinned when the box is wide |
| `GET /api/transit/trips/{trip_id}?date=&passes=` | any | A trip with every stop (`stops[]` with scheduled and estimated times, `delay_s`, `track`, `state`), its `vehicle`, and `alerts`. `passes=1` also lists stations the train runs through. 404 if unknown |
| `GET /api/transit/stations/{stop_id}?back=60&ahead=240&date=&agency=&source=&passing=` | any | Departures and arrivals at a station: `{stop, canonical_id, routes, departures, arrivals, passing, alerts}`. `stop_id` is a group (`st:was`) or any `<source>:<stop>` id. With `date` the whole scheduled day is listed |
| `GET /api/transit/stations/{place_id}/board?back=30&ahead=180` | any | The board for an app place id (the regional map): `{place_id, name, generated, upcoming, departed, sources, attribution}` |
| `GET /api/transit/stations/merges` | any | Station groups with their members, plus suggested merges |
| `GET /api/transit/routes/{route_id}?date=` | any | Timetable grid of a route by direction |
| `GET /api/transit/alerts?source=` | any | Active service alerts `{header, description, url, routes, stops, start, end}` |
| `GET /api/transit/approaching?lat=&lon=&radius_km=1&ahead_min=60&back_min=10&offset_min=0&agency=&include_scheduled=true&limit=100` | any | Trains that pass a point, each with an ETA at the nearest point on its line. `lat` and `lon` required |
| `GET /api/transit/stats` | any | Per-source load timings and index memory |
| `GET /api/transit/sources` | admin | Configured sources with state, counts and last error |
| `POST /api/transit/sources` | admin | Add a source (`SourceConfig` body, 201). 409 if the id exists; 422 if any URL is not http(s) to a public host |
| `PUT /api/transit/sources/{id}` | admin | Replace a source |
| `DELETE /api/transit/sources/{id}` | admin | `204` |
| `POST /api/transit/sources/{id}/refresh` | admin | Re-download the static data now |

Ranges for `approaching`: `radius_km` 0.1 to 25, `ahead_min` 1 to 360, `back_min` 0 to 60, `offset_min` -360 to 720,
`limit` 1 to 500. Station boards: `back` 0 to 240 (station calls: 0 to 720), `ahead` 1 to 1440.

A source (`SourceConfig`): `id` (lowercase slug), `name`, `agency`, `kind` (`gtfs`, `amtraker` or `lines`),
`enabled`, `static_url`, `rt_trip_updates_url`, `rt_vehicle_positions_url`, `rt_alerts_url`, `api_key` (write-only;
reads return a mask), `key_header`, `route_types`, `exclude_routes`, `static_refresh_h` (default 24), `rt_poll_s`
(default 15, minimum 5), `stale_after_s`. `TransitSource` adds a read-only `status` with `state`
(`ok`, `stale`, `error`, `disabled`, `loading`, `warming`), `error`, load times, and `counts`.

The full transit field-by-field contract is in the repository's `docs/transit-api.md`.

## Geo

Static map data. GeoJSON layers are cacheable: they send `ETag` and `Cache-Control: public, max-age=3600`, and answer
`304` to `If-None-Match`. Open to any role.

| Call | Returns |
|---|---|
| `GET /api/geo/rail` | Rail lines, `application/geo+json`. 404 when the file is not installed |
| `GET /api/geo/rail-detail` | Track-level detail at terminals (GeoJSON) |
| `GET /api/geo/water` | Water polygons (GeoJSON) |
| `GET /api/geo/places` | JSON: seeded stations and (in replay mode) fictional feed sites |
| `GET /api/geo/routes` | JSON: the replay's routes with mileposts |

## Receiver settings

The one LAN `rtl_tcp` receiver (feed `feed-live`). Admin only.

| Call | Notes |
|---|---|
| `GET /api/radio` (any) | Connection status: `{host, state, ...}`. `state` is `off`, `disabled`, `starting`, `reconnecting` or `streaming`; adds `error`, `tuner`, `center_hz`, `rate`, `gain_db`, `throughput` (1.0 is full rate) and per-channel squelch readings when streaming |
| `GET /api/radio/settings` (admin) | `{name, host, port, freq_hz, rate, gain_db, squelch_db, lat, lon, enabled}` |
| `PUT /api/radio/settings` (admin) | Same fields. `name` 1 to 40 characters; `host` letters, digits, `.`, `_`, `-`; `port` 1 to 65535; `freq_hz` 24 000 000 to 1 766 000 000; `rate` a multiple of 48 000 in 225 001 to 300 000 or 900 001 to 3 200 000; `gain_db` 0 to 50 or `null` (automatic); `squelch_db` 1 to 30; `lat`, `lon`. A host is required while `enabled`. Applies immediately |

## Replay clock

`GET /api/sim` (any) -> `{"scenario": "keyed", "clock": "14:07:30", "speed": 1.0, "scenario_feed": "feed-lnd"}`.
`scenario` and `scenario_feed` are `null` when no scenario is active.

`POST /api/sim/jump` (admin) moves the clock. Body, all optional:

| Field | Meaning |
|---|---|
| `scenario` | `listening` (03:40:00), `fault` (14:06:22), `fault-acked` (14:06:36) or `keyed` (14:07:30). Clears user acknowledgements |
| `clock` | `HH:MM` or `HH:MM:SS` or `HH:MM:SS.s` |
| `speed` | Playback speed, 0 or more; 0 freezes the clock. After a jump the default is the server's configured speed |

Returns the same shape as `GET /api/sim`. `scenario_feed` is the node the scenario is about; the server no longer
switches anybody's listened node, so a client that wants it sends the `listen` op itself. With the replay off the
real Eastern clock cannot be moved, so a jump has no effect on the time.

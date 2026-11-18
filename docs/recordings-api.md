# Recordings API (D-4)

Every transmission on a channel that is in a bank is saved as one Ogg Opus file and one `recording` row
(decision 57). This page is the HTTP side. All endpoints need a login and are **read-only for viewers**; nothing
here needs the admin password. Times are UTC with a `Z`, to the millisecond. An unknown frequency is 404, a bad
`date` or `limit` is 422.

How recording works: the node's Opus packets are written into Ogg pages as they arrive (no re-encode); the LAN
receiver's PCM is encoded with the same encoder. A transmission that ghost suppression (A-5) drops is never
recorded: the files are what a browser would have heard. A file ends on key-down or after
`SDRVIZ_RECORDING_MAX_S` (120 s), and a longer transmission continues as a second row and file. A row appears when
the file is complete, a moment after key-down.

## The recording object

```json
{
  "id": 412,
  "frequency_id": "amtk-k-tower",
  "aar_channel": 12,
  "feed_id": "node-1",
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

- `audio_state`: `ok` or `expired` (retention deleted the file; the row and transcript stay). When expired,
  `audio_url` is `null` and the audio endpoint answers 410.
- `transcript_state`: `pending` (waiting for the worker), `done`, `empty` (nothing intelligible, or the server runs
  with `SDRVIZ_TRANSCRIBER=none`), `failed`.
- `feed_lat`/`feed_lon` are the receiving feed's position when it was recorded (null if the feed is unknown).
- `engine` is empty until the worker has touched the row.

## `GET /api/recordings?frequency_id=&before=&limit=`

Newest first. `frequency_id` is optional. `limit` is 1 to 200 (default 50). `before` is an ISO time: only
recordings that **started before it**. To page, pass the last row's `started_at`. The response is a plain JSON list
of recording objects (empty when there are none).

`GET /api/recordings/{id}` returns one recording object.

## `GET /api/recordings/{id}/audio`

`audio/ogg` (Opus, mono, 12 kbps, plays in `<audio>` in Chrome and Firefox; Safari only plays Ogg Opus from 18.4, so check older iPhones). It supports `Range`
requests (`206 Partial Content`, `Accept-Ranges: bytes`), so a player can seek. 410 when the audio expired, 404 when
the row or the file is missing.

## `GET /api/frequencies/{id}/activity?date=YYYY-MM-DD`

One **Eastern** day (America/New_York, default today) in 15 minute buckets. `count` is the number of transmissions
that started in the bucket and `airtime_s` their total length (a transmission is counted where it started). The day
has 96 buckets, or 92 and 100 on the daylight saving changes; `start` is the UTC moment each bucket begins, so the
list is already correct for those days.

```json
{
  "frequency_id": "amtk-k-tower",
  "date": "2026-11-17",
  "tz": "America/New_York",
  "recording_since": "2026-11-16T22:41:09.120Z",
  "buckets": [
    {"start": "2026-11-17T05:00:00.000Z", "count": 0, "airtime_s": 0.0},
    {"start": "2026-11-17T05:15:00.000Z", "count": 2, "airtime_s": 11.4}
  ]
}
```

`recording_since` is the start of this frequency's oldest recording, or `null` when nothing was ever recorded. A
bucket with `count: 0` before it means "we were not recording yet", after it "nothing was heard". (It is the oldest
recording row, which is kept forever, even when the audio has expired.)

## `GET /api/frequencies/{id}/activity/week?date=YYYY-MM-DD`

The 7 Eastern days that **end on** `date` (default today), oldest first, each as 24 hourly buckets (23 or 25 on a
daylight saving change). Same bucket shape, same `recording_since`.

```json
{
  "frequency_id": "amtk-k-tower",
  "tz": "America/New_York",
  "recording_since": "2026-11-16T22:41:09.120Z",
  "days": [
    {"date": "2026-11-11", "hours": [{"start": "2026-11-11T05:00:00.000Z", "count": 0, "airtime_s": 0.0}]},
    {"date": "2026-11-17", "hours": [{"start": "2026-11-17T05:00:00.000Z", "count": 3, "airtime_s": 21.7}]}
  ]
}
```

(`hours` has 24 entries; shortened here.)

## `GET /api/frequencies/activity?date=YYYY-MM-DD`

The day buckets of **every frequency that is in a bank**, in one call, for the `/frequency` index. Same buckets and
`recording_since` per frequency (the whole response is about 96 small objects per frequency).

```json
{
  "date": "2026-11-17",
  "tz": "America/New_York",
  "frequencies": [
    {
      "frequency_id": "amtk-k-tower",
      "recording_since": "2026-11-16T22:41:09.120Z",
      "buckets": [{"start": "2026-11-17T05:00:00.000Z", "count": 0, "airtime_s": 0.0}]
    }
  ]
}
```

## Settings

| Variable | Default | |
|---|---|---|
| `SDRVIZ_TRANSCRIBER` | `faster-whisper` | or `none`: rows are saved as `empty`, no model is loaded |
| `SDRVIZ_WHISPER_THREADS` | `2` | CPU threads of the speech model |
| `SDRVIZ_AUDIO_RETENTION_DAYS` | `90` | audio older than this is deleted |
| `SDRVIZ_AUDIO_MAX_GB` | `10` | oldest audio is deleted while the store is bigger |
| `SDRVIZ_RECORDING_MAX_S` | `120` | longest single file |

Files live in the data volume at `audio/YYYY/MM/DD/<frequency_id>-<tx>.ogg` (UTC date of the start); the speech
model is cached in `models/` (about 500 MB, downloaded on the first transcription). Retention runs at start and
every hour; it deletes the oldest audio first and keeps the rows with `audio_state: expired`.

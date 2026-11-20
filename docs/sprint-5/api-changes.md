# Sprint 5 backend API changes (for the frontend)

Decisions 66-70. Banks are gone everywhere. TS types are updated in `frontend/src/lib/types/{live,api,recordings}.ts`
and `frontend/src/lib/ws/protocol.ts`; the rest of the frontend still uses the old names until I-1 to I-4 land.

## Model in one paragraph

A frequency is assigned to feeds (nodes) with `Assignment(frequency_id, feed_id, enabled)`. A feed hears exactly its
enabled assignments: a node decodes their AAR channels, the server shows them on Live Ops, records and transcribes
them. Disabled or unassigned: none of that. Node feeds are `node-N` (N = the node number); dev sim feeds
(`feed-lnd`, ...) work the same.

## REST

### Removed

- Everything under `/api/banks` (list, create, update, delete, activate, `live/channels`).
- `Prefs.active_bank`, `Prefs.displayed_feed`.
- `GET /api/frequencies/{id}` and `DELETE` no longer know `?force=true` (nothing refuses a delete now).

### Frequencies

`FrequencyRecord` (list, read, create, update and the assignment calls all return it):
`{id, label, freq_mhz, aar_channel, railroad, use, line, mode, confidence, notes, sources, assignments: [{feed_id, enabled}]}`.
`assignments` is `[]` for an unassigned frequency. Create and update bodies are unchanged (no `assignments`).

| Call | Who | Does |
|---|---|---|
| `PUT /api/frequencies/{id}/assignments/{feed_id}` `{enabled: bool}` | admin | creates the assignment or changes its flag; 404 for an unknown frequency or a feed that is not in the world (a node must be enrolled first). Returns the frequency. |
| `DELETE /api/frequencies/{id}/assignments/{feed_id}` | admin | unassigns; 404 when it was not assigned. Returns the frequency. |
| `POST /api/frequencies/from-channel` `{aar_channel: 1..97, feed_id}` | admin | right-click on the waterfall. Uses the table's frequency on that AAR channel, or makes `live-chNN` labelled with the number twice ("5454", channel 7 is "0707"); assigns it to the feed, enabled. Returns `{frequency: FrequencyRecord, created: bool}` (`created` false = reused an existing frequency). 422 for an unknown feed or channel. |
| `DELETE /api/frequencies/{id}` | admin | removes the frequency and its assignments. Recordings and transcripts stay (`GET /api/recordings?frequency_id=` still works); the per-frequency activity endpoints answer 404 once the frequency is gone. |

Deleting a feed (`DELETE /api/feeds/{id}`) removes its assignments. The `hears` field in a feed's POST/PUT body is
ignored; `hears` in feed views is the list of its enabled frequency ids.

`GET /api/recordings/frequencies/activity` (batch) now lists every frequency enabled on at least one feed.

### Prefs

`{listen_feed: string | null, muted, solo, record, volume}`. `listen_feed` is the node Live Ops listens to. GET returns
it resolved (the saved choice, else the first online node feed, else the first feed). Changing it is admin only
(403 for a viewer, 422 for an unknown feed) and pushes a snapshot. Sending back the resolved default does not pin it.
`POST /api/sim/jump {scenario}` selects the scenario's feed (`feed-lnd` for all four).

### Nodes

Preset names are `assigned` (default) and `aar`. `banks` is gone; nodes on it become `assigned` at startup.
`assigned`: the node decodes the AAR channels of its enabled assignments (plus held listens, see G-5), sent in
`welcome`, as a `channels` command on connect and whenever the list changes. An empty list is never sent (the node keeps
its last one). `aar`: the whole band; the server still only shows and records enabled frequencies.
A key-up on a channel that is not enabled on that node is ignored (no tile, no recording).

### Recordings

`Recording` and `RecordingOut` gain `node_id: string | null` (the node that heard it; null for the LAN receiver).
`feed_lat` / `feed_lon` are the node's position at the time. Rows from before get `node_id` at startup for `node-N` feeds.
Recording happens only for a frequency enabled on the feed that heard it.

## Live state snapshot (`/api/live/state`, ws `snapshot`)

Dropped: `active_bank`, `displayed_feed`, `banks`, `views` (bank views and the hero), `channels[].banks`,
`off_bank` on transcript rows and active transmissions, `off_bank` on the `keyup` message, `off_bank_*`.

Added:

```ts
listen_feed: string | null;                 // the node Live Ops listens to
feeds_listenable: { feed_id: string; name: string; short: string; online: boolean }[]; // node picker; every feed;
                                            // online = state ok or stale (offline and fault are down)
```

Kept with the same meaning: `channels` (same per-channel fields, minus `banks`) but now only the frequencies enabled
on `listen_feed`, sorted by `freq_mhz` ascending; `feeds`, `header`, `faults`, `degraded`, `status_line`, `system`,
`trains`, `ctc`, `lofar_60m`, `displayed_feed_admin` and `displayed_feed_admin_why` (the Feeds page inspector).

`transcript.rows` and `active_transmissions` are not filtered by node: each row carries `feed_id` and `receptions`, so
the UI filters to the listened node if it wants to. (`channel` patches over the websocket still go out for every
frequency; ignore ids not in `channels`.)

Not provided any more: the bank "hero" (keyed / last key-up line). Derive it from `channels[].tx` and `last_heard`.

## Hold to listen (websocket `/ws/live`)

Client ops (also in `ClientOp`, `frontend/src/lib/ws/protocol.ts`):

```ts
{ op: "listen_hold";    feed_id: string; aar_channel: number }   // press; repeat every 5 s while held
{ op: "listen_release"; feed_id?: string; aar_channel?: number } // release; no fields = all of this connection's holds
```

- `feed_id` must be an online node feed (`node-N`); `aar_channel` 1..97. Bad values are ignored silently (no message);
  a hold on a feed that is not a node or is offline answers `failed`.
- Viewers may hold (it is listening, not a change). At most 4 holds per connection.
- While held, the channel is added to that node's decode list (union with its enabled assignments), pushed to that node
  only. It is removed again on release, 15 s without a renewal, or disconnect (no message to a gone client).
- The audio arrives as ordinary binary audio frames (PCM, 100 ms chunks, `ch` = AAR channel in the header, its own
  `tx_seq`) to the holding connections only; no `audio` op or frequency id is needed. If the channel also is an enabled
  frequency, holders get it once (a connection that subscribed to it with the `audio` op is not sent it twice).
- Held listening is never recorded, transcribed, nor shown as a tile, `keyup`, `keydown` or `level`. A key-up on a
  channel that is neither enabled on the node nor held is ignored.

Server message, to the holding connection only:

```ts
{ type: "listen_state", feed_id, aar_channel, state: "tuning" | "listening" | "released" | "failed", reason?: string }
```

- `tuning`: hold accepted, the node has been sent the new list. `listening`: the node acked it (sent at once, without
  `tuning` first being followed by a wait, when the node already decoded the channel: enabled there or `aar` preset).
  The first audio frame for the channel can take longer than `listening` (it comes with a transmission).
- `released`: `reason` is `"released"` (your op) or `"timeout"`. `failed`: `reason` is `"not a node"`, `"node offline"`,
  `"too many holds"`, `"node timeout"` / `"node failed"` (the node did not ack or refused) or `"could not tell the node"`.
  After `failed` the hold is gone; press again to retry.

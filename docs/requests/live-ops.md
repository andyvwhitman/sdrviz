# Requests from `live-ops` (P1)

Owner: `frontend/src/screens/live-ops/**`. Everything below was either missing from `$lib` when the screen was
built (so a screen-local copy exists and is marked for promotion) or needs a decision from the lead.

## 1. Kit components that did not exist (built locally, promote when the kit package lands)

The plan says "use the kit X". These were not in `$lib` yet, so live-ops carries its own copy. They only take props
and read stores, so promoting is a move plus an import change.

| Local file | Wanted in `$lib` as | Notes |
|---|---|---|
| `Inspector.svelte`, `InspectorSection.svelte` | `components/Inspector.svelte` | head (glyph, title, SIM, `LOG +n`, ESC), kind line, `lead` snippet, sections; ESC key closes |
| `HeroStrip.svelte` + `hero.ts` | `components/HeroStrip.svelte` | the `hero.ts` derivation (keyed / idle, off-bank label, "+n ON feed" label) is pure and tested |
| `RegMark.svelte` | `components/RegMark.svelte` | M4 |
| `FrequencyRuler.svelte` + `freqRuler.ts` | `components/FrequencyRuler.svelte` | includes `extra` numerals with the 4 px clear rule and the 8 px sideways nudge (spec 13.4 gap 9); Feeds can use it as is |
| `SpectrumTrace.svelte`, `Waterfall.svelte` (+ `waterfallModel.svelte.ts`), `LofarStrip.svelte` (+ `lofarModel.svelte.ts`) | `components/` | Feeds inspector reuses them; `wall.ts` holds the shared arithmetic (band x, NFM shape, floor memo) |
| `TranscriptLog.svelte` | `components/TranscriptLog.svelte` | fit-to-rows while following the top, `BANK ONLY`, `▲ n NEW` pill, M24 reveal on first `words` |
| `keyup.svelte.ts` (`KeyupMotion`, `revealWords`) | `lib/motion/keyup.ts`, `lib/motion/reveal.ts` | the 120 ms commit flash is driven by `data-commit`; on release a ghost TX frame (`.lo-ghost`) is laid over the tile, holds `t-settle`, then retracts over `t-settle` (spec 6.3); the AAR step-down and the held-back timer are CSS in `live-ops.css` (`.tile:has(.frame[data-commit])`) and should move to `tile.css` |
| `simClock.svelte.ts` | `stores/simClock.svelte.ts` | smooth sim time between 1 Hz ticks, for key-up timers and LAST ages |
| `mixer.ts` | `lib/audio/mixer.ts` | `gainOf`, `isAudible`, `subscribedChannels` for the audio engine (see 2) |
| `wave.ts` | `lib/hud/wave.ts` | M15 envelope from the 10 Hz level stream; Feeds/History can use it |

## 2. Audio engine (not built anywhere yet)

The mixer UI (per-tile levers, solo dimming, muted treatment, AUDIO section of the channel inspector) is done and
writes only to `prefs` (`muted`, `solo`, `record`, `volumes`). Nothing plays. The engine should, for each channel:
multiply the PCM by `gainOf(mix, channelId)` (`screens/live-ops/mixer.ts`, solo wins over mute, volume is 0..1),
and send `{op:"audio", channels: subscribedChannels(...)}` when the audible set changes. The header chip
(`audio.enable()`) already exists. `prefs.value.volumes[channelId]` is saved on slider release (one PUT per change).

## 3. Changes wanted in shared files

1. `TranscriptRow` log set: a detector row shows its **train id in the speaker column** in the Live Ops mockup
   (`live-ops.js`: `who = role === "detector" ? train_id`). The kit's `speaker()` returns an empty cell for a DET row
   unless it is given a name, so `columns="log"` left it blank. **Local fix in place** (`TranscriptLog.svelte` `forLog`):
   a DET row with a `train_id` is passed to the kit with a neutral role, so the kit falls back to the train id
   (`MARC 861`, `VRE 301`; `role_tag` still prints DET). Verified in the fault and keyed frames. Proper fix for the
   kit: `TranscriptRow` should pass `row.train_id` as `given` to `speaker()` for DET rows in the log column set.
2. `KeyValue` with `sim`: the mockup puts a space before the SIM tag (`MARC 433 SIM`); the kit renders `MARC 433SIM`.
   live-ops passes a children snippet with `{" "}<SimTag />` meanwhile.
3. `tile.css`: the solo rule (`.has-solo .tile:not([data-solo]) .tile__meter, .tile__wave { opacity: .4 }`) is live-ops
   local; the spec has no "dimmed by solo" state. Decide whether it belongs in the tile spec (the header chip already
   says `SOLO n`).
4. `types/live.ts`: `Feed.episode_start` exists on the wire but not in the type (read with a cast in `FeedInspector`);
   `BankView.hero` has the keyed shape (`aar4`, `via`, `timer`, `others_label`) as well as the idle one.
5. **`Prefs.volumes` is `volume` on the wire** (`backend/app/schemas.py` `PrefsModel.volume`); `lib/types/api.ts`, its README row and
   the scaffold notes say `volumes`. The key is silently dropped by the PUT today. live-ops reads and writes `volume` through
   `mixer.volumesOf` / `volumePatch` (one cast); fix the shared type and delete the helpers.
6. `Chip` has no `ESC`/`LOG` kinds; live-ops uses `nominal` / `active` as the mockup does.

## 4. Backend / contract observations

- `views[bank].hero`, `off_bank_label` and `selector_extra_label` only change with a snapshot (every 30 s keyframe), so
  the screen derives them from `active_transmissions` and `channels` (`hero.ts`). If the backend recomputes them per
  event the derivation can go away.
- `lofar_row` is not applied to `LiveState` by `reduce.ts`; live-ops keeps its own rows on top of the snapshot
  (`lofarModel.svelte.ts`). A reducer case would let every screen share it.
- `GET /feeds/{id}/waterfall` returns -127 rows for a feed without samples, so a faulted displayed feed has no backfill
  to freeze on. The mockup freezes the wall on the transmissions of the minute before the fault; the app shows the feed's
  floor (dimmed). A `?at=` (time) parameter would let the wall freeze at the last good sample.
- `snapshot.channels[].last_heard.end_t` and `active_transmissions[].t_offset_s` are used with the smooth clock to count
  ages and timers locally between ticks; both are present and correct.
- Spectrum frames: 1024 bins over the feed's own span (2.4 MHz at 160.89 MHz); the 1.35 MHz AAR band is cut out on the
  client. Fine for now; a band-limited frame would cut the bandwidth by 44 %.
- The wire has no `squelch_dbfs` (spec 13.4 gap 3); M17 is still floor + 8 dB (`SQUELCH_OVER_FLOOR_DB`).

## 5. Regenerating the CTC label-pass fixture

`ctc/fixtures/mockup-ctc.json` holds, per scenario and size, the text widths Chromium measured in
`design/mockups/live-ops.js` and the `html[data-ctc-audit]` it printed. Generate it by loading `live-ops.js` as a
library (`<html data-lo-module>`), calling `LiveOps.buildWorld`, `ctcHTML`, reading the `.lo-lab` text widths
(full and `data-short`) and running `ctcLabelPass`; dump with `chromium --headless=new --dump-dom`.

## 6. Deferred

- **Squelch-open / DETECT tile frame** (motion-keyup, first 100 ms before commit: solid squelch line, diagonal glyph,
  brighter brackets). Not built: the wire has no squelch-open event before `keyup` (spec 13.4 gap 3), so the tile
  cannot know a carrier is open without a commit. Needs a `squelch` message (channel id, open/closed); then it is a
  `data-detect` attribute next to `data-commit`.
- **Key-up timers and the header clock** share one clock: `simClock` is re-anchored on every `tick` and snapshot and
  extrapolates at `live.simSpeed`, the header reads the same `tick`. Checked on an unfrozen speed-1 backend: the header
  advanced 14:07:31 > 14:07:36 while the timers counted with it. Frozen (speed 0) both stand still.

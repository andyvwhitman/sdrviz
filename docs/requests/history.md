# History package requests

Written by the `history` package (screens/history). Shared-kit and backend gaps; the lead folds these in.

## Shared kit

1. **`LiveState.date`** (`$lib/types/live.ts`). The snapshot and `GET /live/state` carry `date` ("2026-11-10") but the
   type does not, so History reads it through a cast (`simDate()` in `screens/history/adapt.ts`). Add `date: string`.
2. **`DataBlockSvg` leader tone and anchor.** The kit draws the leader in `k-ink3` with a knockout plate; the History
   mockup uses `k-line` and no plate (a plate would cut the stringline). Also, line 1 of a left-pointing block is placed
   from an estimated text width (`tx_ - w1`); the mockup uses `text-anchor="end"`, which lands a few px different.
   Proposal: `leaderClass` prop (default `k-ink3`) and `text-anchor="end"` for left blocks.
3. **Audio ducking.** Playing a History clip should duck live audio by -18 dB while a key-up is on the air (spec 8.8;
   History shows `LIVE AUDIO DUCKED -18 dB`). `$lib/audio` has no engine yet, so the label shows but nothing is ducked.
   Needs `audio.duck(on: boolean)` once the Web Audio engine lands.
4. **`RegMark`, `HeroStrip`, `FilterChip`/menu.** History draws its own registration mark (a ring and crosshair, two
   paths in `prims.ts`), its own hero strip markup (`Hero.svelte`, the shared `.hero` classes) and a filter dropdown
   (`FilterChip.svelte`). If another screen needs the same, promote them.
5. **`--txrow-cols` and the 1440 table.** `TranscriptRow` is used as is. At 1440 the mockup hides the search box; History
   keeps it (narrowed by the chips), see the report.

## Backend

1. **No railroad filter.** The mockup has a RAILROAD filter chip; `GET /transmissions` filters by `frequency_id`,
   `aar`, `bank_id` but not by railroad. History shows BANK, CHANNEL, ROLE, FEED, STATE, DEFECT instead. Add
   `railroad=` (frequencies carry `railroad`) if the chip is wanted.
2. **Spectrogram data.** `GET /transmissions/{id}/waveform` returns peaks only. The clip player draws its spectrogram
   from the transcript's word onsets (as the mockup does), so it is illustrative. A `GET /transmissions/{id}/spectrogram`
   (bins x frames of dB, or a small PNG) would make it real.
3. **Whole-range reads.** The stringline needs every row in the range, the table pages through the same list. History
   walks the `cursor` in pages of 500 (at most four pages, 2000 rows). A 24 h range on the full day can exceed that;
   `GET /transmissions/summary` could return per-train tick positions so the stringline need not load the rows.
4. **`GET /trains` times.** Records are returned with their recorded-day times, not shifted into the window like
   transmissions are. History shifts them by whole days itself (`placeTrains`). Shifting server side would remove that.
5. **`GET /transmissions/{id}`** returns the raw `t_offset_s`, not one shifted into a window; History uses it only to
   find a linked row's hour (`?tx=`).

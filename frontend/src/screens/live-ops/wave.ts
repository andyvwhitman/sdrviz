/**
 * M15 waveform envelope for a keyed tile or inspector: 184 columns at 30 px/s, newest at the right.
 * The shape comes from the transmission itself: its word timings when the decoder has them, else the
 * 10 Hz level stream normalised to this transmission's own range. A column before the squelch crossing
 * is flat, and a column with no sample yet carries only the carrier hiss.
 */

import type { Word } from "$lib/types/live";
import { hash } from "./wall";

export const WAVE_WIDTH = 184;
export const WAVE_PX_PER_S = 30;
const LEVEL_HZ = 10;
const MIN_AMPLITUDE = 0.06;
/** the level range below which a transmission counts as steady (so small noise is not blown up) */
const MIN_RANGE_DB = 6;
/** dB above the floor that gives a burst its full height */
const FULL_SCALE_DB = 30;

/** 0 in a gap, 0.35..1 inside a word (the word starts at `t` and ends just before the next one). */
function speechAt(words: readonly Word[], ts: number, column: number): number {
  const index = words.findIndex((word, i) => {
    const start = word.t ?? 0;
    const end = i + 1 < words.length ? (words[i + 1].t ?? start) - 0.06 : start + 0.45;
    return ts >= start && ts <= end;
  });
  return index < 0 ? 0 : 0.35 + 0.65 * hash(column, index);
}

/**
 * @param levels dB samples at 10 Hz, oldest first, newest last (may include an earlier transmission)
 * @param floorDb feed noise floor
 * @param elapsedS seconds since the squelch crossing
 * @param words the transmission's word timings, when known
 * @returns `[min, max]` per column in -1..1
 */
export function waveEnvelope(levels: readonly number[], floorDb: number, elapsedS: number, words: readonly Word[] = [], width = WAVE_WIDTH): [number, number][] {
  const own = levels.slice(-Math.max(1, Math.ceil(elapsedS * LEVEL_HZ)));
  const low = Math.min(...own);
  const range = Math.max(MIN_RANGE_DB, Math.max(...own) - low);
  const mean = own.reduce((sum, db) => sum + db, 0) / own.length;
  const gain = Math.min(1, Math.max(0.45, (mean - floorDb) / FULL_SCALE_DB));
  const timed = words.some((word) => word.t != null);

  return Array.from({ length: width }, (_, x): [number, number] => {
    const ago = (width - 1 - x) / WAVE_PX_PER_S;
    const ts = elapsedS - ago;
    if (ts < 0) return [0, 0];
    const sample = own[own.length - 1 - Math.round(ago * LEVEL_HZ)];
    const hiss = MIN_AMPLITUDE + hash(x, 3) * 0.05;
    let speech = 0;
    if (timed) speech = speechAt(words, ts, Math.round(ts * WAVE_PX_PER_S)) * gain;
    else if (sample != null) speech = (0.15 + 0.85 * ((sample - low) / range)) * gain;
    const amplitude = Math.max(hiss, speech);
    return [-amplitude * (0.7 + 0.3 * hash(x, 5)), amplitude];
  });
}

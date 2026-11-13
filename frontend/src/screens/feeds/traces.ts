/** Spectrum trace and LOFAR strip arithmetic for the feed inspector, ported from design/mockups/feeds.js. */

import { BAND } from "$lib/hud/band";
import type { SpectrumFrame } from "$lib/ws/protocol";

export const DB_MIN = -80;
/** Idle ripple amplitude in dB before smoothing. */
const RIPPLE_DB = 3.2;

/** x pixel of channel `ch` across a band `width` px wide. */
export const channelX = (ch: number, width: number): number => Math.round(((ch - BAND.first) / (BAND.last - BAND.first)) * (width - 1));
/** Width of one channel slot in px. */
export const slotWidth = (width: number): number => width / (BAND.last - BAND.first + 1);

/** y of `db` in a plot `height` px tall (0 dBFS on top, -80 at the bottom). */
export const dbY = (db: number, height: number): number => Math.round((Math.min(0, Math.max(DB_MIN, db)) / DB_MIN) * height);

export interface Reception {
  /** AAR channel number of the key-up */
  channel: number;
  rssiDbfs: number;
}

/** A deterministic, smoothed idle ripple seeded by the feed id, so the floor reads calm, not boiling. */
export function idleRipple(seed: string, length: number): number[] {
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  const raw = Array.from({ length }, () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 4294967296 - 0.5) * RIPPLE_DB;
  });
  return raw.map((_, i) => (raw[Math.max(0, i - 1)] + raw[i] * 2 + raw[Math.min(length - 1, i + 1)]) / 4);
}

/** Trace dB values per pixel: the noise floor plus ripple, with a Gaussian bump at each live key-up. */
export function syntheticTrace(floorDbfs: number, ripple: number[], receptions: Reception[]): number[] {
  return ripple.map((r, x) => {
    const channel = BAND.first + (x / (ripple.length - 1)) * (BAND.last - BAND.first);
    let power = 10 ** ((floorDbfs + r) / 10);
    for (const rx of receptions) power += 10 ** (rx.rssiDbfs / 10) * Math.exp(-(((channel - rx.channel) / 0.2) ** 2));
    return 10 * Math.log10(power);
  });
}

/** Trace dB values per pixel from a live spectrum frame (int8 dBFS bins across `spanMhz`). */
export function frameTrace(frame: SpectrumFrame, width: number): number[] {
  const lo = frame.centerMhz - frame.spanMhz / 2;
  const mhzAt = (x: number): number => BAND.lo + (x / (width - 1)) * (BAND.hi - BAND.lo);
  const last = frame.bins.length - 1;
  return Array.from({ length: width }, (_, x) => {
    const bin = Math.round(((mhzAt(x) - lo) / frame.spanMhz) * last);
    return frame.bins[Math.min(last, Math.max(0, bin))];
  });
}

/** An SVG path through `values`, one point per pixel, snapped to the half pixel. */
export const tracePath = (values: number[], height: number): string => values.map((db, x) => `${x ? "L" : "M"}${x} ${dbY(db, height) + 0.5}`).join("");

export interface Run {
  from: number;
  to: number;
  sampled: boolean;
}

/** Contiguous rows of equal `sampled` as [from, to) runs. */
export function runsOf(sampled: boolean[]): Run[] {
  const runs: Run[] = [];
  sampled.forEach((value, row) => {
    const last = runs[runs.length - 1];
    if (last && last.sampled === value) last.to = row + 1;
    else runs.push({ from: row, to: row + 1, sampled: value });
  });
  return runs;
}

export interface SampledInput {
  rows: number;
  rowS: number;
  /** the feed delivers samples now */
  measured: boolean;
  lastSampleAgeS: number | null;
  /** rows that hold a measured cell: they have samples by definition */
  cellRows: Set<number>;
  /** per-minute feed state, oldest first, ending at the current minute (GET /feeds/{id}/health) */
  minuteStates?: string[];
  nowS: number;
}

/**
 * Which LOFAR rows have samples. "No samples" comes from the feed's last sample age and from the
 * per-minute health state, so a gap earlier in the hour is a gap too, never a zero.
 */
export function sampledRows({ rows, rowS, measured, lastSampleAgeS, cellRows, minuteStates, nowS }: SampledInput): boolean[] {
  const gapRows = measured ? 0 : Math.ceil((lastSampleAgeS ?? 0) / rowS);
  const nowMinute = Math.floor(nowS / 60);
  return Array.from({ length: rows }, (_, row) => {
    if (row < gapRows) return false;
    if (!minuteStates?.length || cellRows.has(row)) return true;
    const minute = Math.floor((nowS - (row + 0.5) * rowS) / 60);
    return minuteStates[minuteStates.length - 1 - (nowMinute - minute)] === "ok";
  });
}

/** Sparse LOFAR cells of one feed: channel number -> [row, dBFS][]. */
export type Cells = Record<string, [number, number][]>;

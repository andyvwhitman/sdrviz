/** The week grid's arithmetic: four fixed brightness steps for the airtime in an hour, and the week's totals. */

import type { ActivityBucket } from "$lib/types/recordings";

const MIN_S = 60;

/** Airtime in an hour -> the ramp step (2 to 5) of a cell; fixed thresholds, so two weeks compare honestly. */
export function rampStep(airtimeS: number): 2 | 3 | 4 | 5 {
  if (airtimeS >= 10 * MIN_S) return 5;
  if (airtimeS >= 3 * MIN_S) return 4;
  if (airtimeS >= MIN_S) return 3;
  return 2;
}

export type CellKind = "none" | "zero" | "data" | "current";

/**
 * What an hour cell is. Not recorded (before `recording_since`) and the future draw nothing; a recorded hour
 * with no airtime is an empty outline; the hour in progress is marked `current` (outlined over its fill).
 */
export function cellKind(hour: ActivityBucket, endMs: number, sinceMs: number | null, nowMs: number): CellKind {
  const start = Date.parse(hour.start);
  if (start > nowMs) return "none";
  if (sinceMs === null || endMs <= sinceMs) return "none";
  if (nowMs < endMs) return "current";
  return hour.count > 0 || hour.airtime_s > 0 ? "data" : "zero";
}

/** Where each hour of a day ends: the next hour's start, or the day's end (the next day's first start). */
export function hourEnds(hours: ActivityBucket[], nextDayStart: string | undefined): number[] {
  return hours.map((h, i) => (i + 1 < hours.length ? Date.parse(hours[i + 1].start) : nextDayStart ? Date.parse(nextDayStart) : Date.parse(h.start) + 3_600_000));
}

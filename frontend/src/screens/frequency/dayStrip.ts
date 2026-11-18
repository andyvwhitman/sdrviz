/**
 * The day strip's arithmetic: the full-scale ladder, pixel geometry, what each bucket is (data, zero, not recorded,
 * future, in progress), and the annotations (busiest bucket, long silences). Pure, so it is tested without a DOM.
 */

import type { ActivityBucket } from "$lib/types/recordings";
import { clockOf } from "./frequency";

const MIN_S = 60;
/** The airtime a full-height column stands for, per 15 minutes: an instrument range, never an auto axis. */
export const LADDER_MIN = [1, 2, 5, 10, 15] as const;
export const BUCKET_MS = 15 * 60_000;

/** The smallest step of the ladder that holds the busiest bucket, in minutes. */
export function fullScale(buckets: ActivityBucket[]): number {
  const busiest = Math.max(0, ...buckets.map((b) => b.airtime_s));
  return LADDER_MIN.find((step) => busiest <= step * MIN_S) ?? LADDER_MIN[LADDER_MIN.length - 1];
}

/** Whole pixels only: the pitch is floored and the unused remainder stays at the right. */
export function geometry(width: number, count: number): { pitch: number; bar: number } {
  const pitch = Math.max(1, Math.floor(width / Math.max(1, count)));
  return { pitch, bar: Math.max(1, pitch - Math.max(1, Math.round(pitch * 0.2))) };
}

/** A bucket with something in it is at least 1 px tall, however short the airtime: a kerchunk is a fact. */
export function barHeight(bucket: ActivityBucket, scaleMin: number, plotHeight: number): number {
  if (bucket.count <= 0 && bucket.airtime_s <= 0) return 0;
  return Math.min(plotHeight, Math.max(1, Math.round((bucket.airtime_s / (scaleMin * MIN_S)) * plotHeight)));
}

export type BucketKind = "data" | "zero" | "unrecorded" | "future" | "current";

/**
 * What one bucket is, as the strip draws it. `sinceMs` is when recording began (null: never), `nowMs` the real
 * time, `today` whether the strip shows today (only today has a future and a bucket in progress).
 */
export function kindOf(bucket: ActivityBucket, endMs: number, sinceMs: number | null, nowMs: number, today: boolean): BucketKind {
  const start = Date.parse(bucket.start);
  if (today && start > nowMs) return "future";
  if (sinceMs === null || endMs <= sinceMs) return "unrecorded";
  if (today && start <= nowMs && nowMs < endMs) return "current";
  return bucket.count > 0 ? "data" : "zero";
}

/** Where each bucket ends: the next one's start, or a quarter hour after the last. */
export const endsOf = (buckets: ActivityBucket[]): number[] =>
  buckets.map((b, i) => (i + 1 < buckets.length ? Date.parse(buckets[i + 1].start) : Date.parse(b.start) + BUCKET_MS));

export interface Totals {
  count: number;
  airtimeS: number;
}
export const totalsOf = (buckets: ActivityBucket[]): Totals => ({
  count: buckets.reduce((sum, b) => sum + b.count, 0),
  airtimeS: buckets.reduce((sum, b) => sum + b.airtime_s, 0),
});

/** The index of the bucket with the most airtime, or -1 when nothing was heard. */
export function busiest(buckets: ActivityBucket[]): number {
  let best = -1;
  buckets.forEach((b, i) => {
    if (b.airtime_s > 0 && (best < 0 || b.airtime_s > buckets[best].airtime_s)) best = i;
  });
  return best;
}

export interface Run {
  from: number;
  /** exclusive */
  to: number;
}

/** Runs of `zero` buckets at least `minBuckets` long (four of them is an hour), longest first, at most `limit`. */
export function silences(kinds: BucketKind[], minBuckets: number, limit: number): Run[] {
  const runs: Run[] = [];
  let from = -1;
  kinds.forEach((kind, i) => {
    if (kind === "zero" && from < 0) from = i;
    if (kind !== "zero" && from >= 0) (runs.push({ from, to: i }), (from = -1));
  });
  if (from >= 0) runs.push({ from, to: kinds.length });
  return runs
    .filter((run) => run.to - run.from >= minBuckets)
    .sort((a, b) => b.to - b.from - (a.to - a.from))
    .slice(0, limit)
    .sort((a, b) => a.from - b.from);
}

/** The run of `unrecorded` buckets that opens the day (recording began part way through), or null. */
export function unrecordedLead(kinds: BucketKind[]): Run | null {
  const to = kinds.findIndex((kind) => kind !== "unrecorded");
  return to > 0 ? { from: 0, to } : null;
}

/** "07:15–07:30" for a bucket. */
export const spanLabel = (bucket: ActivityBucket, endMs: number, tz: string): string =>
  `${clockOf(bucket.start, tz).slice(0, 5)}–${clockOf(endMs, tz).slice(0, 5)}`;

/** Local time of the hour starts for the ruler: the bucket indexes that begin on the hour, with their hour number. */
export function hourMarks(buckets: ActivityBucket[], tz: string): { index: number; hour: number }[] {
  const marks: { index: number; hour: number }[] = [];
  buckets.forEach((b, i) => {
    const [hour, minute] = clockOf(b.start, tz).split(":").map(Number);
    if (minute === 0) marks.push({ index: i, hour });
  });
  return marks;
}

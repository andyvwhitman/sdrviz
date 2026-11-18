/**
 * Pure helpers for the SPOT timeline: the span of time the page loads, the window the user has scrolled to, the
 * scale of the tape, and which train tags fit. Times are seconds or minutes from now; no DOM, no stores.
 */

import { hhmm } from "../map/lib/transitView";
import type { Row } from "./spot";

/** The page loads this much history and future once, so scrolling the timeline never waits on the network. */
export const RANGE_BACK_MIN = 60;
export const RANGE_AHEAD_MIN = 360;
/** At "now" the table also keeps trains that passed this recently. */
export const LIVE_BACK_MIN = 10;

/** The window lengths the user can pick, in minutes. */
export const HORIZONS = [30, 60, 120] as const;

export const horizonText = (minutes: number): string => (minutes >= 60 ? `${minutes / 60} H` : `${minutes} MIN`);

/** The window the table shows: from the scrolled-to moment for `horizonMin`, in seconds from now. */
export interface Window {
  fromS: number;
  toS: number;
  /** scrolled to now: the countdowns and the just-passed rows apply */
  live: boolean;
}

export function windowOf(offsetMin: number, horizonMin: number): Window {
  const live = offsetMin === 0;
  return {
    fromS: (live ? -LIVE_BACK_MIN : offsetMin) * 60,
    toS: (offsetMin + horizonMin) * 60,
    live,
  };
}

/** A row the window shows. A schedule-only train just overdue stays while live: it cannot be said to have passed. */
export function inWindow(row: Pick<Row, "remainingS" | "group">, window: Window): boolean {
  if (window.live && row.group === "overdue") return true;
  return row.remainingS >= window.fromS && row.remainingS <= window.toS;
}

/** Keep an offset inside the loaded range, whole minutes. */
export function clampOffset(minutes: number, horizonMin: number): number {
  return Math.round(Math.min(RANGE_AHEAD_MIN - horizonMin, Math.max(-RANGE_BACK_MIN, minutes)));
}

/** Pixels per minute: the window takes this share of the strip, so every window length reads at the same width. */
export const WINDOW_SHARE = 0.72;
export const pxPerMinute = (width: number, horizonMin: number): number => (width * WINDOW_SHARE) / horizonMin;

/** Tick spacing for a scale: small ticks, and clock labels far enough apart to read. */
export function tickSteps(perMin: number): { minor: number; label: number } {
  if (perMin >= 6) return { minor: 5, label: 15 };
  if (perMin >= 2.5) return { minor: 5, label: 30 };
  return { minor: 15, label: 60 };
}

/** "21:30" for a moment `minutes` from `nowMs`, in the railroad's local time. */
export const clockAt = (nowMs: number, minutes: number): string => hhmm(new Date(nowMs + minutes * 60_000).toISOString());

/**
 * Which tags fit along one lane, soonest first: a tag is drawn when it starts at least `gap` pixels after the last
 * drawn one. Returns the indices of the positions given (which must be sorted).
 */
export function fittingTags(xs: readonly number[], gap: number): number[] {
  const shown: number[] = [];
  let last = -Infinity;
  xs.forEach((x, i) => {
    if (x - last >= gap) {
      shown.push(i);
      last = x;
    }
  });
  return shown;
}

/**
 * Pure helpers for the SPOT page: what a train's ETA is made of (basis), how it reads, how rows sort and group,
 * which side of the ladder a train approaches from, and how a typed position is parsed. No DOM, no stores.
 */

import type { ApproachingTrain } from "$lib/types/transit";
import { cleanName } from "$lib/displayName";
import { trainTag } from "../map/lib/transitView";

/** How we know a train is coming (page direction 4.2): drawn four ways, never by hue. */
export type Basis = "tracked" | "stale" | "predicted" | "scheduled";

export const BASIS_WORD: Record<Basis, string> = {
  tracked: "TRACKED",
  stale: "STALE",
  predicted: "PREDICTED",
  scheduled: "SCHEDULED",
};

/** Seconds past due after which a schedule-only train with no realtime is dropped. */
export const OVERDUE_LIMIT_S = 600;
/** A train this close (seconds) reads DUE. */
export const DUE_S = 30;
/** The ladder shows this many minutes each side of the spot. */
export const LADDER_MIN = 30;
/** Opposite-direction trains this close in time (seconds) are a meet. */
export const MEET_WINDOW_S = 120;

const BASIS: Record<ApproachingTrain["basis"], Basis> = { live: "tracked", stale: "stale", estimated: "predicted", schedule: "scheduled" };

export const basisOf = (train: Pick<ApproachingTrain, "basis">): Basis => BASIS[train.basis];

/** A station this close (metres) with a stop there means the train stops at the spot. */
export const STOP_RADIUS_M = 500;

export const stopsHere = (train: Pick<ApproachingTrain, "station">): boolean =>
  !!train.station && train.station.stops && train.station.distance_m <= STOP_RADIUS_M;

/** What the train does at the spot's station: STOPS, PASSES, or DEPARTS / TERMINATES for a trip that starts or ends there. */
export function stopWord(train: Pick<ApproachingTrain, "station">): string {
  const role = train.station?.role;
  if (stopsHere(train) && role === "origin") return "DEPARTS";
  if (stopsHere(train) && role === "terminus") return "TERMINATES";
  return stopsHere(train) ? "STOPS" : "PASSES";
}

const CARDINALS: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

/** The way the train travels at the spot, in degrees: the bearing, else the compass point, else north. */
export const bearingOf = ({ direction }: Pick<ApproachingTrain, "direction">): number =>
  direction.bearing ?? CARDINALS[direction.cardinal ?? ""] ?? 0;

/** "NB", else "SW": how a direction reads in a row. */
export const directionText = ({ direction }: Pick<ApproachingTrain, "direction">): string => direction.label ?? direction.cardinal ?? "";

/** Which way a train sits on the ladder: trains coming from the west (moving east) arrive from the left. */
export type Side = "left" | "right";

export function sideOf(bearing: number): Side {
  const rad = (bearing * Math.PI) / 180;
  const east = Math.sin(rad);
  // a line that runs north-south: trains moving north come from the south, which takes the left
  return Math.abs(east) > 0.1 ? (east > 0 ? "left" : "right") : Math.cos(rad) > 0 ? "left" : "right";
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (bearing: number): string => COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];

/** "FROM SW": the side a train comes from, named by the compass point behind it. */
export const fromLabel = (bearing: number): string => `FROM ${compass(bearing + 180)}`;

export type Group = "passed" | "coming" | "overdue";

/** A train as the page shows it at one moment. */
export interface Row {
  train: ApproachingTrain;
  tag: string;
  basis: Basis;
  /** seconds until it reaches the spot, negative once it has */
  remainingS: number;
  group: Group;
  /** a train that runs through without stopping, or one we are not tracking: the time is approximate */
  passes: boolean;
  approx: boolean;
  side: Side;
}

/** Make a row from a train and the seconds since the response was made. */
export function rowOf(train: ApproachingTrain, elapsedS: number): Row {
  const basis = basisOf(train);
  const remainingS = (train.eta_in_s ?? 0) - elapsedS;
  const passes = !stopsHere(train);
  let group: Group = remainingS < 0 ? "passed" : "coming";
  // a timetable-only train that should have come by: it cannot be said to have passed
  if (basis === "scheduled" && remainingS < 0 && remainingS > -OVERDUE_LIMIT_S) group = "overdue";
  return {
    train,
    tag: trainTag(train),
    basis,
    remainingS,
    group,
    passes,
    approx: basis !== "tracked" || passes,
    side: sideOf(bearingOf(train)),
  };
}

export interface Rows {
  /** reached the spot in the back window, oldest first so the latest sits against the NOW divider */
  passed: Row[];
  /** due and upcoming, soonest first; overdue schedule-only trains park at the front */
  coming: Row[];
}

/** Sort and group trains for the table. Trains with no ETA, and schedule-only trains long overdue, are dropped. */
export function sortRows(trains: readonly ApproachingTrain[], elapsedS: number): Rows {
  const rows = trains.filter((t) => t.eta_in_s !== null).map((t) => rowOf(t, elapsedS));
  const passed = rows.filter((r) => r.group === "passed" && !(r.basis === "scheduled" && r.remainingS <= -OVERDUE_LIMIT_S));
  const coming = rows.filter((r) => r.group !== "passed");
  passed.sort((a, b) => a.remainingS - b.remainingS);
  coming.sort((a, b) => a.remainingS - b.remainingS);
  return { passed, coming };
}

const minutes = (seconds: number): number => Math.max(1, Math.round(Math.abs(seconds) / 60));

function hoursMinutes(min: number): string {
  return min < 120 ? `${min} MIN` : `${Math.floor(min / 60)} H ${String(min % 60).padStart(2, "0")}`;
}

/** The ETA of a coming row: `4 MIN`, `~7 MIN`, `DUE`, `~1 H 20`; overdue schedule-only trains read `DUE`. */
export function etaText(row: Pick<Row, "remainingS" | "approx" | "group">): string {
  if (row.group === "overdue") return "DUE";
  if (row.remainingS < DUE_S) return "DUE";
  return `${row.approx ? "~" : ""}${hoursMinutes(minutes(row.remainingS))}`;
}

/** The ETA cell of a just-passed row: `PASSED 3M`, or `PASSED ~3M` when the time was never measured. */
export function passedText(row: Pick<Row, "remainingS" | "approx">): string {
  return `PASSED ${row.approx ? "~" : ""}${Math.max(1, Math.round(-row.remainingS / 60))}M`;
}

/** One cell for any row. */
export const rowEta = (row: Row): string => (row.group === "passed" ? passedText(row) : etaText(row));

/** "POS 18S" / "POS 3M": the age of the position a tracked ETA rests on. */
export function positionAge(ageS: number | null | undefined): string {
  if (ageS == null) return "";
  return ageS < 90 ? `POS ${Math.round(ageS)}S` : `POS ${Math.round(ageS / 60)}M`;
}

/** A position older than this (seconds) is worth saying so on the row itself. */
export const OLD_FIX_S = 90;

/**
 * The basis line: `TRACKED · POS 18S`, `SCHEDULED`. Rows give the position age only when the fix is old
 * (`alwaysAge` false); the hero always gives it.
 */
export function basisLine(row: Pick<Row, "basis" | "train" | "group">, alwaysAge = true): string {
  if (row.group === "overdue") return "DUE \u00b7 NO REALTIME";
  const ageS = row.train.vehicle?.age_s;
  const showAge = (row.basis === "tracked" || row.basis === "stale") && (alwaysAge || (ageS ?? 0) > OLD_FIX_S);
  return [BASIS_WORD[row.basis], showAge ? positionAge(ageS) : ""].filter(Boolean).join(" \u00b7 ");
}

/** Two opposite-direction trains due at the spot within two minutes of each other. */
export interface Meet {
  left: Row;
  right: Row;
}

export function meets(coming: readonly Row[]): Meet[] {
  const live = coming.filter((r) => r.group === "coming");
  const found: Meet[] = [];
  for (const left of live.filter((r) => r.side === "left")) {
    for (const right of live.filter((r) => r.side === "right")) {
      // two trains that both call at the spot's station are not a meet a spotter can use
      if (!left.passes && !right.passes) continue;
      if (Math.abs(left.remainingS - right.remainingS) <= MEET_WINDOW_S) found.push({ left, right });
    }
  }
  return found.sort((a, b) => Math.max(a.left.remainingS, a.right.remainingS) - Math.max(b.left.remainingS, b.right.remainingS));
}

/** One arm of the ladder: the terminal trains come from (or compass point), and the timetable tag (`NB`). */
export interface Arm {
  name: string;
  tag: string;
  /** the name is a compass point, not a place */
  compass: boolean;
}

/** The most common value, ties broken alphabetically so the label never flickers between polls. */
function commonest(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const best = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? best[0] : null;
}

/**
 * Name both arms of the ladder from where trains come from. Trains on the right are heading toward the left end, so
 * the left arm is named by the most common destination of right-side trains, and the reverse. A side with no trains
 * falls back to the compass point behind the track direction.
 */
export function armNames(rows: readonly Row[], bearing: number | null): { left: Arm; right: Arm } {
  const arm = (side: Side): Arm => {
    const here = rows.filter((r) => r.side === side);
    const opposite = rows.filter((r) => r.side !== side);
    const name = commonest(opposite.flatMap((r) => (r.train.direction.toward ? [cleanName(r.train.direction.toward).toUpperCase()] : [])));
    const tag = commonest(here.flatMap((r) => (r.train.direction.label ? [r.train.direction.label] : []))) ?? "";
    if (name) return { name, tag, compass: false };
    const b = bearing === null ? null : sideOf(bearing) === side ? bearing : bearing + 180;
    return { name: b === null ? "" : compass(b + 180), tag, compass: true };
  };
  return { left: arm("left"), right: arm("right") };
}

/** Position of a row on the ladder axis, 0 (far left) to 1 (far right), or null beyond the scale. */
export function ladderFraction(row: Pick<Row, "remainingS" | "side">): number | null {
  const min = Math.max(0, row.remainingS) / 60;
  if (min > LADDER_MIN) return null;
  const offset = (min / LADDER_MIN) * 0.5;
  return row.side === "left" ? 0.5 - offset : 0.5 + offset;
}

// ---- position input

export interface LatLon {
  lat: number;
  lon: number;
}

export const validLatLon = ({ lat, lon }: LatLon): boolean =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** "39.0869, -76.7065" or "39.0869 -76.7065" to a position; null for anything else. */
export function parseLatLon(text: string): LatLon | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!match) return null;
  const point = { lat: Number(match[1]), lon: Number(match[2]) };
  return validLatLon(point) ? point : null;
}

/** Stations whose name contains every word typed ("odent" finds Odenton), best (shortest) names first. */
export function searchStops<T extends { name: string }>(stops: readonly T[], query: string, limit = 8): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return stops
    .filter((s) => words.every((w) => s.name.toLowerCase().includes(w)))
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, limit);
}

/** Metres as the spot bar says them: `40 M`, `3.4 KM`. */
export const distanceText = (metres: number): string => (metres < 1000 ? `${Math.round(metres)} M` : `${(metres / 1000).toFixed(1)} KM`);

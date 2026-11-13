/** Pure helpers for the transit layers and windows: delays, freshness, times, and the boxes the map asks the API for. */

import { BLANK } from "$lib/hud/fmt";
import type { Vehicle } from "$lib/types/transit";
import type { Pt } from "./geom";
import type { LonLat } from "./project";

/** Within this many seconds of the schedule a train is on time (the API's own threshold). */
export const ON_TIME_S = 120;
export type DelayTone = "ok" | "late" | "early" | "unknown";

export function delayTone(delayS: number | null): DelayTone {
  if (delayS == null) return "unknown";
  if (Math.abs(delayS) < ON_TIME_S) return "ok";
  return delayS > 0 ? "late" : "early";
}

/** "ON TIME" within two minutes, else "+12 MIN LATE" or "5 MIN EARLY". */
export function delayLabel(delayS: number | null): string {
  const tone = delayTone(delayS);
  if (tone === "unknown") return BLANK;
  if (tone === "ok") return "ON TIME";
  const min = Math.round(Math.abs(delayS!) / 60);
  return tone === "late" ? `+${min} MIN LATE` : `${min} MIN EARLY`;
}

/** Short form for the list: "ON TIME", "+12 MIN", "-5 MIN". */
export function delayShort(delayS: number | null): string {
  const tone = delayTone(delayS);
  if (tone === "unknown") return BLANK;
  if (tone === "ok") return "ON TIME";
  const min = Math.round(Math.abs(delayS!) / 60);
  return tone === "late" ? `+${min} MIN` : `-${min} MIN`;
}

/**
 * The one status word beside a single time: "ON TIME", "+7 MIN", "-3 MIN", or "SCHED" when there is no realtime
 * (the time shown is then the timetable's).
 */
export function timeTag(delayS: number | null, estimated: string | null): { text: string; tone: DelayTone } {
  if (!estimated && delayS == null) return { text: "SCHED", tone: "unknown" };
  return { text: delayShort(delayS), tone: delayTone(delayS) };
}

/** Age of a position now: the age the response reported plus the time since it arrived. */
export function ageNow(ageS: number | null, fetchedAt: number, now: number): number | null {
  return ageS == null ? null : Math.max(0, ageS + (now - fetchedAt) / 1000);
}

/** A position is stale once it is older than its source's threshold (`Vehicle.stale_after_s`). */
export const isStale = (ageS: number | null, staleAfterS: number): boolean => ageS != null && ageS > staleAfterS;

/** "42 s" under a minute, else whole minutes "3 min"; for the freshness dot's tooltip. */
export function sinceText(ageS: number | null): string {
  if (ageS == null) return "unknown";
  return ageS < 60 ? `${Math.floor(ageS)} s` : `${Math.floor(ageS / 60)} min`;
}

/** Past this a train's data is old whatever its source (ten minutes). */
export const OLD_S = 600;

export type Freshness = "fresh" | "stale" | "old" | "unknown";

/** fresh up to the source's own limit, stale beyond it, old after ten minutes */
export function freshness(ageS: number | null, staleAfterS: number): Freshness {
  if (ageS == null) return "unknown";
  if (ageS > OLD_S) return "old";
  return ageS > staleAfterS ? "stale" : "fresh";
}

export function ageText(ageS: number | null): string {
  if (ageS == null) return BLANK;
  if (ageS < 90) return `${Math.round(ageS)} S`;
  if (ageS < 5400) return `${Math.round(ageS / 60)} MIN`;
  return `${(ageS / 3600).toFixed(1)} H`;
}

const eastern = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
const easternSeconds = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/New_York" });

/**
 * HH:MM of an ISO time. An offset other than UTC means the feed wrote the agency's own wall clock, which is
 * kept as it is; UTC times are shown in Eastern time, the map's home.
 */
export function hhmm(iso: string | null | undefined): string {
  if (!iso) return BLANK;
  const local = /T(\d{2}):(\d{2})[^+-]*([+-]\d{2}:?\d{2})$/.exec(iso);
  if (local && !/^[+-]00:?00$/.test(local[3])) return `${local[1]}:${local[2]}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? BLANK : eastern.format(date);
}

/** HH:MM:SS of an ISO time, by the same rule as hhmm; for "data as of". */
export function hhmmss(iso: string | null | undefined): string {
  if (!iso) return BLANK;
  const local = /T(\d{2}:\d{2}:\d{2})[^+-]*([+-]\d{2}:?\d{2})$/.exec(iso);
  if (local && !/^[+-]00:?00$/.test(local[2])) return local[1];
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? BLANK : easternSeconds.format(date);
}

/** A ms timestamp (the last poll) as HH:MM:SS in Eastern time. */
export const clockOf = (ms: number): string => (ms ? easternSeconds.format(new Date(ms)) : BLANK);

export const trainTitle = (v: Pick<Vehicle, "agency" | "train">): string => `${v.agency} ${v.train ?? ""}`.trim();

// ---- what to ask the API for

/** [west, south, east, north] */
export type Bbox = [number, number, number, number];

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The lon/lat box around the canvas (walking its edge, as the conic bends it), with `margin` of each side on top. */
export function viewBbox(invert: (p: Pt) => LonLat, width: number, height: number, margin = 0.25): Bbox {
  const pts: LonLat[] = [];
  for (let i = 0; i <= 8; i++) {
    const [x, y] = [(width * i) / 8, (height * i) / 8];
    pts.push(invert([x, 0]), invert([x, height]), invert([0, y]), invert([width, y]));
  }
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const [w, e, s, n] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const [dx, dy] = [(e - w) * margin, (n - s) * margin];
  return [clamp(w - dx, -180, 180), clamp(s - dy, -85, 85), clamp(e + dx, -180, 180), clamp(n + dy, -85, 85)];
}

/** A step of 1, 2 or 5 times a power of ten that is no bigger than `v`. */
export function niceStep(v: number): number {
  const pow = 10 ** Math.floor(Math.log10(v));
  const f = v / pow;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * pow;
}

/** Round a box outwards to a grid a quarter of its size, so small pans ask for (and cache) the same box. */
export function snapBbox([w, s, e, n]: Bbox): Bbox {
  const step = niceStep(Math.max(e - w, n - s) / 4);
  const snap = (v: number, fn: (x: number) => number): number => Math.round(fn(v / step) * step * 1e6) / 1e6;
  return [snap(w, Math.floor), snap(s, Math.floor), snap(e, Math.ceil), snap(n, Math.ceil)];
}

/** Half-octave steps of the map zoom: the detail the server returns changes about this often. */
export function zoomBucket(k: number): number {
  return Math.round(Math.log2(Math.max(k, 1e-6)) * 2);
}

export const bucketZoom = (bucket: number): number => Math.round(2 ** (bucket / 2) * 1000) / 1000;

export const bboxParam = (b: Bbox): string => b.join(",");

export const inBbox = (lon: number, lat: number, [w, s, e, n]: Bbox): boolean => lon >= w && lon <= e && lat >= s && lat <= n;

/** Keep one item per `cell` px square (the first of each), for labels and markers that would pile up. */
export function thinByGrid<T>(items: T[], at: (t: T) => Pt, cell: number): T[] {
  const taken = new Set<string>();
  return items.filter((item) => {
    const [x, y] = at(item);
    const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    if (taken.has(key)) return false;
    taken.add(key);
    return true;
  });
}

/** The stop nearest (lon, lat) within `maxKm`, for turning a regional station into its GTFS stop. */
export function nearestStop<T extends { lon: number; lat: number }>(stops: T[], lon: number, lat: number, maxKm = 0.6): T | null {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  let best: T | null = null;
  let bestKm = maxKm;
  for (const s of stops) {
    const km = Math.hypot((s.lon - lon) * kx, (s.lat - lat) * 111.32);
    if (km <= bestKm) [best, bestKm] = [s, km];
  }
  return best;
}

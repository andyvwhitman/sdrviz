/** The pointer readout (M11): lat/long, plus the nearest route milepost within 250 m. */

import * as fmt from "$lib/hud/fmt";
import { distanceKm, type LonLat } from "./project";
import { parseMp, type Milepost } from "./rail";
import type { Route } from "./types";

export interface MilepostSegment {
  a: LonLat;
  b: LonLat;
  pa: Milepost;
  pb: Milepost;
}

export function milepostSegments(routes: Route[]): MilepostSegment[] {
  const out: MilepostSegment[] = [];
  for (const r of routes) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const [a, b] = [r.points[i], r.points[i + 1]];
      const [pa, pb] = [parseMp(a.mp_label), parseMp(b.mp_label)];
      if (pa && pb && pa.prefix === pb.prefix) out.push({ a: [a.lon, a.lat], b: [b.lon, b.lat], pa, pb });
    }
  }
  return out;
}

/** "39.0 N · 76.9 W" plus " · NEC 113.6" when a route milepost is within 250 m. */
export function describePointer(at: LonLat | null, segments: MilepostSegment[]): string {
  if (!at) return fmt.BLANK;
  let best: { d: number; v: number; prefix: string; derived: boolean } | null = null;
  for (const s of segments) {
    for (let k = 0; k <= 20; k++) {
      const t = k / 20;
      const d = distanceKm(at, [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t]);
      if (d <= 0.25 && (!best || d < best.d)) {
        best = { d, v: s.pa.v + (s.pb.v - s.pa.v) * t, prefix: s.pa.prefix, derived: s.pa.derived || s.pb.derived };
      }
    }
  }
  const position = `${at[1].toFixed(4)} N · ${Math.abs(at[0]).toFixed(4)} W`;
  return best ? `${position} · ${best.derived ? "≈" : ""}${best.prefix} ${best.v.toFixed(1)}` : position;
}

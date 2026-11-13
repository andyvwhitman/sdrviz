/** Rail lines in canvas pixels: snapping stations to the drawn track, slicing train tails, milepost parsing. */

import { dist, lerp, type Pt, type Rect, segRect } from "./geom";
import type { LonLat } from "./project";
import type { GeoFeatureCollection, RailClass, Route } from "./types";

export interface RailLine {
  cls: RailClass;
  name: string;
  pts: Pt[];
}

export interface Snap {
  line: RailLine;
  /** segment index and fraction along it */
  i: number;
  t: number;
  pt: Pt;
  d: number;
  /** unit direction of the segment */
  dir: Pt;
}

export function railLines(rail: GeoFeatureCollection, project: (p: LonLat) => Pt): RailLine[] {
  return rail.features.map((f) => ({
    cls: (f.properties.class ?? "passenger") as RailClass,
    name: f.properties.name ?? "",
    pts: f.geometry.coordinates.map(project),
  }));
}

/** The point on the drawn rail nearest `p`, within `maxPx`. */
export function nearestOn(lines: RailLine[], p: Pt, filter?: (l: RailLine) => boolean, maxPx = 40): Snap | null {
  let best: Snap | null = null;
  for (const line of lines) {
    if (filter && !filter(line)) continue;
    const pts = line.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const len2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
      const q: Pt = [a[0] + dx * t, a[1] + dy * t];
      const d = dist(p, q);
      if (d <= maxPx && (!best || d < best.d)) {
        const len = Math.sqrt(len2);
        best = { line, i, t, pt: q, d, dir: [dx / len, dy / len] };
      }
    }
  }
  return best;
}

const before = (a: Snap, b: Snap): boolean => a.i < b.i || (a.i === b.i && a.t <= b.t);

/** The sub-polyline of `line` from snap `a` to snap `b`, starting at `a`. */
export function slice(line: RailLine, a: Snap, b: Snap): Pt[] {
  const at = (q: Snap): Pt => lerp(line.pts[q.i], line.pts[q.i + 1], q.t);
  const forward = before(a, b);
  const [s, e] = forward ? [a, b] : [b, a];
  const out: Pt[] = [at(s)];
  for (let i = s.i + 1; i <= e.i; i++) out.push(line.pts[i]);
  out.push(at(e));
  return forward ? out : out.reverse();
}

/** lon/lat at a route mile (linear between route points). */
export function routeLonLat(route: Route, mi: number): LonLat {
  const pts = route.points;
  if (mi <= pts[0].route_mi) return [pts[0].lon, pts[0].lat];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if (mi >= a.route_mi && mi <= b.route_mi) {
      const t = b.route_mi > a.route_mi ? (mi - a.route_mi) / (b.route_mi - a.route_mi) : 0;
      return [a.lon + (b.lon - a.lon) * t, a.lat + (b.lat - a.lat) * t];
    }
  }
  const last = pts[pts.length - 1];
  return [last.lon, last.lat];
}

export interface Milepost {
  derived: boolean;
  prefix: string;
  v: number;
}

/** Parse "NEC 113.6" or "≈CFP 85.6". */
export function parseMp(label: string | null | undefined): Milepost | null {
  const m = String(label ?? "").match(/^(≈)?\s*([A-Z]+)\s*(\d+(?:\.\d+)?)/);
  return m ? { derived: !!m[1], prefix: m[2], v: Number(m[3]) } : null;
}

/** Rail segments that touch the canvas, for the placers' rail tests. */
export function segmentsInView(lines: RailLine[], view: Rect): { line: RailLine; segs: [Pt, Pt][] }[] {
  return lines
    .map((line) => ({
      line,
      segs: line.pts
        .slice(1)
        .map((b, i): [Pt, Pt] => [line.pts[i], b])
        .filter(([a, b]) => segRect(a, b, view)),
    }))
    .filter((l) => l.segs.length);
}

/** Plane geometry for the label placers: segments, polygons and rectangles in canvas pixels. */

export type Pt = [number, number];

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const round1 = (v: number): number => Math.round(v * 10) / 10;

export const padRect = (b: Rect, p: number): Rect => ({ x0: b.x0 - p, y0: b.y0 - p, x1: b.x1 + p, y1: b.y1 + p });
export const overlap = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
export const rectPoly = (b: Rect): Pt[] => [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];

const cross = (o: Pt, a: Pt, b: Pt): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Proper intersection of segments ab and cd (touching does not count). */
export function segCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function inPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const polyEdges = (poly: Pt[]): [Pt, Pt][] => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);

export const segPoly = (a: Pt, b: Pt, poly: Pt[]): boolean =>
  inPoly(a, poly) || inPoly(b, poly) || polyEdges(poly).some(([c, d]) => segCross(a, b, c, d));

export const polyPoly = (p: Pt[], q: Pt[]): boolean =>
  inPoly(p[0], q) || inPoly(q[0], p) || polyEdges(p).some(([a, b]) => polyEdges(q).some(([c, d]) => segCross(a, b, c, d)));

/** Does the segment touch the rectangle? */
export function segRect(a: Pt, b: Pt, r: Rect): boolean {
  if (Math.max(a[0], b[0]) < r.x0 || Math.min(a[0], b[0]) > r.x1 || Math.max(a[1], b[1]) < r.y0 || Math.min(a[1], b[1]) > r.y1) {
    return false;
  }
  return segPoly(a, b, rectPoly(r));
}

export function segDistance(p: Pt, a: Pt, c: Pt): number {
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const len2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
}

export type Anchor = "start" | "middle" | "end";

/** A rotated text run (origin at the baseline start; cap height 9 above, 3 below), `pad` px clear of the ink. */
export function textPoly(ox: number, oy: number, angle: number, w: number, anchor: Anchor = "start", pad = 2): Pt[] {
  const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
  const [vx, vy] = [-uy, ux];
  const s0 = anchor === "end" ? -w : anchor === "middle" ? -w / 2 : 0;
  const s1 = s0 + w;
  const at = (s: number, t: number): Pt => [ox + ux * s + vx * t, oy + uy * s + vy * t];
  return [at(s0 - pad, -10 - pad), at(s1 + pad, -10 - pad), at(s1 + pad, 4 + pad), at(s0 - pad, 4 + pad)];
}

/** The ink box of an 11 px uppercase run, 1 px clear: for name-to-name tests. */
export function tightPoly(ox: number, oy: number, angle: number, w: number, anchor: Anchor = "start"): Pt[] {
  const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
  const [vx, vy] = [-uy, ux];
  const s0 = anchor === "end" ? -w : anchor === "middle" ? -w / 2 : 0;
  const s1 = s0 + w;
  const at = (s: number, t: number): Pt => [ox + ux * s + vx * t, oy + uy * s + vy * t];
  return [at(s0 - 1, -9), at(s1 + 1, -9), at(s1 + 1, 2), at(s0 - 1, 2)];
}

/** The glyph box of a centred, rotated name (caps from -4 to +4 about c), plus pad. */
export function namePoly(c: Pt, angle: number, w: number, pad: number): Pt[] {
  const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
  const [vx, vy] = [-uy, ux];
  const at = (s: number, t: number): Pt => [c[0] + ux * s + vx * t, c[1] + uy * s + vy * t];
  return [at(-w / 2 - pad, -4 - pad), at(w / 2 + pad, -4 - pad), at(w / 2 + pad, 4 + pad), at(-w / 2 - pad, 4 + pad)];
}

export function bboxOf(poly: Pt[]): Rect {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** A set of axis-aligned boxes already claimed on the canvas. */
export class Boxes {
  readonly list: Rect[] = [];

  constructor(
    private readonly w: number,
    private readonly h: number,
  ) {}

  add(b: Rect, pad = 0): void {
    this.list.push(padRect(b, pad));
  }

  /** How many claimed boxes `b` overlaps; Infinity if it leaves the canvas (less `margin`). */
  hits(b: Rect, margin = 4): number {
    if (b.x0 < margin || b.y0 < margin || b.x1 > this.w - margin || b.y1 > this.h - margin) return Infinity;
    return this.list.reduce((n, o) => n + (overlap(b, o) ? 1 : 0), 0);
  }
}

/** A rotated label as a strip of small squares along its baseline: close to its true footprint. */
export function labelStrip(c: Pt, angle: number, w: number, h: number): Rect[] {
  const n = Math.max(1, Math.ceil(w / h));
  const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n - 0.5;
    const [x, y] = [c[0] + ux * t * w, c[1] + uy * t * w];
    return { x0: x - h / 2, y0: y - h / 2, x1: x + h / 2, y1: y + h / 2 };
  });
}

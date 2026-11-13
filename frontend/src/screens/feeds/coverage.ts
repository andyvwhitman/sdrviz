/**
 * Coverage thumbnail geometry (spec 4.5, 11.14): the map turned like the Map screen (Washington Union
 * left, Baltimore Penn right), the feed at the centre, rings every 5 km, and a label placer that
 * keeps text clear of the ring edge, routes and other labels. Ported from design/mockups/feeds.js.
 */

import type { GeoRoute } from "./types";

export const THUMB_W = 273;
export const THUMB_H = 92;

interface Site {
  short: string;
  lat: number;
  lon: number;
}

interface Label {
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  cls: "num" | "lab";
}

export interface CoverageModel {
  cx: number;
  cy: number;
  /** ring radius in px */
  radius: number;
  routePaths: { d: string; main: boolean }[];
  /** inner rings every 5 km, px radii */
  rings: number[];
  /** hatch lines clipped to the outer ring, rest +45 degrees, unacked fault -45 degrees */
  hatch: string;
  north: { x1: number; y1: number; x2: number; y2: number; lx: number; ly: number };
  labels: Label[];
  sites: { x: number; y: number }[];
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const PAD = 3;
const CHAR_W = 6.7;
const ASCENT = 8;
const DESCENT = 2;
const RING_STEP_KM = 5;
const HATCH_PITCH = 8;

/** The hatch path of the coverage disc: M23 rest +45 degrees ("/"), unacked fault -45 degrees ("\"). */
export function hatchPath(fault: boolean, w = THUMB_W, h = THUMB_H): string {
  let d = "";
  for (let k = -h; k < w + h; k += HATCH_PITCH) d += fault ? `M${k} 0L${k + h} ${h}` : `M${k} ${h}L${k + h} 0`;
  return d;
}

export function coverageModel(feed: Site & { coverage_radius_km: number }, others: Site[], routes: GeoRoute[], fault: boolean): CoverageModel | null {
  const points = routes.flatMap((r) => r.points);
  const union = points.find((p) => p.place_id === "wash-union");
  const penn = points.find((p) => /penn/i.test(p.place_id) && /balt/i.test(p.place_id)) ?? points.find((p) => /Baltimore Penn/i.test(p.name));
  if (!union || !penn) return null;

  const kx = 111.32 * Math.cos((feed.lat * Math.PI) / 180);
  const ky = 110.57;
  const km = (lat: number, lon: number): [number, number] => [(lon - feed.lon) * kx, (lat - feed.lat) * ky];
  const [ux, uy] = km(union.lat, union.lon);
  const [bx, by] = km(penn.lat, penn.lon);
  const phi = Math.atan2(by - uy, bx - ux);
  const radiusKm = feed.coverage_radius_km;
  const scale = (THUMB_H / 2 - 6) / radiusKm;
  const cx = THUMB_W / 2;
  const cy = THUMB_H / 2;
  const radius = radiusKm * scale;
  const project = (lat: number, lon: number): [number, number] => {
    const [x, y] = km(lat, lon);
    const xr = x * Math.cos(phi) + y * Math.sin(phi);
    const yr = -x * Math.sin(phi) + y * Math.cos(phi);
    return [cx + xr * scale, cy - yr * scale];
  };

  const routePaths = routes.map((r) => ({
    main: r.id === "r-nec",
    d: r.points.map((p, i) => `${i ? "L" : "M"}${project(p.lat, p.lon).map((v) => v.toFixed(1)).join(" ")}`).join(""),
  }));
  const rings: number[] = [];
  for (let km5 = RING_STEP_KM; km5 < radiusKm; km5 += RING_STEP_KM) rings.push(km5 * scale);

  // Label placement: try right, left, above, below; take the first spot inside the box, clear of the
  // ring edge, the routes and every label already placed.
  const routePoints: [number, number][] = [];
  for (const route of routes) {
    const pts = route.points.map((p) => project(p.lat, p.lon));
    pts.slice(1).forEach(([x2, y2], i) => {
      const [x1, y1] = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2));
      for (let k = 0; k <= n; k++) routePoints.push([x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n]);
    });
  }
  const taken: Rect[] = [];
  const boxOf = (x: number, y: number, w: number, anchor: Label["anchor"]): Rect => {
    const x0 = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
    return { x0: x0 - 1, x1: x0 + w + 1, y0: y - ASCENT - 1, y1: y + DESCENT + 1 };
  };
  const cost = (box: Rect): number => {
    let c = 0;
    if (box.x0 < PAD || box.x1 > THUMB_W - PAD || box.y0 < PAD || box.y1 > THUMB_H - PAD) c += 1000;
    const nearX = Math.max(box.x0, Math.min(cx, box.x1));
    const nearY = Math.max(box.y0, Math.min(cy, box.y1));
    const near = Math.hypot(nearX - cx, nearY - cy);
    const far = Math.max(...[[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
    if (near < radius && far > radius) c += 300; // crosses the ring edge
    else if (far <= radius) c += 150; // sits on the hatch
    for (const t of taken) if (box.x0 < t.x1 && box.x1 > t.x0 && box.y0 < t.y1 && box.y1 > t.y0) c += 500;
    for (const [x, y] of routePoints) if (x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1) c += 2;
    return c;
  };
  const labels: Label[] = [];
  const place = (text: string, candidates: Omit<Label, "text" | "cls">[], cls: Label["cls"]): void => {
    const width = text.length * CHAR_W;
    let best: { c: number; cand: (typeof candidates)[number]; box: Rect } | null = null;
    for (const cand of candidates) {
      const box = boxOf(cand.x, cand.y, width, cand.anchor);
      const c = cost(box);
      if (!best || c < best.c) best = { c, cand, box };
    }
    if (!best) return;
    taken.push(best.box);
    labels.push({ text, cls, ...best.cand });
  };
  const around = (x: number, y: number, d: number): Omit<Label, "text" | "cls">[] =>
    [d, d + 6].flatMap((e) => [
      { x: x + e, y: y + 4, anchor: "start" as const },
      { x: x - e, y: y + 4, anchor: "end" as const },
      { x, y: y - e, anchor: "middle" as const },
      { x: x + 2, y: y - e, anchor: "start" as const },
      { x: x - 2, y: y - e, anchor: "end" as const },
      { x, y: y + e + 8, anchor: "middle" as const },
      { x: x + 2, y: y + e + 8, anchor: "start" as const },
      { x: x - 2, y: y + e + 8, anchor: "end" as const },
    ]);

  // North indicator (the view is turned): in the corner with the least going on.
  const nx = Math.sin(phi);
  const ny = -Math.cos(phi);
  const corner = 20;
  const corners: [number, number][] = [[THUMB_W - corner, THUMB_H - corner], [corner, THUMB_H - corner], [THUMB_W - corner, corner], [corner, corner]];
  const cornerBox = ([x, y]: [number, number]): Rect => ({ x0: x - corner + 4, x1: x + corner - 4, y0: y - corner + 4, y1: y + corner - 4 });
  const [ncx, ncy] = corners.map((c) => [c, cost(cornerBox(c))] as const).sort((p, q) => p[1] - q[1])[0][0];
  taken.push(cornerBox([ncx, ncy]));
  const north = { x1: ncx - nx * 4, y1: ncy - ny * 4, x2: ncx - nx * 4 + nx * 10, y2: ncy - ny * 4 + ny * 10, lx: ncx + nx * 12, ly: ncy + ny * 12 + 4 };

  // Ring distance: on the outer ring, just outside the hatch.
  const ringCandidates = [-45, -135, 45, 135].map((deg) => {
    const t = (deg * Math.PI) / 180;
    const x = cx + Math.cos(t) * (radius + 3);
    const y = cy + Math.sin(t) * (radius + 3);
    return { x: x + (Math.cos(t) > 0 ? 1 : -1), y: y + (Math.sin(t) > 0 ? 9 : -1), anchor: (Math.cos(t) > 0 ? "start" : "end") as Label["anchor"] };
  });
  place(`${radiusKm} KM`, ringCandidates, "num");

  // The other feeds: a site dot and its id.
  const visible = others
    .map((f) => ({ f, at: project(f.lat, f.lon) }))
    .filter(({ at: [x, y] }) => x >= 0 && x <= THUMB_W && y >= 0 && y <= THUMB_H);
  for (const { at: [x, y] } of visible) taken.push({ x0: x - 3, x1: x + 3, y0: y - 3, y1: y + 3 });
  for (const { f, at: [x, y] } of visible) place(f.short, around(x, y, 6), "num");

  return { cx, cy, radius, routePaths, rings, hatch: hatchPath(fault), north, labels, sites: visible.map(({ at: [x, y] }) => ({ x, y })) };
}

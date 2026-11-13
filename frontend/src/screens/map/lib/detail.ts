/**
 * Track-level detail at the terminals (GET /api/geo/rail-detail, built by tools/fetch_detail.py).
 *
 * Zoomed out, the map draws the regional rail lines. From DETAIL_ZOOM in, each terminal area swaps to its
 * own tracks, switches, signals, buffer stops and platforms, and the regional lines are masked out inside it.
 */

import { dist, type Pt, type Rect } from "./geom";
import type { BaseProjection, LonLat, View } from "./project";

/** The map zooms this far in (the regional view is 1x). */
export const MAX_ZOOM = 400;
/** From this zoom the terminals show their tracks. */
export const DETAIL_ZOOM = 8;
/** Track numbers appear a little later, once tracks are far enough apart to label. */
export const TRACK_LABEL_ZOOM = 12;

export type DetailKind = "track" | "switch" | "signal" | "buffer_stop" | "railway_crossing" | "platform";

export interface DetailFeature {
  properties: { kind: DetailKind; area: string; ref?: string; service?: string; operator?: string };
  geometry: { type: "LineString"; coordinates: LonLat[] } | { type: "Point"; coordinates: LonLat };
}

export interface DetailCollection {
  /** id -> name and [west, south, east, north] */
  areas: Record<string, { name: string; bbox: [number, number, number, number] }>;
  features: DetailFeature[];
}

export interface DetailArea {
  id: string;
  name: string;
  /** short label for its button */
  short: string;
  bbox: [number, number, number, number];
  centre: LonLat;
}

export function areasOf(detail: DetailCollection): DetailArea[] {
  return Object.entries(detail.areas).map(([id, { name, bbox }]) => ({
    id,
    name,
    short: name.split("·")[0].trim().toUpperCase(),
    bbox,
    centre: platformCentre(detail, id) ?? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
  }));
}

/** The middle of an area's platforms (the station itself), or null when it has none. */
function platformCentre(detail: DetailCollection, area: string): LonLat | null {
  const points = detail.features
    .filter((f) => f.properties.area === area && f.properties.kind === "platform" && f.geometry.type === "LineString")
    .flatMap((f) => f.geometry.coordinates as LonLat[]);
  if (!points.length) return null;
  const mean = (i: 0 | 1): number => points.reduce((sum, p) => sum + p[i], 0) / points.length;
  return [mean(0), mean(1)];
}

/** The area's box in canvas pixels. */
export function areaRect(area: DetailArea, project: (p: LonLat) => Pt): Rect {
  const [w, s, e, n] = area.bbox;
  const corners = [project([w, s]), project([w, n]), project([e, s]), project([e, n])];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Areas whose box overlaps the canvas, in a stable order (north to south). */
export function visibleAreas(areas: DetailArea[], project: (p: LonLat) => Pt, width: number, height: number): DetailArea[] {
  return areas
    .filter((a) => {
      const r = areaRect(a, project);
      return r.x1 > 0 && r.x0 < width && r.y1 > 0 && r.y0 < height;
    })
    .sort((a, b) => b.centre[1] - a.centre[1]);
}

/** The view that puts `area` at the centre of a `width` x `height` canvas at zoom `k`. */
export function viewCentredOn(base: BaseProjection, area: DetailArea, k: number, width: number, height: number): View {
  const [x, y] = base.project(area.centre);
  return { k, tx: width / 2 - x * k, ty: height / 2 - y * k };
}

/** Same track number again after this many pixels along the track. */
export const LABEL_SPACING_PX = 220;
/** Two different numbers stay this far apart, so neighbouring tracks never print on top of each other. */
const LABEL_CLEAR_PX = 16;
/** A terminus number sits this far past the buffer stop. */
const END_OFFSET_PX = 10;

export interface TrackLine {
  ref: string;
  pts: Pt[];
}

export interface TrackLabel {
  at: Pt;
  text: string;
  /** beside the buffer stop where the track ends */
  end: boolean;
}

/** Points every `spacing` px along a polyline, the first half a spacing in (or the middle of a short line). */
export function along(pts: Pt[], spacing: number): Pt[] {
  const lengths = pts.slice(1).map((p, i) => dist(pts[i], p));
  const total = lengths.reduce((a, b) => a + b, 0);
  const out: Pt[] = [];
  let i = 0;
  let walked = 0;
  for (let target = Math.min(spacing / 2, total / 2); target <= total && lengths.length; target += spacing) {
    while (i < lengths.length - 1 && walked + lengths[i] < target) walked += lengths[i++];
    const t = lengths[i] ? (target - walked) / lengths[i] : 0;
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
  }
  return out;
}

/**
 * Track numbers inside a `width` x `height` canvas: first one past every buffer stop a numbered track ends at
 * (the station's stub tracks), then the same numbers repeated about every LABEL_SPACING_PX along each track.
 * A number is dropped rather than printed over another one, so zoomed out only the termini survive.
 */
export function trackLabels(tracks: TrackLine[], stops: Pt[], width: number, height: number): TrackLabel[] {
  const kept: TrackLabel[] = [];
  const onCanvas = ([x, y]: Pt): boolean => x > 8 && x < width - 8 && y > 8 && y < height - 8;
  const add = (at: Pt, text: string, end: boolean, sameGap: number): void => {
    if (!onCanvas(at)) return;
    if (kept.some((k) => dist(k.at, at) < (k.text === text ? sameGap : LABEL_CLEAR_PX))) return;
    kept.push({ at, text, end });
  };

  for (const { ref, pts } of tracks) {
    if (pts.length < 2) continue;
    for (const [tip, next] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
      if (!stops.some((s) => dist(s, tip) < 2)) continue;
      const d = dist(tip, next) || 1;
      add([tip[0] + ((tip[0] - next[0]) / d) * END_OFFSET_PX, tip[1] + ((tip[1] - next[1]) / d) * END_OFFSET_PX], ref, true, LABEL_CLEAR_PX);
    }
  }
  for (const { ref, pts } of tracks) {
    if (pts.length < 2) continue;
    for (const at of along(pts, LABEL_SPACING_PX)) add(at, ref, false, LABEL_SPACING_PX * 0.7);
  }
  return kept;
}

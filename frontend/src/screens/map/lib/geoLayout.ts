/**
 * Geo layout: everything the geo map needs that depends on the view and on where the trains are, solved in the
 * order map.js solved it (spec 4.5): graticule numerals and ring labels, terminals, high-priority names, link
 * paths reserved, data blocks, link labels, remaining names, line names.
 */

import type { Direction } from "$lib/hud/dataBlock";
import { Boxes, dist, lerp, type Pt, type Rect, segRect } from "./geom";
import { BlockPlacer, leaderLength, railLinesThrough, type PlacementContext, type RailSegments } from "./blockPlacer";
import {
  GeoLabeler, type LinkLabel, type LinkSpec, nameRank, type StationPos, TERMINALS, type TerminalLabel, type TextLabel,
} from "./labelPlacer";
import type { Measure } from "./measure";
import { destination, type LonLat } from "./project";
import { nearestOn, parseMp, type RailLine, routeLonLat, segmentsInView, slice } from "./rail";
import type { MapData, Place } from "./types";

const TAIL_MI = 0.6 / 1.609344; // 600 m of past track behind a train

export interface FeedInput {
  id: string;
  short: string;
  lat: number;
  lon: number;
  radiusKm: number;
  sim: boolean;
  /** line 2 of the data block, and its state class */
  l2: string;
  l2Class: string;
}

export interface TrainInput {
  id: string;
  lat: number;
  lon: number;
  routeId: string;
  routeMi: number;
  direction: string;
  nextStop: string | null;
  sim: boolean;
  l2: string;
}

export interface ReceptionInput {
  feed_id: string;
  dist_km: number | null;
  snr_db: number | null;
}

export interface ActiveInput {
  trainId: string | null;
  placeId: string | null;
  feedId: string;
  receptions: ReceptionInput[];
}

export interface GeoInput {
  width: number;
  height: number;
  project: (p: LonLat) => Pt;
  invert: (p: Pt) => LonLat;
  data: MapData;
  lines: RailLine[];
  feeds: FeedInput[];
  trains: TrainInput[];
  active: ActiveInput[];
  /** HTML overlays (readout, controls, attribution, pointer) as canvas rectangles */
  overlays: Rect[];
  /** width of the inspector when something is selected, else 0 */
  inspectorWidth: number;
  /** rectangles for the scale bar and the north arrow, when the view draws them */
  scaleBox: Rect;
  northBox: Rect;
  measure: Measure;
  /** SNR text, e.g. "SNR 15 dB" */
  snrText: (snr: number | null) => string;
}

export interface TrainGeo {
  id: string;
  pt: Pt;
  tail: Pt[] | null;
  heading: Pt;
  /** pinned to the bezel, pointing off the view */
  off: boolean;
}

export interface BlockChoice {
  x: number;
  y: number;
  dir: Direction;
  len: number;
  from: number;
}

export interface RingLabel {
  km: number;
  x: number;
  y: number;
}

export interface GraticuleLine {
  pts: Pt[];
  label: string;
}

export interface EdgeLabel {
  text: string;
  box: Rect;
  x: number;
  y: number;
}

export interface GeoAudit {
  terminalsPlaced: number;
  namesDropped: string[];
  namesOffView: string[];
  maxLeader: number;
  blocksWithRailBehindKnockout: number;
  primaryLinkLabels: boolean[];
  railUnderLabel: string[];
}

export interface GeoLayout {
  mpTicks: [Pt, Pt][];
  graticule: GraticuleLine[];
  edgeLabels: EdgeLabel[];
  ringLabels: Record<string, RingLabel[]>;
  stationPos: Record<string, StationPos>;
  detectorPos: Record<string, Pt>;
  stationNames: TextLabel[];
  terminals: TerminalLabel[];
  lineLabels: TextLabel[];
  trains: TrainGeo[];
  trainBlocks: Record<string, BlockChoice>;
  feedBlocks: Record<string, BlockChoice>;
  links: { spec: LinkSpec; label: LinkLabel | null; trainId: string }[];
  audit: GeoAudit;
}

const normalise = (s: string): string => s.toLowerCase().replace(/[\s_-]+/g, "");
export { normalise as normaliseId };

/** Positions, tails and headings of the trains in the current view. Cheap: runs on every tick. */
export function trainGeometry(trains: TrainInput[], input: Pick<GeoInput, "width" | "height" | "project" | "data" | "lines">): TrainGeo[] {
  const { width, height, project, data, lines } = input;
  const routes = Object.fromEntries(data.routes.routes.map((r) => [r.id, r]));
  const notFreight = (l: RailLine): boolean => l.cls !== "freight";
  return trains.map((t) => {
    const route = routes[t.routeId];
    const raw = project([t.lon, t.lat]);
    const head = nearestOn(lines, raw, notFreight, 40);
    const headPt = head?.pt ?? raw;
    let sign = t.direction === "SB" ? -1 : 1;
    const next = route && t.nextStop ? route.points.find((p) => p.place_id === t.nextStop) : null;
    if (next) sign = Math.sign(next.route_mi - t.routeMi) || sign;
    let tail: Pt[] | null = null;
    if (route) {
      const back = project(routeLonLat(route, t.routeMi - sign * TAIL_MI));
      const backSnap = head ? nearestOn(lines, back, (l) => l === head.line, 40) : null;
      tail = head && backSnap ? slice(head.line, head, backSnap) : [headPt, back];
    }
    let heading: Pt = head?.dir ?? [1, 0];
    if (tail && tail.length > 1) {
      const z = tail[tail.length - 1];
      const d = dist(headPt, z) || 1;
      heading = [(headPt[0] - z[0]) / d, (headPt[1] - z[1]) / d];
    }
    // trains beyond the view pin to the bezel as an edge marker
    const E = 22;
    const inView = headPt[0] >= E && headPt[0] <= width - E && headPt[1] >= E && headPt[1] <= height - E;
    if (inView) return { id: t.id, pt: headPt, tail, heading, off: false };
    const c: Pt = [width / 2, height / 2];
    const v: Pt = [headPt[0] - c[0], headPt[1] - c[1]];
    const k = Math.min(Math.abs((width / 2 - E) / (v[0] || 1e-9)), Math.abs((height / 2 - E) / (v[1] || 1e-9)));
    const d = Math.hypot(v[0], v[1]);
    return { id: t.id, pt: [c[0] + v[0] * k, c[1] + v[1] * k], tail: null, heading: [v[0] / d, v[1] / d], off: true };
  });
}

/** Link paths: one from each receiving feed to the talking train, 12 px off the feed and 9 px short of the train. */
export function linkSpecs(input: Pick<GeoInput, "project" | "feeds" | "active" | "snrText">, trains: TrainGeo[]): { spec: LinkSpec; trainId: string }[] {
  const feedById = Object.fromEntries(input.feeds.map((f) => [f.id, f]));
  const out: { spec: LinkSpec; trainId: string }[] = [];
  for (const tx of input.active) {
    const tg = trains.find((g) => g.id === tx.trainId);
    if (!tx.trainId || !tg || tg.off) continue;
    for (const r of tx.receptions) {
      const f = feedById[r.feed_id];
      if (!f) continue;
      const a = input.project([f.lon, f.lat]);
      const b = tg.pt;
      const d = dist(a, b);
      const [ux, uy] = [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
      const snr = input.snrText(r.snr_db);
      out.push({
        trainId: tx.trainId,
        spec: {
          key: `${tx.trainId}:${r.feed_id}`,
          primary: r.feed_id === tx.feedId,
          A: [a[0] + ux * 12, a[1] + uy * 12],
          B: [b[0] - ux * 9, b[1] - uy * 9],
          d, ux, uy,
          km: r.dist_km,
          snr,
          full: `${(r.dist_km ?? 0).toFixed(1)} KM · ${snr}`,
        },
      });
    }
  }
  return out;
}

function graticule(project: (p: LonLat) => Pt): GraticuleLine[] {
  const out: GraticuleLine[] = [];
  for (let lat = 38.3; lat <= 39.81; lat += 0.1) {
    const pts: Pt[] = [];
    for (let lon = -78.0; lon <= -75.7; lon += 0.02) pts.push(project([lon, lat]));
    out.push({ pts, label: `${lat.toFixed(1)} N` });
  }
  for (let lon = -78.0; lon <= -75.69; lon += 0.1) {
    const pts: Pt[] = [];
    for (let lat = 38.3; lat <= 39.8; lat += 0.02) pts.push(project([lon, lat]));
    out.push({ pts, label: `${Math.abs(lon).toFixed(1)} W` });
  }
  return out;
}

/** Where a polyline crosses the horizontal line y = edge, and how squarely. */
function edgeCrossings(pts: Pt[], edge: number): { x: number; square: number }[] {
  const out: { x: number; square: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if ((a[1] - edge) * (b[1] - edge) < 0) {
      const t = (edge - a[1]) / (b[1] - a[1]);
      out.push({ x: a[0] + (b[0] - a[0]) * t, square: Math.abs(b[1] - a[1]) / dist(a, b) });
    }
  }
  return out;
}

/**
 * Graticule numerals where lines meet the top and bottom edges. A numeral reads as one coordinate, never a pair:
 * the squarest crossings win, 24 px clear of each other and 16 px clear of any rail crossing the edge.
 */
function edgeLabels(lines: GraticuleLine[], rail: RailLine[], boxes: Boxes, width: number, measure: Measure, height: number): EdgeLabel[] {
  const out: EdgeLabel[] = [];
  for (const [edge, ly] of [[0, 14], [height, height - 6]] as const) {
    const railX = rail.flatMap((l) => edgeCrossings(l.pts, edge).map((c) => c.x));
    const cands = lines
      .flatMap((g) => edgeCrossings(g.pts, edge).map((c) => ({ ...c, label: g.label })))
      .sort((p, q) => q.square - p.square);
    const kept: Rect[] = [];
    for (const c of cands) {
      if (c.x < 8 || c.x > width - 60) continue;
      const lx = c.x + 4;
      const w = measure.exact(c.label, "mono11");
      const box: Rect = { x0: lx - 2, y0: ly - 10, x1: lx + w + 2, y1: ly + 2 };
      if (kept.some((k) => box.x0 < k.x1 + 24 && box.x1 > k.x0 - 24)) continue;
      if (railX.some((x) => x > box.x0 - 16 && x < box.x1 + 16)) continue;
      if (boxes.hits(box, 0) !== 0) continue;
      kept.push(box);
      boxes.add(box);
      out.push({ text: c.label, box, x: lx, y: ly });
    }
  }
  return out;
}

/** Mileposts every 5 mi on route lines, a 5 px tick perpendicular to the drawn track. */
function milepostTicks(input: GeoInput): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (const r of input.data.routes.routes) {
    const seen = new Set<string>();
    for (let i = 0; i < r.points.length - 1; i++) {
      const [a, b] = [parseMp(r.points[i].mp_label), parseMp(r.points[i + 1].mp_label)];
      if (!a || !b || a.prefix !== b.prefix || a.v === b.v) continue;
      const [lo, hi] = [Math.min(a.v, b.v), Math.max(a.v, b.v)];
      for (let m = Math.ceil(lo / 5) * 5; m <= hi; m += 5) {
        const key = a.prefix + m;
        if (seen.has(key)) continue;
        seen.add(key);
        const t = (m - a.v) / (b.v - a.v);
        const mi = r.points[i].route_mi + t * (r.points[i + 1].route_mi - r.points[i].route_mi);
        const snap = nearestOn(input.lines, input.project(routeLonLat(r, mi)), (l) => l.cls !== "freight" || r.id === "r-phila", 30);
        if (!snap) continue;
        out.push([snap.pt, [snap.pt[0] - snap.dir[1] * 5, snap.pt[1] + snap.dir[0] * 5]]);
      }
    }
  }
  return out;
}

export function layoutGeo(input: GeoInput): GeoLayout {
  const { width, height, project, data, lines, feeds, active, measure } = input;
  const stations = data.places.stations;
  const placeById: Record<string, Place> = {};
  for (const p of [...stations, ...data.places.landmarks, ...data.places.detectors, ...data.places.feeds, ...(data.routes.derived_points ?? [])]) {
    placeById[p.id] = p;
  }
  const viewRect: Rect = { x0: 0, y0: 0, x1: width, y1: height };
  const inView = segmentsInView(lines, viewRect);
  const rail: RailSegments = { all: inView.flatMap((l) => l.segs), byLine: inView.map((l) => l.segs) };
  const boxes = new Boxes(width, height);
  const hardNames: Rect[] = [];
  const ctx: PlacementContext = { width, height, boxes, rail, hardNames, measure };

  // 1. ring labels (M5): where each 10 km ring crosses north, dropped when on another label
  const ringLabels: Record<string, RingLabel[]> = {};
  for (const f of feeds) {
    const labels: RingLabel[] = [];
    const place = (km: number): void => {
      const n = project(destination([f.lon, f.lat], 0, km));
      const text = `${km} KM`;
      const w = measure.exact(text, "mono11");
      const box: Rect = { x0: n[0] + 2, y0: n[1] - 15, x1: n[0] + w + 6, y1: n[1] - 1 };
      if (boxes.hits(box) !== 0) return;
      boxes.add(box);
      labels.push({ km, x: n[0] + 4, y: n[1] - 4 });
    };
    for (let km = 5; km < f.radiusKm; km += 5) if (km % 10 === 0) place(km);
    place(f.radiusKm);
    ringLabels[f.id] = labels;
  }

  // 2. overlays, the inspector, the scale bar and the north arrow
  input.overlays.forEach((b) => boxes.add(b, 8));
  if (input.inspectorWidth) boxes.add({ x0: width - input.inspectorWidth, y0: 0, x1: width, y1: height }, 8);
  boxes.add(input.scaleBox, 4);
  boxes.add(input.northBox);

  // 3. graticule numerals
  const grid = graticule(project);
  const labelsAtEdges = edgeLabels(grid, lines, boxes, width, measure, height);

  // 4. trains, feeds and station marks claim their space (they are the data)
  const trains = trainGeometry(input.trains, input);
  trains.forEach((g) => boxes.add({ x0: g.pt[0] - 7, y0: g.pt[1] - 7, x1: g.pt[0] + 7, y1: g.pt[1] + 7 }));
  feeds.forEach((f) => {
    const c = project([f.lon, f.lat]);
    boxes.add({ x0: c[0] - 11, y0: c[1] - 11, x1: c[0] + 11, y1: c[1] + 11 });
  });
  const stationPos: Record<string, StationPos> = {};
  for (const s of stations) {
    const p = project([s.lon, s.lat]);
    const snap = nearestOn(lines, p, undefined, 30);
    stationPos[s.id] = snap ? { pt: snap.pt, dir: snap.dir } : { pt: p, dir: [1, 0] };
    const r = TERMINALS.has(s.id) ? 8 : 5;
    const q = stationPos[s.id].pt;
    boxes.add({ x0: q[0] - r, y0: q[1] - r, x1: q[0] + r, y1: q[1] + r });
  }
  const detectorPos: Record<string, Pt> = {};
  for (const d of data.places.detectors) {
    const p = project([d.lon, d.lat]);
    detectorPos[d.id] = nearestOn(lines, p, undefined, 25)?.pt ?? p;
  }

  // 5. names that outrank the data: terminals, Amtrak stops, the talking train's stations
  const blocks = new BlockPlacer(ctx);
  const labeler = new GeoLabeler(ctx, lines, stationPos, () => blocks.placed, project);
  const talkAdjacent = new Set<string>();
  for (const tx of active) {
    if (!tx.trainId) continue;
    if (tx.placeId) talkAdjacent.add(tx.placeId);
    const next = input.trains.find((t) => t.id === tx.trainId)?.nextStop;
    if (next) talkAdjacent.add(next);
  }
  const rankOf = (s: Place): number => nameRank(s, talkAdjacent);
  stations.filter((s) => TERMINALS.has(s.id)).forEach((s) => labeler.placeTerminal(s));
  labeler.placeEarlyStations(stations, rankOf);

  // 6. link paths are reserved before any block is placed
  const links = linkSpecs(input, trains);
  for (const { spec } of links) {
    const n = Math.ceil(dist(spec.A, spec.B) / 8);
    for (let k = 1; k < n; k++) {
      const q = lerp(spec.A, spec.B, k / n);
      boxes.add({ x0: q[0] - 2, y0: q[1] - 2, x1: q[0] + 2, y1: q[1] + 2 });
    }
  }

  // 7. data blocks: trains with the widest variant (TX glyph) so the layout never jumps on key-up, then feeds
  const through = (box: Rect): number => railLinesThrough(rail, box);
  const trainBlocks: Record<string, BlockChoice> = {};
  input.trains.forEach((t, i) => {
    const g = trains[i];
    const placed = blocks.place({ x: g.pt[0], y: g.pt[1], from: 7, l1: t.id, sim: t.sim, l2: t.l2, tx: true, glyph: "tx" }, undefined, through);
    trainBlocks[t.id] = { x: g.pt[0], y: g.pt[1], dir: placed.dir, len: placed.len!, from: 7 };
  });
  const feedBlocks: Record<string, BlockChoice> = {};
  for (const f of feeds) {
    const c = project([f.lon, f.lat]);
    const placed = blocks.place(
      { x: c[0], y: c[1], from: 10, l1: f.short, sim: f.sim, l2: f.l2, l2Class: f.l2Class, glyph: "tx" },
      ["sw", "se", "nw", "ne", "w", "e", "s", "n"],
      through,
    );
    feedBlocks[f.id] = { x: c[0], y: c[1], dir: placed.dir, len: placed.len!, from: 10 };
  }

  // 8. link labels, after the blocks; the primary link first
  const labelled = links.map((l) => ({ ...l, label: null as LinkLabel | null }));
  [...labelled].sort((a, b) => Number(b.spec.primary) - Number(a.spec.primary)).forEach((l) => {
    l.label = labeler.placeLinkLabel(l.spec);
  });

  // 9. the remaining names, line names before the first of them
  labeler.replaceCovered(stations);
  let linesDone = false;
  for (const s of [...stations].sort((a, b) => rankOf(a) - rankOf(b))) {
    if (TERMINALS.has(s.id) || labeler.isEarly(s.id)) continue;
    if (!linesDone) {
      labeler.placeLineLabels();
      linesDone = true;
    }
    labeler.placeStation(s);
  }

  const railUnderLabel = labeler.glyphs
    .filter((g) => g && g.kind !== "terminal" && g.rect && rail.all.some(([a, c]) => segRect(a, c, g.rect!)))
    .map((g) => g!.text);
  const placedBlocks = blocks.placed;
  return {
    mpTicks: milepostTicks(input),
    graticule: grid,
    edgeLabels: labelsAtEdges,
    ringLabels,
    stationPos,
    detectorPos,
    stationNames: labeler.stationNames.filter((n): n is TextLabel => n !== null),
    terminals: labeler.terminals,
    lineLabels: labeler.lineLabels,
    trains,
    trainBlocks,
    feedBlocks,
    links: labelled,
    audit: {
      terminalsPlaced: labeler.terminalsPlaced.length,
      namesDropped: labeler.namesDropped,
      namesOffView: labeler.namesOffView,
      maxLeader: Math.round(Math.max(0, ...placedBlocks.map(leaderLength))),
      blocksWithRailBehindKnockout: placedBlocks.filter((g) => through(g.box) > 0).length,
      primaryLinkLabels: labelled.filter((l) => l.spec.primary).map((l) => !!l.label),
      railUnderLabel,
    },
  };
}


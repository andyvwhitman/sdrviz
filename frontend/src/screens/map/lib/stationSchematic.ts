/**
 * Station schematics: one terminal's tracks drawn in the schematic style (45 degree lines, ticks for track ends),
 * opened from the regional schematic.
 *
 * Hybrid layout: the track order across the station, which tracks dead-end and the platform pairs come from
 * the OSM detail layer (tools/fetch_detail.py); how the tracks merge into leads, the interlockings and the routes
 * leaving the station are a short hand-written config per station (STATIONS). North is to the right.
 */

import type { DetailCollection } from "./detail";
import type { LonLat } from "./project";

// ---- per-station config (the hand-set part)

export interface StationRoute {
  name: string;
  /** indexes into the station's leads, top to bottom */
  leads: number[];
  /** up: climbs away at 45 degrees; straight: carries on; yard: drops into a fan of yard tracks */
  dir: "up" | "straight" | "yard";
  yard?: string[];
}

export interface StationConfig {
  /** detail area id (and the TERMINALS button) */
  area: string;
  /** schematic place id of the terminal square that opens it */
  placeId: string;
  title: [string, string];
  /** compass bearing of the station tracks, pointing out of the station (north end) */
  bearingDeg: number;
  /** groups of station tracks, top to bottom, each funnelling into its `lead` track */
  groups: { tracks: string[]; lead: string }[];
  /** a gap is left above this track (between the two levels) */
  gapBefore?: string;
  levels?: [string, string];
  interlockings: string[];
  routes: StationRoute[];
  /** where the through tracks go at the south end */
  south?: { line: string; via: string };
}

const range = (a: number, b: number): string[] => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));

export const STATIONS: StationConfig[] = [
  {
    area: "union",
    placeId: "wash-union",
    title: ["WASHINGTON", "UNION STATION"],
    bearingDeg: 20,
    groups: [
      { tracks: range(7, 10), lead: "10" },
      { tracks: range(11, 14), lead: "11" },
      { tracks: range(15, 17), lead: "17" },
      { tracks: range(18, 20), lead: "18" },
      { tracks: range(22, 26), lead: "22" },
      { tracks: range(27, 30), lead: "27" },
    ],
    gapBefore: "22",
    levels: ["UPPER LEVEL", "LOWER LEVEL"],
    interlockings: ["K TOWER", "C"],
    routes: [
      { name: "CSX METRO SUB", leads: [0, 1], dir: "up" },
      { name: "CSX CAPITAL SUB", leads: [2], dir: "up" },
      { name: "NEC", leads: [3, 4], dir: "straight" },
      { name: "IVY CITY YARD", leads: [5], dir: "yard", yard: ["A", "B", "C", "D", "34", "35", "36", "37", "LS1", "LS2"] },
    ],
    south: { line: "RF&P", via: "FIRST ST TUNNEL" },
  },
];

export const stationFor = (key: string | null | undefined): StationConfig | undefined =>
  STATIONS.find((s) => s.area === key || s.placeId === key);

// ---- what OSM says about the station (the automatic part)

export interface StationTrack {
  ref: string;
  /** metres across the station, west / left of the direction of travel out of the station negative */
  across: number;
  /** runs on past the south end of the platforms (a through track) */
  through: boolean;
}

export interface StationFacts {
  tracks: StationTrack[];
  /** platform track pairs, e.g. ["7", "8"] */
  pairs: [string, string][];
}

type Local = { along: number; across: number };

/** OSM tracks of `config`'s station: their order across the platforms, which run through, and the platform pairs. */
export function stationFacts(detail: DetailCollection, config: StationConfig): StationFacts {
  const mine = detail.features.filter((f) => f.properties.area === config.area);
  const platforms = mine.filter((f) => f.properties.kind === "platform" && f.geometry.type === "LineString");
  const platformPts = platforms.flatMap((f) => f.geometry.coordinates as LonLat[]);
  const origin: LonLat = [mean(platformPts.map((p) => p[0])), mean(platformPts.map((p) => p[1]))];
  const toLocal = localFrame(origin, config.bearingDeg);
  const platformAlong = platformPts.map((p) => toLocal(p).along);
  const [south, north] = [Math.min(...platformAlong), Math.max(...platformAlong)];
  const samples = [0.25, 0.5, 0.75].map((t) => south + (north - south) * t);

  const wanted = new Set(config.groups.flatMap((g) => g.tracks));
  const across = new Map<string, number[]>();
  const minAlong = new Map<string, number>();
  for (const f of mine) {
    const ref = f.properties.ref;
    if (f.properties.kind !== "track" || !ref || !wanted.has(ref) || f.geometry.type !== "LineString") continue;
    const pts = (f.geometry.coordinates as LonLat[]).map(toLocal);
    if (pts.every((p) => p.along > north + 300 || p.along < south - 300)) continue; // the same number in a far yard
    minAlong.set(ref, Math.min(minAlong.get(ref) ?? Infinity, ...pts.map((p) => p.along)));
    for (const at of samples) for (const x of crossings(pts, at)) across.set(ref, [...(across.get(ref) ?? []), x]);
  }

  const tracks = [...wanted]
    .filter((ref) => across.has(ref))
    .map((ref) => ({ ref, across: mean(across.get(ref)!), through: (minAlong.get(ref) ?? Infinity) < south - 60 }))
    .sort((a, b) => a.across - b.across);
  const known = new Set(tracks.map((t) => t.ref));
  const pairs = platforms
    .map((f) => (f.properties.ref ?? "").split(";"))
    .filter((r): r is [string, string] => r.length === 2 && known.has(r[0]) && known.has(r[1]));
  return { tracks, pairs };
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

function localFrame(origin: LonLat, bearingDeg: number): (p: LonLat) => Local {
  const kx = Math.cos((origin[1] * Math.PI) / 180) * 111_320;
  const a = (bearingDeg * Math.PI) / 180;
  return ([lon, lat]) => {
    const x = (lon - origin[0]) * kx;
    const y = (lat - origin[1]) * 110_540;
    return { along: x * Math.sin(a) + y * Math.cos(a), across: x * Math.cos(a) - y * Math.sin(a) };
  };
}

/** `across` wherever the line crosses the cut at `along`. */
function crossings(pts: Local[], along: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [p, q] = [pts[i - 1], pts[i]];
    if ((p.along - along) * (q.along - along) > 0 || p.along === q.along) continue;
    out.push(p.across + ((along - p.along) / (q.along - p.along)) * (q.across - p.across));
  }
  return out;
}

// ---- the drawing

export interface StationText {
  x: number;
  y: number;
  text: string;
  cls: "num" | "mp" | "stn" | "linelab" | "term";
  anchor?: "start" | "middle" | "end";
  rotate?: number;
}

export interface StationLayout {
  width: number;
  height: number;
  paths: { d: string; cls: string }[];
  texts: StationText[];
  diamonds: [number, number][];
  square: [number, number];
}

const S = 16; // station track spacing
const Y0 = 190;
const STOP_X = 250;
const PLAT_X0 = 270;
const PLAT_X1 = 500;
const FAN_X = 520;
const GAP = 14; // spacing of the leads once they close up
const WIDTH = 1376;
const END_X = WIDTH - 190;

export function layoutStation(config: StationConfig, facts: StationFacts): StationLayout {
  const paths: StationLayout["paths"] = [];
  const texts: StationText[] = [];
  const diamonds: [number, number][] = [];
  const path = (d: string, cls = "s-hair k-line"): number => paths.push({ d, cls });
  const text = (t: StationText): number => texts.push(t);

  const order = facts.tracks.map((t) => t.ref);
  const gapAt = config.gapBefore ? order.indexOf(config.gapBefore) : -1;
  const y = (ref: string): number => {
    const i = order.indexOf(ref);
    return Y0 + i * S + (gapAt >= 0 && i >= gapAt ? S : 0);
  };
  const last = order[order.length - 1];

  // platforms, track ends, numbers
  for (const [a, b] of facts.pairs) path(`M${PLAT_X0} ${(y(a) + y(b)) / 2}H${PLAT_X1}`, "s-hair k-faint mp-plat");
  for (const t of facts.tracks) {
    if (!t.through) path(`M${STOP_X} ${y(t.ref) - 4}V${y(t.ref) + 4}`);
    text({ x: STOP_X - 8, y: y(t.ref) + (t.through ? -3 : 4), text: t.ref, cls: "num", anchor: "end" });
    text({ x: PLAT_X1 + 4, y: y(t.ref) - 3, text: t.ref, cls: "mp" });
  }

  // through tracks merge into two at the south end
  const through = facts.tracks.filter((t) => t.through).map((t) => t.ref);
  if (through.length && config.south) {
    const half = Math.ceil(through.length / 2);
    const targets = [y(through[half - 1]), y(through[Math.min(half, through.length - 1)])];
    through.forEach((ref, i) => {
      const target = targets[i < half ? 0 : 1];
      const dy = Math.abs(y(ref) - target);
      path(dy ? `M${STOP_X} ${y(ref)}H200L${200 - dy} ${target}H70` : `M70 ${y(ref)}H${STOP_X}`);
    });
    text({ x: 64, y: (targets[0] + targets[1]) / 2 + 4, text: config.south.line, cls: "linelab", anchor: "end" });
    text({ x: 150, y: Math.max(...targets) + 22, text: config.south.via, cls: "linelab", anchor: "middle" });
  }

  // each group funnels into its lead: a 45 degree ladder, nearest track first
  const groups = config.groups.map((g) => ({ lead: g.lead, tracks: g.tracks.filter((r) => order.includes(r)) })).filter((g) => order.includes(g.lead));
  for (const t of order) path(`M${STOP_X} ${y(t)}H${FAN_X}`);
  for (const g of groups) {
    const yl = y(g.lead);
    const others = g.tracks.filter((r) => r !== g.lead).sort((a, b) => Math.abs(y(a) - yl) - Math.abs(y(b) - yl));
    others.forEach((r, rank) => {
      const xt = FAN_X + rank * 10;
      path(`M${FAN_X} ${y(r)}H${xt}L${xt + Math.abs(y(r) - yl)} ${yl}`);
    });
    path(`M${FAN_X} ${yl}H${FAN_X + 100}`);
  }

  // the leads close up into a bundle
  const leads = groups.map((g) => g.lead);
  const mid = (Y0 + y(last)) / 2;
  const bundle = leads.map((_, k) => mid + (k - (leads.length - 1) / 2) * GAP);
  const xTurn = FAN_X + 100;
  const xBundle = xTurn + Math.max(...leads.map((l, k) => Math.abs(y(l) - bundle[k])));
  leads.forEach((l, k) => path(`M${xTurn} ${y(l)}L${xTurn + Math.abs(bundle[k] - y(l))} ${bundle[k]}H${xBundle}`));

  // interlockings: a bracket across the bundle, the name at 45 degrees like a station
  const xSplit = xBundle + 70 + config.interlockings.length * 120 - 70;
  bundle.forEach((r, k) => {
    path(`M${xBundle} ${r}H${xSplit}`);
    for (const x of [xBundle + 20, xBundle + 120]) if (x < xSplit - 30) text({ x, y: r - 3, text: leads[k], cls: "mp" });
  });
  config.interlockings.forEach((name, i) => {
    const x = xBundle + 70 + i * 120;
    path(`M${x} ${bundle[0] - 8}V${bundle[bundle.length - 1] + 8}`, "s-hair k-faint");
    diamonds.push([x, bundle[0] - 14]);
    text({ x: x + 4, y: bundle[0] - 24, text: name, cls: "stn", rotate: -45 });
  });

  // routes out of the last interlocking
  let upTarget = Y0 + 25;
  let upLine = 0;
  let bottom = y(last) + 40;
  for (const route of config.routes) {
    const rows = route.leads.map((k) => bundle[k]).filter((r) => r !== undefined);
    if (!rows.length) continue;
    if (route.dir === "up") {
      rows.forEach((r, k) => {
        const rise = r - (upTarget + k * GAP);
        const x0 = xSplit + upLine++ * GAP * 2;
        path(`M${xSplit} ${r}H${x0}L${x0 + rise} ${r - rise}H${END_X}`);
      });
      text({ x: END_X + 8, y: upTarget + ((rows.length - 1) * GAP) / 2 + 4, text: route.name, cls: "linelab" });
      upTarget += rows.length * GAP + 56;
    } else if (route.dir === "straight") {
      rows.forEach((r) => path(`M${xSplit} ${r}H${END_X}`));
      text({ x: END_X + 8, y: mean(rows) + 4, text: route.name, cls: "linelab" });
    } else {
      const r = rows[rows.length - 1];
      const drop = 40;
      const fanX = xSplit + drop + 20;
      path(`M${xSplit} ${r}H${xSplit + 10}L${xSplit + 10 + drop} ${r + drop}H${fanX}`);
      const yard = route.yard ?? [];
      yard.forEach((name, k) => {
        const ty = r + drop + k * 13;
        path(`M${fanX} ${r + drop}L${fanX + k * 13} ${ty}H${WIDTH - 150}`, "s-hair k-faint");
        text({ x: WIDTH - 144, y: ty + 4, text: name, cls: "mp" });
      });
      const below = r + drop + yard.length * 13 + 18;
      text({ x: fanX + 10, y: below, text: route.name, cls: "linelab" });
      bottom = Math.max(bottom, below + 20);
    }
  }

  // titles
  text({ x: STOP_X - 44, y: Y0 - 70, text: config.title[0], cls: "term" });
  text({ x: STOP_X - 44, y: Y0 - 54, text: config.title[1], cls: "term" });
  if (config.levels && gapAt > 0) {
    text({ x: PLAT_X0, y: Y0 - 18, text: config.levels[0], cls: "linelab" });
    text({ x: PLAT_X0, y: y(last) + 28, text: config.levels[1], cls: "linelab" });
  }
  return { width: WIDTH, height: Math.max(bottom, y(last) + 60), paths, texts, diamonds, square: [STOP_X - 60, Y0 - 66] };
}

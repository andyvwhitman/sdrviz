/**
 * Schematic layout (Beck 0/45/90 degrees, spec 4.5, map.js `SCH`). Stations sit at even spacing on the NEC /
 * RF&P spine, the other routes branch off at 45 degrees, detectors sit between stations by milepost.
 * Data blocks use 0/45/90 degree leaders only, found by an exact search with every label, route line, train mark
 * and other leader as a hard obstacle; names are placed after the blocks and dropped rather than overlapped.
 */

import type { BlockGeometry, Direction } from "$lib/hud/dataBlock";
import {
  type Anchor, bboxOf, lerp, polyPoly, type Pt, type Rect, rectPoly, segCross, segPoly, textPoly, tightPoly,
} from "./geom";
import { legs, measuredBlock } from "./blockPlacer";
import { nameRank, shortName, TERMINALS } from "./labelPlacer";
import type { Measure } from "./measure";
import { distanceKm } from "./project";
import type { Place, Route, RoutePoint } from "./types";

export interface SchematicTrain {
  id: string;
  routeId: string;
  routeMi: number;
  sim: boolean;
  l2: string;
}

export interface SchematicFeed {
  id: string;
  short: string;
  lat: number;
  lon: number;
  radiusKm: number;
}

export interface SchematicInput {
  width: number;
  height: number;
  routes: Route[];
  placeById: Record<string, Place>;
  trains: SchematicTrain[];
  feeds: SchematicFeed[];
  /** places the talking train is at or next to */
  talkAdjacent: ReadonlySet<string>;
  /** HTML overlays as canvas rectangles */
  overlays: Rect[];
  measure: Measure;
}

export interface SchItem {
  p: RoutePoint;
  rid: string;
  xy: Pt;
}

/** A static text on the schematic: SVG text with an optional rotation about (x, y). */
export interface SchText {
  text: string;
  x: number;
  y: number;
  anchor: Anchor;
  rotate?: number;
  /** `dy` 4 for text centred on a point */
  dy?: number;
  cls: "term" | "mp" | "linelab" | "stn" | "lab";
}

export interface SchBlock {
  dir: Direction;
  len: number;
  v: number;
  flip: boolean;
}

export interface StripRow {
  feed: SchematicFeed;
  y: number;
  /** glyph position */
  gx: number;
  gy: number;
  /** x of every spine point inside the feed's radius */
  ticks: number[];
  inside: number;
  /** runs of consecutive ticks as [x0, x1] */
  runs: [number, number][];
}

export interface PennLabel {
  lines: SchText[];
  tie: [Pt, Pt] | null;
}

export interface SchematicAudit {
  leaderLeader: number;
  leaderLabel: number;
  leaderBlock: number;
  blockLabel: number;
  maxLeader: number;
  search: string;
  unplaced: string[];
  namesDropped: string[];
}

export interface SchematicLayout {
  pos: Record<string, SchItem>;
  chains: Record<string, string[]>;
  ys: number;
  texts: SchText[];
  names: SchText[];
  penn: PennLabel | null;
  blocks: Record<string, SchBlock | null>;
  trainPos: Record<string, { xy: Pt; dir: Pt } | null>;
  strip: { head: SchText[]; rows: StripRow[]; headline: string };
  audit: SchematicAudit;
}

const SCH_LEAD_MAX = 64;
const SCH_LEAD_PREF = 48;
const SCH_FROM = 7;
const SCH_BLOCK_GAP = 3;
const PENN_GAP = 12;
const NAME_COST = 100;
const DFS_BUDGET = 8000;
/** the search also stops after this long (ms), keeping the best assignment so far, so a live re-solve never stalls the page */
const DFS_TIME_MS = 400;

interface Obstacle {
  poly: Pt[];
  kind: string;
  owner?: number;
  /** wider footprint used by the audit */
  pad?: Pt[];
}

interface Seg {
  a: Pt;
  b: Pt;
  kind: string;
  owner?: number;
  penn?: boolean;
}

interface NameCandidate {
  item: SchText;
  poly: Pt[];
  tight: Pt[];
}

interface PendingName {
  name: string;
  cands: NameCandidate[];
  rank: number;
  x: number;
}

interface Candidate {
  dir: Direction;
  len: number;
  v: number;
  flip: boolean;
  d: number;
  cost: number;
}

interface Scored {
  g: BlockGeometry;
  rank: number;
  c: Candidate;
  poly?: Pt[];
}

const norm = (s: string): string => s.toLowerCase();
export const trainKey = norm;

/** Item positions: evenly spaced stations on the spine, branches rising at 45 degrees. */
export function schematicPositions(routes: Route[], width: number, height: number): {
  pos: Record<string, SchItem>;
  chains: Record<string, string[]>;
  ys: number;
  left: number;
  right: number;
  rise: number;
} {
  const routeById = Object.fromEntries(routes.map((r) => [r.id, r]));
  const keep = (p: RoutePoint): boolean => p.kind === "station" || p.kind === "detector";
  const items = (rid: string): RoutePoint[] => {
    const out: RoutePoint[] = [];
    for (const p of routeById[rid].points) if (keep(p) && (!out.length || out[out.length - 1].place_id !== p.place_id)) out.push(p);
    return out;
  };
  const ys = Math.round(height * 0.5);
  const left = 112;
  const right = width - 96;
  const rise = 172; // with leaders capped at 64 px: three block rows above the spine at both sizes
  const pos: Record<string, SchItem> = {};
  const put = (rid: string, p: RoutePoint, xy: Pt): void => {
    pos[`${rid}:${p.place_id}`] = { p, rid, xy };
  };
  // evenly spaced stations; a detector sits between its neighbours by route mile
  const spine = items("r-nec");
  const stns = spine.filter((p) => p.kind !== "detector");
  const step = (right - left) / (stns.length - 1);
  stns.forEach((p, i) => put("r-nec", p, [left + i * step, ys]));
  spine.forEach((p, k) => {
    if (p.kind !== "detector") return;
    const a = spine.slice(0, k).reverse().find((q) => q.kind !== "detector")!;
    const b = spine.slice(k + 1).find((q) => q.kind !== "detector")!;
    const xa = pos[`r-nec:${a.place_id}`].xy[0];
    const xb = pos[`r-nec:${b.place_id}`].xy[0];
    put("r-nec", p, [xa + ((p.route_mi - a.route_mi) / (b.route_mi - a.route_mi || 1)) * (xb - xa), ys]);
  });
  const X = (id: string): number => pos[`r-nec:${id}`].xy[0];
  const [xw, xp, xa] = [X("wash-union"), X("baltimore-penn"), X("alexandria")];
  const cap = items("r-capital").filter((p) => p.place_id !== "wash-union");
  cap.forEach((p, i) => put("r-capital", p, [xw + rise + (i * (xp - xw - rise)) / (cap.length - 1), ys - rise]));
  const met = items("r-metro").filter((p) => p.place_id !== "wash-union");
  const mstep = Math.min(56, (ys - rise - 24) / met.length);
  met.forEach((p, i) => put("r-metro", p, [xw, ys - (i + 1) * mstep]));
  const man = items("r-manassas").filter((p) => p.place_id !== "alexandria").reverse();
  man.forEach((p, i) => put("r-manassas", p, [xa - rise - i * step, ys - rise]));
  // Philadelphia branches off at Baltimore Penn on its own 45 degree connector (lower at 1440)
  const phRise = width < 1600 ? 112 : rise;
  const phl = items("r-phila");
  const x0p = xp + phRise;
  phl.forEach((p, i) => put("r-phila", p, [x0p + (i * (right - x0p)) / Math.max(1, phl.length - 1), ys - phRise]));
  const chains: Record<string, string[]> = {
    "r-nec": spine.map((p) => `r-nec:${p.place_id}`),
    "r-capital": ["r-nec:wash-union", ...cap.map((p) => `r-capital:${p.place_id}`)],
    "r-metro": ["r-nec:wash-union", ...met.map((p) => `r-metro:${p.place_id}`)],
    "r-manassas": [...man.slice().reverse().map((p) => `r-manassas:${p.place_id}`), "r-nec:alexandria"],
    "r-phila": ["r-nec:baltimore-penn", ...phl.map((p) => `r-phila:${p.place_id}`)],
  };
  return { pos, chains, ys, left, right, rise };
}

/** A train's schematic position: interpolated by route mile between that route's items. */
export function schematicTrainPosition(
  pos: Record<string, SchItem>,
  t: { routeId: string; routeMi: number },
): { xy: Pt; dir: Pt } | null {
  const its = Object.values(pos)
    .filter((it) => it.rid === t.routeId || (t.routeId === "r-capital" && it.p.place_id === "wash-union" && it.rid === "r-nec"))
    .map((it) => ({ mi: it.rid === t.routeId ? it.p.route_mi : 0, xy: it.xy }))
    .sort((a, b) => a.mi - b.mi);
  if (!its.length) return null;
  if (t.routeMi <= its[0].mi) return { xy: its[0].xy, dir: [1, 0] };
  for (let i = 0; i < its.length - 1; i++) {
    const [a, b] = [its[i], its[i + 1]];
    if (t.routeMi >= a.mi && t.routeMi <= b.mi) {
      const d = Math.hypot(b.xy[0] - a.xy[0], b.xy[1] - a.xy[1]) || 1;
      return { xy: lerp(a.xy, b.xy, (t.routeMi - a.mi) / (b.mi - a.mi || 1)), dir: [(b.xy[0] - a.xy[0]) / d, (b.xy[1] - a.xy[1]) / d] };
    }
  }
  return { xy: its[its.length - 1].xy, dir: [1, 0] };
}

/** Candidate leaders, cheapest first: a straight 45, an n/s flagpole, a Beck dogleg, then a long 45. */
function leaderCandidates(): Candidate[] {
  const out: Candidate[] = [];
  const over = (d: number): number => (d > SCH_LEAD_PREF ? 200 : 0);
  const LENS = [24, 31, 39, 47, 55, 63, 71];
  for (const len of LENS) {
    for (const dir of ["ne", "nw", "se", "sw"] as const) {
      const d = len - SCH_FROM;
      out.push({ dir, len, v: 0, flip: false, d, cost: d + over(d) * 1.5 });
    }
  }
  for (const len of LENS) {
    for (const dir of ["n", "s"] as const) {
      for (const flip of [false, true]) {
        const d = len - SCH_FROM;
        out.push({ dir, len, v: 0, flip, d, cost: d + 6 + (flip ? 1 : 0) + over(d) });
      }
    }
  }
  for (let v = 15; v <= SCH_LEAD_MAX; v += 8) {
    for (const len of [16, 24, 32]) {
      for (const dir of ["ne", "nw", "se", "sw"] as const) {
        const d = v - SCH_FROM + len;
        out.push({ dir, len, v, flip: false, d, cost: d + 12 + over(d) });
      }
    }
  }
  return out.filter((c) => c.d <= SCH_LEAD_MAX).sort((a, b) => a.cost - b.cost);
}

const blockPad = (b: Rect): Rect => ({ x0: b.x0 - 8, y0: b.y0 - SCH_BLOCK_GAP, x1: b.x1 + 8, y1: b.y1 + SCH_BLOCK_GAP });

export function layoutSchematic(input: SchematicInput): SchematicLayout {
  const { width: W, height: H, routes, placeById, feeds, measure } = input;
  const routeById = Object.fromEntries(routes.map((r) => [r.id, r]));
  const S = schematicPositions(routes, W, H);
  const { pos, chains } = S;
  const sch = (id: string): Pt => pos[`r-nec:${id}`].xy;

  const polys: Obstacle[] = [];
  const segs: Seg[] = [];
  const texts: SchText[] = [];
  const lw = (t: string): number => measure.tracked(t, "line11");
  const put = (item: SchText, poly: Pt[], kind = "label"): void => {
    texts.push(item);
    polys.push({ poly, kind });
  };
  const polyFree = (poly: Pt[]): boolean => polys.every((o) => o.kind === "pennpad" || !polyPoly(poly, o.poly));
  input.overlays.forEach((b) => polys.push({ poly: rectPoly(b), kind: "overlay" }));
  for (const keys of Object.values(chains)) {
    const pts = keys.map((k) => pos[k].xy);
    for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1], kind: "route" });
  }
  for (const id of TERMINALS) {
    const [x, y] = sch(id);
    polys.push({ poly: rectPoly({ x0: x - 9, y0: y - 9, x1: x + 9, y1: y + 9 }), kind: "mark" });
  }

  // Washington: the two-line terminal name sits on its box, the MP-equation mark rides above it
  const eq = routeById["r-nec"].points.find((p) => p.place_id === "wash-union" && p.equation);
  let eqPoly: Pt[] | null = null;
  {
    const [x, y] = sch("wash-union");
    const [a, b] = ["WASHINGTON", "UNION STATION"];
    put({ text: a, x: x - 16, y: y - 24, anchor: "end", cls: "term" }, textPoly(x - 16, y - 24, 0, measure.tracked(a, "term13"), "end"));
    put({ text: b, x: x - 16, y: y - 7, anchor: "end", cls: "term" }, textPoly(x - 16, y - 7, 0, measure.tracked(b, "term13"), "end"));
    if (eq?.equation) {
      eqPoly = textPoly(x - 16, y - 43, 0, measure.exact(eq.equation, "mono11"), "end");
      put({ text: eq.equation, x: x - 16, y: y - 43, anchor: "end", cls: "mp" }, eqPoly);
    }
  }

  // Station and detector names are placed after the train blocks; here each gets its candidate slots
  const pending: PendingName[] = [];
  for (const it of Object.values(pos)) {
    const [x, y] = it.xy;
    const id = it.p.place_id;
    const detector = it.p.kind === "detector";
    if (TERMINALS.has(id) && it.rid === "r-nec") continue;
    const place = placeById[id];
    const name = detector ? (it.p.mp_label || "").replace("≈", "≈ ") : shortName(place ?? { id, name: it.p.name });
    const w = detector ? measure.exact(name, "mono11") : measure.tracked(name, "lab11");
    const cls = detector ? "mp" : "stn";
    const slot = (ox: number, oy: number, rotate: number, anchor: Anchor): NameCandidate => {
      const ang = (rotate * Math.PI) / 180;
      return {
        item: { text: name, x: ox, y: oy, anchor, rotate: rotate || undefined, cls },
        poly: textPoly(ox, oy, ang, w, anchor),
        tight: tightPoly(ox, oy, ang, w, anchor),
      };
    };
    const below = slot(x + 4, y + 12, 45, "start");
    const above = slot(x + 4, y - 10, -45, "start");
    const belowL = slot(x - 4, y + 12, -45, "end");
    const aboveL = slot(x - 4, y - 10, 45, "end");
    let cands: NameCandidate[];
    if (it.rid === "r-metro") cands = [slot(x - 14, y + 4, 0, "end"), slot(x + 14, y + 4, 0, "start")];
    else if (it.rid === "r-nec" && !detector && x < sch("wash-union")[0]) cands = [below, belowL, above, aboveL];
    else cands = [above, aboveL, below, belowL];
    pending.push({ name, cands, rank: detector ? 9 : nameRank(place, input.talkAdjacent), x });
    polys.push({ poly: rectPoly({ x0: x - 5, y0: y - 5, x1: x + 5, y1: y + 5 }), kind: "mark" });
  }
  const softHits = (poly: Pt[]): number => pending.reduce((n, nm) => n + (polyPoly(poly, nm.cands[0].poly) ? 1 : 0), 0);

  // route names: the spine is two counts, RF&P south-west of Washington and NEC east of it
  put({ text: "RF&P", x: S.left - 16, y: S.ys + 4, anchor: "end", cls: "linelab" }, textPoly(S.left - 16, S.ys + 4, 0, lw("RF&P"), "end"));
  put({ text: "NEC", x: S.right + 16, y: S.ys + 4, anchor: "start", cls: "linelab" }, textPoly(S.right + 16, S.ys + 4, 0, lw("NEC")));
  {
    const top = pos[chains["r-metro"].slice(-1)[0]].xy;
    const t = "CSX METROPOLITAN SUB";
    put({ text: t, x: top[0], y: top[1] - 18, anchor: "middle", cls: "linelab" }, textPoly(top[0], top[1] - 18, 0, lw(t), "middle"));
    const c0 = pos[chains["r-manassas"][0]].xy;
    const tm = "NS · VRE MANASSAS";
    put({ text: tm, x: c0[0] - 16, y: c0[1] + 4, anchor: "end", cls: "linelab" }, textPoly(c0[0] - 16, c0[1] + 4, 0, lw(tm), "end"));
  }
  // Capital and Philadelphia: named along their 45 degree connector, slid along it until clear
  for (const [rid, names] of [["r-capital", ["CSX CAPITAL SUB"]], ["r-phila", ["CSX PHILADELPHIA SUB", "CSX PHILA SUB"]]] as const) {
    const [a, b] = [pos[chains[rid][0]].xy, pos[chains[rid][1]].xy];
    let done = false;
    for (const text of names) {
      for (const side of [-1, 1]) {
        for (const t of [0.5, 0.58, 0.66, 0.42, 0.74, 0.34, 0.82]) {
          if (done) break;
          const m = lerp(a, b, t);
          const [cx, cy] = [m[0] + 9 * side, m[1] + 9 * side];
          const ang = -Math.PI / 4;
          const [ox, oy] = [cx - 4 * Math.sin(ang), cy + 4 * Math.cos(ang)];
          const poly = textPoly(ox, oy, ang, lw(text), "middle");
          const wide = textPoly(ox, oy, ang, lw(text), "middle", 8);
          if (!polyFree(poly) || softHits(wide) || segs.some((sg) => segPoly(sg.a, sg.b, poly))) continue;
          put({ text, x: cx, y: cy, anchor: "middle", rotate: -45, dy: 4, cls: "linelab" }, poly);
          done = true;
        }
      }
    }
  }

  // coverage strip: which spine points each feed reaches
  const spineItems = chains["r-nec"].map((k) => pos[k]);
  const y0 = H - feeds.length * 22 - 46;
  const headline = "NEC · RF&P POINTS INSIDE EACH FEED’S NOMINAL RADIUS";
  const stripHead: SchText[] = [
    { text: "COVERAGE", x: S.left - 16, y: y0 - 22, anchor: "end", cls: "lab" },
    { text: headline, x: S.left, y: y0 - 22, anchor: "start", cls: "lab" },
  ];
  polys.push({ poly: rectPoly({ x0: S.left - 100, y0: y0 - 34, x1: S.left + measure.tracked(headline, "lab11") + 8, y1: y0 - 18 }), kind: "strip" });
  const rows: StripRow[] = feeds.map((f, i) => {
    const y = y0 + i * 22;
    const inside = spineItems.map((it) => distanceKm([f.lon, f.lat], [it.p.lon, it.p.lat]) <= f.radiusKm);
    const ticks: number[] = [];
    const runs: [number, number][] = [];
    let run: number | null = null;
    inside.forEach((ok, j) => {
      if (ok) {
        run ??= j;
        ticks.push(spineItems[j].xy[0]);
      } else if (run !== null) {
        runs.push([spineItems[run].xy[0], spineItems[j - 1].xy[0]]);
        run = null;
      }
    });
    if (run !== null) runs.push([spineItems[run].xy[0], spineItems[inside.length - 1].xy[0]]);
    polys.push({ poly: rectPoly({ x0: S.left - 100, y0: y - 12, x1: W, y1: y + 4 }), kind: "strip" });
    return { feed: f, y, gx: S.left - 92, gy: y - 4, ticks, inside: inside.length, runs };
  });

  // Baltimore Penn label slots: attached to the terminal box, with a 12 px keep-out no block may enter
  const pennSlots = pennLabelSlots();
  function pennLabelSlots(): { lines: SchText[]; pa: Pt[]; pb: Pt[]; pad: Pt[]; tie: [Pt, Pt] | null }[] {
    const [x, y] = sch("baltimore-penn");
    const [a, b] = ["BALTIMORE", "PENN STATION"];
    const cands: [number, number, Anchor][] = [
      [16, 24, "start"], [-16, 24, "end"], [-16, -34, "end"], [16, -34, "start"],
      [0, -52, "middle"], [0, -70, "middle"], [-28, -70, "middle"], [0, -88, "middle"], [-28, -88, "middle"], [-40, -88, "middle"],
      [0, -106, "middle"], [-28, -106, "middle"], [0, 40, "middle"], [0, 58, "middle"], [0, 76, "middle"], [0, 94, "middle"],
      [-28, 76, "middle"], [-28, 94, "middle"], [0, 112, "middle"],
    ];
    const out: { lines: SchText[]; pa: Pt[]; pb: Pt[]; pad: Pt[]; tie: [Pt, Pt] | null }[] = [];
    for (const [dx, dy, anchor] of cands) {
      const pa = textPoly(x + dx, y + dy, 0, measure.tracked(a, "term13"), anchor);
      const pb = textPoly(x + dx, y + dy + 17, 0, measure.tracked(b, "term13"), anchor);
      const tie: [Pt, Pt] | null = anchor !== "middle" ? null : dy < 0 ? [[x, y - 9], [x, y + dy + 21]] : [[x, y + 9], [x, y + dy - 13]];
      const clean =
        [pa, pb].every((q) => polyFree(q) && !segs.some((sg) => segPoly(sg.a, sg.b, q))) &&
        (!tie || (!polys.some((o) => o.kind !== "mark" && segPoly(tie[0], tie[1], o.poly)) && !segs.some((sg) => segCross(tie[0], tie[1], sg.a, sg.b))));
      if (!clean) continue;
      const box = bboxOf([...pa, ...pb]);
      const k = PENN_GAP - 2;
      const pad = rectPoly({ x0: box.x0 - k, y0: box.y0 - k, x1: box.x1 + k, y1: box.y1 + k });
      out.push({
        pa, pb, pad, tie,
        lines: [
          { text: a, x: x + dx, y: y + dy, anchor, cls: "term" },
          { text: b, x: x + dx, y: y + dy + 17, anchor, cls: "term" },
        ],
      });
    }
    // prefer slots that displace no station name (stable sort keeps the order above)
    return out
      .map((sl, k) => ({ sl, k, n: softHits(sl.pa) + softHits(sl.pb) }))
      .sort((p, q) => p.n - q.n || p.k - q.k)
      .map((o) => o.sl);
  }
  type PennSlot = (typeof pennSlots)[number];
  const pennOn = (sl: PennSlot): void => {
    polys.push({ poly: sl.pa, kind: "label" }, { poly: sl.pb, kind: "label" }, { poly: sl.pad, kind: "pennpad" });
    if (sl.tie) segs.push({ a: sl.tie[0], b: sl.tie[1], kind: "tie", penn: true });
  };
  const pennOff = (sl: PennSlot): void => {
    for (let i = polys.length - 1; i >= 0; i--) if ([sl.pa, sl.pb, sl.pad].includes(polys[i].poly)) polys.splice(i, 1);
    for (let i = segs.length - 1; i >= 0; i--) if (segs[i].penn) segs.splice(i, 1);
  };

  // ---- train blocks
  const trainPos: Record<string, { xy: Pt; dir: Pt } | null> = {};
  input.trains.forEach((t) => (trainPos[t.id] = schematicTrainPosition(pos, t)));
  const CANDS = leaderCandidates();
  const idx = input.trains.map((_, i) => i).filter((i) => trainPos[input.trains[i].id]);
  const marks = input.trains.map((t) => {
    const p = trainPos[t.id];
    return p ? rectPoly({ x0: p.xy[0] - 7, y0: p.xy[1] - 5, x1: p.xy[0] + 7, y1: p.xy[1] + 5 }) : null;
  });
  const blockAt = (i: number, c: Candidate): BlockGeometry => {
    const t = input.trains[i];
    const xy = trainPos[t.id]!.xy;
    return measuredBlock(measure, { x: xy[0], y: xy[1], from: SCH_FROM, l1: t.id, sim: t.sim, l2: t.l2, tx: true, glyph: "tx", dir: c.dir, len: c.len, v: c.v, flip: c.flip });
  };
  /** { hard } if a fixed obstacle is hit, else the trains whose block or leader is in the way */
  const check = (g: BlockGeometry, own: Pt[] | null): { hard: boolean; owners: Set<number> } => {
    const owners = new Set<number>();
    const b = g.box;
    if (b.x0 < 4 || b.y0 < 4 || b.x1 > W - 4 || b.y1 > H - 4) return { hard: true, owners };
    const bp = rectPoly(b);
    const lg = legs(g);
    const hit = (o: { owner?: number }, test: boolean): boolean => {
      if (!test) return false;
      if (o.owner == null) return true;
      owners.add(o.owner);
      return false;
    };
    for (const o of polys) if (hit(o, polyPoly(bp, o.poly) || (o.kind !== "pennpad" && lg.some(([a, c]) => segPoly(a, c, o.poly))))) return { hard: true, owners };
    for (const sg of segs) if (hit(sg, segPoly(sg.a, sg.b, bp) || lg.some(([a, c]) => segCross(a, c, sg.a, sg.b)))) return { hard: true, owners };
    if (marks.some((p) => p && polyPoly(bp, p))) return { hard: true, owners };
    if (lg.some(([a, c]) => marks.some((p) => p && p !== own && segPoly(a, c, p)))) return { hard: true, owners };
    return { hard: false, owners };
  };
  const clean = (g: BlockGeometry, i: number): boolean => {
    const r = check(g, marks[i]);
    return !r.hard && r.owners.size === 0;
  };
  const chosen: (BlockGeometry | null)[] = input.trains.map(() => null);
  const choose = (i: number, g: BlockGeometry): void => {
    chosen[i] = g;
    polys.push({ poly: rectPoly(blockPad(g.box)), kind: "block", owner: i });
    legs(g).forEach(([a, b]) => segs.push({ a, b, kind: "leader", owner: i }));
  };
  const lift = (i: number): void => {
    chosen[i] = null;
    for (let k = polys.length - 1; k >= 0; k--) if (polys[k].owner === i) polys.splice(k, 1);
    for (let k = segs.length - 1; k >= 0; k--) if (segs[k].owner === i) segs.splice(k, 1);
  };
  const firstClean = (i: number): BlockGeometry | null => {
    for (const c of CANDS) {
      const g = blockAt(i, c);
      if (clean(g, i)) return g;
    }
    return null;
  };

  // exact search: forward checking over each train's clean candidates, minimising leader length + displaced names
  const pairClash = (g: Scored, h: Scored): boolean => {
    const bg = (g.poly ??= rectPoly(blockPad(g.g.box)));
    const bh = (h.poly ??= rectPoly(blockPad(h.g.box)));
    const [lg, lh] = [legs(g.g), legs(h.g)];
    return polyPoly(bg, bh) || lg.some(([a, b]) => segPoly(a, b, bh) || lh.some(([c, d]) => segCross(a, b, c, d))) || lh.some(([a, b]) => segPoly(a, b, bg));
  };
  let nodes = 0;
  let deadline = Infinity;
  let best: Record<number, Scored> | null = null;
  let bestCost = Infinity;
  const dfs = (doms: Record<number, Scored[]>, picked: Record<number, Scored>, cost: number): void => {
    const open = Object.keys(doms).map(Number);
    if (!open.length) {
      if (cost < bestCost) {
        bestCost = cost;
        best = picked;
      }
      return;
    }
    const lb = open.reduce((n, j) => n + doms[j][0].rank, cost);
    if (lb >= bestCost) return;
    const i = open.reduce((p, q) => (doms[q].length < doms[p].length ? q : p));
    const rest = lb - doms[i][0].rank;
    for (const g of doms[i]) {
      if (rest + g.rank >= bestCost || ++nodes > DFS_BUDGET || (nodes % 64 === 0 && performance.now() > deadline)) return;
      const next: Record<number, Scored[]> = {};
      let dead = false;
      for (const j of open) {
        if (j === i) continue;
        next[j] = doms[j].filter((h) => !pairClash(g, h));
        if (!next[j].length) {
          dead = true;
          break;
        }
      }
      if (!dead) dfs(next, { ...picked, [i]: g }, cost + g.rank);
    }
  };
  /** 1 per default slot taken; a high-priority name also costs 4 per slot taken, so blocks leave it a slot */
  const nameCost = (g: BlockGeometry): number => {
    const bp = rectPoly(blockPad(g.box));
    const lg = legs(g);
    const hit = (q: NameCandidate): boolean => polyPoly(bp, q.tight) || lg.some(([a, b]) => segPoly(a, b, q.poly));
    return pending.reduce((n, nm) => n + (hit(nm.cands[0]) ? 1 : 0) + (nm.rank < 3 ? 4 * nm.cands.filter(hit).length : 0), 0);
  };
  let trace = "";
  const solve = (): boolean => {
    const doms: Record<number, Scored[]> = {};
    for (const i of idx) {
      doms[i] = CANDS.map((c) => ({ g: blockAt(i, c), rank: c.cost, c }))
        .filter((s) => clean(s.g, i))
        .map((s) => ({ ...s, rank: s.rank + NAME_COST * nameCost(s.g) }))
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 60);
    }
    const empty = Object.entries(doms).filter(([, d]) => !d.length).map(([i]) => input.trains[Number(i)].id);
    if (empty.length) {
      trace = `empty:${empty}`;
      return false;
    }
    nodes = 0;
    best = null;
    bestCost = Infinity;
    deadline = performance.now() + DFS_TIME_MS;
    dfs(doms, {}, 0);
    trace = best ? `ok · cost ${Math.round(bestCost)} · ${nodes} nodes` : nodes > DFS_BUDGET ? "budget" : "exhausted";
    if (!best) return false;
    for (const [i, s] of Object.entries(best as Record<number, Scored>)) choose(Number(i), s.g);
    return true;
  };

  let exact = false;
  let pennSlot: PennSlot | null = null;
  for (const sl of pennSlots) {
    pennOn(sl);
    if (solve()) {
      exact = true;
      pennSlot = sl;
      break;
    }
    pennOff(sl);
  }
  if (!pennSlot && pennSlots.length) {
    pennSlot = pennSlots[0];
    pennOn(pennSlot);
  }

  // fallback: greedy in the best of three orders, then repair
  let unplaced: number[] = [];
  if (!exact) {
    const free = Object.fromEntries(idx.map((i) => [i, CANDS.filter((c) => clean(blockAt(i, c), i)).length]));
    const byX = (i: number, j: number): number => trainPos[input.trains[i].id]!.xy[0] - trainPos[input.trains[j].id]!.xy[0];
    const orders = [idx.slice().sort(byX), idx.slice().sort((i, j) => byX(j, i)), idx.slice().sort((i, j) => free[i] - free[j] || byX(i, j))];
    let bestRun: { placed: Record<number, BlockGeometry>; unplaced: number[]; cost: number } | null = null;
    for (const order of orders) {
      const run = { placed: {} as Record<number, BlockGeometry>, unplaced: [] as number[], cost: 0 };
      for (const i of order) {
        const g = firstClean(i);
        if (!g) {
          run.unplaced.push(i);
          continue;
        }
        choose(i, g);
        run.placed[i] = g;
        run.cost += (g.len ?? 0) + (g.v ?? 0);
      }
      order.forEach(lift);
      if (!bestRun || run.unplaced.length < bestRun.unplaced.length || (run.unplaced.length === bestRun.unplaced.length && run.cost < bestRun.cost)) bestRun = run;
    }
    for (const [i, g] of Object.entries(bestRun!.placed)) choose(Number(i), g);
    unplaced = bestRun!.unplaced.slice();
    // repair: take the cheapest slot only other trains are in the way of, lift them, place this one, re-place them
    for (let pass = 0; pass < 3 && unplaced.length; pass++) {
      for (const u of unplaced.slice()) {
        for (const c of CANDS) {
          const g = blockAt(u, c);
          const r = check(g, marks[u]);
          if (r.hard || !r.owners.size) continue;
          const lifted = [...r.owners];
          const before = Object.fromEntries(lifted.map((i) => [i, chosen[i]!]));
          lifted.forEach(lift);
          choose(u, g);
          const again = lifted.map((i) => {
            const h = firstClean(i);
            if (h) choose(i, h);
            return h;
          });
          if (again.every(Boolean)) {
            unplaced = unplaced.filter((x) => x !== u);
            break;
          }
          lifted.forEach(lift);
          lift(u);
          lifted.forEach((i) => choose(i, before[i]));
        }
      }
    }
  }

  // names, after the data: by priority, default side, then the other side, else dropped
  const dropped: string[] = [];
  const names: SchText[] = [];
  const tightKinds = new Set(["name", "block"]);
  for (const nm of [...pending].sort((a, b) => a.rank - b.rank || a.x - b.x)) {
    const nameHit = (q: NameCandidate, o: Obstacle): boolean => (tightKinds.has(o.kind) ? polyPoly(q.tight, o.poly) : polyPoly(q.poly, o.poly));
    const c = nm.cands.find(
      (q) =>
        polys.every((o) => o.kind === "pennpad" || !nameHit(q, o)) &&
        !segs.some((sg) => segPoly(sg.a, sg.b, q.poly)) &&
        !marks.some((m) => m && polyPoly(q.tight, m)),
    );
    if (!c) {
      dropped.push(nm.name);
      continue;
    }
    polys.push({ poly: c.tight, pad: c.poly, kind: "name" });
    names.push(c.item);
  }

  const blocks: Record<string, SchBlock | null> = {};
  input.trains.forEach((t, i) => {
    const g = chosen[i];
    blocks[t.id] = g ? { dir: g.dir, len: g.len!, v: g.v ?? 0, flip: !!g.flip } : null;
  });
  const placed = chosen.map((g, i) => (g ? { g, i } : null)).filter((b): b is { g: BlockGeometry; i: number } => b !== null);
  const audit = auditBlocks(placed, polys);
  void eqPoly;
  return {
    pos,
    chains,
    ys: S.ys,
    texts,
    names,
    penn: pennSlot ? { lines: pennSlot.lines, tie: pennSlot.tie } : null,
    blocks,
    trainPos,
    strip: { head: stripHead, rows, headline },
    audit: {
      ...audit,
      maxLeader: Math.round(Math.max(0, ...placed.map(({ g }) => legs(g).reduce((n, [a, b]) => n + Math.hypot(a[0] - b[0], a[1] - b[1]), 0)))),
      search: exact ? `exact · ${trace}` : "greedy",
      unplaced: unplaced.map((i) => input.trains[i].id),
      namesDropped: dropped,
    },
  };
}

/** Collision audit, independent of the placers: counts what is actually drawn. */
function auditBlocks(
  blocks: { g: BlockGeometry; i: number }[],
  polys: Obstacle[],
): Pick<SchematicAudit, "leaderLeader" | "leaderLabel" | "leaderBlock" | "blockLabel"> {
  const labels = polys
    .filter((o) => ["label", "strip", "overlay", "name"].includes(o.kind))
    .map((o) => (o.pad ? { ...o, poly: o.pad } : o));
  let leaderLeader = 0;
  let leaderLabel = 0;
  let blockLabel = 0;
  let leaderBlock = 0;
  for (const A of blocks) {
    const la = legs(A.g);
    for (const B of blocks) {
      if (B.i <= A.i) continue;
      for (const [a, b] of la) for (const [c, d] of legs(B.g)) if (segCross(a, b, c, d)) leaderLeader++;
    }
    for (const [a, b] of la) {
      leaderLabel += labels.filter((o) => segPoly(a, b, o.poly)).length;
      leaderBlock += blocks.filter((B) => B !== A && segPoly(a, b, rectPoly(B.g.box))).length;
    }
    blockLabel += labels.filter((o) => polyPoly(rectPoly(A.g.box), o.poly)).length;
  }
  return { leaderLeader, leaderLabel, leaderBlock, blockLabel };
}

/**
 * Geo label placer (spec 4.5, map.js). Names are placed greedily in priority order, rail is a hard obstacle
 * for station and line names, terminals are never dropped.
 *
 * Name priority: terminals > Amtrak stops > the station a talking train is at or next to > MARC / VRE stops by
 * the number of lines serving them > others. Ranks above "others" claim their slot before any data block.
 */

import {
  type Anchor, Boxes, dist, labelStrip, lerp, namePoly, overlap, padRect, type Pt, type Rect, rectPoly, segPoly, segRect,
} from "./geom";
import type { BlockGeometry } from "$lib/hud/dataBlock";
import { legs, railUnderRect, type PlacementContext } from "./blockPlacer";
import { nearestOn, type RailLine } from "./rail";
import type { Place } from "./types";

export const TERMINALS = new Set(["wash-union", "baltimore-penn"]);
export const TERMINAL_LINES: Record<string, [string, string]> = {
  "wash-union": ["WASHINGTON", "UNION STATION"],
  "baltimore-penn": ["BALTIMORE", "PENN STATION"],
};
/** map short forms for the longest station names (full names stay in the inspector) */
const SHORT_NAMES: Record<string, string> = { "college-park": "College Park", bwi: "BWI Airport", "lorton-auto-train": "Lorton Auto Train" };

export const shortName = (s: { id: string; name: string }): string =>
  (SHORT_NAMES[s.id] ?? s.name)
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/ Station$/, "")
    .replace(/^Washington Union$/, "Washington Union Station")
    .toUpperCase();

/** 0 terminal, 1 Amtrak stop, 2 talking train's station, 3.x by the number of lines serving it */
export function nameRank(place: Place | undefined, talkAdjacent: ReadonlySet<string>): number {
  const lines = place?.lines ?? [];
  if (place && TERMINALS.has(place.id)) return 0;
  if (lines.some((l) => /^Amtrak/.test(l))) return 1;
  if (place && talkAdjacent.has(place.id)) return 2;
  return 3 + (10 - Math.min(9, lines.length)) / 10;
}

export interface StationPos {
  pt: Pt;
  dir: Pt;
}

export interface TextLabel {
  text: string;
  x: number;
  y: number;
  anchor: Anchor;
  /** rotation in degrees about (x, y) */
  rotate?: number;
}

export interface TerminalLabel {
  id: string;
  lines: TextLabel[];
  box: Rect;
  /** 1 px ink-3 tie when the label sits more than 12 px from its box */
  tie: [Pt, Pt] | null;
}

/** A placed name as its glyph polygon, for the rail-under-label audit. */
export interface LabelGlyph {
  kind: "station" | "line" | "terminal";
  text: string;
  poly: Pt[];
  rect?: Rect;
}

export interface LineLabelSpec {
  name: string;
  text: string;
  short: string;
  at: [number, number];
}

export const LINE_LABELS: LineLabelSpec[] = [
  { name: "Northeast Corridor", text: "NORTHEAST CORRIDOR", short: "NEC", at: [-76.36, 39.37] },
  { name: "Capital Subdivision", text: "CSX CAPITAL SUB", short: "CSX CAPITAL", at: [-76.9, 39.035] },
  { name: "CSX RF&P Subdivision", text: "CSX RF&P SUB", short: "CSX RF&P", at: [-77.17, 38.73] },
  { name: "Metropolitan Subdivision", text: "CSX METROPOLITAN SUB", short: "CSX METRO SUB", at: [-77.17, 39.11] },
  { name: "NS Washington District", text: "NS · VRE MANASSAS", short: "NS · VRE", at: [-77.27, 38.79] },
  { name: "Philadelphia Subdivision", text: "CSX PHILADELPHIA SUB", short: "CSX PHILA SUB", at: [-76.36, 39.43] },
  { name: "Popes Creek Subdivision", text: "CSX POPES CREEK SUB", short: "CSX POPES CREEK", at: [-76.83, 38.8] },
  { name: "Old Main Line Subdivision", text: "CSX OLD MAIN LINE", short: "CSX OML", at: [-76.86, 39.31] },
];

export interface LinkSpec {
  /** stable key */
  key: string;
  primary: boolean;
  /** link end points A (feed side) and B (train side) */
  A: Pt;
  B: Pt;
  /** feed-to-train distance in px */
  d: number;
  /** unit vector along the link */
  ux: number;
  uy: number;
  km: number | null;
  snr: string;
  full: string;
}

export interface LinkLabel {
  /** fraction along the link and side (+1 / -1) and extra stand-off the placer chose */
  t: number;
  side: 1 | -1;
  more: number;
  text: string;
}

/** The label placer: owns the claimed boxes it shares with the block placer. */
export class GeoLabeler {
  readonly stationNames: (TextLabel | null)[] = [];
  readonly terminals: TerminalLabel[] = [];
  readonly lineLabels: TextLabel[] = [];
  readonly glyphs: (LabelGlyph | null)[] = [];
  readonly terminalsPlaced: string[] = [];
  readonly namesDropped: string[] = [];
  readonly namesOffView: string[] = [];
  /** early (rank < 3) names by place id, so a block that had to cover one can push it to a new slot */
  private readonly early = new Map<string, { box: Rect; nameIndex: number; glyphIndex: number }>();
  private readonly earlyIds = new Set<string>();

  constructor(
    private readonly ctx: PlacementContext,
    private readonly lines: RailLine[],
    private readonly stationPos: Record<string, StationPos>,
    private readonly placedBlocks: () => BlockGeometry[],
    private readonly project: (p: [number, number]) => Pt,
  ) {}

  private get boxes(): Boxes {
    return this.ctx.boxes;
  }

  isEarly(id: string): boolean {
    return this.earlyIds.has(id);
  }

  /** Station names: both perpendicular sides of the bar, stepping out; then the corner slots; else dropped. */
  placeStation(s: Place, early = false): void {
    const { pt, dir } = this.stationPos[s.id];
    const { width, height, measure } = this.ctx;
    const name = shortName(s);
    const w = measure.tracked(name, "lab11");
    const cap = 8;
    const [nx, ny] = [-dir[1], dir[0]];
    const ext = (Math.abs(nx) * w) / 2 + (Math.abs(ny) * cap) / 2;
    const cands: [number, number, Anchor][] = [];
    for (const d of [7, 10, 14]) {
      for (const side of [1, -1]) {
        cands.push([nx * side * (d + ext), ny * side * (d + ext) + cap / 2, "middle"]);
      }
    }
    cands.push([8, -8, "start"], [-8, -8, "end"], [8, 16, "start"], [-8, 16, "end"], [10, 4, "start"], [-10, 4, "end"], [0, -12, "middle"], [0, 20, "middle"]);
    for (const [dx, dy, anchor] of cands) {
      const [x, y] = [pt[0] + dx, pt[1] + dy];
      const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
      const glyph: Rect = { x0, y0: y - cap, x1: x0 + w, y1: y + 0.5 };
      const box: Rect = { x0: x0 - 2, y0: y - cap - 3, x1: x0 + w + 2, y1: y + 3 };
      // 10 px from any data block, so a name never reads as a third word of a block's line
      if (this.boxes.hits(box) !== 0 || railUnderRect(this.ctx.rail, padRect(glyph, 4)) || this.placedBlocks().some((g) => overlap(padRect(glyph, 10), g.box))) continue;
      this.boxes.add(box);
      if (early) {
        this.ctx.hardNames.push(box);
        this.early.set(s.id, { box, nameIndex: this.stationNames.length, glyphIndex: this.glyphs.length });
      }
      this.glyphs.push({ kind: "station", text: name, poly: rectPoly(padRect(glyph, 2)), rect: padRect(glyph, 2) });
      this.stationNames.push({ text: name, x, y, anchor });
      return;
    }
    const outside = pt[0] < 0 || pt[0] > width || pt[1] < 0 || pt[1] > height;
    (outside ? this.namesOffView : this.namesDropped).push(name);
  }

  placeEarlyStations(stations: Place[], rankOf: (p: Place) => number): void {
    stations
      .filter((s) => !TERMINALS.has(s.id) && rankOf(s) < 3)
      .sort((a, b) => rankOf(a) - rankOf(b))
      .forEach((s) => {
        this.earlyIds.add(s.id);
        this.placeStation(s, true);
      });
  }

  /** An early name a block still had to cover is placed again around the block, or dropped; never overlapped. */
  replaceCovered(stations: Place[]): void {
    const blocks = this.placedBlocks();
    for (const [id, e] of this.early) {
      if (!blocks.some((g) => overlap(e.box, g.box) || legs(g).some(([a, b]) => segRect(a, b, e.box)))) continue;
      this.stationNames[e.nameIndex] = null;
      this.glyphs[e.glyphIndex] = null;
      this.early.delete(id);
      this.placeStation(stations.find((s) => s.id === id)!);
    }
  }

  /**
   * Terminal names never drop: a two-line 13 px label, which may cross rail on a bg-void plate. The cleanest slot
   * wins (no data, then least rail under it).
   */
  placeTerminal(s: Place): void {
    const { pt } = this.stationPos[s.id];
    const { width, height, measure, rail } = this.ctx;
    if (pt[0] < 0 || pt[0] > width || pt[1] < 0 || pt[1] > height) {
      this.terminalsPlaced.push(`${s.id} (off view)`);
      this.namesOffView.push(shortName(s));
      return;
    }
    const [a, b] = TERMINAL_LINES[s.id];
    const [wa, wb] = [measure.tracked(a, "term13"), measure.tracked(b, "term13")];
    const cap = 9;
    const lineHeight = 17;
    const cands: [number, number, Anchor][] = [
      [12, -24, "start"], [-12, -24, "end"], [12, 18, "start"], [-12, 18, "end"], [0, -36, "middle"], [0, 28, "middle"],
      [20, -40, "start"], [-20, -40, "end"], [20, 34, "start"], [-20, 34, "end"], [0, -52, "middle"], [0, 44, "middle"],
      [-24, -56, "end"], [24, -56, "start"], [24, 50, "start"], [-24, 50, "end"],
    ];
    let best: { score: number; x: number; y: number; anchor: Anchor; rects: Rect[]; box: Rect } | null = null;
    cands.forEach(([dx, dy, anchor], k) => {
      const [x, y] = [pt[0] + dx, pt[1] + dy];
      const rects = [a, b].map((_, i) => {
        const w = i ? wb : wa;
        const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
        return { x0, y0: y + i * lineHeight - cap, x1: x0 + w, y1: y + i * lineHeight + 0.5 };
      });
      const box: Rect = {
        x0: Math.min(...rects.map((r) => r.x0)) - 2,
        y0: rects[0].y0 - 3,
        x1: Math.max(...rects.map((r) => r.x1)) + 2,
        y1: rects[1].y1 + 3,
      };
      const outside = box.x0 < 4 || box.x1 > width - 4 || box.y0 < 4 || box.y1 > height - 4;
      const own: Rect = { x0: pt[0] - 8, y0: pt[1] - 8, x1: pt[0] + 8, y1: pt[1] + 8 };
      const data = this.boxes.hits(box) - (overlap(box, own) ? 1 : 0); // its own mark box does not count
      const railCount = rects.reduce((n, r) => n + rail.all.filter(([p, q]) => segRect(p, q, padRect(r, 2))).length, 0);
      const score = (outside ? 1e6 : 0) + Math.max(0, Math.min(data, 99)) * 1000 + railCount * 10 + k;
      if (!best || score < best.score) best = { score, x, y, anchor, rects, box };
    });
    const { x, y, anchor, rects, box } = best!;
    this.boxes.add(box);
    this.ctx.hardNames.push(box);
    this.terminalsPlaced.push(s.id);
    const [nx, ny] = [Math.max(box.x0, Math.min(pt[0], box.x1)), Math.max(box.y0, Math.min(pt[1], box.y1))];
    const d = Math.hypot(nx - pt[0], ny - pt[1]);
    const tie: [Pt, Pt] | null = d > 12 ? [[pt[0] + ((nx - pt[0]) / d) * 8, pt[1] + ((ny - pt[1]) / d) * 8], [nx, ny]] : null;
    this.terminals.push({
      id: s.id,
      lines: [a, b].map((text, i) => ({ text, x, y: y + i * lineHeight, anchor })),
      box,
      tie,
    });
    rects.forEach((r) => this.glyphs.push({ kind: "terminal", text: `${a} ${b}`, poly: rectPoly(padRect(r, 2)), rect: padRect(r, 2) }));
  }

  /**
   * Each line is named once, set on the straight chord through the track near `at`. Rail is a hard obstacle (the
   * glyph box, padded 4 px, may touch no rail segment, its own line included). The name slides along the line to a
   * clear stretch; failing that it takes its short form; failing that it is dropped.
   */
  placeLineLabels(specs = LINE_LABELS): void {
    const { width, height, measure, rail } = this.ctx;
    const railUnderPoly = (poly: Pt[]): boolean => {
      const xs = poly.map((p) => p[0]);
      const ys = poly.map((p) => p[1]);
      const bb: Rect = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      return rail.all.some(([a, c]) => segRect(a, c, bb) && segPoly(a, c, poly));
    };
    for (const spec of specs) {
      const onLine = (l: RailLine): boolean => l.name === spec.name;
      const pref = this.project(spec.at);
      const cands: Pt[] = [];
      for (const line of this.lines.filter(onLine)) {
        for (const q of line.pts) if (q[0] > 0 && q[0] < width && q[1] > 0 && q[1] < height) cands.push(q);
      }
      cands.sort((a, b) => dist(a, pref) - dist(b, pref));
      this.placeLine(spec, cands, onLine, railUnderPoly, measure.tracked.bind(measure));
    }
  }

  private placeLine(
    spec: LineLabelSpec,
    cands: Pt[],
    onLine: (l: RailLine) => boolean,
    railUnderPoly: (poly: Pt[]) => boolean,
    tracked: (t: string, f: "line11") => number,
  ): boolean {
    for (const text of [spec.text, spec.short]) {
      const tw = tracked(text, "line11");
      const half = tw / 2 + 10;
      for (const q of cands.slice(0, 400)) {
        const a = nearestOn(this.lines, q, onLine, 2);
        if (!a) continue;
        const b0 = nearestOn(this.lines, [a.pt[0] - a.dir[0] * half, a.pt[1] - a.dir[1] * half], onLine, 10);
        const b1 = nearestOn(this.lines, [a.pt[0] + a.dir[0] * half, a.pt[1] + a.dir[1] * half], onLine, 10);
        if (!b0 || !b1 || dist(b0.pt, b1.pt) < half * 1.8) continue; // the track must run straight under the name
        let [p0, p1] = [b0.pt, b1.pt];
        if (p0[0] > p1[0]) [p0, p1] = [p1, p0];
        const angle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        const m = lerp(p0, p1, 0.5);
        for (const off of [10, 13, 16]) {
          for (const side of [1, -1]) {
            const c: Pt = [m[0] + Math.sin(angle) * side * off, m[1] - Math.cos(angle) * side * off];
            const strip = labelStrip(c, angle, tw, 10);
            if (!strip.every((b) => this.boxes.hits(b, 16) === 0) || railUnderPoly(namePoly(c, angle, tw, 4))) continue;
            strip.forEach((b) => this.boxes.add(b));
            this.glyphs.push({ kind: "line", text, poly: namePoly(c, angle, tw, 2) });
            this.lineLabels.push({ text, x: c[0], y: c[1], anchor: "middle", rotate: (angle * 180) / Math.PI });
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Link labels, placed after the blocks (the link paths were reserved first). The primary link slides along its
   * length and steps off the link, then falls back to the SNR alone; a secondary simply drops.
   */
  placeLinkLabel(link: LinkSpec): LinkLabel | null {
    const { measure } = this.ctx;
    const angle = Math.atan2(link.uy, link.ux);
    const deg = (angle * 180) / Math.PI;
    const up = deg > 90 || deg < -90 ? deg + 180 : deg;
    const upRad = (up * Math.PI) / 180;
    const tries: [string, number[]][] = link.primary ? [[link.full, [0, 4]], [link.snr, [0, 4, 8]]] : [[link.full, [0]]];
    const ts = link.primary
      ? [0.5, 0.35, 0.65, 0.25, 0.75, 0.42, 0.58, 0.3, 0.7, 0.2, 0.8]
      : [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.8];
    for (const [text, extra] of tries) {
      const w = measure.exact(text, "mono11");
      if (w > link.d * 0.9) continue;
      for (const more of extra) {
        for (const t of ts) {
          for (const side of [1, -1] as const) {
            const c = linkLabelCentre(link, { t, side, more }, up);
            const strip = labelStrip(c, upRad, w + 4, 10);
            if (strip.every((b) => this.boxes.hits(b, 0) === 0)) {
              strip.forEach((b) => this.boxes.add(b));
              return { t, side, more, text };
            }
          }
        }
      }
    }
    return null;
  }
}

/** Where a link label sits: along the link, `9 + more` px off it (a little further on a diagonal). */
export function linkLabelCentre(link: Pick<LinkSpec, "A" | "B" | "ux" | "uy">, at: Pick<LinkLabel, "t" | "side" | "more">, upDeg: number): Pt {
  const rad = (upDeg * Math.PI) / 180;
  const off = 9 + at.more + 4 * Math.abs(Math.sin(2 * rad));
  const m = lerp(link.A, link.B, at.t);
  return [m[0] + Math.sin(rad) * at.side * off, m[1] - Math.cos(rad) * at.side * off];
}

/** Text angle for a link label: along the link, never upside down. */
export function linkLabelAngle(link: Pick<LinkSpec, "ux" | "uy">): number {
  const deg = (Math.atan2(link.uy, link.ux) * 180) / Math.PI;
  return deg > 90 || deg < -90 ? deg + 180 : deg;
}

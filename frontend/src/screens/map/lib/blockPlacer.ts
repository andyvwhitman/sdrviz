/**
 * Geo data-block placer (spec 4.5, map.js `placeBlock`). Each block tries eight directions at growing leader
 * lengths; the cheapest clean candidate wins. Hard rules: no block within 4 px of another, no leader over
 * another block, no leader longer than 64 px, no leader running along rail. Soft costs: text under the block,
 * rail through it, leaders crossing rail, leader length.
 */

import { type BlockGeometry, type BlockOptions, blockGeometry, type Direction } from "$lib/hud/dataBlock";
import { Boxes, dist, overlap, padRect, type Pt, type Rect, segCross, segDistance, segRect } from "./geom";
import type { Font, Measure } from "./measure";

export const LEAD_MAX = 64;
const ALL_DIRECTIONS: Direction[] = ["ne", "nw", "se", "sw", "e", "w", "n", "s"];
const LENGTHS = [24, 40, 56, 72];
const COS25 = Math.cos((25 * Math.PI) / 180);

export interface RailSegments {
  /** every rail segment touching the canvas */
  all: [Pt, Pt][];
  /** the same, per line (a block counts each line that passes through it once) */
  byLine: [Pt, Pt][][];
}

export interface PlacementContext {
  width: number;
  height: number;
  boxes: Boxes;
  rail: RailSegments;
  /** names claimed before the data blocks: no block plate or leader may cover them */
  hardNames: Rect[];
  measure: Measure;
}

export const legs = (g: { lead: Pt[] }): [Pt, Pt][] => g.lead.slice(1).map((p, k) => [g.lead[k], p]);
export const leaderLength = (g: { lead: Pt[] }): number => legs(g).reduce((n, [a, b]) => n + dist(a, b), 0);

/** Block geometry measured with the placer's fonts. */
export function measuredBlock(measure: Measure, o: BlockOptions): BlockGeometry {
  return blockGeometry(o, (text, kind) => (kind === "mono12" ? measure.exact(text, "mono12") : measure.tracked(text, "lab11" as Font)));
}

export const railUnderRect = (rail: RailSegments, b: Rect): boolean => rail.all.some(([a, c]) => segRect(a, c, b));
export const railLinesThrough = (rail: RailSegments, b: Rect): number =>
  rail.byLine.reduce((n, segs) => n + (segs.some(([a, c]) => segRect(a, c, b)) ? 1 : 0), 0);

/** Leaders cross rail but never run along it: a run over 8 px within 4 px of a rail segment within 25 degrees. */
export function leaderRunsAlongRail(rail: RailSegments, g: { lead: Pt[] }): boolean {
  for (const [a, b] of legs(g)) {
    const length = dist(a, b);
    if (length < 8) continue;
    const [ux, uy] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const bbox: Rect = { x0: Math.min(a[0], b[0]) - 4, y0: Math.min(a[1], b[1]) - 4, x1: Math.max(a[0], b[0]) + 4, y1: Math.max(a[1], b[1]) + 4 };
    const near = rail.all.filter(([c, d]) => {
      if (!segRect(c, d, bbox)) return false;
      const l = dist(c, d) || 1;
      return Math.abs(((d[0] - c[0]) * ux + (d[1] - c[1]) * uy) / l) >= COS25;
    });
    if (!near.length) continue;
    let run = 0;
    for (let k = 0; k <= length; k++) {
      const q: Pt = [a[0] + ux * k, a[1] + uy * k];
      run = near.some(([c, d]) => segDistance(q, c, d) <= 4) ? run + 1 : 0;
      if (run > 8) return true;
    }
  }
  return false;
}

const leaderCells = (g: BlockGeometry): Rect[] => {
  const n = Math.max(1, Math.ceil(dist([g.sx, g.sy], [g.ex, g.ey]) / 6));
  return Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    const q: Pt = [g.sx + ((g.ex - g.sx) * k) / n, g.sy + ((g.ey - g.sy) * k) / n];
    return { x0: q[0] - 2, y0: q[1] - 2, x1: q[0] + 2, y1: q[1] + 2 };
  });
};

export class BlockPlacer {
  readonly placed: BlockGeometry[] = [];

  constructor(private readonly ctx: PlacementContext) {}

  private clashesPlaced(g: BlockGeometry): boolean {
    const box2 = padRect(g.box, 2);
    const mine = legs(g);
    return this.placed.some(
      (h) =>
        overlap(box2, padRect(h.box, 2)) ||
        mine.some(([a, b]) => segRect(a, b, padRect(h.box, 2))) ||
        legs(h).some(([a, b]) => segRect(a, b, box2)),
    );
  }

  private railCrossings(g: BlockGeometry): number {
    return legs(g).reduce((n, [a, b]) => n + this.ctx.rail.all.filter(([c, d]) => segCross(a, b, c, d)).length, 0);
  }

  private coversName(g: BlockGeometry): number {
    return this.ctx.hardNames.filter((r) => overlap(g.box, r) || legs(g).some(([a, b]) => segRect(a, b, r))).length;
  }

  /**
   * Place one block. Pass 1 treats names claimed earlier as hard; pass 2 (only if pass 1 found nothing) lets a
   * block cover one at a cost, and the name is re-placed around it afterwards. `soft(box)` adds a cost per rail line.
   */
  place(
    base: Omit<BlockOptions, "dir">,
    dirs: Direction[] = ALL_DIRECTIONS,
    soft?: (box: Rect) => number,
  ): BlockGeometry {
    const { boxes, measure } = this.ctx;
    let best: { g: BlockGeometry; cost: number } | null = null;
    for (const strictNames of [true, false]) {
      if (best) break;
      LENGTHS.forEach((len, li) =>
        dirs.forEach((dir) => {
          const g = measuredBlock(measure, { ...base, dir, len: Math.min(len, LEAD_MAX + (base.from ?? 0)) });
          if (leaderLength(g) > LEAD_MAX + 0.01 || this.clashesPlaced(g) || leaderRunsAlongRail(this.ctx.rail, g)) return;
          const covered = this.coversName(g);
          if (strictNames && covered) return;
          const hard = boxes.hits(g.box) * 10 + leaderCells(g).reduce((a, b) => a + boxes.hits(b, 0), 0);
          if (hard === Infinity) return;
          const cost = hard + 50 * covered + (soft ? 3 * soft(g.box) : 0) + 2 * this.railCrossings(g) + li * 0.5;
          if (!best || cost < best.cost) best = { g, cost };
        }),
      );
    }
    const g = best ? (best as { g: BlockGeometry }).g : measuredBlock(measure, { ...base, dir: dirs[0], len: LENGTHS[0] });
    this.claim(g);
    return g;
  }

  private claim(g: BlockGeometry): void {
    this.ctx.boxes.add(g.box);
    leaderCells(g).forEach((b) => this.ctx.boxes.add(b));
    this.placed.push(g);
  }
}

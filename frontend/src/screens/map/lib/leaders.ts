/**
 * Leaders for the real-train labels: a 45 degree diagonal to an elbow, then a horizontal shelf the label sits on.
 * `chooseQuadrant` picks the corner and reach each label hangs in, clear of station names, marks and other labels.
 */
import { overlap, segRect, type Pt, type Rect } from "./geom";

export type Quadrant = "UR" | "DR" | "UL" | "DL";

/** Tie-break order. */
export const QUADRANTS: readonly Quadrant[] = ["UR", "DR", "UL", "DL"];

/** Neighbours are counted within this screen distance. */
export const NEIGHBOUR_R = 96;
/** A placement must beat the current one by this much cost before a label moves. */
export const HYSTERESIS = 2;
/** A label box keeps this far from the canvas edge. */
export const EDGE_MARGIN = 12;

const START = 9.2;
/** The diagonal's run in x and in y, by tier: the elbow is at START + REACH[tier]. */
export const REACH = [40, 64] as const;
const GAP = 4;
const SHELF_PAD = 8;
/** Half the side of the square a drawn train's mark blocks. */
const MARK_HALF = 13;
/** The label box reaches this far above the shelf and 2 px below it. */
const BOX_UP = 18;
const BOX_DOWN = 2;
const HIT_COST = 100;
const TIER_COST = 10;

export type Tier = 0 | 1;
export interface Placement {
  q: Quadrant;
  tier: Tier;
}

/** Candidates in tie order: the short leaders first. */
export const CANDIDATES: readonly Placement[] = ([0, 1] as const).flatMap((tier) => QUADRANTS.map((q) => ({ q, tier })));

const elbowOf = (tier: Tier, scale: number): number => (START + REACH[tier]) * scale;

export interface LeaderPoint {
  id: string;
  /** screen position */
  pos: Pt;
  /** width of the label text; absent when the train carries no label */
  labelWidth?: number;
  /** the mark's scale (0.7 when crowded) */
  scale?: number;
}

export interface Canvas {
  width: number;
  height: number;
}

/** Signs of x and y (screen y grows downward, so up is -1) for a quadrant. */
const sign = (q: Quadrant): Pt => [q[1] === "R" ? 1 : -1, q[0] === "D" ? 1 : -1];

/** Other points within R in each quadrant. A neighbour on an axis counts in both quadrants beside it. */
function crowding(p: LeaderPoint, points: readonly LeaderPoint[]): Record<Quadrant, number> {
  const counts: Record<Quadrant, number> = { UR: 0, DR: 0, UL: 0, DL: 0 };
  for (const o of points) {
    if (o.id === p.id) continue;
    const dx = o.pos[0] - p.pos[0];
    const dy = o.pos[1] - p.pos[1];
    if (Math.hypot(dx, dy) > NEIGHBOUR_R) continue;
    for (const q of QUADRANTS) {
      const [sx, sy] = sign(q);
      if (dx * sx >= 0 && dy * sy >= 0) counts[q]++;
    }
  }
  return counts;
}

/** The label's box (elbow to shelf end, a line of text tall) in screen space. */
export function labelBox(p: LeaderPoint, { q, tier }: Placement): Rect {
  const s = p.scale ?? 1;
  const [sx, sy] = sign(q);
  const elbowX = p.pos[0] + sx * elbowOf(tier, s);
  const elbowY = p.pos[1] + sy * elbowOf(tier, s);
  const farX = elbowX + sx * ((p.labelWidth ?? 0) + SHELF_PAD * s);
  return { x0: Math.min(elbowX, farX), x1: Math.max(elbowX, farX), y0: elbowY - BOX_UP, y1: elbowY + BOX_DOWN };
}

/** Whether the label box stays inside the canvas (with the margin). */
function fits(p: LeaderPoint, c: Placement, canvas: Canvas): boolean {
  const box = labelBox(p, c);
  const elbowY = p.pos[1] + sign(c.q)[1] * elbowOf(c.tier, p.scale ?? 1);
  return box.x0 >= EDGE_MARGIN && box.x1 <= canvas.width - EDGE_MARGIN && elbowY >= EDGE_MARGIN && elbowY <= canvas.height - EDGE_MARGIN;
}

const markSquare = (o: LeaderPoint): Rect => {
  const h = MARK_HALF * (o.scale ?? 1);
  return { x0: o.pos[0] - h, y0: o.pos[1] - h, x1: o.pos[0] + h, y1: o.pos[1] + h };
};

/** Obstacles the label box overlaps, plus the other marks the diagonal crosses. */
function hitsOf(p: LeaderPoint, c: Placement, avoid: readonly Rect[], marks: readonly Rect[], placed: readonly Rect[]): number {
  const box = labelBox(p, c);
  const s = p.scale ?? 1;
  const [sx, sy] = sign(c.q);
  const from: Pt = [p.pos[0] + sx * START * s, p.pos[1] + sy * START * s];
  const elbow: Pt = [p.pos[0] + sx * elbowOf(c.tier, s), p.pos[1] + sy * elbowOf(c.tier, s)];
  let hits = 0;
  for (const r of [...avoid, ...marks, ...placed]) if (overlap(box, r)) hits++;
  for (const m of marks) if (segRect(from, elbow, m)) hits++;
  return hits;
}

const same = (a: Placement, b: Placement): boolean => a.q === b.q && a.tier === b.tier;

/**
 * The placement for every point that has a label, placed one at a time in id order. Each of the 8 candidates costs
 * 100 per hit (a station name or terminal block in `avoid`, another train's mark, a label already placed, a mark the
 * diagonal crosses) + 10 for the long tier + the neighbours in its quadrant. The cheapest wins, ties in CANDIDATES order.
 * A label keeps its previous placement unless that no longer fits, hits more than the best, or the best is at least
 * HYSTERESIS cheaper. If nothing fits (a tiny canvas) all candidates are open.
 */
export function chooseQuadrant(
  points: readonly LeaderPoint[],
  prev: ReadonlyMap<string, Placement>,
  canvas: Canvas,
  avoid: readonly Rect[] = [],
): Map<string, Placement> {
  const chosen = new Map<string, Placement>();
  const placed: Rect[] = [];
  const labelled = points.filter((p) => p.labelWidth !== undefined).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const p of labelled) {
    const counts = crowding(p, points);
    const marks = points.filter((o) => o.id !== p.id).map(markSquare);
    const fitting = CANDIDATES.filter((c) => fits(p, c, canvas));
    const open = fitting.length > 0 ? fitting : CANDIDATES;
    const scored = open.map((c) => {
      const hits = hitsOf(p, c, avoid, marks, placed);
      return { c, hits, cost: HIT_COST * hits + TIER_COST * c.tier + counts[c.q] };
    });
    const best = scored.reduce((a, b) => (b.cost < a.cost ? b : a));
    const before = prev.get(p.id);
    const old = before && scored.find((e) => same(e.c, before));
    const keep = old && old.hits <= best.hits && best.cost > old.cost - HYSTERESIS;
    const pick = keep ? old.c : best.c;
    chosen.set(p.id, pick);
    placed.push(labelBox(p, pick));
  }
  return chosen;
}

export interface LeaderShape {
  /** diagonal: from the ring to the elbow */
  from: Pt;
  elbow: Pt;
  /** the shelf's far end */
  end: Pt;
  /** text anchor point, relative to the mark's centre */
  text: Pt;
  anchor: "start" | "end";
}

/** Leader geometry relative to the mark's centre. Lengths scale with the mark; the label text does not. */
export function leaderShape(q: Quadrant, labelWidth: number, scale = 1, tier: Tier = 0): LeaderShape {
  const [sx, sy] = sign(q);
  const e = elbowOf(tier, scale);
  const elbow: Pt = [sx * e, sy * e];
  const shelf = labelWidth + SHELF_PAD * scale;
  return {
    from: [sx * START * scale, sy * START * scale],
    elbow,
    end: [elbow[0] + sx * shelf, elbow[1]],
    text: [elbow[0] + sx * GAP * scale, elbow[1] - GAP],
    anchor: sx > 0 ? "start" : "end",
  };
}

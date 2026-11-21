/**
 * Leaders for the real-train labels: a 45 degree diagonal to an elbow, then a horizontal shelf the label sits on.
 * `chooseQuadrant` picks the corner each label hangs in, so labels lean away from their neighbours.
 */
import type { Pt } from "./geom";

export type Quadrant = "UR" | "DR" | "UL" | "DL";

/** Tie-break order. */
export const QUADRANTS: readonly Quadrant[] = ["UR", "DR", "UL", "DL"];

/** Neighbours are counted within this screen distance. */
export const NEIGHBOUR_R = 96;
/** A quadrant must beat the current one by this many neighbours before a label moves. */
export const HYSTERESIS = 2;
/** A label box keeps this far from the canvas edge. */
export const EDGE_MARGIN = 12;

const START = 9.2;
const ELBOW = 37.2;
const GAP = 4;
const SHELF_PAD = 8;

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

/** Whether the label box in quadrant `q` stays inside the canvas (with the margin). */
function fits(p: LeaderPoint, q: Quadrant, canvas: Canvas): boolean {
  const s = p.scale ?? 1;
  const [sx, sy] = sign(q);
  const shelfEnd = p.pos[0] + sx * (ELBOW * s + (p.labelWidth ?? 0) + SHELF_PAD * s);
  const elbowY = p.pos[1] + sy * ELBOW * s;
  return shelfEnd >= EDGE_MARGIN && shelfEnd <= canvas.width - EDGE_MARGIN && elbowY >= EDGE_MARGIN && elbowY <= canvas.height - EDGE_MARGIN;
}

/**
 * The quadrant for every point that has a label: the one with the fewest neighbours, ties in the order UR, DR, UL, DL.
 * A label keeps its previous quadrant unless that no longer fits or another is at least HYSTERESIS neighbours better.
 * If no quadrant fits (a tiny canvas) all are candidates.
 */
export function chooseQuadrant(points: readonly LeaderPoint[], prev: ReadonlyMap<string, Quadrant>, canvas: Canvas): Map<string, Quadrant> {
  const chosen = new Map<string, Quadrant>();
  for (const p of points) {
    if (p.labelWidth === undefined) continue;
    const counts = crowding(p, points);
    const fitting = QUADRANTS.filter((q) => fits(p, q, canvas));
    const open = fitting.length > 0 ? fitting : QUADRANTS;
    const best = open.reduce((a, b) => (counts[b] < counts[a] ? b : a));
    const before = prev.get(p.id);
    const keep = before !== undefined && open.includes(before) && counts[best] > counts[before] - HYSTERESIS;
    chosen.set(p.id, keep ? before : best);
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
export function leaderShape(q: Quadrant, labelWidth: number, scale = 1): LeaderShape {
  const [sx, sy] = sign(q);
  const elbow: Pt = [sx * ELBOW * scale, sy * ELBOW * scale];
  const shelf = labelWidth + SHELF_PAD * scale;
  return {
    from: [sx * START * scale, sy * START * scale],
    elbow,
    end: [elbow[0] + sx * shelf, elbow[1]],
    text: [elbow[0] + sx * GAP * scale, elbow[1] - GAP],
    anchor: sx > 0 ? "start" : "end",
  };
}

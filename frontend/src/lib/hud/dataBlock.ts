/**
 * M8 data block geometry (spec 5.13). One leader leaves a point at one of eight compass
 * directions; the two-line tag sits past the leader's end. Ported from HUD.svg.dataBlock and
 * map.js `blockGeom`, which adds the options the shared builder lacked: a glyph slot before
 * line 1, a state class on line 2, a start offset (`from`), an orthogonal first leg (`v`) and
 * the vertical flagpole (`n`/`s`, with `flip` to end the block flush at the pole).
 */

export type Direction = "ne" | "e" | "se" | "s" | "sw" | "w" | "nw" | "n";

const DIRECTIONS: Record<Direction, [number, number]> = {
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
  nw: [-1, -1],
  n: [0, -1],
};

export interface BlockOptions {
  /** the point the leader leaves */
  x: number;
  y: number;
  dir: Direction;
  /** leader length in px (default 24) */
  len?: number;
  /** start the leader this far out from the point (feed sites leave a gap) */
  from?: number;
  /** orthogonal run before the 45 degree leg (Beck style dogleg) */
  v?: number;
  /** flagpole: end the block flush at the pole instead of starting past it */
  flip?: boolean;
  l1: string;
  l2: string;
  sim?: boolean;
  tx?: boolean;
  /** M6 glyph before line 1 */
  glyph?: string;
  /** state class on line 2 */
  l2Class?: string;
}

export interface BlockGeometry extends BlockOptions {
  /** leader start and end */
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  /** text origin */
  tx_: number;
  ty: number;
  /** the tag lies to the left of the leader end */
  left: boolean;
  glyphWidth: number;
  /** width of line 1 (with SIM) and line 2 */
  w1: number;
  w2: number;
  w: number;
  /** polyline of the leader */
  lead: [number, number][];
  /** knockout / collision box */
  box: { x0: number; y0: number; x1: number; y1: number };
}

/** Advance of JetBrains Mono per em; the labels use a condensed face around 0.62 em plus tracking. */
const MONO_ADVANCE = 0.6;
const LABEL_ADVANCE = 0.66;

/** Text width in px. Screens that can measure (canvas) pass their own. */
export type TextMeasure = (text: string, kind: "mono12" | "lab11") => number;

export const estimateTextWidth: TextMeasure = (text, kind) =>
  text.length * (kind === "mono12" ? 12 * MONO_ADVANCE : 11 * LABEL_ADVANCE);

export function blockGeometry(o: BlockOptions, measure: TextMeasure = estimateTextWidth): BlockGeometry {
  const [dx, dy] = DIRECTIONS[o.dir];
  const diagonal = dx !== 0 && dy !== 0;
  const len = o.len ?? 24;
  const reach = diagonal ? len / Math.SQRT2 : len;
  const from = o.from ?? 0;
  const v = o.v ?? 0;

  let sx = o.x + (dx * from) / (diagonal ? Math.SQRT2 : 1);
  let sy = o.y + (dy * from) / (diagonal ? Math.SQRT2 : 1);
  const kx = o.x;
  const ky = o.y + dy * v;
  if (v) {
    sx = o.x;
    sy = o.y + dy * from;
  }
  const ex = kx + dx * reach;
  const ey = ky + dy * reach;
  const left = dx < 0 || (dx === 0 && !!o.flip);

  const tx_ = ex + (dx < 0 ? -4 : dx > 0 ? 4 : 0);
  // a vertical leader is a flagpole: the block sits wholly past its end, so the pole never runs through a glyph
  const ty = dx === 0 ? (dy > 0 ? ey + 14 : ey - 21) : dy > 0 ? ey + 12 : ey - 6;

  const glyphWidth = o.glyph ? 18 : 0;
  const w1 = measure(o.l1, "mono12") + (o.sim ? 6 + measure("SIM", "lab11") : 0);
  const w2 = measure(o.l2, "mono12");
  const w = Math.max(w1 + glyphWidth, w2);
  const x0 = left ? tx_ - w : tx_;
  const lead: [number, number][] = v
    ? [[sx, sy], [kx, ky], [ex, ey]]
    : [[sx, sy], [ex, ey]];

  return {
    ...o,
    sx,
    sy,
    ex,
    ey,
    tx_,
    ty,
    left,
    glyphWidth,
    w1,
    w2,
    w,
    lead,
    box: { x0: x0 - 2, y0: ty - 12, x1: x0 + w + 2, y1: ty + 19 },
  };
}

/** SVG path data for a polyline. */
export const polyline = (points: [number, number][]): string =>
  points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join("");

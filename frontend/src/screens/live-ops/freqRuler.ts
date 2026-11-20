/**
 * The spectrograph's axis labels (docs/sprint-4/axis-labels.md, E-2): every labelled channel gets a short 45 degree
 * tail from its tick and a label `54 160.920` reading bottom-up; when neighbouring labels would touch, the run becomes
 * a bracket (an M12 dimension rule across its members) with one two-line label `20–25` / `160.410`. Pure layout: it
 * returns the primitives the SVG draws (ticks, tails, rules, text origins and strings), and the tests run on those.
 *
 * Coordinates in the result are SVG pixels: x from the plot's left edge, y from the ruler's top. The ruler's axis line
 * (between it and the waterfall) is y = `height`; the spec's "y up from the axis" is `height - y`.
 *
 * The layout depends only on the width, the screen class, the labelled set and the extras. Keyed, selected and stale
 * never move anything (the renderer changes colour and stroke only).
 */

import { BAND, chToMhz } from "$lib/hud/band";

export type AxisClass = "desktop" | "portrait" | "landscape";

export interface AxisMetrics {
  /** font px (JetBrains Mono) */
  f: number;
  /** advance, ink height of a digit, bracket line pitch */
  adv: number;
  cap: number;
  lead: number;
  /** clear gap between labels, in the rotated frame */
  G: number;
  /** labelled tick height, tail run (dx = dy), bracket rule height */
  tick: number;
  t: number;
  ruleY: number;
  /** ruler height, right label margin, scale strip height */
  H: number;
  M: number;
  strip: number;
}

const metrics = (f: number, G: number, tick: number, ruleY: number, H: number, M: number, strip: number): AxisMetrics => ({
  f,
  adv: 0.6 * f,
  cap: 0.73 * f,
  lead: 1.2 * f,
  G,
  tick,
  t: 4,
  ruleY,
  H,
  M,
  strip,
});

export const METRICS: Record<AxisClass, AxisMetrics> = {
  desktop: metrics(11, 4, 8, 5, 68, 56, 14),
  portrait: metrics(13, 5, 6, 4, 76, 0, 18),
  landscape: metrics(13, 5, 6, 4, 76, 66, 18),
};

/** The handset spectrum layer: a wall under 600 px is the portrait form, a wider one the landscape form. */
export const phoneClass = (wallWidth: number): AxisClass => (wallWidth < 600 ? "portrait" : "landscape");

export interface AxisInput {
  /** plot width, CSS px (the wall's inner width less the right margin) */
  width: number;
  cls: AxisClass;
  /** the listed channels the displayed feed hears */
  labelled: readonly number[];
  /** unlisted keyed channels, and the selected channel when it is not labelled */
  extras?: readonly number[];
  /** channels the displayed feed hears (8 px faint ticks) */
  hears?: readonly number[];
}

export interface Pt {
  x: number;
  y: number;
}

export interface Seg {
  a: Pt;
  b: Pt;
}

/** One `<text>`: rotated -45 degrees about `origin` (already raised 1.5 px off the baseline), in runs of one style each. */
export interface TextLabel {
  origin: Pt;
  runs: { text: string; role: "channel" | "freq" | "range" | "dash" }[];
  /** which member's number a run belongs to, for keyed and selected styling (channel and range runs) */
  members: (number | null)[];
}

export interface RulerItem {
  kind: "single" | "bracket";
  members: number[];
  extra?: boolean;
  /** the first member's tick and the tail that continues it */
  tick: Seg;
  tail: Seg;
  rule?: Seg;
  texts: TextLabel[];
}

export type TickTone = "line" | "faint";
export interface RulerTick {
  ch: number;
  x: number;
  length: number;
  tone: TickTone;
  /** a member of a bracket (its tick runs through the rule) or a bare labelled tick */
  role: "slot" | "label" | "member" | "bare";
}

export interface ScaleNumeral {
  ch: number;
  /** the tick's true x */
  x: number;
  /** where the numeral is centred: slid inward near a plot edge */
  textX: number;
  text: string;
}

export interface RulerLayout {
  cls: AxisClass;
  m: AxisMetrics;
  width: number;
  height: number;
  ticks: RulerTick[];
  items: RulerItem[];
  extraSingles: RulerItem[];
  bare: number[];
  bareExtras: number[];
  scale: ScaleNumeral[];
}

const R2 = Math.SQRT1_2;
/** each label sits 1.5 px above its baseline, perpendicular to it (up and to the left) */
const RAISE = 1.5 * R2;

/** The true slot centre of a channel on a plot `width` px wide. */
export const X = (ch: number, width: number): number => Math.round(((ch - BAND.first) * (width - 1)) / (BAND.last - BAND.first)) + 0.5;

// ---- rotated frame: u along the text, v across it; all labels are parallel, so overlap is a box test
interface Box {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}
const uv = (x: number, y: number): { u: number; v: number } => ({ u: (x + y) * R2, v: (y - x) * R2 });

const boxesSingle = (x: number, m: AxisMetrics): Box[] => {
  const S = uv(x + m.t, m.tick + m.t);
  return [{ u0: S.u, u1: S.u + 10 * m.adv, v0: S.v, v1: S.v + m.cap }];
};
const boxesBracket = (x: number, m: AxisMetrics): Box[] => {
  const S = uv(x + m.t, m.tick + m.t);
  return [
    { u0: S.u, u1: S.u + 5 * m.adv, v0: S.v, v1: S.v + m.cap },
    { u0: S.u + m.lead, u1: S.u + m.lead + 7 * m.adv, v0: S.v - m.lead, v1: S.v - m.lead + m.cap },
  ];
};
const collide = (A: Box[], B: Box[], G: number): boolean =>
  A.some((a) => B.some((b) => a.u0 < b.u1 + G && b.u0 < a.u1 + G && a.v0 < b.v1 + G && b.v0 < a.v1 + G));
const xRight = (boxes: Box[]): number => Math.max(...boxes.map((b) => (b.u1 - b.v0) * R2));

const p2 = (n: number): string => String(n).padStart(2, "0");
const unique = (list: readonly number[]): number[] => [...new Set(list)].sort((a, b) => a - b);

export function rulerLayout({ width, cls, labelled, extras = [], hears = [] }: AxisInput): RulerLayout {
  const m = METRICS[cls];
  const H = m.H;
  const x = (ch: number): number => X(ch, width);
  const L = unique(labelled);
  const boxesOf = (it: { kind: string; members: number[] }): Box[] => (it.kind === "single" ? boxesSingle(x(it.members[0]), m) : boxesBracket(x(it.members[0]), m));

  // pass 1: singles and brackets, left to right
  const runs: { kind: "single" | "bracket"; members: number[] }[] = [];
  for (let i = 0; i < L.length; ) {
    const s = L[i];
    if (i === L.length - 1 || !collide(boxesSingle(x(s), m), boxesSingle(x(L[i + 1]), m), m.G)) {
      runs.push({ kind: "single", members: [s] });
      i++;
      continue;
    }
    let j = i + 1;
    while (j < L.length && collide(boxesBracket(x(s), m), boxesSingle(x(L[j]), m), m.G)) j++;
    runs.push({ kind: "bracket", members: L.slice(i, j) });
    i = j;
  }

  // pass 2: the right edge (it only bites with no margin, in phone portrait): what would cross it becomes bare ticks
  let bare: number[] = [];
  while (runs.length && xRight(boxesOf(runs[runs.length - 1])) > width + m.M + 1e-6) bare = runs.pop()!.members.concat(bare);

  // pass 3: extras are additive and never move a listed item
  const placed = runs.map(boxesOf);
  const extraRuns: { kind: "single"; members: number[]; extra: true }[] = [];
  const bareExtras: number[] = [];
  for (const e of unique(extras)) {
    if (L.includes(e)) continue;
    const b = boxesSingle(x(e), m);
    const inSpan = runs.some((it) => it.kind === "bracket" && x(it.members[0]) <= x(e) && x(e) <= x(it.members[it.members.length - 1]));
    if (inSpan || placed.some((p) => collide(p, b, m.G)) || xRight(b) > width + m.M + 1e-6) bareExtras.push(e);
    else {
      extraRuns.push({ kind: "single", members: [e], extra: true });
      placed.push(b);
    }
  }

  // ---- primitives
  const svg = (px: number, py: number): Pt => ({ x: px, y: H - py });
  const label = (ox: number, oy: number): Pt => svg(ox - RAISE, oy + RAISE);
  const build = (run: { kind: "single" | "bracket"; members: number[]; extra?: true }): RulerItem => {
    const first = run.members[0];
    const x0 = x(first);
    const item: RulerItem = {
      kind: run.kind,
      members: run.members,
      extra: run.extra,
      tick: { a: svg(x0, 0), b: svg(x0, m.tick) },
      tail: { a: svg(x0, m.tick), b: svg(x0 + m.t, m.tick + m.t) },
      texts: [],
    };
    const originX = x0 + m.t;
    const originY = m.tick + m.t;
    if (run.kind === "single") {
      item.texts.push({
        origin: label(originX, originY),
        runs: [
          { text: p2(first), role: "channel" },
          { text: ` ${chToMhz(first).toFixed(3)}`, role: "freq" },
        ],
        members: [first, null],
      });
    } else {
      const last = run.members[run.members.length - 1];
      item.rule = { a: svg(x0, m.ruleY), b: svg(x(last), m.ruleY) };
      item.texts.push({
        origin: label(originX, originY),
        runs: [
          { text: p2(first), role: "range" },
          { text: "–", role: "dash" },
          { text: p2(last), role: "range" },
        ],
        members: [first, null, last],
      });
      item.texts.push({
        origin: label(originX + m.lead * Math.SQRT2, originY),
        runs: [{ text: chToMhz(first).toFixed(3), role: "freq" }],
        members: [first],
      });
    }
    return item;
  };
  const items = runs.map(build);
  const extraSingles = extraRuns.map(build);

  // ---- ticks: M2's rhythm, amended by the labels
  const heard = new Set(hears);
  const memberTick = Math.max(m.tick, m.ruleY + 3);
  const spans = runs.filter((r) => r.kind === "bracket").map((r) => [x(r.members[0]), x(r.members[r.members.length - 1])] as const);
  const role = new Map<number, RulerTick["role"]>();
  for (const r of runs) for (const ch of r.members) role.set(ch, r.kind === "bracket" ? "member" : "label");
  for (const r of extraRuns) role.set(r.members[0], "label");
  for (const ch of [...bare, ...bareExtras]) role.set(ch, "bare");
  const ticks: RulerTick[] = [];
  for (let ch = BAND.first; ch <= BAND.last; ch++) {
    const px = x(ch);
    const kind = role.get(ch);
    let length = 4;
    let tone: TickTone = "faint";
    if (kind === "member") [length, tone] = [memberTick, "line"];
    else if (kind === "label") [length, tone] = [m.tick, "line"];
    else if (kind === "bare") [length, tone] = [12, "line"];
    else if (spans.some(([a, b]) => a <= px && px <= b)) length = 3; // a non-member slot inside a bracket is clipped
    else if (ch % 10 === 0) [length, tone] = [8, "line"];
    else if (heard.has(ch)) length = 8;
    ticks.push({ ch, x: px, length, tone, role: kind ?? "slot" });
  }

  return { cls, m, width, height: H, ticks, items, extraSingles, bare, bareExtras, scale: scaleLayout(width, m.f) };
}

/** The MHz numerals of the strip under the waterfall: every 10, 20 or 30 channels, whichever first leaves room. */
export function scaleLayout(width: number, f: number): ScaleNumeral[] {
  const adv = 0.6 * f;
  const pitch = (width - 1) / (BAND.last - BAND.first);
  const step = [10, 20, 30].find((k) => k * pitch >= 7 * adv + 16) ?? 30;
  const half = (7 * adv) / 2;
  const out: ScaleNumeral[] = [];
  for (let ch = BAND.first; ch <= BAND.last; ch++) {
    if ((ch - 10) % step !== 0) continue;
    const px = X(ch, width);
    out.push({ ch, x: px, textX: Math.min(width - half, Math.max(half, px)), text: chToMhz(ch).toFixed(3) });
  }
  return out;
}

/** The ink box of a label, rebuilt from its drawn origin and string (for the tests): u along the text, v across it. */
export function inkBoxes(layout: RulerLayout, item: RulerItem): Box[] {
  const { m, height } = layout;
  return item.texts.map((t) => {
    const S = uv(t.origin.x, height - t.origin.y);
    const chars = t.runs.reduce((n, r) => n + r.text.length, 0);
    return { u0: S.u, u1: S.u + chars * m.adv, v0: S.v, v1: S.v + m.cap };
  });
}
export type { Box };

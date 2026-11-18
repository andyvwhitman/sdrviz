/** Layout arithmetic for the approach ladder: where each train sits on the time axis and where its tag goes. */

import { LADDER_MIN, ladderFraction, type Row } from "./spot";

/** Width kept free at each end of the axis for the "beyond 30 min" count. */
export const GUTTER_PX = 28;
/** Pixels per character of the 13 px mono tags (JetBrains Mono is 0.6 em wide). */
export const TAG_CHAR_PX = 7.8;

export interface Placed {
  row: Row;
  /** centre of the glyph on the x axis, in px */
  x: number;
  /** 0 or 1: the tier of tags it was placed in; null when its tag folded into a neighbour's count */
  tier: 0 | 1 | null;
  /** trains whose tags folded into this one: `MARC 448 +1` */
  extra: number;
}

/** The x of a row on an axis `width` px wide, or null beyond the scale. */
export function ladderX(row: Pick<Row, "remainingS" | "side">, width: number): number | null {
  const fraction = ladderFraction(row);
  return fraction === null ? null : GUTTER_PX + fraction * (width - 2 * GUTTER_PX);
}

/** Pixels per minute of an axis `width` px wide (both arms count 30 minutes). */
export const pxPerMinute = (width: number): number => (width - 2 * GUTTER_PX) / (2 * LADDER_MIN);

/** The text of a tag, with the trains folded into it. */
export const tagText = (p: Pick<Placed, "row" | "extra">): string => (p.extra ? `${p.row.tag} +${p.extra}` : p.row.tag);

/**
 * Greedy tag placement, nearest the spot first: a tag takes the first of two tiers where it clears the tags already
 * there. A train whose tag cannot place keeps its glyph and folds into the nearest placed tag on the same side
 * (`MARC 448 +1`), so every train inside the scale is either named or counted.
 */
export function placeTags(rows: readonly Row[], width: number, gap = 6): Placed[] {
  const placed: Placed[] = [];
  const edges: [number, number][][] = [[], []];
  const ordered = [...rows].sort((a, b) => a.remainingS - b.remainingS);
  for (const row of ordered) {
    const x = ladderX(row, width);
    if (x === null) continue;
    const half = (row.tag.length * TAG_CHAR_PX) / 2;
    const [from, to] = [x - half - gap, x + half + gap];
    const tier = ([0, 1] as const).find((t) => edges[t].every(([a, b]) => to <= a || from >= b)) ?? null;
    if (tier !== null) edges[tier].push([from, to]);
    placed.push({ row, x, tier, extra: 0 });
  }
  for (const folded of placed.filter((p) => p.tier === null)) {
    const host = placed
      .filter((p) => p.tier !== null && p.row.side === folded.row.side)
      .sort((a, b) => Math.abs(a.x - folded.x) - Math.abs(b.x - folded.x))[0];
    if (host) host.extra += 1;
  }
  return placed;
}

/** Trains past the 30 minute scale, counted per side. */
export function beyond(rows: readonly Row[]): Record<"left" | "right", number> {
  const count = { left: 0, right: 0 };
  for (const row of rows) if (row.group === "coming" && ladderFraction(row) === null) count[row.side] += 1;
  return count;
}

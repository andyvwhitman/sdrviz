/**
 * CTC label pass (spec 5.30, review r1 #6, r3 #1). Per row, labels are accepted by priority:
 * route name > talking train > other trains > MP equation > stations. Rules:
 *  - gap: 8 px between label extents (text box plus its 2 px knockout), measured both ways whichever
 *    was placed first; 16 px when either label sits beside a tie or a tie runs between them
 *    (a tie is not separation);
 *  - reach: a centred station name may run 3/4 of the pitch toward each neighbour node (1.5x pitch
 *    overall); too wide: use the routes.json `short` form; still too wide: drop it;
 *  - beside a tie: end at x - 8, else start at x + 8, never on the tie (full name, then short form);
 *  - accepted labels get a bg-void knockout 2 px around the glyphs (drawn by the component).
 * Pure: widths come from `measure`, so the same pass runs in the browser (SVG text boxes) and in tests.
 */

export const GAP_PX = 8;
export const KNOCKOUT_PX = 2;
/** a "talking" glyph sits 5 px left of the train id, radius 1.75 */
export const TALK_DOT_OFFSET_PX = 5;
export const TALK_DOT_RADIUS_PX = 1.75;

export type Anchor = "start" | "middle" | "end";
export type LabelFont = "route" | "train" | "equation" | "station";

export interface LabelCandidate {
  row: number;
  /** 0 route name, 1 talking train, 2 train, 3 MP equation, 4 station */
  priority: number;
  text: string;
  font: LabelFont;
  /** anchor x */
  x: number;
  anchor: Anchor;
  /** the carrier glyph before a talking train id */
  talking?: boolean;
  /** x of the tie this label would sit on; it is then set beside it */
  tie?: number;
  /** routes.json short form, upper-cased */
  short?: string;
  /** how far a centred label may run toward the left and right neighbour node */
  reach?: readonly [left: number, right: number];
}

export interface PlacedLabel {
  candidate: LabelCandidate;
  text: string;
  x: number;
  anchor: Anchor;
  /** the text box */
  textBox: { left: number; right: number };
  /** the text box plus knockout (and the carrier glyph) */
  extent: readonly [left: number, right: number];
  /** x of the talking glyph centre */
  dotX: number | null;
}

export interface LabelPassOptions {
  /** strip width; label text stays inside it */
  width: number;
  /** x of every junction tie */
  tieXs: readonly number[];
  /** rendered text width in px */
  measure: (text: string, font: LabelFont) => number;
}

interface Kept {
  extent: readonly [number, number];
  beside: boolean;
  text: string;
}

/** Result for one row, for the audit (names kept and the gaps between neighbours, left to right). */
export interface RowAudit {
  row: number;
  names: string[];
  gaps: number[];
}

function textBoxOf(text: string, font: LabelFont, x: number, anchor: Anchor, measure: LabelPassOptions["measure"]) {
  const w = measure(text, font);
  const left = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  return { left, right: left + w };
}

export function labelPass(candidates: readonly LabelCandidate[], options: LabelPassOptions): { placed: PlacedLabel[]; audit: RowAudit[] } {
  const { width, tieXs, measure } = options;
  const byRow = new Map<number, { candidate: LabelCandidate; index: number }[]>();
  candidates.forEach((candidate, index) => {
    const list = byRow.get(candidate.row) ?? [];
    list.push({ candidate, index });
    byRow.set(candidate.row, list);
  });

  const placed: PlacedLabel[] = [];
  const audit: RowAudit[] = [];
  const tieBetween = (p: readonly [number, number], q: readonly [number, number]) =>
    tieXs.some((x) => x > Math.min(p[1], q[1]) && x < Math.max(p[0], q[0]));

  for (const [row, list] of byRow) {
    const kept: Kept[] = [];

    const attempt = (c: LabelCandidate, text: string, x: number, anchor: Anchor, beside: boolean): PlacedLabel | null => {
      const box = textBoxOf(text, c.font, x, anchor, measure);
      const dotX = c.talking ? box.left - TALK_DOT_OFFSET_PX : null;
      const left = (dotX == null ? box.left : dotX - TALK_DOT_RADIUS_PX) - KNOCKOUT_PX;
      const extent = [left, box.right + KNOCKOUT_PX] as const;
      if (extent[0] + KNOCKOUT_PX < 0 || extent[1] - KNOCKOUT_PX > width) return null; // the text stays inside the strip
      const fits = kept.every((k) => {
        const gap = beside || k.beside || tieBetween(extent, k.extent) ? 2 * GAP_PX : GAP_PX;
        return extent[1] + gap <= k.extent[0] || extent[0] >= k.extent[1] + gap;
      });
      return fits ? { candidate: c, text, x, anchor, textBox: box, extent, dotX } : null;
    };

    /** a centred name must stay within its reach of the node */
    const withinReach = (c: LabelCandidate, text: string): boolean => {
      if (!c.reach) return true;
      const box = textBoxOf(text, c.font, c.x, c.anchor, measure);
      return c.x - box.left <= c.reach[0] + 0.5 && box.right - c.x <= c.reach[1] + 0.5;
    };

    const ordered = [...list].sort((a, b) => a.candidate.priority - b.candidate.priority || a.index - b.index);
    for (const { candidate: c } of ordered) {
      let result: PlacedLabel | null = null;
      if (c.tie != null) {
        // beside the tie, never on it: left first, then right; full name, then the short form
        const names = c.short ? [c.text, c.short] : [c.text];
        search: for (const name of names) {
          for (const [anchor, x] of [["end", c.tie - GAP_PX], ["start", c.tie + GAP_PX]] as const) {
            result = attempt(c, name, x, anchor, true);
            if (result) break search;
          }
        }
      } else {
        const text = withinReach(c, c.text) ? c.text : c.short && withinReach(c, c.short) ? c.short : null;
        if (text != null) result = attempt(c, text, c.x, c.anchor, false);
      }
      if (!result) continue;
      kept.push({ extent: result.extent, beside: c.tie != null, text: result.text });
      placed.push(result);
    }

    kept.sort((a, b) => a.extent[0] - b.extent[0]);
    audit.push({
      row,
      names: kept.map((k) => k.text),
      gaps: kept.slice(1).map((k, i) => Math.round(k.extent[0] - kept[i].extent[1])),
    });
  }
  return { placed, audit };
}

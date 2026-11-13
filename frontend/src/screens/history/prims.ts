/** Drawing primitives the History layouts emit and Prims.svelte renders inside an <svg class="hud">. */

import type { BlockGeometry } from "$lib/hud/dataBlock";
import type { GlyphState } from "$lib/hud/tile";

/** Half-pixel snap for 1 px strokes. */
export const snap = (v: number): number => Math.round(v) + 0.5;

export type Anchor = "start" | "middle" | "end";

export type Prim =
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; cls: string }
  | { t: "path"; d: string; cls: string }
  | { t: "rect"; x: number; y: number; w: number; h: number; cls: string }
  | { t: "text"; x: number; y: number; s: string; cls: string; anchor?: Anchor; sim?: boolean }
  | { t: "glyph"; cx: number; cy: number; state: GlyphState }
  | { t: "block"; g: BlockGeometry };

export const line = (x1: number, y1: number, x2: number, y2: number, cls: string): Prim => ({ t: "line", x1, y1, x2, y2, cls });
export const text = (x: number, y: number, s: string, cls: string, anchor: Anchor = "start"): Prim => ({ t: "text", x, y, s, cls, anchor });

/** HUD.svg.regMark: a ring and crosshair at (x, y). */
export function regMark(x: number, y: number): Prim[] {
  const cx = snap(x);
  const cy = snap(y);
  return [
    { t: "path", d: `M${cx - 6} ${cy}a6 6 0 1 0 12 0a6 6 0 1 0 -12 0`, cls: "s-hair k-line" },
    { t: "path", d: `M${cx - 10} ${cy}H${cx + 10}M${cx} ${cy - 10}V${cy + 10}`, cls: "s-hair k-line" },
  ];
}

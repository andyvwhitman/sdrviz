/** Where the floating window sits (direction 8.3): beside a tile, or under a button; always inside the content area. */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const GAP = 8;
export const MARGIN = 16;

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(value, Math.max(low, high)));

/**
 * `tile`: the window's left edge `GAP` right of the anchor, or `GAP` left of it when it would cross the area's right
 * edge; its top aligned with the anchor's. `button`: right-aligned to the anchor, `GAP` under it. Both are then
 * clamped `MARGIN` inside `area`.
 */
export function place(kind: "tile" | "button", anchor: Box, size: { width: number; height: number }, area: Box): { left: number; top: number } {
  const rawLeft = kind === "button" ? anchor.right - size.width : anchor.right + GAP + size.width > area.right - MARGIN ? anchor.left - GAP - size.width : anchor.right + GAP;
  const rawTop = kind === "button" ? anchor.bottom + GAP : anchor.top;
  return {
    left: clamp(rawLeft, area.left + MARGIN, area.right - MARGIN - size.width),
    top: clamp(rawTop, area.top + MARGIN, area.bottom - MARGIN - size.height),
  };
}

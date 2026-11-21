/** The Feeds split: a list on the left and the detail on the right, with a draggable divider between them. */

import { clamp, type Bounds } from "$lib/hud/bounds";

/** The divider's gutter. */
export const GUTTER_PX = 16;
export const LIST_MIN_PX = 280;
export const DETAIL_MIN_PX = 480;
/** The list's share of the space beside the gutter, until the user drags the divider. */
export const LIST_SHARE = 1 / 3;
/** Under this width the screen shows one pane at a time. */
export const NARROW_PX = 1024;

/** The list's width limits in a split `width` px wide. */
export const listBounds = (width: number): Bounds => ({ min: LIST_MIN_PX, max: Math.max(LIST_MIN_PX, width - GUTTER_PX - DETAIL_MIN_PX) });

/** The list's width: the remembered fraction of the space beside the gutter (or a third), kept within the limits. */
export const listSize = (width: number, fraction: number | null): number =>
  Math.round(clamp((fraction ?? LIST_SHARE) * (width - GUTTER_PX), listBounds(width)));

/** The fraction to remember for a list `px` wide. */
export const listFraction = (px: number, width: number): number => px / (width - GUTTER_PX);

/** A stored value is usable only as a fraction strictly between 0 and 1. */
export const validFraction = (value: unknown): number | null => (typeof value === "number" && value > 0 && value < 1 ? value : null);

/**
 * Live Ops layout arithmetic for the two dividers (direction 4.3). The grid itself is CSS (live-ops.css), which
 * resolves a divider's saved fraction against the window with container query units; these functions are the same
 * formulas in pixels, for a drag, a key step, the readout and the ARIA values. Keep the two in step: the tests pin
 * the direction's figures.
 */

/** The wall's plots (E-2): the spectrum takes a clamp of what the ruler and the scale strip leave, the waterfall the rest. */
export const RULER_PX = 68;
export const STRIP_PX = 14;
const SPECTRUM = { min: 48, max: 144, share: 0.25 };
export const MIN_WATERFALL_PX = 64;

export const WALL_DEFAULT = 0.36;
/** Fixed chrome the wall's share leaves out: the hero, the gaps and the panel margins (CSS: `--below-hero`). */
const CHROME_PX = 128;
const GAP_PX = 16;
/** The lower half never gets shorter than this: two standard tile rows and the tabs. */
const LOWER_MIN_PX = 240;
export const WALL_MIN_PX = SPECTRUM.min + RULER_PX + MIN_WATERFALL_PX + STRIP_PX;

export const PANE_MIN_PX = 360;
const PANE_DEFAULT = { share: 0.4, min: 400, max: 880 };
const GUTTER_PX = 24;
/** One tile column and the scrollbar must stay beside the pane. */
const TILES_MIN_PX = 216;
const TILE_COLUMN_PX = 208;

export interface Bounds {
  min: number;
  max: number;
}

export const clamp = (value: number, { min, max }: Bounds): number => Math.max(min, Math.min(max, value));

/** The wall's height limits for a content area `height` px tall under a hero `heroH` px tall. */
export const wallBounds = (height: number, heroH: number): Bounds => {
  const min = WALL_MIN_PX;
  return { min, max: Math.max(min, height - 4 * GAP_PX - heroH - LOWER_MIN_PX) };
};

/** The wall's height for a saved fraction (null: the default). */
export const wallPx = (fraction: number | null, height: number, heroH: number): number =>
  Math.round(clamp((fraction ?? WALL_DEFAULT) * (height - CHROME_PX), wallBounds(height, heroH)));

/** The fraction that makes the wall `px` tall. */
export const wallFraction = (px: number, height: number): number => px / (height - CHROME_PX);

export const spectrumPx = (wall: number): number => Math.round(clamp((wall - RULER_PX - STRIP_PX) * SPECTRUM.share, { min: SPECTRUM.min, max: SPECTRUM.max }));
export const waterfallPx = (wall: number): number => wall - RULER_PX - STRIP_PX - spectrumPx(wall);

export const paneBounds = (width: number): Bounds => ({ min: PANE_MIN_PX, max: Math.max(PANE_MIN_PX, width - GUTTER_PX - TILES_MIN_PX) });

/** The pane's width for a saved fraction (null: the default, 40% of the width within 400 to 880 px). */
export const panePx = (fraction: number | null, width: number): number =>
  Math.round(fraction === null ? clamp(PANE_DEFAULT.share * width, PANE_DEFAULT) : clamp(fraction * width, paneBounds(width)));

export const paneFraction = (px: number, width: number): number => px / width;

/** How many tile columns fit beside a pane `pane` px wide. */
export const tileColumns = (width: number, pane: number): number => Math.max(1, Math.floor((width - GUTTER_PX - pane) / TILE_COLUMN_PX));

/**
 * Live Ops boxes (spec 4.3). Content-relative [x, y, w, h]; the content origin is the stage margin
 * (32, 56). The arithmetic is binding at both sizes, so every big box is placed from here.
 */

import type { TileVariant } from "$lib/hud/tile";
import type { StageSize } from "$lib/params";

export type Box = readonly [x: number, y: number, w: number, h: number];

export interface Geometry {
  width: number;
  hero: Box;
  spectrum: Box;
  ruler: Box;
  waterfall: Box;
  tabs: Box;
  tiles: Box;
  log: Box;
  tileCols: number;
  tileVariant: TileVariant;
}

const GEOMETRY: Record<StageSize, Geometry> = {
  1920: {
    width: 1856,
    hero: [0, 0, 1856, 64],
    spectrum: [0, 80, 1856, 72],
    ruler: [0, 152, 1856, 32],
    waterfall: [0, 184, 1856, 200],
    tabs: [0, 400, 1072, 32],
    tiles: [0, 448, 1072, 536],
    log: [1096, 400, 760, 584],
    tileCols: 5,
    tileVariant: "standard",
  },
  1440: {
    width: 1376,
    hero: [0, 0, 1376, 64],
    spectrum: [0, 80, 1376, 56],
    ruler: [0, 136, 1376, 24],
    waterfall: [0, 160, 1376, 160],
    tabs: [0, 336, 792, 32],
    tiles: [0, 384, 792, 420],
    log: [816, 336, 560, 468],
    tileCols: 3,
    tileVariant: "compact",
  },
};

/** Horizontal stage margins (32 px each side). */
const MARGINS = 64;
const GUTTER = 24;

/**
 * The boxes for a stage `stageWidth` wide: the spectrum, ruler and waterfall span the full width, the tile wall
 * keeps its design width (its columns are fixed) and the transcript log takes whatever is left.
 */
export function geometryFor(size: StageSize, stageWidth: number = size): Geometry {
  const g = GEOMETRY[size];
  const width = stageWidth - MARGINS;
  const full = ([x, y, , h]: Box): Box => [x, y, width, h];
  const logX = g.tiles[2] + GUTTER;
  return {
    ...g,
    width,
    hero: full(g.hero),
    spectrum: full(g.spectrum),
    ruler: full(g.ruler),
    waterfall: full(g.waterfall),
    log: [logX, g.log[1], width - logX, g.log[3]],
  };
}

/** CSS for an absolutely placed box. */
export const boxStyle = ([x, y, w, h]: Box): string => `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;

/** Spectrum vertical scale: M3 graticule, 10 dB per division, reference level at the top. */
export const REF_DBFS = -10;
export const DB_DIVS = 6;

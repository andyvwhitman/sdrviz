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
  lofar: Box;
  lofarRuler: Box;
  lofarHead: Box;
  tabs: Box;
  tiles: Box;
  log: Box;
  ctc: Box;
  tileCols: number;
  tileVariant: TileVariant;
  /** waterfall rows (2 rows per second) and LOFAR rows (30 s each) */
  waterfallRows: number;
  lofarRows: number;
  /** x of the first CTC node (leaves room for the route name column) */
  ctcX0: number;
  /** y of the LOFAR ramp legend inside the LOFAR head box */
  rampTop: number;
}

const GEOMETRY: Record<StageSize, Geometry> = {
  1920: {
    width: 1856,
    hero: [0, 0, 1856, 64],
    spectrum: [0, 80, 1656, 72],
    ruler: [0, 152, 1656, 32],
    waterfall: [0, 184, 1656, 120],
    lofar: [1672, 184, 184, 120],
    lofarRuler: [1672, 168, 184, 16],
    lofarHead: [1672, 80, 184, 88],
    tabs: [0, 320, 1072, 32],
    tiles: [0, 368, 1072, 480],
    log: [1096, 320, 760, 528],
    ctc: [0, 864, 1856, 120],
    tileCols: 5,
    tileVariant: "standard",
    waterfallRows: 120,
    lofarRows: 120,
    ctcX0: 144,
    rampTop: 18,
  },
  1440: {
    width: 1376,
    hero: [0, 0, 1376, 64],
    spectrum: [0, 80, 1176, 56],
    ruler: [0, 136, 1176, 24],
    waterfall: [0, 160, 1176, 96],
    lofar: [1192, 160, 184, 96],
    lofarRuler: [1192, 144, 184, 16],
    lofarHead: [1192, 80, 184, 56],
    tabs: [0, 272, 792, 32],
    tiles: [0, 320, 792, 348],
    log: [816, 272, 560, 396],
    ctc: [0, 684, 1376, 120],
    tileCols: 3,
    tileVariant: "compact",
    waterfallRows: 96,
    lofarRows: 96,
    ctcX0: 120,
    rampTop: 14,
  },
};

export const geometryFor = (size: StageSize): Geometry => GEOMETRY[size];

/** CSS for an absolutely placed box. */
export const boxStyle = ([x, y, w, h]: Box): string => `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;

/** Spectrum vertical scale: M3 graticule, 10 dB per division, reference level at the top. */
export const REF_DBFS = -10;
export const DB_DIVS = 6;

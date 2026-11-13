/** The scale bar's length: the longest "nice" length that fits, so it reads at any zoom from the whole country to a platform. */

import { MI_KM } from "./project";

/** Lengths whose quarters are round numbers (20 ticks, a numeral every five). */
const NICE = [0.004, 0.008, 0.02, 0.04, 0.08, 0.2, 0.4, 0.8, 2, 4, 8, 20, 40, 80, 200, 400, 800, 2000, 4000];
/** The bar should not run longer than this on screen. */
export const MAX_BAR_PX = 190;

export interface ScaleSpec {
  /** length in km and in miles, and their widths on screen */
  km: number;
  mi: number;
  kmW: number;
  miW: number;
}

const fit = (pxPerUnit: number): number => [...NICE].reverse().find((n) => n * pxPerUnit <= MAX_BAR_PX) ?? NICE[0];

export function scaleSpec(pxPerKm: number): ScaleSpec {
  const km = fit(pxPerKm);
  const mi = fit(pxPerKm * MI_KM);
  return { km, mi, kmW: Math.round(km * pxPerKm), miW: Math.round(mi * MI_KM * pxPerKm) };
}

/** A tick label: 12.5, 0.1, 500. */
export const scaleLabel = (v: number): string => String(Math.round(v * 10000) / 10000);

/** Pure helpers for showing the viewer's own position on the map. */

import type { BaseProjection, LonLat, View } from "./project";

/** A GPS fix: position plus the reported accuracy radius in metres. */
export interface Fix {
  lon: number;
  lat: number;
  accuracyM: number;
}

/** A fix vaguer than this (a cell-tower or IP guess) is not drawn as a circle. */
export const MAX_ACCURACY_M = 5000;
/** Zoom the LOCATE button goes to when the map is further out than this. */
export const LOCATE_ZOOM = 4;

/** Radius of the accuracy circle in canvas pixels, or null when the fix is too vague to draw. */
export function accuracyRadiusPx(accuracyM: number, pxPerKm: number): number | null {
  if (!Number.isFinite(accuracyM) || accuracyM <= 0 || accuracyM > MAX_ACCURACY_M) return null;
  return (accuracyM / 1000) * pxPerKm;
}

/** The view that puts `at` in the middle of a `width` x `height` area, at zoom `k`. */
export function viewCentredAt(base: BaseProjection, at: LonLat, k: number, width: number, height: number): View {
  const [x, y] = base.project(at);
  return { k, tx: width / 2 - x * k, ty: height / 2 - y * k };
}

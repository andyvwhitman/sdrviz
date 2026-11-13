/** The LOFAR grid of one feed as sparse cells: channel number -> [row, dBFS][]. Row 0 is the newest row (30 s each). */

import type { Lofar } from "$lib/types/live";

export type LofarCell = readonly [row: number, dbfs: number];

export function lofarCells(lofar: Lofar, feedId: string): Map<number, LofarCell[]> {
  const sparse = (lofar.cells?.[feedId] ?? {}) as Record<string, LofarCell[]>;
  return new Map(Object.entries(sparse).map(([channel, cells]) => [Number(channel), cells]));
}

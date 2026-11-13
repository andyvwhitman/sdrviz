/**
 * Waterfall rows for one watched feed: a backfill from GET /feeds/{id}/waterfall, then one row
 * per 500 ms from the spectrum frames (2 rows per second, spec 6.6). Rows are int8 dBFS over the
 * feed's own span; the canvas maps them onto the AAR band.
 */

import { api } from "$lib/api/client";
import type { SpectrumFrame } from "$lib/ws/protocol";

const ROW_MS = 500;
/** What the backend writes for a sample the feed never delivered. */
export const NO_SAMPLE_DBFS = -127;

export interface WaterfallRow {
  bins: Int8Array;
}

export class WaterfallModel {
  /** oldest first */
  rows = $state.raw<WaterfallRow[]>([]);
  centerMhz = 0;
  spanMhz = 0;
  private lastRowMs = -Infinity;
  private generation = 0;

  constructor(private readonly capacity: number) {}

  /** Replace the contents with the backend's backfill for `feedId`. */
  async load(feedId: string): Promise<void> {
    const generation = ++this.generation;
    this.rows = [];
    this.lastRowMs = -Infinity;
    try {
      const fill = await api.feeds.waterfall(feedId, this.capacity);
      if (generation !== this.generation || !fill.bins) return;
      this.centerMhz = fill.centerMhz;
      this.spanMhz = fill.spanMhz;
      const count = Math.floor(fill.data.length / fill.bins);
      this.rows = Array.from({ length: count }, (_, i) => ({ bins: fill.data.subarray(i * fill.bins, (i + 1) * fill.bins) }));
    } catch (error) {
      console.warn("waterfall backfill failed", error);
    }
  }

  /** Append the newest frame as a row, at most one per 500 ms of sim time. */
  push(frame: SpectrumFrame): void {
    if (frame.tMs - this.lastRowMs < ROW_MS) return;
    this.lastRowMs = frame.tMs;
    this.centerMhz = frame.centerMhz;
    this.spanMhz = frame.spanMhz;
    const next = [...this.rows, { bins: frame.bins }];
    this.rows = next.slice(-this.capacity);
  }
}

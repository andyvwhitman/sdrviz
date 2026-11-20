/**
 * Waterfall rows for one watched feed: a backfill from GET /feeds/{id}/waterfall, then one row
 * per 500 ms from the spectrum frames (2 rows per second, spec 6.6). Rows are int8 dBFS over the
 * feed's own span; the canvas maps them onto the AAR band.
 *
 * Time density is constant (direction section 3.2): every row is ROW_PX CSS pixels tall, so a taller box
 * shows more history. The model keeps enough rows for the tallest box it has been asked to fill.
 */

import { api } from "$lib/api/client";
import type { SpectrumFrame } from "$lib/ws/protocol";

export const ROW_MS = 500;
/** CSS pixels per 500 ms row: 6 px per second of history. */
export const ROW_PX = 3;
export const PX_PER_S = (ROW_PX * 1000) / ROW_MS;
/** What the backend writes for a sample the feed never delivered. */
export const NO_SAMPLE_DBFS = -127;
/** The backend serves at most this many rows in one backfill. */
export const MAX_ROWS = 600;
const MIN_ROWS = 60;

/** Rows needed to fill a box `height` CSS px tall. */
export const rowsFor = (height: number): number => Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.ceil(height / ROW_PX)));

/** Seconds of history a box `height` CSS px tall shows. */
export const secondsFor = (height: number): number => height / PX_PER_S;

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
  private feedId: string | null = null;

  constructor(private capacity = MIN_ROWS) {}

  /** Replace the contents with the backend's backfill for `feedId`. */
  async load(feedId: string): Promise<void> {
    const generation = ++this.generation;
    if (feedId !== this.feedId) this.rows = [];
    this.feedId = feedId;
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

  /** A taller box needs more history: ask the backfill again once the rows held no longer fill it. */
  grow(capacity: number): void {
    if (capacity <= this.capacity) return;
    const full = this.rows.length >= this.capacity;
    this.capacity = capacity;
    if (full && this.feedId) void this.load(this.feedId);
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

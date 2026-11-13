/** Shapes the History screen reads from the REST contract (GET /trains, /geo/routes, /transmissions, feed health). */

import type { TxRow } from "$lib/types/live";

export interface RoutePoint {
  place_id: string;
  name: string;
  kind: string;
  lat: number | null;
  lon: number | null;
  /** native milepost count ("NEC", "CFP", "BAA") and the mile on it */
  prefix: string | null;
  mp: number | null;
  mp_approx: boolean;
  mp_label: string;
  /** track miles from the route's left end */
  route_mi: number;
}

export interface Route {
  id: string;
  name: string;
  length_mi: number;
  points: RoutePoint[];
}

export interface TrainStop {
  place_id: string;
  route_id: string;
  route_mi: number;
  t: number;
}

/** One train run: a string on the stringline. `t` values are seconds after sim midnight (shifted into the window). */
export interface Train {
  train_id: string;
  line: string;
  direction: string;
  start_t: number;
  end_t: number;
  routes: string[];
  stops: TrainStop[];
}

/** [lat, lon] by place id */
export type PlaceCoords = Record<string, [number, number]>;

/** How a row sits on the selected route: on a train's string, on a detector's diamond, or on the margin rail. */
export type RowKind = "train" | "det" | "rail";

export interface HistoryRow extends TxRow {
  kind: RowKind;
  /** route mile of the tick; null on the rail */
  mi: number | null;
  /** belongs to the selected route (its string, its detector, or its nearest-route margin rail) */
  onRoute: boolean;
}

export type SpanState = "stale" | "fault" | "offline";

/** One non-ok stretch of a feed's uptime (GET /feeds/{id}/health `spans`). */
export interface FeedSpan {
  feed_id: string;
  start_t: number;
  end_t: number;
  state: SpanState;
  label: string;
  active: boolean;
}

/** The time window on the stringline and the table. */
export interface Range {
  start_t: number;
  end_t: number;
  /** ends at the sim clock and follows it */
  live: boolean;
}

export interface Summary {
  range: { start_t: number; end_t: number; start: string; end: string };
  totals: { count: number; airtime_s: number; airtime_label: string };
  scrubber_start_t: number;
  scrubber_airtime_per_min: number[];
}

export interface Waveform {
  duration_s: number;
  peaks: number[];
}

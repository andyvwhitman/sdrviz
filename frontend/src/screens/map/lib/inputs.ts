/** LiveState to placer inputs, and the per-feed look (glyph, line 2, tone) shared by the geo and schematic views. */

import * as fmt from "$lib/hud/fmt";
import type { GlyphState } from "$lib/hud/tile";
import type { Feed, TrainPosition, TxRow } from "$lib/types/live";
import type { ActiveInput, FeedInput, TrainInput } from "./geoLayout";

export interface FeedLook {
  fault: boolean;
  stale: boolean;
  acked: boolean;
  /** "idle-dim" is the armed mark of a feed at rest */
  glyph: GlyphState | "idle-dim";
  l2: string;
  l2Class: string;
  mark: "line" | "stale" | "fault";
}

/** How a feed site reads: `hearing` is the number of transmissions it is receiving; `squelch` shows the diagonal glyph. */
export function feedLook(f: Feed, hearing: number, squelch = false): FeedLook {
  const fault = f.state === "fault";
  const stale = f.state === "stale";
  let glyph: FeedLook["glyph"] = "idle-dim";
  if (fault) glyph = "fault";
  else if (f.state === "offline") glyph = "offline";
  else if (stale) glyph = "stale";
  else if (hearing) glyph = "tx";
  else if (squelch) glyph = "squelch";
  const l2 = fault
    ? f.label
    : stale
      ? `STALE · AGE ${f.in_state_label || fmt.age(f.last_sample_age_s, "age")}`
      : `${f.coverage_radius_km} KM · ${fmt.snr(f.snr_db)}`;
  return {
    fault,
    stale,
    acked: f.acked,
    glyph,
    l2,
    l2Class: fault ? "mp-l2-fault" : stale ? "mp-l2-stale" : "",
    mark: fault ? "fault" : stale ? "stale" : "line",
  };
}

export const feedInput = (f: Feed): FeedInput => {
  const look = feedLook(f, 0);
  return { id: f.id, short: f.short, lat: f.lat, lon: f.lon, radiusKm: f.coverage_radius_km, sim: f.sim, l2: look.l2, l2Class: look.l2Class };
};

export const trainInput = (t: TrainPosition): TrainInput => ({
  id: fmt.trainId(t.train_id),
  lat: t.lat,
  lon: t.lon,
  routeId: t.route_id,
  routeMi: t.route_mi,
  direction: t.direction,
  nextStop: t.next_stop,
  sim: t.sim,
  l2: t.data_block[1],
});

export const activeInput = (t: TxRow): ActiveInput => ({
  trainId: t.train_id ? fmt.trainId(t.train_id) : null,
  placeId: t.place_id,
  feedId: t.feed_id,
  receptions: (t.receptions ?? []).map((r) => ({ feed_id: r.feed_id, dist_km: r.dist_km, snr_db: r.snr_db })),
});

/** What `?select=` names: a tracked train, a feed site or a place. */

import type { Feed, LiveState, TrainPosition } from "$lib/types/live";
import type { MapData, Place } from "./types";

export type Selection =
  | { kind: "train"; id: string; train: TrainPosition }
  | { kind: "feed"; id: string; feed: Feed }
  | { kind: "place"; id: string; place: Place };

export const normaliseId = (s: string | null | undefined): string => String(s ?? "").toLowerCase().replace(/[\s_-]+/g, "");

/** Train ID first, then feed (short name or id), then station or detector id or name. */
export function resolveSelection(query: string | null, state: LiveState, data: MapData): Selection | null {
  const wanted = normaliseId(query);
  if (!wanted) return null;
  const train = state.trains.positions.find((t) => normaliseId(t.train_id) === wanted);
  if (train) return { kind: "train", id: train.train_id, train };
  const feed = state.feeds.find((f) => normaliseId(f.short) === wanted || normaliseId(f.id) === wanted);
  if (feed) return { kind: "feed", id: feed.short, feed };
  const place = [...data.places.stations, ...data.places.detectors].find((p) => normaliseId(p.id) === wanted || normaliseId(p.name) === wanted);
  return place ? { kind: "place", id: place.id, place } : null;
}

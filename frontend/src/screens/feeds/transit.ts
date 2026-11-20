/** The hero's one-line read of the transit sources: how many enabled ones are fresh, and the worst that is not. */

import * as fmt from "$lib/hud/fmt";
import type { TransitSource } from "$lib/types/sources";

export interface TransitSummary {
  /** enabled sources reporting ok */
  fresh: number;
  enabled: number;
  /** the first enabled source that is stale or in error, e.g. "MARC · STALE REALTIME 3M" */
  worst: { text: string; tone: "is-stale" | "is-fault" } | null;
}

/** Realtime counts as late after this many missed polls. */
const LATE_POLLS = 3;

/** Which load made a stale source stale, and when that part last worked. */
function staleSince(source: TransitSource, nowMs: number): { part: "REALTIME" | "STATIC"; updated: string | null } {
  const { rt_updated_at: rt, static_loaded_at: loaded } = source.status;
  const hasRealtime = !!(source.rt_trip_updates_url || source.rt_vehicle_positions_url || source.rt_alerts_url);
  const rtLate = hasRealtime && (!rt || nowMs - Date.parse(rt) > LATE_POLLS * source.rt_poll_s * 1000);
  return rtLate ? { part: "REALTIME", updated: rt } : { part: "STATIC", updated: loaded };
}

export function transitSummary(sources: readonly TransitSource[], nowMs: number): TransitSummary {
  const enabled = sources.filter((s) => s.enabled);
  const late = enabled.find((s) => s.status.state === "stale" || s.status.state === "error");
  let worst: TransitSummary["worst"] = null;
  if (late?.status.state === "error") {
    worst = { text: `${late.name} · ERROR`, tone: "is-fault" };
  } else if (late) {
    const { part, updated } = staleSince(late, nowMs);
    const since = updated ? ` ${fmt.age((nowMs - Date.parse(updated)) / 1000)}` : "";
    worst = { text: `${late.name} · STALE ${part}${since}`, tone: "is-stale" };
  }
  return { fresh: enabled.filter((s) => s.status.state === "ok").length, enabled: enabled.length, worst };
}

/** The hero's one-line read of the transit sources: how many enabled ones are fresh, and the worst that is not. */

import * as fmt from "$lib/hud/fmt";
import type { TransitSource } from "$lib/types/sources";

export interface TransitSummary {
  /** enabled sources reporting ok */
  fresh: number;
  enabled: number;
  /** the first enabled source that is stale or in error, e.g. "MARC · STALE 3M" */
  worst: { text: string; tone: "is-stale" | "is-fault" } | null;
}

export function transitSummary(sources: readonly TransitSource[], nowMs: number): TransitSummary {
  const enabled = sources.filter((s) => s.enabled);
  const late = enabled.find((s) => s.status.state === "stale" || s.status.state === "error");
  let worst: TransitSummary["worst"] = null;
  if (late?.status.state === "error") {
    worst = { text: `${late.name} · ERROR`, tone: "is-fault" };
  } else if (late) {
    const updated = late.status.rt_updated_at ?? late.status.static_loaded_at;
    const since = updated ? ` ${fmt.age((nowMs - Date.parse(updated)) / 1000)}` : "";
    worst = { text: `${late.name} · STALE${since}`, tone: "is-stale" };
  }
  return { fresh: enabled.filter((s) => s.status.state === "ok").length, enabled: enabled.length, worst };
}

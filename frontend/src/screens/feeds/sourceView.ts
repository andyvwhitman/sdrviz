/** How a transit source reads on its list card and in its detail pane. */

import type { ChipKind } from "$lib/hud/chips";
import * as fmt from "$lib/hud/fmt";
import type { SourceState, TransitSource } from "$lib/types/sources";
import { KINDS } from "./sourceForm";

export const STATE_CHIP: Record<SourceState, ChipKind> = { ok: "nominal", stale: "degraded", error: "fault", disabled: "offline", loading: "armed" };

export const sourceKindText = (source: TransitSource): string => KINDS.find((k) => k.value === source.kind)?.text ?? source.kind;

/** The count readouts a source has: a lines feed has no trips or vehicles. */
export function sourceCounts(source: TransitSource): [string, number][] {
  const { counts } = source.status;
  return source.kind === "lines"
    ? [["ROUTES", counts.routes], ["STOPS", counts.stops]]
    : [["ROUTES", counts.routes], ["STOPS", counts.stops], ["TRIPS", counts.trips], ["VEHICLES", counts.vehicles]];
}

/** "3M AGO" for a timestamp, or a blank. `nowMs` is the wall clock. */
export const agoText = (iso: string | null, nowMs: number): string => (iso ? `${fmt.age((nowMs - Date.parse(iso)) / 1000, "age")} AGO` : fmt.BLANK);

/** Header chips for the transit feeds: a source warming up or gone stale, and the whole feed going quiet. */

import type { TransitSourceStatus } from "$lib/types/transit";
import type { ChipSpec } from "./chips";

/** The map polls the vehicles this often (ms). */
export const TRANSIT_POLL_MS = 15_000;
/** The vehicle list is stale once it is older than this many polls. */
const STALE_POLLS = 2;

export interface TransitHealth {
  sources: Pick<TransitSourceStatus, "agency" | "enabled" | "status">[];
  /** when the vehicles last arrived (ms); 0 before the first poll answers */
  fetchedAt: number;
  /** the last poll failed */
  failed: boolean;
  now: number;
}

/**
 * `AMTRAK WARMING` for a source in state "warming", `MARC RT STALE` for one in state "stale", and
 * `TRANSIT FEED STALE` when the vehicle list is older than two polls (or the first poll failed). Nothing when all is well.
 */
export function transitChips({ sources, fetchedAt, failed, now }: TransitHealth): ChipSpec[] {
  const chips: ChipSpec[] = [];
  for (const source of sources) {
    if (!source.enabled) continue;
    const agency = source.agency.toUpperCase();
    if (source.status.state === "warming") chips.push({ id: "transit", text: `${agency} WARMING`, kind: "degraded" });
    else if (source.status.state === "stale") chips.push({ id: "transit", text: `${agency} RT STALE`, kind: "degraded" });
  }
  const quiet = fetchedAt ? now - fetchedAt > STALE_POLLS * TRANSIT_POLL_MS : failed;
  if (quiet) chips.push({ id: "transit", text: "TRANSIT FEED STALE", kind: "degraded" });
  return chips;
}

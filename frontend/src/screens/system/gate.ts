/** Which system state the Live Ops route shows (spec 8.4 to 8.6). Pure, so the rules are unit-tested. */

import type { LinkStatus } from "$lib/ws/link";

export type GateState = "live" | "loading" | "connecting" | "reconnecting" | "no-link";

/** `?force=` values, for screenshots and design review. */
export const FORCED_STATES: readonly GateState[] = ["loading", "connecting", "reconnecting", "no-link"];

export interface GateInput {
  forced: string | null;
  link: LinkStatus;
}

export function gateState({ forced, link }: GateInput): GateState {
  const wanted = FORCED_STATES.find((s) => s === forced);
  if (wanted) return wanted;
  if (link === "connecting") return "connecting";
  if (link === "reconnecting" || link === "no-link") return link;
  return "live";
}

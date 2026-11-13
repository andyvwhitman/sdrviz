import type { Bank } from "$lib/types/live";

/** How a system screen forces the Live Ops wall (spec 11.17). */
export interface LiveOpsLink {
  state: "loading" | "connecting" | "reconnecting" | "no-link" | "empty-bank";
  /** seconds since the backend link dropped (reconnecting, no-link) */
  dropAge?: number;
  /** empty-bank: the bank that has no channels (a new bank is not in the snapshot's list yet) */
  bank?: Bank;
}

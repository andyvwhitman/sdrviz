/** How a system screen forces the Live Ops wall (spec 11.17). */
export interface LiveOpsLink {
  state: "loading" | "connecting" | "reconnecting" | "no-link";
  /** seconds since the backend link dropped (reconnecting, no-link) */
  dropAge?: number;
}

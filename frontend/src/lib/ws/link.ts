/**
 * Link state and reconnect timing (spec 8.7; numbers from data/sim/scenarios/system.json).
 * Pure functions, so the timing rules are unit-tested without a socket.
 */

export type LinkStatus = "connecting" | "live" | "reconnecting" | "no-link";

/** Wait this long for the first data before the connecting screen says so. */
export const FIRST_DATA_WAIT_S = 6;
/** Retry delays after a drop: 1, 2, 4, 8, then 8 s forever. */
export const BACKOFF_S = [1, 2, 4, 8] as const;
/** Drop age a forced (`?force=`) link state pretends to have: 9 s is RECONNECTING, 22 s is past the NO LINK threshold. */
export const FORCED_DROP_AGE_S: Partial<Record<LinkStatus, number>> = { reconnecting: 9, "no-link": 22 };
/** A drop older than this is NO LINK (and the system-down alarm). */
export const NO_LINK_AFTER_S = 15;

/** Delay before reconnect attempt `attempt` (0 is the first retry). */
export const backoffDelayS = (attempt: number): number => BACKOFF_S[Math.min(attempt, BACKOFF_S.length - 1)];

export interface LinkInput {
  /** a snapshot has arrived on the current socket */
  hasData: boolean;
  /** the link has delivered data at some point in this page's life */
  everLive: boolean;
  /** seconds since the link dropped (or since the first attempt failed), null while healthy or never tried */
  dropAgeS: number | null;
}

export function linkStatus({ hasData, everLive, dropAgeS }: LinkInput): LinkStatus {
  if (hasData) return "live";
  if (dropAgeS == null) return "connecting";
  if (!everLive && dropAgeS < FIRST_DATA_WAIT_S) return "connecting";
  return dropAgeS >= NO_LINK_AFTER_S ? "no-link" : "reconnecting";
}

/**
 * Which retry the client is waiting for and how long until it fires, `dropAgeS` seconds after the drop.
 * Attempts fire at 1, 3, 7, 15, 23 ... s after the drop (the cumulative backoff).
 */
export function retryInfo(dropAgeS: number): { attempt: number; inS: number } {
  let at = 0;
  let attempt = 0;
  while (at <= dropAgeS) at += backoffDelayS(attempt++);
  return { attempt, inS: Math.ceil(at - dropAgeS) };
}

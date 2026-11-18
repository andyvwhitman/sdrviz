/** What the login screen says for each way a login can fail. */

import { ApiError } from "$lib/api/client";

export interface LoginFailure {
  /** the line under the field (the wait, when there is one, is added by the screen as it counts down) */
  message: string;
  /** how long the screen should keep ENTER disabled (a 429 or 423), or null */
  waitS: number | null;
}

/** Used when a 429 or 423 does not say how long: the backend's window is a minute, a lockout is longer. */
const DEFAULT_WAIT_S = { 429: 60, 423: 15 * 60 } as const;

/** "45 S", "2 MIN" */
export function waitText(seconds: number): string {
  return seconds < 90 ? `${Math.ceil(seconds)} S` : `${Math.ceil(seconds / 60)} MIN`;
}

export function loginFailure(error: unknown): LoginFailure {
  if (!(error instanceof ApiError)) return { message: "Backend unreachable", waitS: null };
  if (error.status === 429 || error.status === 423) {
    const waitS = error.retryAfterS ?? DEFAULT_WAIT_S[error.status];
    const message = error.status === 429 ? "Too many attempts." : "Locked after repeated wrong passwords.";
    return { message, waitS };
  }
  return { message: "Password not accepted.", waitS: null };
}

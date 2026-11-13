/**
 * Time conversion for the whole front end (the backend twin is app/sim/clock.py).
 *
 * Sim records carry a day-relative `t_offset_s` (seconds since local midnight) and a
 * wall-clock string such as "14:07:30". The recorded day is cyclic: a 24 h window that
 * starts at 03:40 wraps back to the previous evening, so all differences wrap too.
 */

export const DAY_S = 86400;

/** Wrap any number of seconds into [0, 86400). */
export const wrapDay = (seconds: number): number => ((seconds % DAY_S) + DAY_S) % DAY_S;

/** Seconds elapsed from `then` to `now` on the cyclic day. */
export function cyclicAge(now: number, then: number): number {
  return wrapDay(now - then);
}

/** "14:07:30" or "14:07" -> 50850; null when the text has no clock in it. */
export function parseClock(text: string): number | null {
  const m = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) : null;
}

const pad2 = (n: number): string => String(Math.trunc(n)).padStart(2, "0");

/** 50850.4 -> "14:07:30" (wraps; fractions dropped). */
export function clockText(seconds: number): string {
  const s = Math.floor(wrapDay(seconds));
  return `${pad2(s / 3600)}:${pad2((s % 3600) / 60)}:${pad2(s % 60)}`;
}

/** "-05:00" -> -18000. */
export function parseUtcOffset(offset: string): number {
  const m = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!m) return 0;
  const seconds = Number(m[2]) * 3600 + Number(m[3]) * 60;
  return m[1] === "-" ? -seconds : seconds;
}

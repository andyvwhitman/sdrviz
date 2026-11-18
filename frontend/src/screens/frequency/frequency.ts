/** Pure helpers of the frequency page: local clock and day, transcript states, and the log's day dividers. */

import type { Recording } from "$lib/types/recordings";

export const DEFAULT_TZ = "America/New_York";
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The wall-clock parts of an instant in a zone. */
export function zoneParts(instant: string | number | Date, tz: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  let format = formatters.get(tz);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    });
    formatters.set(tz, format);
  }
  const parts: Record<string, number> = {};
  for (const part of format.formatToParts(new Date(instant))) if (part.type !== "literal") parts[part.type] = Number(part.value);
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour % 24, minute: parts.minute, second: parts.second };
}

const two = (n: number): string => String(n).padStart(2, "0");

/** "14:03:05" */
export function clockOf(instant: string | number | Date, tz: string): string {
  const p = zoneParts(instant, tz);
  return `${two(p.hour)}:${two(p.minute)}:${two(p.second)}`;
}

/** Seconds since local midnight, for placing a moment on a day's axis. */
export function secondsOfDay(instant: string | number | Date, tz: string): number {
  const p = zoneParts(instant, tz);
  return p.hour * 3600 + p.minute * 60 + p.second;
}

/** "2026-11-17": the local day of an instant. */
export function dayKey(instant: string | number | Date, tz: string): string {
  const p = zoneParts(instant, tz);
  return `${p.year}-${two(p.month)}-${two(p.day)}`;
}

/** "TUE 17 NOV" for a YYYY-MM-DD key. The key is a calendar date, so no zone is involved. */
export function dayName(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]}`;
}

/** "TODAY · TUE 17 NOV" for today, "MON 16 NOV" for any other day. */
export const dayHeading = (key: string, todayKey: string): string => (key === todayKey ? `TODAY · ${dayName(key)}` : dayName(key));

export type TranscriptKind = "text" | "pending" | "empty" | "failed";

/** What the text column shows. A finished transcript of only whitespace is the same as no speech. */
export function transcriptKind(rec: Recording): TranscriptKind {
  switch (rec.transcript_state) {
    case "pending":
      return "pending";
    case "failed":
      return "failed";
    case "empty":
      return "empty";
    default:
      return rec.transcript.trim() ? "text" : "empty";
  }
}

/** True when the browser can be asked to play this row's file. */
export const hasAudio = (rec: Recording): boolean => rec.audio_state === "ok" && !!rec.audio_url;

/** "01:12.0" style lengths come from fmt.dur; this is the playing form "00:05.2 / 00:12.9". */
export type LogItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "expired-note" }
  | { kind: "row"; rec: Recording };

/**
 * The log's items, newest first: a day divider where the local date changes, and once, above the first row whose
 * audio has expired, a note (older rows are text only). Rows carry no date of their own.
 */
export function logItems(rows: Recording[], tz: string, todayKey: string): LogItem[] {
  const items: LogItem[] = [];
  let day = "";
  let noted = false;
  for (const rec of rows) {
    const key = dayKey(rec.started_at, tz);
    if (key !== day) {
      day = key;
      items.push({ kind: "day", key, label: dayHeading(key, todayKey) });
    }
    if (!noted && rec.audio_state === "expired") {
      noted = true;
      items.push({ kind: "expired-note" });
    }
    items.push({ kind: "row", rec });
  }
  return items;
}

/** Row whose start is the given instant (the `?at=` link), within a millisecond. */
export function findByStart(rows: Recording[], at: string): Recording | undefined {
  const target = Date.parse(at);
  return Number.isNaN(target) ? undefined : rows.find((rec) => Math.abs(Date.parse(rec.started_at) - target) < 1);
}

/** The `before` that makes a page start at the given transmission: one second after it. */
export const beforeAt = (at: string): string => new Date(Date.parse(at) + 1000).toISOString();

/** The next row that continuous play should take: the next newer playable row (the log is newest first). */
export function nextNewer(rows: Recording[], id: number): Recording | undefined {
  const at = rows.findIndex((rec) => rec.id === id);
  for (let i = at - 1; i >= 0; i--) if (hasAudio(rows[i])) return rows[i];
  return undefined;
}

/** Retry delays after a failed load: 1, 2, 4, then 8 s. */
export const backoffS = (attempt: number): number => Math.min(8, 2 ** Math.max(0, attempt));

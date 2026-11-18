/** What the node health view derives: the 30-minute history of link and lag, faults, and the reconnect count. */

import type { NodeEvent, NodeHealth } from "$lib/types/nodes";

export const HISTORY_MS = 30 * 60_000;

/** One poll of one node; link and lag are null while it is not ONLINE, which draws as a gap. */
export interface Sample {
  t: number;
  link: number | null;
  lag: number | null;
}

/** `history` with `sample` added and everything older than the window dropped. The input is not changed. */
export function appendSample(history: readonly Sample[] | undefined, sample: Sample, windowMs = HISTORY_MS): Sample[] {
  return [...(history ?? []), sample].filter((s) => s.t > sample.t - windowMs);
}

/** A temperature above this is a fault (the Pi throttles at 80 C). */
export const TEMP_FAULT_C = 80;

/** The real faults in a health report, as short uppercase phrases; empty when all is well. */
export function nodeFaults(health: NodeHealth | null): string[] {
  if (!health) return [];
  const faults: string[] = [];
  if (health.rtl_tcp === "down") faults.push("RTL_TCP DOWN");
  if (health.rtl_tcp === "no samples") faults.push("NO SAMPLES");
  if (health.temp_c != null && health.temp_c > TEMP_FAULT_C) faults.push(`TEMPERATURE ${Math.round(health.temp_c)} C`);
  return faults;
}

/** How many reconnects the events show in the last hour. */
export function reconnectsLastHour(events: readonly NodeEvent[], now: number): number {
  return events.filter((e) => e.kind === "reconnect" && now - Date.parse(e.t) <= 3_600_000).length;
}

const eventClock = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });

/** An event time as `17/11 07:05` in Eastern time, like the rest of the transit screens. */
export function eventTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "— — —" : eventClock.format(date).replace(",", "");
}

/** How a command answer reads: ACKED, FAILED with the node's message, or TIMED OUT. */
export function commandText(result: { status: "acked" | "failed" | "timeout"; error: { message: string } | null }): string {
  if (result.status === "acked") return "ACKED";
  if (result.status === "timeout") return "NO ANSWER IN TIME";
  return `FAILED${result.error ? ` · ${result.error.message}` : ""}`;
}

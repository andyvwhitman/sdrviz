/**
 * The footer's key-up strip (Sprint 6, B.5), as plain functions: which frames the strip shows, in which order,
 * and how a frame lives from entering to leaving. The component only animates what these decide.
 */

import { keyAge } from "$lib/time";
import type { TxRow } from "$lib/types/live";

/** One keyed frequency: a single frame, however many feeds hear it. */
export interface KeyFrame {
  /** the frequency id: one frame per frequency */
  id: string;
  /** the earliest key-up start of the frequency, in sim seconds since midnight */
  since: number;
  /** wall clock of that start, "20:13:07" */
  startClock: string;
  /** "CH54" */
  aar: string;
  /** "AMTK NEC" */
  label: string;
  /** every feed that hears it, in the order the rows arrived */
  via: string[];
}

/** A frame as the strip holds it. A dormant frame has been released and is waiting out its hold. */
export interface StripEntry {
  frame: KeyFrame;
  phase: "live" | "dormant";
  /** seconds keyed, frozen at the release (dormant frames only) */
  frozenS: number | null;
}

/** Every row of the air, grouped per frequency (earliest start wins), oldest on the left. */
export function keyFrames(rows: readonly TxRow[], now: number): KeyFrame[] {
  const byFrequency = new Map<string, KeyFrame>();
  for (const row of rows) {
    const frame = byFrequency.get(row.frequency_id);
    if (!frame) {
      byFrequency.set(row.frequency_id, {
        id: row.frequency_id,
        since: row.t_offset_s,
        startClock: row.clock.slice(0, 8),
        aar: row.aar,
        label: row.label,
        via: row.feed_label ? [row.feed_label] : [],
      });
      continue;
    }
    if (row.feed_label && !frame.via.includes(row.feed_label)) frame.via.push(row.feed_label);
    if (keyAge(now, row.t_offset_s) > keyAge(now, frame.since)) {
      frame.since = row.t_offset_s;
      frame.startClock = row.clock.slice(0, 8);
    }
  }
  return [...byFrequency.values()].sort((a, b) => keyAge(now, b.since) - keyAge(now, a.since) || a.id.localeCompare(b.id));
}

/**
 * The strip's next entries. A frame already in the strip keeps its place; one that is no longer on the air turns
 * dormant (frozen at its running time) instead of vanishing; one that keys again during its hold goes back to live;
 * a new frequency is appended on the right.
 */
export function reconcile(entries: readonly StripEntry[], frames: readonly KeyFrame[], now: number): StripEntry[] {
  const keyed = new Map(frames.map((frame) => [frame.id, frame]));
  const next: StripEntry[] = entries.map((entry) => {
    const frame = keyed.get(entry.frame.id);
    if (frame) return { frame, phase: "live", frozenS: null };
    if (entry.phase === "dormant") return entry;
    return { frame: entry.frame, phase: "dormant", frozenS: keyAge(now, entry.frame.since) };
  });
  const known = new Set(entries.map((entry) => entry.frame.id));
  for (const frame of frames) if (!known.has(frame.id)) next.push({ frame, phase: "live", frozenS: null });
  return next;
}

/** Drop a frame once its leave has finished. The frames to its right close up to the left. */
export const without = (entries: readonly StripEntry[], id: string): StripEntry[] => entries.filter((entry) => entry.frame.id !== id);

/** The AAR table: channel 7 is 160.215 MHz, 15 kHz apart. null when the text has no channel number. */
export function aarMhz(aar: string): number | null {
  const channel = Number(aar.replace(/\D/g, ""));
  return aar.match(/\d/) ? 160.215 + (channel - 7) * 0.015 : null;
}

/** Whole seconds, "0:12" (a row of ticking tenths would be exhausting to read). */
export function keyedFor(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** "keyed 1 minute 5 seconds" in words, for the ARIA label. */
export function keyedWords(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? "" : "s"}`;
  return minutes ? `${plural(minutes, "minute")} ${plural(rest, "second")}` : plural(rest, "second");
}

/** The label and the tooltip of a frame. `title` adds the feeds. */
export function frameLabel(frame: KeyFrame, mhz: string, seconds: number, { withVia = false } = {}): string {
  const parts = [
    `${mhz} MHz`,
    [frame.aar, frame.label].filter(Boolean).join(" "),
    `keyed ${keyedWords(seconds)}`,
    `since ${frame.startClock}`,
  ].filter(Boolean);
  const text = `${parts.join(", ")} · open in Live Ops`;
  return withVia && frame.via.length ? `${text} · VIA ${frame.via.join(", ")}` : text;
}

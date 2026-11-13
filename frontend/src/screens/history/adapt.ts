/** Wire shapes of the history endpoints and their conversion to the shared TxRow. */

import * as fmt from "$lib/hud/fmt";
import { feedName, roleTag } from "$lib/hud/roles";
import { wrapDay } from "$lib/time";
import type { DetectorReading, LiveState, Reception, TranscriptState, TxRow, Word } from "$lib/types/live";

/** GET /transmissions items (backend TransmissionOut). `t_offset_s` is shifted into the queried window. */
export interface TransmissionOut {
  id: string;
  t_offset_s: number;
  clock: string;
  frequency_id: string;
  aar_channel: number;
  feed_id: string;
  speaker_role: string | null;
  speaker: string | null;
  duration_s: number;
  train_id: string | null;
  place_id: string | null;
  transcript: string;
  transcript_state: TranscriptState;
  confidence: number | null;
  words: Word[];
  receptions: Reception[];
  detector: (DetectorReading & { detector_id?: string }) | null;
  source: string;
  sim: boolean;
}

export interface TransmissionPage {
  items: TransmissionOut[];
  total: number;
  next_cursor: string | null;
}

/** What the table needs to name a channel and flag it off the active bank. */
export interface ChannelNames {
  labels: Record<string, string>;
  /** frequency ids of the active bank; null when unknown (nothing is flagged off-bank) */
  bank: Set<string> | null;
}

/** The sim date ("2026-11-10") the snapshot carries; LiveState does not type it yet. */
export const simDate = (state: LiveState): string => (state as LiveState & { date: string }).date;

/** ISO-8601 text for day-relative seconds on the sim date (the API reads it back as seconds after midnight). */
export function isoAt(t: number, date: string, utcOffset: string): string {
  const midnight = Date.parse(`${date}T00:00:00${utcOffset}`);
  return new Date(midnight + t * 1000).toISOString();
}

export function toTxRow(out: TransmissionOut, names: ChannelNames): TxRow {
  const tenths = Math.floor(wrapDay(out.t_offset_s) * 10 + 1e-6) % 10;
  const extra = out.receptions.length > 1 ? ` +${out.receptions.length - 1}` : "";
  return {
    id: out.id,
    t_offset_s: out.t_offset_s,
    clock: out.clock,
    clock_tenths: `${out.clock}.${tenths}`,
    aar: fmt.ch(out.aar_channel),
    aar4: fmt.aar(out.aar_channel),
    frequency_id: out.frequency_id,
    label: names.labels[out.frequency_id] ?? out.frequency_id.toUpperCase(),
    off_bank: names.bank ? !names.bank.has(out.frequency_id) : false,
    feed_id: out.feed_id,
    feed_label: feedName(out.feed_id) + extra,
    role: out.speaker_role ?? "unknown",
    role_tag: roleTag(out.speaker_role),
    speaker: out.speaker ?? "",
    train_id: out.train_id,
    place_id: out.place_id,
    duration_s: out.duration_s,
    state: out.transcript_state,
    final_state: out.transcript_state,
    live: false,
    transcript: out.transcript,
    words: out.words,
    confidence: out.confidence,
    detector: out.detector,
    sim: out.sim,
    receptions: out.receptions,
  };
}

/** The frequency editor's pure logic: the details draft, what changed, validation, the add field and the delete check. */

import { BAND, chToMhz } from "$lib/hud/band";
import { aar as aarPair, BLANK, ch as chText, freq as mhzText } from "$lib/hud/fmt";
import type { Frequency, FrequencyBody } from "$lib/types/frequencies";

/** The editable details, all as text. The MHz and the id of a saved frequency are not editable. */
export interface Draft {
  label: string;
  railroad: string;
  use: string;
  line: string;
  notes: string;
  mode: string;
  confidence: string;
  source: string;
}

export type Errors = Partial<Record<keyof Draft, string>>;

export const emptyDraft = (label = ""): Draft => ({ label, railroad: "", use: "", line: "", notes: "", mode: "NFM", confidence: "medium", source: "" });

export const draftFrom = (f: Frequency): Draft => ({
  label: f.label,
  railroad: f.railroad,
  use: f.use,
  line: f.line,
  notes: f.notes,
  mode: f.mode,
  confidence: f.confidence,
  source: f.sources[0] ?? "",
});

/** The fields that differ between two drafts, in form order. Empty: nothing to save. */
export const changedFields = (saved: Draft, draft: Draft): (keyof Draft)[] => (Object.keys(saved) as (keyof Draft)[]).filter((key) => saved[key].trim() !== draft[key].trim());

export const isDirty = (saved: Draft, draft: Draft): boolean => changedFields(saved, draft).length > 0;

export function validate(draft: Draft): Errors {
  const errors: Errors = {};
  if (!draft.label.trim()) errors.label = "Required";
  if (draft.source.trim() && !/^https?:\/\/\S+$/.test(draft.source.trim())) errors.source = "A web address";
  return errors;
}

/** The request body for a frequency: the draft's fields, the identity fixed. Other sources stay; the first is the one edited. */
export function bodyFrom(id: string, freqMhz: number, draft: Draft, previousSources: string[] = []): FrequencyBody {
  const source = draft.source.trim();
  return {
    id,
    label: draft.label.trim(),
    freq_mhz: freqMhz,
    railroad: draft.railroad.trim(),
    use: draft.use.trim(),
    line: draft.line.trim(),
    mode: draft.mode.trim() || "NFM",
    confidence: draft.confidence,
    notes: draft.notes.trim(),
    sources: source ? [source, ...previousSources.slice(1)] : previousSources.slice(1),
  };
}

// ---- the add field: "CHANNEL OR MHz"

export type Target = { ok: true; channel: number; mhz: number } | { ok: false; message: string };

export const NOT_AAR = `NOT AN AAR CHANNEL · ${chText(BAND.first)}–${chText(BAND.last)} · ${mhzText(BAND.lo)}–${mhzText(BAND.hi)}`;

const inBand = (channel: number): boolean => Number.isInteger(channel) && channel >= BAND.first && channel <= BAND.last;

/**
 * What a typed value means: `54`, `CH54` or `5454` (the AAR pair) is a channel; anything with a decimal point is MHz and
 * must sit on a channel. Empty input is neither an answer nor an error (`message` is empty).
 */
export function parseTarget(text: string): Target {
  const typed = text.trim().toUpperCase().replace(/\s*MHZ$/, "");
  if (!typed) return { ok: false, message: "" };
  let channel: number;
  if (typed.includes(".")) {
    if (!/^\d{3}\.\d{1,3}$/.test(typed)) return { ok: false, message: NOT_AAR };
    channel = Math.round((Number(typed) - chToMhz(0)) / BAND.step);
    if (Math.abs(chToMhz(channel) - Number(typed)) > 0.0005) return { ok: false, message: NOT_AAR };
  } else {
    const digits = /^(?:CH)?(\d{1,4})$/.exec(typed)?.[1];
    if (!digits) return { ok: false, message: NOT_AAR };
    if (digits.length === 4 && digits.slice(0, 2) !== digits.slice(2)) return { ok: false, message: NOT_AAR };
    if (digits.length === 3) return { ok: false, message: NOT_AAR };
    channel = digits.length === 4 ? Number(digits.slice(0, 2)) : Number(digits);
  }
  return inBand(channel) ? { ok: true, channel, mhz: chToMhz(channel) } : { ok: false, message: NOT_AAR };
}

/** The line under the add field once it resolves: `CH54 · 160.920 MHz`. */
export const targetReadout = (target: Extract<Target, { ok: true }>): string => `${chText(target.channel)} · ${mhzText(target.mhz)} MHz`;

/** An id for a new frequency on this channel that no existing id uses: `ch54`, `ch54-2`. */
export function newId(channel: number, existing: string[]): string {
  const base = `ch${String(channel).padStart(2, "0")}`;
  let id = base;
  for (let n = 2; existing.includes(id); n++) id = `${base}-${n}`;
  return id;
}

// ---- delete

/** Whether the typed text deletes: the label, exactly (surrounding spaces aside). */
export const deleteMatches = (typed: string, label: string): boolean => typed.trim() === label.trim() && label.trim() !== "";

/** The copy under the typed field; the count is left out when unknown, never written as 0. */
export function deleteCopy(f: Pick<Frequency, "label" | "aar_channel">, recordings: number | null): string {
  const name = `${aarPair(f.aar_channel)} ${f.label}`;
  const kept = recordings == null ? "Its recordings and transcripts are kept." : `Its ${recordings.toLocaleString("en-US").replace(/,/g, " ")} recordings and transcripts are kept.`;
  return `Removes ${name} and its node assignments. ${kept}`;
}

/** `5454 · AMTK NEC` for a bar and an aria-label. */
export const titleOf = (f: Pick<Frequency, "label" | "aar_channel">): string => `${aarPair(f.aar_channel)} · ${f.label}`;

/** `160.920 MHz · CH54 · NFM` */
export const identityOf = (f: Pick<Frequency, "freq_mhz" | "aar_channel" | "mode">): string => `${mhzText(f.freq_mhz)} MHz · ${chText(f.aar_channel)} · ${f.mode || BLANK}`;

/** The last seven days of activity as the editor's readout: `412 TX · 1H 06M AIR`; null when nothing was heard (not 0). */
export function weekReadout(days: { hours: { count: number; airtime_s: number }[] }[]): string | null {
  const hours = days.flatMap((day) => day.hours);
  const count = hours.reduce((sum, h) => sum + h.count, 0);
  if (count === 0) return null;
  const minutes = Math.round(hours.reduce((sum, h) => sum + h.airtime_s, 0) / 60);
  return `${count} TX · ${Math.floor(minutes / 60)}H ${String(minutes % 60).padStart(2, "0")}M AIR`;
}

/** What an editor reports when it finishes: a save keeps it open, an add moves to the new row, a delete ends it. */
export type Outcome = "saved" | "added" | "deleted";

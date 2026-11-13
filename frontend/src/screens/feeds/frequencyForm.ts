/** Draft and validation for the frequency catalogue editor. */

import { mhzToCh } from "$lib/hud/band";
import type { Frequency } from "./types";

export interface FrequencyDraft {
  id: string;
  label: string;
  freq_mhz: string;
  railroad: string;
  use: string;
  line: string;
  mode: string;
  confidence: string;
  source: string;
  notes: string;
}

export const emptyFrequencyDraft = (): FrequencyDraft => ({ id: "", label: "", freq_mhz: "", railroad: "", use: "", line: "", mode: "NFM", confidence: "medium", source: "", notes: "" });

export const frequencyDraftFrom = (f: Frequency): FrequencyDraft => ({
  id: f.id,
  label: f.label,
  freq_mhz: f.freq_mhz.toFixed(3),
  railroad: f.railroad,
  use: f.use,
  line: f.line,
  mode: f.mode,
  confidence: f.confidence,
  source: f.sources[0] ?? "",
  notes: f.notes,
});

export type FrequencyErrors = Partial<Record<keyof FrequencyDraft, string>>;

export function validateFrequency(draft: FrequencyDraft, isNew: boolean, existingIds: string[]): FrequencyErrors {
  const errors: FrequencyErrors = {};
  if (isNew) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(draft.id)) errors.id = "Lower-case letters, digits and dashes";
    else if (existingIds.includes(draft.id)) errors.id = "Already in use";
  }
  if (!draft.label.trim()) errors.label = "Required";
  if (!draft.railroad.trim()) errors.railroad = "Required";
  if (!draft.use.trim()) errors.use = "Required";
  const mhz = Number(draft.freq_mhz);
  if (draft.freq_mhz.trim() === "" || !Number.isFinite(mhz)) errors.freq_mhz = "A number";
  else if (mhz < 160.2 || mhz > 161.6) errors.freq_mhz = "AAR band 160.215 to 161.565";
  return errors;
}

/** The AAR channel of a typed frequency, for the live preview next to the field. */
export const aarOf = (mhz: string): number | null => (Number.isFinite(Number(mhz)) && mhz.trim() !== "" ? mhzToCh(Number(mhz)) : null);

export const frequencyBody = (draft: FrequencyDraft): Partial<Frequency> & { id: string } => ({
  id: draft.id,
  label: draft.label.trim(),
  freq_mhz: Number(draft.freq_mhz),
  railroad: draft.railroad.trim(),
  use: draft.use.trim(),
  line: draft.line.trim(),
  mode: draft.mode.trim() || "NFM",
  confidence: draft.confidence,
  notes: draft.notes.trim(),
  sources: draft.source.trim() ? [draft.source.trim()] : [],
});

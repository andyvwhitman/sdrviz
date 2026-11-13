import { roleTag } from "./roles";

const OPERATOR_SHORT: Record<string, string> = { amtrak: "AMTK" };
const SPEAKER_COLUMN_CHARS = 16; // the 120 px column at mono 12

interface SpeakerRow {
  speaker_role?: string;
  train_id?: string | null;
  symbol?: string | null;
  speaker?: string | null;
}

export interface Speaker {
  who: string;
  full: string;
}

/**
 * Speaker cell (spec 5.12): train id, symbol or speaker, upper-cased; crew suffix dropped;
 * operator short forms (Amtrak -> AMTK); cut at a word boundary past 16 characters.
 */
export function speaker(row: SpeakerRow, given?: string): Speaker {
  if (roleTag(row.speaker_role) === "DET" && !given) return { who: "", full: "" };
  const source = given || row.train_id || row.symbol || row.speaker || "";
  if (!source) return { who: "", full: "" };
  const upper = source.replace(/\s+(engineer|conductor)$/i, "").toUpperCase();
  let who = upper
    .split(/\s+/)
    .map((word) => OPERATOR_SHORT[word.toLowerCase()] ?? word)
    .join(" ");
  while (who.length > SPEAKER_COLUMN_CHARS && who.includes(" ")) who = who.slice(0, who.lastIndexOf(" "));
  return { who, full: row.speaker || source };
}

/** The frequency table over REST (backend/app/routers/frequencies.py): a frequency and where it is assigned. */

/** One node's switch for a frequency: assigned, and enabled (decoded, recorded, transcribed) or not. */
export interface Assignment {
  feed_id: string;
  enabled: boolean;
}

export interface Frequency {
  id: string;
  label: string;
  freq_mhz: number;
  aar_channel: number;
  railroad: string;
  use: string;
  line: string;
  mode: string;
  confidence: string;
  notes: string;
  sources: string[];
  assignments: Assignment[];
}

/** The body of POST and PUT /frequencies: everything but the derived channel and the assignments. */
export type FrequencyBody = Omit<Frequency, "aar_channel" | "assignments">;

/** A node as the frequency screens see it: the feed that carries its assignments. */
export interface NodeColumn {
  feedId: string;
  /** SDR-01 */
  short: string;
  state: "ok" | "stale" | "fault" | "offline" | "disabled";
}

/** What one node does with one frequency: "off" is assigned but disabled, "none" is not assigned. */
export type Slot = "on" | "off" | "none";

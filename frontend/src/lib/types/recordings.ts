/** The recordings API (docs/recordings-api.md): saved transmissions and per-frequency activity. */

export type AudioState = "ok" | "expired";
export type RecordingTranscriptState = "pending" | "done" | "empty" | "failed";

export interface Recording {
  id: number;
  frequency_id: string;
  aar_channel: number | null;
  feed_id: string;
  feed_lat: number | null;
  feed_lon: number | null;
  /** UTC, to the millisecond, with a Z */
  started_at: string;
  duration_s: number;
  audio_bytes: number;
  audio_state: AudioState;
  audio_url: string | null;
  transcript: string;
  transcript_state: RecordingTranscriptState;
  engine: string;
}

export interface ActivityBucket {
  /** UTC moment the bucket begins */
  start: string;
  count: number;
  airtime_s: number;
}

export interface DayActivity {
  frequency_id: string;
  /** the Eastern day, YYYY-MM-DD */
  date: string;
  tz: string;
  /** the start of the oldest recording on this frequency, or null when nothing was ever recorded */
  recording_since: string | null;
  buckets: ActivityBucket[];
}

export interface WeekActivity {
  frequency_id: string;
  tz: string;
  recording_since: string | null;
  /** oldest first */
  days: { date: string; hours: ActivityBucket[] }[];
}

/** One row of GET /api/frequencies/{id}: the catalogue entry the page shows as identity. */
export interface FrequencyInfo {
  id: string;
  label: string;
  freq_mhz: number;
  aar_channel: number | null;
  railroad: string;
  use: string;
  line?: string | null;
  confidence?: string | null;
  notes?: string | null;
  sources?: string[];
}

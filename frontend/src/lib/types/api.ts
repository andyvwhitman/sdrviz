/** REST shapes the shared layer needs. Everything else comes from schema.gen.ts once the backend exists. */

export interface SessionInfo {
  authenticated: boolean;
  sim: boolean;
  /** absent on a backend without roles: treated as admin */
  role?: "admin" | "viewer";
}

export interface SimStatus {
  scenario: string | null;
  clock: string;
  speed: number;
}

export interface SimJump {
  scenario?: string;
  clock?: string;
  speed?: number;
}

export interface Prefs {
  /** the node Live Ops listens to; admin only to change. GET returns the resolved default */
  listen_feed: string | null;
  muted: string[];
  solo: string[];
  record: string[];
  volumes: Record<string, number>;
}

/** A frequency assigned to a feed (node); a feed hears, decodes and records its enabled assignments. */
export interface Assignment {
  feed_id: string;
  enabled: boolean;
}

/** GET /api/frequencies and friends: the frequency row plus its assignments (empty = unassigned). */
export interface FrequencyRecord {
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

/** POST /api/frequencies/from-channel (right-click on the waterfall; admin) */
export interface FromChannelResult {
  frequency: FrequencyRecord;
  /** false: the table already had a frequency on that AAR channel */
  created: boolean;
}

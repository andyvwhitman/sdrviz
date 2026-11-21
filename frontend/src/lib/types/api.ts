/** REST shapes the shared layer needs. Everything else comes from schema.gen.ts once the backend exists. */

export interface SessionInfo {
  authenticated: boolean;
  sim: boolean;
  /** absent on a backend without roles: treated as admin */
  role?: "admin" | "viewer";
  /** the server version, shown as BUILD <version> in the footer */
  version: string;
}

export interface SimStatus {
  scenario: string | null;
  clock: string;
  speed: number;
  /** the node a scenario is about: the page that asked for the scenario listens to it */
  scenario_feed?: string | null;
}

export interface SimJump {
  scenario?: string;
  clock?: string;
  speed?: number;
}

/** How this browser mixes the channels; kept in localStorage (stores/prefs.svelte.ts), not on the server. */
export interface Prefs {
  muted: string[];
  solo: string[];
  record: string[];
  /** per channel, 0..1; a channel with no entry plays at full volume */
  volume: Record<string, number>;
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

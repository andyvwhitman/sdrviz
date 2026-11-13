/** REST shapes the shared layer needs. Everything else comes from schema.gen.ts once the backend exists. */

export interface SessionInfo {
  authenticated: boolean;
  sim: boolean;
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
  active_bank: string;
  displayed_feed: string | null;
  muted: string[];
  solo: string[];
  record: string[];
  volumes: Record<string, number>;
}

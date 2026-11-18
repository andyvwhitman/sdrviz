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
  active_bank: string;
  displayed_feed: string | null;
  muted: string[];
  solo: string[];
  record: string[];
  volumes: Record<string, number>;
}

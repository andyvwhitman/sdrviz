/** Shapes of docs/transit-api.md (sources) and GET /api/system/backend. */

export type SourceKind = "gtfs" | "amtraker" | "lines";
export type SourceState = "ok" | "stale" | "error" | "disabled" | "loading";

export interface SourceStatus {
  state: SourceState;
  error: string | null;
  static_loaded_at: string | null;
  static_version: string | null;
  rt_updated_at: string | null;
  counts: { routes: number; stops: number; trips: number; vehicles: number };
}

/** What a client may write: a source minus its read-only status. `api_key` reads back as "***" when set. */
export interface SourceConfig {
  id: string;
  name: string;
  agency: string;
  kind: SourceKind;
  enabled: boolean;
  static_url: string | null;
  rt_trip_updates_url: string | null;
  rt_vehicle_positions_url: string | null;
  rt_alerts_url: string | null;
  api_key: string | null;
  key_header: string | null;
  route_types: number[] | null;
  static_refresh_h: number;
  rt_poll_s: number;
}

export interface TransitSource extends SourceConfig {
  status: SourceStatus;
}

export interface BackendStats {
  build: { version: string; commit: string | null; python: string; platform: string; pid: number };
  started_at: number;
  uptime_s: number;
  sim: { enabled: boolean; speed: number };
  cpu: { process_pct: number; load_avg: number[]; cores: number | null };
  memory: { rss_bytes: number; peak_rss_bytes: number };
  disk: { total_bytes: number; free_bytes: number; data_bytes: number; audio_bytes: number; db_bytes: number };
  websocket: { clients: number; audio_subscriptions: number; spectrum_watchers: number };
}

/** GET /api/radio: the rtl_tcp link (fields appear as the link comes up). */
export interface RadioStatus {
  state?: string;
  host?: string;
  error?: string;
  throughput?: number | null;
  channels?: Record<string, { open: boolean; snr_db: number; hiss: number }>;
}

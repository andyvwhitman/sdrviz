/** Shapes of GET /api/system/backend and GET /api/radio. */

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

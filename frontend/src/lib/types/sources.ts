/** Shapes of docs/transit-api.md (the GTFS, Amtraker and lines sources), shared by Feeds and Settings. */

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

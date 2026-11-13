/** REST shapes owned by the Feeds & Banks screen (backend/app/models.py). */

export interface Frequency {
  id: string;
  label: string;
  freq_mhz: number;
  aar_channel: number;
  railroad: string;
  use: string;
  line: string;
  mode: string;
  confidence: "high" | "medium" | "med" | "low" | string;
  notes: string;
  sources: string[];
}

export interface BankRecord {
  id: string;
  name: string;
  description: string;
  home_feed: string;
  short: string;
  sim: boolean;
  /** ordered: the tile order of the bank */
  frequency_ids: string[];
}

/** The configuration fields of a feed (FeedBase), as the forms edit them. */
export interface FeedConfig {
  id: string;
  name: string;
  short: string | null;
  site: string;
  lat: number;
  lon: number;
  coverage_radius_km: number;
  hears: string[];
  driver: string;
  host: string;
  port: number | null;
  center_mhz: number;
  sample_rate_msps: number;
  gain_db: number;
  ppm: number;
  noise_floor_dbfs: number;
  enabled: boolean;
  sim: boolean;
}

/** GET /feeds/{id}/health, the series this screen reads. */
export interface FeedHealth {
  series_1m: { sample_rate_msps?: (number | null)[]; state?: string[] };
  /** state changes of the recorded day, oldest first */
  events?: { t: number; clock: string; state: string; label: string }[];
}

/** One route of GET /geo/routes, as far as the coverage thumbnail needs it. */
export interface GeoRoute {
  id: string;
  points: { place_id: string; name: string; lat: number; lon: number }[];
}

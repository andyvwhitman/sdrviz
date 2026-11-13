/**
 * The LiveState shape: the scenario JSON in data/sim/scenarios minus the
 * bookkeeping keys (summary, generator, history, stats, map). The WebSocket
 * `snapshot` message and `GET /api/live/state` both carry it.
 * Only the fields the shared layer reads are typed in detail.
 */

export type FeedState = "ok" | "stale" | "fault" | "offline" | "disabled";
export type CoverageState = "ok" | "partial" | "stale" | "offline";
export type ChannelState = "idle" | "squelch" | "tx" | "recent" | "recent-dim";
export type TranscriptState =
  | "decoding"
  | "draft"
  | "final"
  | "carrier_only"
  | "no_transcript_decoder_down"
  | "failed"
  | "undecodable"
  | "not_recorded";

export interface Tz {
  name: string;
  iana: string;
  utc_offset: string;
}

export interface Fault {
  object: string;
  kind: string;
  short: string;
  state: string;
  label: string;
  since: string;
  acked: boolean;
  acked_at: string | null;
}

export interface Degraded {
  object: string;
  kind: string;
  short: string;
  state: string;
  label: string;
  since: string;
  in_state_label: string;
}

export interface Header {
  feeds_chip: string;
  feeds_chip_state: "ok" | "stale" | "fault";
  asr_chip: string | null;
  disk_chip: string | null;
  host_chip: string | null;
  feeds_hero: string;
  feeds_hero_ranked: unknown[];
}

export interface Feed {
  id: string;
  short: string;
  name: string;
  site: string;
  lat: number;
  lon: number;
  coverage_radius_km: number;
  hears: string[];
  driver: string;
  sim: boolean;
  enabled: boolean;
  state: FeedState;
  label: string;
  since_t: number | null;
  since: string | null;
  in_state_s: number | null;
  in_state_label: string | null;
  acked: boolean;
  acked_at: string | null;
  last_sample_age_s: number | null;
  last_sample_age_label: string | null;
  center_mhz: number;
  sample_rate_msps: number;
  sample_rate_measured_msps: number | null;
  gain_db: number | null;
  ppm: number | null;
  snr_db: number | null;
  noise_floor_dbfs: number | null;
  telemetry: Record<string, number | null> | null;
  telemetry_na: string[];
  sample_rate_15m: (number | null)[];
}

export interface Reception {
  feed_id: string;
  snr_db: number | null;
  rssi_dbfs: number | null;
  dist_km: number | null;
}

export interface CoveragePip {
  feed_id: string;
  short: string;
  state: FeedState;
}

export interface ChannelTx {
  tx_id: string;
  elapsed_s: number;
  timer: string;
  primary_feed: string;
  via: string;
  receptions: Reception[];
  train_id: string | null;
}

export interface Channel {
  id: string;
  label: string;
  aar: string; // "CH54"
  aar4: string; // "5454"
  freq_mhz: number;
  railroad: string;
  use: string;
  monitored: boolean;
  banks: string[];
  heard_by: string[];
  coverage: { state: CoverageState; healthy: number; total: number; label: string; pips: CoveragePip[] };
  state: ChannelState;
  status_readout: string | null;
  channel_fault: { reason?: string; label?: string; acked?: boolean; onset?: boolean } | null;
  tx: ChannelTx | null;
  last_heard: { tx_id: string; end_t: number; clock: string; age_s: number; age_label: string; via: string } | null;
  spark_60m: number[];
}

export interface Word {
  w: string;
  conf: number | null;
  t?: number;
}

export interface DetectorReading {
  mp_label: string | null;
  axles: number | null;
  mph: number | null;
  defect: boolean;
  defect_text?: string | null;
}

/** A transcript row or active transmission (scenario `transcript.rows[]` / `active_transmissions[]`). */
export interface TxRow {
  id: string;
  t_offset_s: number;
  clock: string;
  clock_tenths: string;
  aar: string;
  aar4: string;
  frequency_id: string;
  label: string;
  off_bank: boolean;
  feed_id: string;
  feed_label: string;
  role: string;
  role_tag: string;
  speaker: string;
  train_id: string | null;
  place_id: string | null;
  duration_s: number;
  state: TranscriptState;
  final_state: TranscriptState;
  live: boolean;
  transcript: string;
  words: Word[];
  confidence: number | null;
  detector: DetectorReading | null;
  sim: boolean;
  elapsed_s?: number;
  receptions?: Reception[];
}

export interface BankView {
  bank_id: string;
  name: string;
  tile_ids: string[];
  tile_count: number;
  hero: { mode: string; age_label: string | null; aar: string | null; label: string | null; line: string };
  displayed_feed: string;
  displayed_feed_label: string;
  off_bank_active: string[];
  off_bank_label: string | null;
  not_on_displayed_feed: string[];
  selector_extra_label: string | null;
}

export interface Bank {
  id: string;
  name: string;
  home_feed: string;
  frequency_ids: string[];
  sim: boolean;
}

export interface SystemInfo {
  host: {
    cpu_pct: number | null;
    soc_temp_c: number | null;
    throttled: boolean;
    under_voltage: boolean;
    uptime_s: number;
    state: string;
  };
  decoder: { queue: number; median_latency_s: number | null; state: "ok" | "backlog" | "fault" };
  disk: { pct: number; state: string };
}

export interface TrainPosition {
  train_id: string;
  operator: string;
  line: string;
  direction: string;
  route_id: string;
  route_mi: number;
  prefix: string;
  mp: number;
  mp_label: string;
  lat: number;
  lon: number;
  speed_mph: number;
  at_place: string | null;
  next_stop: string | null;
  next_stop_t: number | null;
  channel: string | null;
  talking: boolean;
  sim: boolean;
  data_block: [string, string];
}

export interface CtcRoute {
  trains: { train_id: string; route_mi: number; talking: boolean }[];
  detectors_talking: unknown[];
}

export interface Lofar {
  row_s: number;
  rows: number;
  row0: string;
  /** feed id -> channel number -> [[row, dbfs], ...] (sparse); the live backend may send dense rows. */
  cells: Record<string, Record<string, unknown>>;
}

export interface LiveState {
  scenario?: string;
  sim: boolean;
  tz: Tz;
  t_offset_s: number;
  clock: string;
  clock_tenths: string;
  active_bank: string;
  displayed_feed: string;
  banks: Bank[];
  header: Header;
  status_line: string[];
  faults: Fault[];
  degraded: Degraded[];
  feeds: Feed[];
  system: SystemInfo;
  channels: Channel[];
  views: Record<string, BankView>;
  active_transmissions: TxRow[];
  transcript: { rows: TxRow[]; count_today: number };
  trains: { tracked_count: number; positions: TrainPosition[] };
  ctc: Record<string, CtcRoute>;
  lofar_60m: Lofar;
}

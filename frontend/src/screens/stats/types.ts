/** The GET /api/stats?range= response (backend/app/services/stats.py), narrowed to what the screen reads. */

export type StatsRange = "today" | "yesterday" | "rolling_24h";

export interface ChannelStats {
  frequency_id: string;
  label: string;
  aar_channel: number;
  count: number;
  airtime_s: number;
  airtime_share: number;
  airtime_per_hour: number[];
  airtime_per_10min: number[];
}

export interface Detector {
  detector_id: string;
  name: string;
  mp_label: string;
  reports: number;
  defects: number;
  last: { clock: string; axles: number; mph: number; defect: boolean } | null;
}

export interface UptimeSpan {
  start_t: number;
  end_t: number;
  start: string;
  end: string;
  state: "fault" | "offline" | "stale";
  label: string;
  active: boolean;
}

export interface StatsView {
  start_t: number;
  end_t: number;
  start: string;
  end: string;
  hour_bins_start_t: number;
  hour_labels: string[];
  ten_min_bins_start_t: number;
  channels: Record<string, ChannelStats>;
  totals: { count: number; airtime_s: number; airtime_label: string; blips: number };
  busiest: { aar: string; label: string; share_label: string };
  top_channels: string[];
  top_talkers: { name: string; count: number }[];
  detectors: Detector[];
  decoder: {
    engine: string;
    final_rows: number;
    confidence_histogram: number[];
    median_latency_s: number | null;
  };
  feed_uptime: Record<string, UptimeSpan[]>;
}

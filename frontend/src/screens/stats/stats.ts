/** Pure helpers for the Stats screen: series building, the shared vertical rhythm, peak hours. Ported from design/mockups/stats.js. */

import type { ChannelStats, StatsView } from "./types";

export const DAY_S = 86400;
const MAX_RIDGES = 16;

/** Half-pixel snap for 1 px strokes. */
export const snap = (v: number): number => Math.round(v) + 0.5;
export const pad2 = (n: number): string => String(n).padStart(2, "0");

/** 3-bin (30 min) centred running mean; the ends average what exists. */
export function mean3(values: number[]): number[] {
  return values.map((_, i) => {
    const near = values.slice(Math.max(0, i - 1), i + 2);
    return near.reduce((a, b) => a + b, 0) / near.length;
  });
}

export function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))] || 0;
}

/** Runs of consecutive bins at or above the cap: [[first, last], ...]. */
export function capRuns(values: number[], cap: number): [number, number][] {
  const runs: [number, number][] = [];
  values.forEach((v, k) => {
    if (v < cap) return;
    const last = runs.at(-1);
    if (last && last[1] === k - 1) last[1] = k;
    else runs.push([k, k]);
  });
  return runs;
}

const sumColumns = (lists: number[][], n: number): number[] =>
  Array.from({ length: n }, (_, i) => lists.reduce((a, list) => a + (list[i] ?? 0), 0));

export interface Series {
  key: string;
  aar: string;
  label: string;
  bins: number[];
  hours: number[];
  airtimeS: number;
  share: number;
  /** the summed tail of small channels */
  other: boolean;
  frequencyId?: string;
}

export interface SeriesSet {
  series: Series[];
  /** channels drawn individually (without OTHER) */
  topCount: number;
  restCount: number;
  /** channels with any traffic */
  heard: number;
  monitored: number;
  /** the ALL CHANNELS ridge: every channel summed */
  allBins: number[];
}

/** Up to 16 channels with traffic by airtime; the rest summed as OTHER (n). */
export function buildSeries(stats: StatsView): SeriesSet {
  const all = Object.values(stats.channels);
  const heard = all.filter((c) => c.airtime_s > 0).sort((a, b) => b.airtime_s - a.airtime_s);
  const top = heard.slice(0, MAX_RIDGES);
  const rest = heard.slice(MAX_RIDGES);
  const bins = (c: ChannelStats) => c.airtime_per_10min;
  const nBins = Math.max(0, ...heard.map((c) => bins(c).length));
  const nHours = Math.max(0, ...heard.map((c) => c.airtime_per_hour.length));

  const series: Series[] = top.map((c) => ({
    key: c.frequency_id,
    aar: `CH${pad2(c.aar_channel)}`,
    label: c.label,
    bins: bins(c),
    hours: c.airtime_per_hour,
    airtimeS: c.airtime_s,
    share: c.airtime_share,
    other: false,
    frequencyId: c.frequency_id,
  }));
  if (rest.length) {
    series.push({
      key: "other",
      aar: "OTHER",
      label: `(${rest.length})`,
      bins: sumColumns(rest.map(bins), nBins),
      hours: sumColumns(rest.map((c) => c.airtime_per_hour), nHours),
      airtimeS: rest.reduce((a, c) => a + c.airtime_s, 0),
      share: rest.reduce((a, c) => a + c.airtime_share, 0),
      other: true,
    });
  }
  return {
    series,
    topCount: top.length,
    restCount: rest.length,
    heard: heard.length,
    monitored: all.length,
    allBins: sumColumns(heard.map(bins), nBins),
  };
}

/**
 * Shared vertical rhythm: ridge baselines and heatmap rows line up across the two panels.
 * Layout (svg y): dimension row, ALL ridge (3 pitches), 2-pitch gap, one pitch per ridge, hour ruler.
 */
export interface Rhythm {
  plotTop: number;
  pitch: number;
  amp: number;
  ampAll: number;
  allBase: number;
  /** baseline of ridge i */
  base: (i: number) => number;
}

export function rhythm(bodyHeight: number, ridges: number): Rhythm {
  const plotTop = 20;
  const rulerRoom = 32;
  const pitch = Math.floor((bodyHeight - plotTop - rulerRoom) / (ridges + 4));
  const ampAll = pitch * 3;
  const allBase = plotTop + ampAll;
  return { plotTop, pitch, amp: Math.round(pitch * 1.5), ampAll, allBase, base: (i) => allBase + (2 + i) * pitch };
}

/**
 * The time axis: a 24 h window. Today and yesterday start at 00:00; rolling 24 h starts at
 * `start_t`. `x0..x1` are the plot's pixel bounds.
 */
export class TimeAxis {
  readonly start: number;
  constructor(
    start: number,
    readonly x0: number,
    readonly x1: number,
  ) {
    this.start = start;
  }
  x = (t: number): number => this.x0 + ((t - this.start) / DAY_S) * (this.x1 - this.x0);
  /** whole hours inside the window: absolute second, the clock hour 0..23, and the printed hour (the closing tick of a calendar day reads 24) */
  hours(): { t: number; hour: number; label: number }[] {
    const first = Math.ceil(this.start / 3600);
    return Array.from({ length: 25 }, (_, k) => first + k)
      .filter((h) => h * 3600 <= this.start + DAY_S)
      .map((h) => {
        const hour = ((h % 24) + 24) % 24;
        return { t: h * 3600, hour, label: this.start === 0 && h * 3600 === DAY_S ? 24 : hour };
      });
  }
}

export interface PeakHour {
  name: string;
  /** absolute start second of the hour */
  t: number;
  hour: number;
  airtimeS: number;
  /** multiple of the 10-14 midday mean */
  times: string;
}

/** Total airtime per hour, all channels; AM and PM peaks against the 10-14 midday mean. */
export function peakHours(stats: StatsView, complete: boolean[]): PeakHour[] {
  const n = stats.hour_labels.length;
  const totals = Array.from({ length: n }, (_, i) => Object.values(stats.channels).reduce((a, c) => a + (c.airtime_per_hour[i] ?? 0), 0));
  const hourOf = (i: number) => Number(stats.hour_labels[i]);
  const idx = Array.from({ length: n }, (_, i) => i).filter((i) => complete[i]);
  const mid = idx.filter((i) => hourOf(i) >= 10 && hourOf(i) <= 13).map((i) => totals[i]);
  const midday = mid.length ? mid.reduce((a, b) => a + b, 0) / mid.length : null;

  const pick = (lo: number, hi: number, name: string): PeakHour | null => {
    const inBand = idx.filter((i) => hourOf(i) >= lo && hourOf(i) <= hi);
    const best = inBand.reduce<number | null>((b, i) => (b == null || totals[i] > totals[b] ? i : b), null);
    if (best == null || totals[best] <= 0) return null;
    return {
      name,
      t: stats.hour_bins_start_t + best * 3600,
      hour: hourOf(best),
      airtimeS: totals[best],
      times: midday ? (totals[best] / midday).toFixed(1) : "—",
    };
  };
  return [pick(5, 9, "AM PEAK"), pick(15, 19, "PM PEAK")].filter((p): p is PeakHour => p != null);
}

/** Hour bins that are complete inside the range (the partial first/last bins of a rolling window and the running hour of today are not). */
export function completeHours(stats: StatsView): boolean[] {
  return stats.hour_labels.map((_, i) => {
    const a = stats.hour_bins_start_t + i * 3600;
    return a >= stats.start_t && a + 3600 <= stats.end_t + 1;
  });
}

import { describe, expect, it } from "vitest";
import { buildSeries, capRuns, mean3, quantile, rhythm, TimeAxis } from "./stats";
import type { ChannelStats, StatsView } from "./types";

const channel = (id: string, airtime: number, bins: number[]): ChannelStats => ({
  frequency_id: id,
  label: id.toUpperCase(),
  aar_channel: 8,
  count: 1,
  airtime_s: airtime,
  airtime_share: 0.5,
  airtime_per_hour: [airtime],
  airtime_per_10min: bins,
});

describe("mean3", () => {
  it("averages what exists at the ends", () => {
    expect(mean3([3, 6, 9])).toEqual([4.5, 6, 7.5]);
  });
});

describe("quantile", () => {
  it("picks the 95th percentile index", () => {
    expect(quantile([1, 2, 3, 4, 100], 0.95)).toBe(4);
    expect(quantile([], 0.95)).toBe(0);
  });
});

describe("capRuns", () => {
  it("groups consecutive bins at or above the cap", () => {
    expect(capRuns([1, 5, 6, 2, 7], 5)).toEqual([
      [1, 2],
      [4, 4],
    ]);
  });
});

describe("rhythm", () => {
  it("puts ridge baselines one pitch apart below the ALL ridge", () => {
    const r = rhythm(372, 16);
    expect(r.pitch).toBe(16);
    expect(r.base(1) - r.base(0)).toBe(16);
    expect(r.allBase).toBe(20 + 48);
  });
});

describe("TimeAxis", () => {
  it("lists absolute hours of a rolling window with their clock hour", () => {
    const axis = new TimeAxis(-3600 * 2.5, 0, 240);
    const hours = axis.hours();
    expect(hours[0]).toEqual({ t: -7200, hour: 22, label: 22 });
    expect(hours.at(-1)?.t).toBe(-3600 * 2.5 + 86400 - ((-3600 * 2.5 + 86400) % 3600));
  });
});

describe("buildSeries", () => {
  it("sums channels beyond the 16th into OTHER", () => {
    const channels = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`c${i}`, channel(`c${i}`, 100 - i, [1, 2])]));
    const stats = { channels } as unknown as StatsView;
    const set = buildSeries(stats);
    expect(set.series).toHaveLength(17);
    expect(set.series.at(-1)).toMatchObject({ aar: "OTHER", label: "(2)", bins: [2, 4] });
    expect(set.allBins).toEqual([18, 36]);
  });
});

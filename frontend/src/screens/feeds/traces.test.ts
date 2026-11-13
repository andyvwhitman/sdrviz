import { describe, expect, it } from "vitest";
import { channelX, idleRipple, runsOf, sampledRows } from "./traces";

describe("traces", () => {
  it("places the first and last channel on the plot edges", () => {
    expect(channelX(7, 544)).toBe(0);
    expect(channelX(97, 544)).toBe(543);
  });

  it("the idle ripple is deterministic per feed", () => {
    expect(idleRipple("feed-lnd", 8)).toEqual(idleRipple("feed-lnd", 8));
    expect(idleRipple("feed-lnd", 8)).not.toEqual(idleRipple("feed-bay", 8));
  });

  it("a feed without samples is void from the newest row back to its last sample", () => {
    const rows = sampledRows({ rows: 10, rowS: 30, measured: false, lastSampleAgeS: 80, cellRows: new Set(), nowS: 1000 });
    expect(rows.slice(0, 4)).toEqual([false, false, false, true]);
    expect(runsOf(rows)).toEqual([
      { from: 0, to: 3, sampled: false },
      { from: 3, to: 10, sampled: true },
    ]);
  });

  it("per-minute health marks an earlier gap", () => {
    // now = 1200 s = minute 20; states for minutes 17..20; row 3 is at 1200 - 105 = minute 18
    const rows = sampledRows({ rows: 6, rowS: 30, measured: true, lastSampleAgeS: 0, cellRows: new Set(), minuteStates: ["ok", "stale", "ok", "ok"], nowS: 1200 });
    expect(rows[3]).toBe(false);
    expect(rows[0]).toBe(true);
  });
});

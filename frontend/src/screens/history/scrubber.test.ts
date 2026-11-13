import { describe, expect, it } from "vitest";
import { buildFeedsLane } from "./feedsLane";
import { buildScrubber, heatColumns } from "./scrubber";
import type { FeedSpan, Summary } from "./types";

describe("heatColumns", () => {
  it("is empty without data", () => expect(heatColumns([], 10)).toEqual([]));
  it("keeps silence at 0 and scales the busiest minute to the top of the ramp", () => {
    const busy = Array.from({ length: 100 }, (_, i) => (i === 50 ? 60 : 0));
    const columns = heatColumns(busy, 100);
    expect(columns).toHaveLength(100);
    expect(columns[0]).toBe(0);
    expect(Math.max(...columns)).toBeCloseTo(0.94);
  });
});

const span = (feed_id: string, state: FeedSpan["state"], start_t: number, end_t: number, active = false): FeedSpan => ({
  feed_id,
  state,
  start_t,
  end_t,
  label: state.toUpperCase(),
  active,
});

const lane = (spans: FeedSpan[]) => buildFeedsLane({ spans, t0: 0, t1: 86400, now: 86400, x0: 100, x1: 1100, y: 84 });
const glyphs = (prims: ReturnType<typeof lane>) => prims.filter((p) => p.t === "glyph");

describe("FEEDS lane", () => {
  it("is a solid line with a label when every feed is healthy", () => {
    const prims = lane([]);
    expect(prims.some((p) => p.t === "text" && p.s === "FEEDS")).toBe(true);
    expect(glyphs(prims)).toHaveLength(0);
  });
  it("puts a fault glyph at the now end for a live fault and names the feed", () => {
    const prims = lane([span("feed-lnd", "fault", 86000, 86400, true)]);
    expect(glyphs(prims)).toEqual([{ t: "glyph", cx: 1094, cy: 82, state: "fault" }]);
    expect(prims.some((p) => p.t === "text" && p.s.startsWith("LND-02"))).toBe(true);
  });
  it("shares one hollow triangle between past faults within 6 px", () => {
    const prims = lane([span("feed-alx", "fault", 40000, 40100), span("feed-bay", "fault", 40010, 40120)]);
    expect(glyphs(prims).filter((g) => g.t === "glyph" && g.state === "fault-past")).toHaveLength(1);
  });
});

describe("scrubber", () => {
  const summary: Summary = {
    range: { start_t: 0, end_t: 3600, start: "00:00", end: "01:00" },
    totals: { count: 0, airtime_s: 0, airtime_label: "00:00:00" },
    scrubber_start_t: 0,
    scrubber_airtime_per_min: new Array(1440).fill(1),
  };
  it("draws the playhead at the picked clip's time plus progress", () => {
    const pick = { t_offset_s: 43200, duration_s: 10 } as never;
    const { prims } = buildScrubber({
      width: 1072,
      small: false,
      summary,
      range: { start_t: 0, end_t: 3600, live: false },
      now: 86400,
      date: "2026-11-10",
      pick,
      progress: 0,
      spans: [],
      diskFault: false,
    });
    // strip x 72..1072: noon is the middle
    expect(prims.some((p) => p.t === "line" && p.cls === "hi-playhead" && p.x1 === 572)).toBe(true);
  });
});

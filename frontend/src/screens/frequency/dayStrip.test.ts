import { describe, expect, it } from "vitest";
import type { ActivityBucket } from "$lib/types/recordings";
import { barHeight, busiest, endsOf, fullScale, geometry, hourMarks, kindOf, silences, totalsOf, unrecordedLead, type BucketKind } from "./dayStrip";

const bucket = (start: string, count: number, airtime_s: number): ActivityBucket => ({ start, count, airtime_s });

describe("fullScale", () => {
  it("takes the smallest ladder step that holds the busiest bucket", () => {
    expect(fullScale([bucket("2026-11-17T05:00:00Z", 1, 30)])).toBe(1);
    expect(fullScale([bucket("2026-11-17T05:00:00Z", 1, 61)])).toBe(2);
    expect(fullScale([bucket("2026-11-17T05:00:00Z", 9, 252)])).toBe(5);
    expect(fullScale([bucket("2026-11-17T05:00:00Z", 9, 900)])).toBe(15);
    expect(fullScale([])).toBe(1);
  });
});

describe("geometry", () => {
  it("matches the direction's three sizes", () => {
    expect(geometry(1792, 96)).toEqual({ pitch: 18, bar: 14 });
    expect(geometry(1312, 96)).toEqual({ pitch: 13, bar: 10 });
    expect(geometry(358, 96)).toEqual({ pitch: 3, bar: 2 });
    expect(geometry(192, 96)).toEqual({ pitch: 2, bar: 1 });
  });
});

describe("barHeight", () => {
  it("is at least one pixel when anything was heard and zero when nothing was", () => {
    expect(barHeight(bucket("x", 1, 0.4), 5, 96)).toBe(1);
    expect(barHeight(bucket("x", 0, 0), 5, 96)).toBe(0);
    expect(barHeight(bucket("x", 3, 150), 5, 96)).toBe(48);
    expect(barHeight(bucket("x", 3, 900), 5, 96)).toBe(96);
  });
});

describe("kindOf", () => {
  const start = "2026-11-17T18:00:00.000Z";
  const end = Date.parse(start) + 15 * 60_000;
  const since = Date.parse("2026-11-17T10:00:00Z");
  it("tells zero from not recorded from the future from the bucket in progress", () => {
    const now = Date.parse("2026-11-17T18:05:00Z");
    expect(kindOf(bucket(start, 2, 9), end, since, now, true)).toBe("current");
    expect(kindOf(bucket(start, 2, 9), end, since, now + 3_600_000, true)).toBe("data");
    expect(kindOf(bucket(start, 0, 0), end, since, now + 3_600_000, true)).toBe("zero");
    expect(kindOf(bucket(start, 0, 0), end, Date.parse("2026-11-17T19:00:00Z"), now + 3_600_000, true)).toBe("unrecorded");
    expect(kindOf(bucket(start, 0, 0), end, null, now, true)).toBe("unrecorded");
    expect(kindOf(bucket(start, 0, 0), end, since, Date.parse("2026-11-17T17:00:00Z"), true)).toBe("future");
    expect(kindOf(bucket(start, 0, 0), end, since, Date.parse("2026-11-17T17:00:00Z"), false)).toBe("zero");
  });
});

describe("annotations", () => {
  it("sums the day and finds the busiest bucket", () => {
    const day = [bucket("a", 2, 10), bucket("b", 5, 40), bucket("c", 0, 0)];
    expect(totalsOf(day)).toEqual({ count: 7, airtimeS: 50 });
    expect(busiest(day)).toBe(1);
    expect(busiest([bucket("a", 0, 0)])).toBe(-1);
  });
  it("finds the longest silences of an hour or more, in time order", () => {
    const kinds: BucketKind[] = ["zero", "zero", "data", ...Array<BucketKind>(8).fill("zero"), "data", ...Array<BucketKind>(5).fill("zero"), "future"];
    expect(silences(kinds, 4, 3)).toEqual([{ from: 3, to: 11 }, { from: 12, to: 17 }]);
    expect(silences(kinds, 4, 1)).toEqual([{ from: 3, to: 11 }]);
  });
  it("finds the part of the day before recording began", () => {
    expect(unrecordedLead(["unrecorded", "unrecorded", "zero"])).toEqual({ from: 0, to: 2 });
    expect(unrecordedLead(["zero"])).toBeNull();
  });
});

describe("ruler", () => {
  it("marks the buckets that start on a local hour", () => {
    const day = ["05:00", "05:15", "05:30", "05:45", "06:00"].map((t) => bucket(`2026-11-17T${t}:00.000Z`, 0, 0));
    expect(hourMarks(day, "America/New_York")).toEqual([{ index: 0, hour: 0 }, { index: 4, hour: 1 }]);
    expect(endsOf(day)[4]).toBe(Date.parse("2026-11-17T06:15:00Z"));
  });
});

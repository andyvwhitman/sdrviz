import { describe, expect, it } from "vitest";
import type { ActivityBucket } from "$lib/types/recordings";
import { cellKind, hourEnds, rampStep } from "./weekGrid";

const hour = (start: string, count: number, airtime_s: number): ActivityBucket => ({ start, count, airtime_s });

describe("rampStep", () => {
  it("uses fixed thresholds: any, 1 min, 3 min, 10 min", () => {
    expect([0.5, 59, 60, 179, 180, 599, 600, 3000].map(rampStep)).toEqual([2, 2, 3, 3, 4, 4, 5, 5]);
  });
});

describe("cellKind", () => {
  const start = "2026-11-17T18:00:00.000Z";
  const end = Date.parse(start) + 3_600_000;
  const since = Date.parse("2026-11-17T00:00:00Z");
  const now = Date.parse("2026-11-17T23:00:00Z");
  it("draws nothing before recording began or in the future, an outline for zero, a fill for airtime", () => {
    expect(cellKind(hour(start, 0, 0), end, null, now)).toBe("none");
    expect(cellKind(hour(start, 0, 0), end, Date.parse("2026-11-17T19:00:00Z"), now)).toBe("none");
    expect(cellKind(hour(start, 0, 0), end, since, Date.parse("2026-11-17T17:00:00Z"))).toBe("none");
    expect(cellKind(hour(start, 0, 0), end, since, now)).toBe("zero");
    expect(cellKind(hour(start, 2, 9), end, since, now)).toBe("data");
    expect(cellKind(hour(start, 2, 9), end, since, Date.parse("2026-11-17T18:30:00Z"))).toBe("current");
  });
});

describe("hourEnds", () => {
  it("ends an hour where the next begins, and the last at the next day's start", () => {
    const hours = [hour("2026-11-17T05:00:00.000Z", 0, 0), hour("2026-11-17T06:00:00.000Z", 0, 0)];
    expect(hourEnds(hours, "2026-11-17T07:00:00.000Z")).toEqual([Date.parse("2026-11-17T06:00:00Z"), Date.parse("2026-11-17T07:00:00Z")]);
    expect(hourEnds(hours, undefined)[1]).toBe(Date.parse("2026-11-17T07:00:00Z"));
  });
});

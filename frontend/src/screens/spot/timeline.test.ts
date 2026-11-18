import { describe, expect, it } from "vitest";
import { clampOffset, fittingTags, horizonText, inWindow, pxPerMinute, tickSteps, windowOf } from "./timeline";

describe("timeline", () => {
  it("makes the window from the scrolled moment, keeping just-passed trains only at now", () => {
    expect(windowOf(0, 60)).toEqual({ fromS: -600, toS: 3600, live: true });
    expect(windowOf(90, 30)).toEqual({ fromS: 5400, toS: 7200, live: false });
    expect(windowOf(-45, 30)).toEqual({ fromS: -2700, toS: -900, live: false });
  });

  it("puts rows in or out of the window; an overdue timetable train stays only while live", () => {
    const live = windowOf(0, 30);
    const later = windowOf(60, 30);
    expect(inWindow({ remainingS: 600, group: "coming" }, live)).toBe(true);
    expect(inWindow({ remainingS: -300, group: "passed" }, live)).toBe(true);
    expect(inWindow({ remainingS: -900, group: "passed" }, live)).toBe(false);
    expect(inWindow({ remainingS: 2400, group: "coming" }, live)).toBe(false);
    expect(inWindow({ remainingS: 4000, group: "coming" }, later)).toBe(true);
    expect(inWindow({ remainingS: -900, group: "overdue" }, live)).toBe(true);
    expect(inWindow({ remainingS: -900, group: "overdue" }, later)).toBe(false);
  });

  it("keeps the offset inside the loaded hour back and six hours ahead", () => {
    expect(clampOffset(-200, 60)).toBe(-60);
    expect(clampOffset(400, 60)).toBe(300);
    expect(clampOffset(400, 120)).toBe(240);
    expect(clampOffset(12.4, 30)).toBe(12);
  });

  it("scales the tape so every window length takes the same width, with readable ticks", () => {
    expect(pxPerMinute(400, 60) * 60).toBeCloseTo(pxPerMinute(400, 120) * 120);
    expect(tickSteps(10)).toEqual({ minor: 5, label: 15 });
    expect(tickSteps(4)).toEqual({ minor: 5, label: 30 });
    expect(tickSteps(1)).toEqual({ minor: 15, label: 60 });
    expect(horizonText(30)).toBe("30 MIN");
    expect(horizonText(120)).toBe("2 H");
  });

  it("draws a tag only where it clears the last one", () => {
    expect(fittingTags([0, 30, 70, 100, 200], 66)).toEqual([0, 2, 4]);
    expect(fittingTags([], 66)).toEqual([]);
  });
});

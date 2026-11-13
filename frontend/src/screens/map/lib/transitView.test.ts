import { describe, expect, it } from "vitest";
import { hhmmss, nearestStop, ageNow, ageText, bboxParam, delayBarPx, delayCell, delayLabel, delayShort, delayTone, formatDelay, hhmm, timeTag, isStale, freshness, sinceText, snapBbox, thinByGrid, viewBbox, zoomBucket, bucketZoom } from "./transitView";

describe("delay", () => {
  it("is on time within two minutes either way", () => {
    expect(delayLabel(0)).toBe("ON TIME");
    expect(delayLabel(119)).toBe("ON TIME");
    expect(delayLabel(-119)).toBe("ON TIME");
  });
  it("says how late or early", () => {
    expect(delayLabel(120)).toBe("+2 MIN LATE");
    expect(delayLabel(905)).toBe("+15 MIN LATE");
    expect(delayLabel(-420)).toBe("7 MIN EARLY");
  });
  it("is blank when unknown", () => {
    expect(delayLabel(null)).not.toMatch(/MIN/);
  });
  it("uses a true minus for early", () => {
    expect(delayShort(-420)).toBe("\u22127 MIN");
    expect(formatDelay(-300)).toBe("\u22125 MIN");
  });
});

describe("delayTone", () => {
  it("steps by brightness at 2 and 5 minutes", () => {
    expect(delayTone(null)).toBe("unknown");
    expect(delayTone(0)).toBe("ok");
    expect(delayTone(119)).toBe("ok");
    expect(delayTone(-119)).toBe("ok");
    expect(delayTone(120)).toBe("slight");
    expect(delayTone(299)).toBe("slight");
    expect(delayTone(300)).toBe("late");
    expect(delayTone(-120)).toBe("early");
  });
});

describe("formatDelay", () => {
  it("is minutes under two hours", () => {
    expect(formatDelay(120)).toBe("+2 MIN");
    expect(formatDelay(119 * 60)).toBe("+119 MIN");
  });
  it("is hours and minutes from two hours", () => {
    expect(formatDelay(120 * 60)).toBe("+2 H 00");
    expect(formatDelay(361 * 60)).toBe("+6 H 01");
  });
  it("is hours for an early train too", () => {
    expect(formatDelay(-125 * 60)).toBe("\u22122 H 05");
  });
});

describe("delay bar", () => {
  it("only a late train has one, longer the later", () => {
    expect(delayBarPx(299)).toBe(0);
    expect(delayBarPx(-900)).toBe(0);
    expect(delayBarPx(300)).toBe(8);
    expect(delayBarPx(900)).toBe(12);
    expect(delayBarPx(3 * 3600)).toBe(24);
  });
});

describe("delayCell and timeTag", () => {
  it("reads the long form with the unit and the word", () => {
    expect(delayCell(905, true)).toEqual({ text: "+15 MIN LATE", tone: "late", barPx: 12 });
    expect(delayCell(361 * 60, true).text).toBe("+6 H 01 LATE");
    expect(delayCell(-420, true).text).toBe("7 MIN EARLY");
  });
  it("says SCHED when there is no realtime at all", () => {
    expect(timeTag(null, null)).toEqual({ text: "SCHED", tone: "unknown", barPx: 0 });
    expect(timeTag(0, "2026-11-13T17:42:00-05:00").text).toBe("ON TIME");
  });
});

describe("freshness", () => {
  it("adds the time since the response arrived", () => {
    expect(ageNow(10, 1000, 6000)).toBe(15);
    expect(ageNow(null, 0, 1)).toBeNull();
  });
  it("goes stale after the source's threshold", () => {
    expect(isStale(120, 120)).toBe(false);
    expect(isStale(121, 120)).toBe(true);
    expect(isStale(300, 360)).toBe(false);
    expect(isStale(null, 120)).toBe(false);
  });
  it("reads in seconds, minutes, hours", () => {
    expect(ageText(12.4)).toBe("12 S");
    expect(ageText(300)).toBe("5 MIN");
    expect(ageText(7200)).toBe("2.0 H");
  });
});

describe("hhmm", () => {
  it("keeps the wall clock of a local offset", () => {
    expect(hhmm("2026-11-13T17:42:00-05:00")).toBe("17:42");
    expect(hhmm("2026-11-13T17:42:00-06:00")).toBe("17:42");
  });
  it("shows UTC in Eastern time", () => {
    expect(hhmm("2026-11-13T22:42:00Z")).toBe("17:42");
    expect(hhmm("2026-11-13T22:42:00+00:00")).toBe("17:42");
  });
  it("is blank without a time", () => {
    expect(hhmm(null)).not.toMatch(/\d/);
  });
});

describe("bbox", () => {
  const invert = ([x, y]: [number, number]): [number, number] => [-80 + x / 100, 40 - y / 100];
  it("surrounds the canvas with a margin", () => {
    const [w, s, e, n] = viewBbox(invert, 1000, 500, 0.5);
    expect([w, s, e, n]).toEqual([-85, 32.5, -65, 42.5]);
  });
  it("snaps outwards to a stable grid", () => {
    const [w, s, e, n] = snapBbox([-77.31, 38.62, -75.9, 39.71]);
    expect(w).toBeLessThanOrEqual(-77.31);
    expect(s).toBeLessThanOrEqual(38.62);
    expect(e).toBeGreaterThanOrEqual(-75.9);
    expect(n).toBeGreaterThanOrEqual(39.71);
    expect(snapBbox([-77.3, 38.6, -75.9, 39.7])).toEqual(snapBbox([-77.31, 38.62, -75.91, 39.69]));
  });
  it("formats for the query string", () => {
    expect(bboxParam([-1, 2, 3, 4])).toBe("-1,2,3,4");
  });
});

describe("zoom bucket", () => {
  it("steps in half octaves, below 1 too", () => {
    expect(zoomBucket(1)).toBe(0);
    expect(zoomBucket(2)).toBe(2);
    expect(zoomBucket(0.05)).toBeLessThan(-6);
    expect(bucketZoom(zoomBucket(4))).toBe(4);
  });
});

describe("thinByGrid", () => {
  it("keeps the first of each cell", () => {
    const pts: [number, number][] = [[1, 1], [5, 5], [50, 5], [51, 6]];
    expect(thinByGrid(pts, (p) => p, 20)).toEqual([[1, 1], [50, 5]]);
  });
});

describe("nearestStop", () => {
  const stops = [{ id: "a", lon: -77.006, lat: 38.897 }, { id: "b", lon: -76.9, lat: 38.9 }];
  it("finds the stop within range", () => {
    expect(nearestStop(stops, -77.0065, 38.8975)?.id).toBe("a");
  });
  it("gives up beyond the range", () => {
    expect(nearestStop(stops, -77.2, 38.9)).toBeNull();
  });
});

describe("hhmmss", () => {
  it("keeps local seconds and converts UTC", () => {
    expect(hhmmss("2026-11-13T14:32:05-05:00")).toBe("14:32:05");
    expect(hhmmss("2026-11-13T19:32:05Z")).toBe("14:32:05");
  });
});

describe("freshness levels", () => {
  it("is fresh within the source limit, stale past it, old past ten minutes", () => {
    expect(freshness(30, 120)).toBe("fresh");
    expect(freshness(121, 120)).toBe("stale");
    expect(freshness(400, 360)).toBe("stale");
    expect(freshness(601, 360)).toBe("old");
    expect(freshness(null, 120)).toBe("unknown");
  });
});

describe("sinceText", () => {
  it("counts seconds under a minute, then whole minutes", () => {
    expect(sinceText(42.7)).toBe("42 s");
    expect(sinceText(59.9)).toBe("59 s");
    expect(sinceText(60)).toBe("1 min");
    expect(sinceText(185)).toBe("3 min");
    expect(sinceText(null)).toBe("unknown");
  });
});

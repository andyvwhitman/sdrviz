import { describe, expect, it } from "vitest";
import { panelQuery, parsePanel, shiftDate, stationHighlight } from "./panel";

const from = (qs: string) => (name: string) => new URLSearchParams(qs).get(name);

describe("panel query", () => {
  it("reads a station, a trip and a route", () => {
    expect(parsePanel(from("page=station&id=st%3Awas"))).toEqual({ kind: "station", id: "st:was", date: null, full: false });
    expect(parsePanel(from("page=trip&id=marc:Train871&full=1"))).toEqual({ kind: "trip", id: "marc:Train871", date: null, full: true });
    expect(parsePanel(from("page=route&id=marc:11704&date=2026-11-13"))?.date).toBe("2026-11-13");
  });
  it("ignores a missing id, an unknown page and a bad date", () => {
    expect(parsePanel(from("page=station"))).toBeNull();
    expect(parsePanel(from("page=wall&id=x"))).toBeNull();
    expect(parsePanel(from("page=route&id=r&date=tomorrow"))?.date).toBeNull();
    expect(parsePanel(from("page=trip&id=t&date=2026-11-13"))?.date).toBeNull();
  });
  it("writes the query, and clears it", () => {
    expect(panelQuery({ kind: "route", id: "r", date: "2026-11-13", full: true })).toEqual({ page: "route", id: "r", date: "2026-11-13", full: "1" });
    expect(panelQuery({ kind: "station", id: "st:was", date: null, full: false })).toEqual({ page: "station", id: "st:was", date: null, full: null });
    expect(panelQuery(null)).toEqual({ page: null, id: null, date: null, full: null });
  });
});

describe("shiftDate", () => {
  it("crosses month and year ends", () => {
    expect(shiftDate("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("stationHighlight", () => {
  const station = { kind: "station", id: "amtrak:WAS", date: null, full: false } as const;
  it("uses the canonical id the board reported for the opened id", () => {
    expect(stationHighlight(station, { for: "amtrak:WAS", id: "st:was" })).toBe("st:was");
  });
  it("uses the id in the URL until the board answers, or when the answer is for another id", () => {
    expect(stationHighlight(station, null)).toBe("amtrak:WAS");
    expect(stationHighlight(station, { for: "amtrak:BAL", id: "st:bal" })).toBe("amtrak:WAS");
  });
  it("is null for a trip or route panel, or none", () => {
    expect(stationHighlight({ kind: "trip", id: "t", date: null, full: false }, null)).toBeNull();
    expect(stationHighlight(null, null)).toBeNull();
  });
});

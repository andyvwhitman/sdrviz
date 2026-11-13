import { describe, expect, it } from "vitest";
import { endpoint, estMark, stateWord, stopCode, stopTimes, timeCell, trackCell } from "./boardView";

const at = (hm: string) => `2026-11-13T${hm}:00-05:00`;

describe("timeCell", () => {
  it("is the one time when schedule and expected agree or there is no realtime", () => {
    expect(timeCell(at("15:57"), at("15:57"))).toEqual({ scheduled: null, time: "15:57" });
    expect(timeCell(at("15:57"), null)).toEqual({ scheduled: null, time: "15:57" });
  });
  it("strikes the scheduled time beside the expected one when late", () => {
    expect(timeCell(at("15:12"), at("15:57"))).toEqual({ scheduled: "15:12", time: "15:57" });
  });
  it("shows the expected time of a passed row, not the timetable's", () => {
    expect(timeCell(at("12:00"), at("12:09")).time).toBe("12:09");
  });
});

describe("stateWord", () => {
  it("says LEFT or IN only on position basis", () => {
    expect(stateWord({ state: "passed", state_basis: "position" }, "departures")).toBe("LEFT");
    expect(stateWord({ state: "passed", state_basis: "position" }, "arrivals")).toBe("IN");
  });
  it("marks a clock-only passed row as an estimate and never says LEFT", () => {
    expect(stateWord({ state: "passed", state_basis: "clock" }, "departures")).toBe("EST. PASSED");
    expect(stateWord({ state: "passed", state_basis: "clock" }, "arrivals")).not.toMatch(/LEFT|^IN$/);
  });
  it("is empty for rows that have not passed", () => {
    expect(stateWord({ state: "upcoming", state_basis: "position" }, "departures")).toBe("");
    expect(stateWord({ state: "cancelled" }, "departures")).toBe("");
  });
});

describe("trackCell", () => {
  it("shows the track when there is one", () => {
    expect(trackCell({ track: "12", source: "amtrak" }, "WAS")).toBe("12");
    expect(trackCell({ track: "2", source: "vre" }, null)).toBe("2");
  });
  it("says TBD for an Amtrak row at WAS, BAL and NYP without a track", () => {
    expect(trackCell({ track: null, source: "amtrak" }, "WAS")).toBe("TBD");
    expect(trackCell({ track: null, source: "amtrak" }, "nyp")).toBe("TBD");
  });
  it("says nothing elsewhere", () => {
    expect(trackCell({ track: null, source: "amtrak" }, "BWI")).toBe("");
    expect(trackCell({ track: null, source: "marc" }, "WAS")).toBe("");
    expect(trackCell({ track: null, source: "amtrak" }, null)).toBe("");
  });
});

describe("endpoint", () => {
  const row = { origin: "BOSTON SOUTH", destination: "WASHINGTON UNION", headsign: "WASHINGTON", route_name: "Acela" };
  it("is the origin for arrivals and the destination for departures", () => {
    expect(endpoint(row, "arrivals")).toBe("BOSTON SOUTH");
    expect(endpoint(row, "departures")).toBe("WASHINGTON UNION");
  });
  it("falls back to the headsign, then the route", () => {
    expect(endpoint({ origin: null, destination: null, headsign: "NORFOLK", route_name: null }, "departures")).toBe("NORFOLK");
    expect(endpoint({ origin: null, destination: null, headsign: null, route_name: "Acela" }, "departures")).toBe("Acela");
  });
});

describe("stopCode", () => {
  it("reads the Amtrak code of a group or Amtrak stop id", () => {
    expect(stopCode("st:was")).toBe("WAS");
    expect(stopCode("amtrak:NYP")).toBe("NYP");
    expect(stopCode("marc:12345")).toBeNull();
  });
});

describe("stopTimes", () => {
  it("is a pair at a layover", () => {
    const s = { arr_scheduled: at("17:02"), arr_estimated: null, dep_scheduled: at("17:10"), dep_estimated: null };
    expect(stopTimes(s)).toMatchObject({ arrival: "17:02", time: "17:10" });
  });
  it("is one time when arrival and departure agree, or a stop has only one", () => {
    expect(stopTimes({ arr_scheduled: at("17:02"), arr_estimated: null, dep_scheduled: at("17:02"), dep_estimated: null })).toMatchObject({ arrival: null, time: "17:02" });
    expect(stopTimes({ arr_scheduled: null, arr_estimated: null, dep_scheduled: at("08:00"), dep_estimated: null })).toMatchObject({ arrival: null, time: "08:00" });
    expect(stopTimes({ arr_scheduled: at("19:00"), arr_estimated: null, dep_scheduled: null, dep_estimated: null }).time).toBe("19:00");
  });
  it("prefers the expected times", () => {
    const s = { arr_scheduled: at("17:02"), arr_estimated: at("17:12"), dep_scheduled: at("17:10"), dep_estimated: at("17:20") };
    expect(stopTimes(s)).toMatchObject({ arrival: "17:12", time: "17:20" });
  });
});

describe("estMark", () => {
  it("only marks the clock basis", () => {
    expect(estMark("clock")).toBe("EST. ");
    expect(estMark("position")).toBe("");
    expect(estMark(undefined)).toBe("");
  });
});

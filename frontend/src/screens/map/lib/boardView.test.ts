import { describe, expect, it } from "vitest";
import { endpoint, estMark, passTime, PASS_LABEL, rowsFor, stateWord, stopCode, stopTimes, timeCell, trackCell } from "./boardView";

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
    expect(trackCell({ track: "12", source: "amtrak" }, [])).toBe("12");
    expect(trackCell({ track: "2", source: "vre" }, [])).toBe("2");
  });
  it("says TBD only when the same agency already announced a track on this board", () => {
    const rows = [{ track: "3", source: "amtrak" }, { track: null, source: "amtrak" }, { track: null, source: "marc" }];
    expect(trackCell(rows[1], rows)).toBe("TBD");
    expect(trackCell(rows[2], rows)).toBe("");
  });
  it("says nothing where no track has been announced", () => {
    const rows = [{ track: null, source: "amtrak" }, { track: null, source: "amtrak" }];
    expect(trackCell(rows[0], rows)).toBe("");
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

describe("passes", () => {
  it("formats an approximate time with a tilde, the expected one when there is realtime", () => {
    expect(passTime(at("14:32"), null)).toBe("~14:32");
    expect(passTime(at("14:32"), at("14:41"))).toBe("~14:41");
  });
  it("labels every pass row, never like a stop", () => {
    expect(PASS_LABEL).toBe("PASSES \u00B7 DOES NOT STOP");
  });
  it("keeps passes out of departures and arrivals", () => {
    const board = { departures: [{ trip_id: "d" }], arrivals: [{ trip_id: "a" }], passing: [{ trip_id: "p" }] } as never;
    expect(rowsFor(board, "departures").map((r) => r.trip_id)).toEqual(["d"]);
    expect(rowsFor(board, "arrivals").map((r) => r.trip_id)).toEqual(["a"]);
    expect(rowsFor(board, "passing").map((r) => r.trip_id)).toEqual(["p"]);
  });
  it("has no passing rows without the parameter", () => {
    expect(rowsFor({ departures: [], arrivals: [] } as never, "passing")).toEqual([]);
    expect(rowsFor(null, "passing")).toEqual([]);
  });
});

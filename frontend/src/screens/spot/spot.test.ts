import { describe, expect, it } from "vitest";
import {
  armNames, basisLine, basisOf, etaText, fromLabel, ladderFraction, meets, parseLatLon, passedText, rowEta, rowOf, searchStops, sideOf, sortRows, stopWord,
} from "./spot";
import { APPROACHING } from "./fixture";

const trainNamed = (name: string) => APPROACHING.trains.find((t) => t.train === name)!;

describe("basisOf", () => {
  it("maps the API's basis: live is tracked", () => {
    expect(basisOf(trainNamed("537"))).toBe("tracked");
  });
  it("marks a position older than the source's limit as stale", () => {
    expect(basisOf(trainNamed("171"))).toBe("stale");
  });
  it("calls a trip-update ETA predicted and a timetable ETA scheduled", () => {
    expect(basisOf(trainNamed("448"))).toBe("predicted");
    expect(basisOf(trainNamed("540"))).toBe("scheduled");
  });

});

describe("eta text", () => {
  const row = (remainingS: number, approx = false, group: "coming" | "passed" | "overdue" = "coming") => ({ remainingS, approx, group });
  it("reads whole minutes, bare when measured", () => {
    expect(etaText(row(240))).toBe("4 MIN");
    expect(etaText(row(100))).toBe("2 MIN");
  });
  it("puts a ~ on anything not measured", () => {
    expect(etaText(row(420, true))).toBe("~7 MIN");
  });
  it("says DUE under half a minute and for an overdue timetable train", () => {
    expect(etaText(row(29))).toBe("DUE");
    expect(etaText(row(-200, true, "overdue"))).toBe("DUE");
  });
  it("shows hours past two", () => {
    expect(etaText(row(80 * 60, true))).toBe("~80 MIN");
    expect(etaText(row(125 * 60, true))).toBe("~2 H 05");
  });
  it("counts passed trains back, with the same approximate mark", () => {
    expect(passedText({ remainingS: -185, approx: false })).toBe("PASSED 3M");
    expect(passedText({ remainingS: -185, approx: true })).toBe("PASSED ~3M");
  });
});

describe("rows", () => {
  it("sorts coming by ETA and passed oldest first, and counts down with elapsed time", () => {
    const { passed, coming } = sortRows(APPROACHING.trains, 0);
    expect(passed.map((r) => r.train.train)).toEqual(["2160"]);
    expect(coming.map((r) => r.train.train)).toEqual(["537", "448", "171", "540", "2163"]);
    const later = sortRows(APPROACHING.trains, 250);
    expect(later.passed.map((r) => r.train.train)).toEqual(["2160", "537"]);
  });
  it("treats a train that does not stop here as approximate even when tracked", () => {
    const row = rowOf({ ...trainNamed("537"), station: null }, 0);
    expect(row.basis).toBe("tracked");
    expect(row.passes).toBe(true);
    expect(row.approx).toBe(true);
    expect(rowEta(row)).toBe("~4 MIN");
  });
  it("parks a timetable train that is overdue, and drops it after ten minutes", () => {
    const sched = trainNamed("540");
    expect(rowOf(sched, 800).group).toBe("overdue");
    expect(basisLine(rowOf(sched, 800))).toBe("DUE · NO REALTIME");
    expect(sortRows([sched], 800).coming).toHaveLength(1);
    expect(sortRows([sched], 1400)).toEqual({ passed: [], coming: [] });
  });
  it("writes the basis with the age of the position", () => {
    expect(basisLine(rowOf(trainNamed("537"), 0))).toBe("TRACKED · POS 18S");
    expect(basisLine(rowOf(trainNamed("171"), 0))).toBe("STALE · POS 3M");
    expect(basisLine(rowOf(trainNamed("540"), 0))).toBe("SCHEDULED");
  });
});

describe("ladder", () => {
  it("puts trains moving east on the left and west on the right", () => {
    expect(sideOf(90)).toBe("left");
    expect(sideOf(270)).toBe("right");
    expect(sideOf(41)).toBe("left");
    expect(sideOf(225)).toBe("right");
    expect(sideOf(0)).toBe("left");
    expect(sideOf(180)).toBe("right");
  });
  it("names the arm by where the train comes from", () => {
    expect(fromLabel(41)).toBe("FROM SW");
    expect(fromLabel(225)).toBe("FROM NE");
  });
  it("scales minutes to a fraction, with the spot at the middle and nothing past 30 minutes", () => {
    expect(ladderFraction({ remainingS: 0, side: "left" })).toBe(0.5);
    expect(ladderFraction({ remainingS: 900, side: "left" })).toBeCloseTo(0.25);
    expect(ladderFraction({ remainingS: 900, side: "right" })).toBeCloseTo(0.75);
    expect(ladderFraction({ remainingS: 31 * 60, side: "right" })).toBeNull();
  });
  it("finds meets between opposite directions within two minutes", () => {
    // 537 (right, 240 s) and 448 (left, 300 s); 537 runs through, so the pair is worth watching
    const trains = APPROACHING.trains.map((t) => (t.train === "537" ? { ...t, station: null } : t));
    const { coming } = sortRows(trains, 0);
    expect(meets(coming).map((m) => [m.left.train.train, m.right.train.train])).toEqual([["448", "537"]]);
  });
});

describe("position input", () => {
  it("parses latitude and longitude", () => {
    expect(parseLatLon("39.0869, -76.7065")).toEqual({ lat: 39.0869, lon: -76.7065 });
    expect(parseLatLon("39.0869 -76.7065")).toEqual({ lat: 39.0869, lon: -76.7065 });
  });
  it("rejects text and out-of-range values", () => {
    expect(parseLatLon("odenton")).toBeNull();
    expect(parseLatLon("95, 10")).toBeNull();
    expect(parseLatLon("39, -190")).toBeNull();
  });
  it("finds a station by part of its name", () => {
    const stops = [{ name: "Odenton" }, { name: "Baltimore Penn Station" }, { name: "Odenton South Lot" }];
    expect(searchStops(stops, "odent").map((s) => s.name)).toEqual(["Odenton", "Odenton South Lot"]);
    expect(searchStops(stops, "penn bal")).toHaveLength(1);
    expect(searchStops(stops, "")).toEqual([]);
  });
});

describe("stop word", () => {
  it("says what the train does at the spot's station", () => {
    const at = (stops: boolean, role: "origin" | "terminus" | null) => ({ station: { id: "x", name: "X", distance_m: 100, stops, role, scheduled: null, eta: null, delay_s: null } });
    expect(stopWord(at(true, null))).toBe("STOPS");
    expect(stopWord(at(true, "origin"))).toBe("DEPARTS");
    expect(stopWord(at(true, "terminus"))).toBe("TERMINATES");
    expect(stopWord(at(false, null))).toBe("PASSES");
    expect(stopWord({ station: null })).toBe("PASSES");
  });
});

describe("meets", () => {
  it("is not a meet when both trains stop at the spot's station", () => {
    const { coming } = sortRows(APPROACHING.trains, 0);
    const bothStop = coming.map((r) => ({ ...r, passes: false }));
    expect(meets(bothStop)).toEqual([]);
  });
  it("lists the soonest first", () => {
    const { coming } = sortRows(APPROACHING.trains, 0);
    const found = meets(coming);
    const latest = found.map((m) => Math.max(m.left.remainingS, m.right.remainingS));
    expect(latest).toEqual([...latest].sort((a, b) => a - b));
  });
});

describe("arm names", () => {
  it("names each arm by where the opposite side's trains are heading, with the timetable tag of its own", () => {
    const { passed, coming } = sortRows(APPROACHING.trains, 0);
    const arms = armNames([...passed, ...coming], 41);
    // right-side trains (SB) head for Washington: that is the left arm
    expect(arms.left).toEqual({ name: "WASHINGTON", tag: "NB", compass: false });
    expect(arms.right.tag).toBe("SB");
  });
  it("falls back to the compass point for a side with no trains", () => {
    expect(armNames([], 41)).toEqual({ left: { name: "SW", tag: "", compass: true }, right: { name: "NE", tag: "", compass: true } });
  });
  it("breaks ties alphabetically so the label does not flicker", () => {
    const { coming } = sortRows(APPROACHING.trains, 0);
    const right = coming.filter((r) => r.side === "right");
    const toward = (name: string) => (r: (typeof right)[number]) => ({ ...r, train: { ...r.train, direction: { ...r.train.direction, toward: name } } });
    const rows = [toward("BOSTON")(right[0]), toward("ALBANY")(right[1])];
    expect(armNames(rows, 41).left.name).toBe("ALBANY");
  });
});

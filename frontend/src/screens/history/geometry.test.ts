import { describe, expect, it } from "vitest";
import { equationIndex, mpAt, mpAtPrefix, miAtPrefix, nearestRoute, parseRange, shiftTrain, shortName, trainMi, viewport } from "./geometry";
import type { Route, RoutePoint, Train } from "./types";

const point = (place_id: string, route_mi: number, prefix: string | null, mp: number | null, extra: Partial<RoutePoint> = {}): RoutePoint => ({
  place_id,
  name: place_id,
  kind: "station",
  lat: 39 + route_mi / 100,
  lon: -77,
  prefix,
  mp,
  mp_approx: false,
  mp_label: prefix ? `${prefix} ${mp}` : "",
  route_mi,
  ...extra,
});

// a route whose count changes at mile 10: CFP counts up 100 -> 110, then NEC counts down 135 -> 125
const route: Route = {
  id: "r-test",
  name: "TEST",
  length_mi: 20,
  points: [point("a", 0, "CFP", 100), point("b", 10, "CFP", 110), point("c", 10, "NEC", 135), point("d", 20, "NEC", 125)],
};

const train: Train = {
  train_id: "MARC 410",
  line: "Penn Line",
  direction: "SB",
  start_t: 1000,
  end_t: 1600,
  routes: ["r-test"],
  stops: [
    { place_id: "a", route_id: "r-test", route_mi: 0, t: 1000 },
    { place_id: "d", route_id: "r-test", route_mi: 20, t: 1600 },
  ],
};

describe("parseRange", () => {
  it("reads HH:MM-HH:MM into seconds", () => expect(parseRange("13:00-14:30")).toEqual([46800, 52200]));
  it("rejects a backwards or malformed range", () => {
    expect(parseRange("14:00-13:00")).toBeNull();
    expect(parseRange("noon")).toBeNull();
    expect(parseRange(null)).toBeNull();
  });
});

describe("trainMi", () => {
  it("interpolates between stops", () => expect(trainMi(train, 1300)).toBeCloseTo(10));
  it("is null outside the run", () => {
    expect(trainMi(train, 900)).toBeNull();
    expect(trainMi(train, 1700)).toBeNull();
  });
});

describe("shiftTrain", () => {
  it("moves every time by the shift", () => {
    const moved = shiftTrain(train, -86400);
    expect(moved.start_t).toBe(1000 - 86400);
    expect(moved.stops[1].t).toBe(1600 - 86400);
    expect(moved.stops[1].route_mi).toBe(20);
  });
  it("returns the same run for no shift", () => expect(shiftTrain(train, 0)).toBe(train));
});

describe("milepost maths", () => {
  it("finds native MP by count", () => {
    expect(mpAtPrefix(route, "CFP", 5)).toBeCloseTo(105);
    expect(mpAtPrefix(route, "NEC", 15)).toBeCloseTo(130);
  });
  it("inverts MP to route miles", () => {
    expect(miAtPrefix(route, "CFP", 105)).toBeCloseTo(5);
    expect(miAtPrefix(route, "NEC", 130)).toBeCloseTo(15);
    expect(miAtPrefix(route, "NEC", 200)).toBeNull();
  });
  it("picks the count on the side a mile lies on", () => {
    expect(mpAt(route, 4)?.prefix).toBe("CFP");
    expect(mpAt(route, 16)?.prefix).toBe("NEC");
  });
  it("finds the MP equation", () => expect(equationIndex(route)).toBe(2));
});

describe("viewport and names", () => {
  it("shows a whole route unless it is the NEC", () => expect(viewport(route)).toEqual([0, 20]));
  it("shortens seed place names", () => {
    expect(shortName({ place_id: "x", name: "Camden Station (Camden Yards)" })).toBe("CAMDEN");
    expect(shortName({ place_id: "wash-union", name: "Washington Union Station" })).toBe("WASHINGTON");
    expect(shortName({ place_id: "y", name: "Ivy City Yard" })).toBe("IVY CITY YD");
  });
});

describe("nearestRoute", () => {
  it("assigns a place to the route with the nearest point", () => {
    const other: Route = { ...route, id: "r-far", points: [point("z", 0, null, null, { lat: 10, lon: 10 })] };
    expect(nearestRoute([other, route], [39.05, -77])).toBe("r-test");
  });
});

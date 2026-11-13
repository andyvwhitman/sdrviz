import { describe, expect, it } from "vitest";
import { cleanName, displayName } from "./displayName";

describe("cleanName", () => {
  it("drops the agency and boilerplate words at the end", () => {
    expect(cleanName("BWI RAIL STATION MARC")).toBe("BWI");
    expect(cleanName("SLIDELL AMTRAK STATION")).toBe("SLIDELL");
    expect(cleanName("NY MOYNIHAN TRAIN HALL AT PENN STATION")).toBe("NY MOYNIHAN TRAIN HALL");
    expect(cleanName("PERRYVILLE MARC")).toBe("PERRYVILLE");
  });
  it("drops an agency word in the middle", () => {
    expect(cleanName("UNION STATION MARC WASHINGTON")).toBe("UNION STATION WASHINGTON");
  });
  it("keeps case and leaves a clean name alone", () => {
    expect(cleanName("Washington Union Station")).toBe("Washington Union");
    expect(cleanName("Alexandria")).toBe("Alexandria");
  });
  it("strips STATION only while the result stays unique among the peers", () => {
    expect(cleanName("CAMDEN STATION MARC", ["CAMDEN STATION MARC", "BALTIMORE PENN"])).toBe("CAMDEN");
    expect(cleanName("PENN STATION", ["PENN STATION", "PENN"])).toBe("PENN STATION");
    expect(cleanName("PENN STATION", ["PENN STATION", "PENN AMTRAK"])).toBe("PENN STATION");
  });
  it("is not fooled by itself as a peer", () => {
    expect(cleanName("CAMDEN STATION", ["CAMDEN STATION"])).toBe("CAMDEN");
  });
  it("never empties a name", () => {
    expect(cleanName("STATION")).toBe("STATION");
    expect(cleanName("MARC")).toBe("MARC");
  });
});

describe("displayName", () => {
  it("prefers the short name of a grouped station", () => {
    expect(displayName({ name: "Washington Union Station", short_name: "Washington Union" })).toBe("Washington Union");
  });
  it("cleans the name when there is none", () => {
    expect(displayName({ name: "BWI RAIL STATION MARC", short_name: null })).toBe("BWI");
    expect(displayName({ name: "ALEXANDRIA" })).toBe("ALEXANDRIA");
  });
});

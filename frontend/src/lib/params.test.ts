// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { carryGlobals, parseParams } from "./params";

describe("parseParams", () => {
  it("defaults to the 1920 stage on a wide window and 1440 on a narrow one", () => {
    expect(parseParams("", 1920, false).size).toBe(1920);
    expect(parseParams("", 1600, false).size).toBe(1440);
    expect(parseParams("?size=1440", 1920, false).size).toBe(1440);
    expect(parseParams("?size=1920", 1200, false).size).toBe(1920);
  });

  it("reads the scenario, freeze, speed, build and gray switches", () => {
    expect(parseParams("?scenario=keyed&freeze=1&speed=30&build=0&gray=1&force=nolink", 1920, false)).toMatchObject({
      scenario: "keyed",
      freeze: true,
      speed: 30,
      build: false,
      gray: true,
      force: "nolink",
    });
    expect(parseParams("", 1920, false)).toMatchObject({ scenario: null, freeze: false, speed: 1, build: true, gray: false });
  });

  it("motion follows the URL, then the OS preference", () => {
    expect(parseParams("", 1920, true).motion).toBe("reduced");
    expect(parseParams("?motion=full", 1920, true).motion).toBe("full");
    expect(parseParams("?motion=nonsense", 1920, false).motion).toBe("full");
  });
});

describe("carryGlobals", () => {
  it("keeps the global parameters and drops screen parameters", () => {
    expect(carryGlobals("?scenario=keyed&freeze=1&select=amtk-nec-road&size=1440")).toBe("scenario=keyed&freeze=1&size=1440");
    expect(carryGlobals("")).toBe("");
  });
});

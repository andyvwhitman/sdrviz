import { describe, expect, it } from "vitest";
import { backoffDelayS, linkStatus, retryInfo } from "./link";

describe("backoffDelayS", () => {
  it("doubles 1, 2, 4, 8 and then holds at the cap", () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(backoffDelayS)).toEqual([1, 2, 4, 8, 8, 8, 8]);
  });
});

describe("linkStatus", () => {
  it("is live whenever data has arrived", () => {
    expect(linkStatus({ hasData: true, everLive: true, dropAgeS: null })).toBe("live");
  });

  it("is connecting at the start, and for the first-data wait", () => {
    expect(linkStatus({ hasData: false, everLive: false, dropAgeS: null })).toBe("connecting");
    expect(linkStatus({ hasData: false, everLive: false, dropAgeS: 5 })).toBe("connecting");
  });

  it("reconnects at once after a drop, and gives up at 15 s", () => {
    expect(linkStatus({ hasData: false, everLive: true, dropAgeS: 0 })).toBe("reconnecting");
    expect(linkStatus({ hasData: false, everLive: true, dropAgeS: 14.9 })).toBe("reconnecting");
    expect(linkStatus({ hasData: false, everLive: true, dropAgeS: 15 })).toBe("no-link");
    expect(linkStatus({ hasData: false, everLive: false, dropAgeS: 20 })).toBe("no-link");
  });
});

describe("retryInfo", () => {
  // the fixtures in data/sim/scenarios/system.json
  it("matches the scripted retries", () => {
    expect(retryInfo(9)).toEqual({ attempt: 4, inS: 6 });
    expect(retryInfo(22)).toEqual({ attempt: 5, inS: 1 });
  });
});

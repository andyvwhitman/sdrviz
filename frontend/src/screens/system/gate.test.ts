import { describe, expect, it } from "vitest";
import { gateState } from "./gate";

describe("gateState", () => {
  it("follows the link while nothing is forced", () => {
    expect(gateState({ forced: null, link: "connecting" })).toBe("connecting");
    expect(gateState({ forced: null, link: "reconnecting" })).toBe("reconnecting");
    expect(gateState({ forced: null, link: "no-link" })).toBe("no-link");
    expect(gateState({ forced: null, link: "live" })).toBe("live");
  });

  it("a forced state wins, an unknown one is ignored", () => {
    expect(gateState({ forced: "no-link", link: "live" })).toBe("no-link");
    expect(gateState({ forced: "banana", link: "live" })).toBe("live");
  });
});

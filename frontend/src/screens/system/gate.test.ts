import { describe, expect, it } from "vitest";
import { gateState } from "./gate";

describe("gateState", () => {
  it("follows the link while nothing is forced", () => {
    expect(gateState({ forced: null, link: "connecting", bankEmpty: null })).toBe("connecting");
    expect(gateState({ forced: null, link: "reconnecting", bankEmpty: false })).toBe("reconnecting");
    expect(gateState({ forced: null, link: "no-link", bankEmpty: false })).toBe("no-link");
    expect(gateState({ forced: null, link: "live", bankEmpty: false })).toBe("live");
  });

  it("a live link with an empty active bank is the empty-bank state", () => {
    expect(gateState({ forced: null, link: "live", bankEmpty: true })).toBe("empty-bank");
  });

  it("a forced state wins, an unknown one is ignored", () => {
    expect(gateState({ forced: "no-link", link: "live", bankEmpty: false })).toBe("no-link");
    expect(gateState({ forced: "banana", link: "live", bankEmpty: false })).toBe("live");
  });
});

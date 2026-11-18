import { describe, expect, it } from "vitest";
import { cyclicAge, DAY_S } from "./time";

describe("cyclicAge", () => {
  it("is the seconds from then to now, across midnight too", () => {
    expect(cyclicAge(100, 40)).toBe(60);
    expect(cyclicAge(30, DAY_S - 30)).toBe(60);
  });

  it("is 0 when this clock is a little ahead of the server's, not almost a day", () => {
    expect(cyclicAge(100, 103)).toBe(0);
    expect(cyclicAge(0, 90)).toBe(0);
  });

  it("still wraps an age that is really most of a day", () => {
    expect(cyclicAge(0, 3600)).toBe(DAY_S - 3600);
  });
});

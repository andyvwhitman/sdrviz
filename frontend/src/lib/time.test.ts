import { describe, expect, it } from "vitest";
import { cyclicAge, DAY_S, keyAge } from "./time";

describe("keyAge", () => {
  it("is the seconds a key-up has been on the air, across midnight too", () => {
    expect(keyAge(100, 40)).toBe(60);
    expect(keyAge(30, DAY_S - 30)).toBe(60);
  });

  it("never reads a key-up stamped ahead of this clock as almost a day, whatever the gap", () => {
    for (const ahead of [0.1, 5, 119, 121, 180, 236, 240, 600, 3600, DAY_S / 2 - 1]) {
      expect(keyAge(1000, 1000 + ahead)).toBe(0);
      expect(keyAge(10, 10 + ahead)).toBe(0);
      expect(keyAge(DAY_S - 10, (DAY_S - 10 + ahead) % DAY_S)).toBe(0);
    }
  });
});

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

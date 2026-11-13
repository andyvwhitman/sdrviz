import { describe, expect, it } from "vitest";
import { MAX_BAR_PX, scaleLabel, scaleSpec } from "./scale";

describe("scaleSpec", () => {
  it("never draws a bar longer than the maximum", () => {
    for (const px of [0.002, 0.05, 1, 6, 300, 20000]) {
      const s = scaleSpec(px);
      expect(s.kmW).toBeLessThanOrEqual(MAX_BAR_PX);
      expect(s.miW).toBeLessThanOrEqual(MAX_BAR_PX);
    }
  });
  it("picks long bars far out and short bars far in", () => {
    expect(scaleSpec(0.05).km).toBeGreaterThanOrEqual(2000);
    expect(scaleSpec(3).km).toBe(40);
    expect(scaleSpec(20000).km).toBeLessThan(0.1);
  });
  it("labels without float noise", () => {
    expect(scaleLabel(0.1 * 3)).toBe("0.3");
    expect(scaleLabel(12.5)).toBe("12.5");
  });
});

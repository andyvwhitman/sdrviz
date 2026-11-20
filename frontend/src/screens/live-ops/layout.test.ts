import { describe, expect, it } from "vitest";
import { paneBounds, paneFraction, panePx, spectrumPx, tileColumns, wallBounds, wallFraction, wallPx, waterfallPx } from "./layout";

describe("the wall's height", () => {
  it("defaults to 36% of the space under the hero (the direction's figures at 1280, 1920 and 2560)", () => {
    expect(wallPx(null, 728, 48)).toBe(216);
    expect(wallPx(null, 1008, 64)).toBe(317);
    expect(wallPx(null, 1368, 64)).toBe(446);
  });

  it("splits into the spectrum clamp, the ruler's 68 px, the waterfall and the 14 px scale strip", () => {
    expect([spectrumPx(317), waterfallPx(317)]).toEqual([59, 176]);
    expect([spectrumPx(216), waterfallPx(216)]).toEqual([48, 86]);
    expect([spectrumPx(446), waterfallPx(446)]).toEqual([91, 273]);
    expect(spectrumPx(2000)).toBe(144);
  });

  it("never goes under the three plots' minimum nor leaves the lower half under 240 px", () => {
    expect(wallBounds(1008, 64)).toEqual({ min: 194, max: 640 });
    expect(wallPx(0.01, 1008, 64)).toBe(194);
    expect(wallPx(0.99, 1008, 64)).toBe(640);
  });

  it("round-trips a fraction", () => {
    expect(wallPx(wallFraction(400, 1008), 1008, 64)).toBe(400);
  });
});

describe("the pane's width", () => {
  it("defaults to 40% of the width, held between 400 and 880 px", () => {
    expect(panePx(null, 960)).toBe(400);
    expect(panePx(null, 1216)).toBe(486);
    expect(panePx(null, 1856)).toBe(742);
    expect(panePx(null, 2496)).toBe(880);
  });

  it("keeps 360 px for the pane and one tile column beside it, whatever the saved fraction", () => {
    expect(paneBounds(1856)).toEqual({ min: 360, max: 1616 });
    expect(panePx(0.05, 1856)).toBe(360);
    expect(panePx(0.99, 1856)).toBe(1616);
    expect(panePx(paneFraction(1000, 1856), 1856)).toBe(1000);
  });

  it("counts the tile columns that fit beside it", () => {
    expect(tileColumns(1856, 742)).toBe(5);
    expect(tileColumns(1216, 486)).toBe(3);
    expect(tileColumns(2496, 880)).toBe(7);
  });
});

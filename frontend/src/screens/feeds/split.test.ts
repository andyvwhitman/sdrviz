import { describe, expect, it } from "vitest";
import { listBounds, listFraction, listSize, validFraction } from "./split";

describe("the Feeds split", () => {
  it("gives the list a third of the space beside the gutter by default", () => {
    expect(listSize(1216, null)).toBe(400);
  });
  it("keeps the list between 280 and the width that leaves the detail 480", () => {
    expect(listBounds(1216)).toEqual({ min: 280, max: 720 });
    expect(listSize(1024, null)).toBe(336);
    expect(listSize(900, null)).toBe(295);
    expect(listSize(1216, 0.05)).toBe(280);
    expect(listSize(1216, 0.95)).toBe(720);
  });
  it("round-trips a dragged size as a fraction", () => {
    expect(listSize(1600, listFraction(500, 1600))).toBe(500);
  });
  it("accepts only a fraction strictly between 0 and 1", () => {
    expect([validFraction(0.4), validFraction(0), validFraction(1), validFraction("0.4"), validFraction(null)]).toEqual([0.4, null, null, null, null]);
  });
});

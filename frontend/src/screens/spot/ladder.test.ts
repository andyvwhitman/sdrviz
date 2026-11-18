import { describe, expect, it } from "vitest";
import { beyond, ladderX, placeTags, GUTTER_PX } from "./ladder";
import { APPROACHING } from "./fixture";
import { sortRows, type Row } from "./spot";

const { coming } = sortRows(APPROACHING.trains, 0);

describe("ladder layout", () => {
  it("puts the spot in the middle and keeps the gutters clear", () => {
    expect(ladderX({ remainingS: 0, side: "left" }, 400)).toBe(200);
    expect(ladderX({ remainingS: 30 * 60, side: "left" }, 400)).toBe(GUTTER_PX);
    expect(ladderX({ remainingS: 30 * 60, side: "right" }, 400)).toBe(400 - GUTTER_PX);
  });
  it("gives colliding tags a second tier, then collapses the rest into the count", () => {
    const near = (n: number): Row => ({ ...coming[0], remainingS: 600 + n, tag: "MARC 537", side: "right" });
    const placed = placeTags([near(0), near(5), near(10)], 360);
    expect(placed.map((p) => p.tier)).toEqual([0, 1, null]);
  });
  it("does not place trains past 30 minutes and counts them by side", () => {
    const far: Row = { ...coming[0], remainingS: 45 * 60, side: "right" };
    expect(placeTags([far], 360)).toEqual([]);
    expect(beyond([far, far, coming[0]])).toEqual({ left: 0, right: 2 });
  });
});

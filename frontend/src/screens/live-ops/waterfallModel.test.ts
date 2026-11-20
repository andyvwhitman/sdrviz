import { describe, expect, it } from "vitest";
import { MAX_ROWS, PX_PER_S, ROW_PX, rowsFor, secondsFor } from "./waterfallModel.svelte";

describe("waterfall time density", () => {
  it("draws every 500 ms row 3 CSS px tall: 6 px per second", () => {
    expect(ROW_PX).toBe(3);
    expect(PX_PER_S).toBe(6);
  });

  it("shows more history in a taller box (direction 3.2)", () => {
    expect(secondsFor(112)).toBeCloseTo(18.7, 1);
    expect(secondsFor(196)).toBeCloseTo(32.7, 1);
    expect(secondsFor(292)).toBeCloseTo(48.7, 1);
    expect(secondsFor(600)).toBe(100);
  });

  it("asks the backfill for enough rows to fill the box, within what the backend serves", () => {
    expect(rowsFor(292)).toBe(98);
    expect(rowsFor(10)).toBe(60);
    expect(rowsFor(10_000)).toBe(MAX_ROWS);
  });
});

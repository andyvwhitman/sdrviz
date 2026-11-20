import { describe, expect, it } from "vitest";
import type { SpectrumFrame } from "$lib/ws/protocol";
import { dbRows, frameDbAt } from "./wall";

const frame = (bins: number[]): SpectrumFrame => ({ kind: "spectrum", flags: 0, centerMhz: 100, spanMhz: 10, tMs: 0, bins: Int8Array.from(bins) });

describe("frameDbAt", () => {
  it("averages the bin under a frequency with its two neighbours", () => {
    const f = frame([-60, -60, -30, -60, -60, -60, -60, -60, -60, -60]);
    // 100 MHz centre, 10 MHz span: 95 to 105. 97 MHz is bin 2 of 10.
    expect(frameDbAt(f, 97)).toBeCloseTo(-50);
  });

  it("holds at the edges of the frame", () => {
    const f = frame([-10, -20, -30, -40]);
    expect(frameDbAt(f, 80)).toBeCloseTo(-15); // before the first bin: bins 0 and 1
    expect(frameDbAt(f, 120)).toBeCloseTo(-35); // after the last: bins 2 and 3
  });
});

describe("dbRows (the dB numerals in the margin)", () => {
  it("thins the numerals so none touch: 1280, 1920, 2560 and the phone landscape forms", () => {
    expect(dbRows(48, 11)).toEqual([0, 3]); // -10 -40
    expect(dbRows(59, 11)).toEqual([0, 2, 4]); // -10 -30 -50
    expect(dbRows(91, 11)).toEqual([0, 2, 4]);
    expect(dbRows(56, 13)).toEqual([0, 3]);
    expect(dbRows(144, 11)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("leaves at least 1.6 lines between two numerals, whatever the height", () => {
    for (const font of [11, 13])
      for (let h = 48; h <= 144; h++) {
        const rows = dbRows(h, font);
        for (let i = 1; i < rows.length; i++) expect(((rows[i] - rows[i - 1]) * h) / 6).toBeGreaterThanOrEqual(1.6 * font - 1e-9);
      }
  });
});

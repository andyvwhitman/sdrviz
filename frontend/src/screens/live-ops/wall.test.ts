import { describe, expect, it } from "vitest";
import type { SpectrumFrame } from "$lib/ws/protocol";
import { frameDbAt } from "./wall";

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

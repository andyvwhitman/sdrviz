import { describe, expect, it } from "vitest";
import { playbackProgress } from "./playhead";

describe("playbackProgress", () => {
  it("follows the audio clock", () => {
    expect(playbackProgress(0.3, 6)).toBeCloseTo(0.05);
    expect(playbackProgress(3, 6)).toBe(0.5);
  });
  it("clamps to the clip", () => {
    expect(playbackProgress(-1, 6)).toBe(0);
    expect(playbackProgress(9, 6)).toBe(1);
  });
  it("is 0 for an unknown duration or clock", () => {
    expect(playbackProgress(1, 0)).toBe(0);
    expect(playbackProgress(Number.NaN, 6)).toBe(0);
  });
});

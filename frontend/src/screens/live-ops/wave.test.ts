import { describe, expect, it } from "vitest";
import { waveEnvelope } from "./wave";

const peaks = (env: [number, number][]) => env.map(([, hi]) => hi);

describe("waveEnvelope", () => {
  it("is flat before the squelch crossing", () => {
    const env = waveEnvelope([], -47, 1);
    expect(env).toHaveLength(184);
    expect(env[0]).toEqual([0, 0]);
    expect(env[183][1]).toBeGreaterThan(0);
  });

  it("shows only carrier hiss with no level samples", () => {
    const env = waveEnvelope([], -47, 20);
    expect(Math.max(...peaks(env))).toBeLessThan(0.12);
  });

  it("rises with the level above the floor, newest at the right", () => {
    const quiet = waveEnvelope(Array(100).fill(-47), -47, 10)[183][1];
    const loud = waveEnvelope(Array(100).fill(-27), -47, 10)[183][1];
    expect(loud).toBeGreaterThan(quiet);
    expect(loud).toBeLessThanOrEqual(1);
  });

  it("small level changes still show, normalised to the transmission's own range", () => {
    const levels = Array.from({ length: 60 }, (_, i) => -30 + (i % 10 < 5 ? 0 : 6));
    const spread = peaks(waveEnvelope(levels, -47, 6));
    expect(Math.max(...spread) - Math.min(...spread.slice(10))).toBeGreaterThan(0.4);
  });

  it("follows word timings: bursts for words, hiss in the gaps", () => {
    const words = [{ w: "a", conf: 1, t: 1 }, { w: "b", conf: 1, t: 4 }];
    const env = peaks(waveEnvelope(Array(60).fill(-30), -47, 6, words));
    const at = (ts: number) => env[183 - Math.round((6 - ts) * 30)];
    expect(at(0.5)).toBeLessThan(0.12);
    expect(at(1.5)).toBeGreaterThan(0.15);
    expect(at(4.2)).toBeGreaterThan(0.15);
    expect(at(5.2)).toBeLessThan(0.12);
  });
});

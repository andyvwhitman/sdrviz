import { describe, expect, it } from "vitest";
import { gainOf, isAudible, isDimmedBySolo, subscribedChannels, volumeOf, type Mix } from "./mixer";

const mix = (over: Partial<{ muted: string[]; solo: string[]; volumes: Record<string, number> }> = {}): Mix => ({
  muted: new Set(over.muted),
  solo: new Set(over.solo),
  volumes: over.volumes ?? {},
});

describe("mixer", () => {
  it("plays at full volume by default", () => {
    expect(volumeOf(mix(), "a")).toBe(1);
    expect(gainOf(mix(), "a")).toBe(1);
  });

  it("applies the channel volume", () => {
    expect(gainOf(mix({ volumes: { a: 0.4 } }), "a")).toBe(0.4);
  });

  it("silences a muted channel", () => {
    expect(isAudible(mix({ muted: ["a"] }), "a")).toBe(false);
    expect(gainOf(mix({ muted: ["a"] }), "a")).toBe(0);
  });

  it("solo hears only the soloed channels and dims the rest", () => {
    const m = mix({ solo: ["a"] });
    expect(isAudible(m, "a")).toBe(true);
    expect(isAudible(m, "b")).toBe(false);
    expect(isDimmedBySolo(m, "b")).toBe(true);
    expect(isDimmedBySolo(m, "a")).toBe(false);
  });

  it("solo overrides mute on the same channel", () => {
    expect(isAudible(mix({ solo: ["a"], muted: ["a"] }), "a")).toBe(true);
  });

  it("subscribes only to audible channels", () => {
    expect(subscribedChannels(mix({ muted: ["b"] }), ["a", "b", "c"])).toEqual(["a", "c"]);
    expect(subscribedChannels(mix({ solo: ["c"] }), ["a", "b", "c"])).toEqual(["c"]);
  });
});

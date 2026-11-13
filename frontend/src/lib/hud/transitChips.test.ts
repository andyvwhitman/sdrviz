import { describe, expect, it } from "vitest";
import { TRANSIT_POLL_MS, transitChips } from "./transitChips";

const source = (agency: string, state: string, enabled = true) => ({ agency, enabled, status: { state, error: null, rt_updated_at: null } }) as never;
const NOW = 1_000_000;
const health = (over: Partial<Parameters<typeof transitChips>[0]> = {}) => ({ sources: [], fetchedAt: NOW - 1000, failed: false, now: NOW, ...over });
const texts = (over?: Parameters<typeof health>[0]) => transitChips(health(over)).map((c) => c.text);

describe("transitChips", () => {
  it("is empty when every source is ok and the data is fresh", () => {
    expect(texts({ sources: [source("Amtrak", "ok"), source("MARC", "ok")] })).toEqual([]);
  });
  it("names a source that is warming", () => {
    expect(texts({ sources: [source("Amtrak", "warming"), source("MARC", "ok")] })).toEqual(["AMTRAK WARMING"]);
  });
  it("names a source whose realtime went stale", () => {
    expect(texts({ sources: [source("MARC", "stale")] })).toEqual(["MARC RT STALE"]);
  });
  it("ignores disabled sources", () => {
    expect(texts({ sources: [source("VRE", "warming", false)] })).toEqual([]);
  });
  it("flags the whole feed when the data is older than two polls", () => {
    expect(texts({ fetchedAt: NOW - 2 * TRANSIT_POLL_MS })).toEqual([]);
    expect(texts({ fetchedAt: NOW - 2 * TRANSIT_POLL_MS - 1 })).toEqual(["TRANSIT FEED STALE"]);
  });
  it("flags a first poll that failed, but not one still to come", () => {
    expect(texts({ fetchedAt: 0, failed: true })).toEqual(["TRANSIT FEED STALE"]);
    expect(texts({ fetchedAt: 0, failed: false })).toEqual([]);
  });
  it("does not shout about one failed poll while the data is still fresh", () => {
    expect(texts({ failed: true })).toEqual([]);
  });
  it("uses the degraded style, no new colour", () => {
    expect(transitChips(health({ sources: [source("Amtrak", "warming")] }))[0].kind).toBe("degraded");
  });
});

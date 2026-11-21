import { describe, expect, it } from "vitest";
import type { Feed } from "$lib/types/live";
import { feedLook, findFeed, fix, roundDp, siteName } from "./look";

const feed = (over: Partial<Feed>) => ({ enabled: true, state: "ok", acked: false, ...over }) as Feed;

describe("feedLook", () => {
  it("nominal feeds are idle", () => expect(feedLook(feed({})).frame).toBe("idle"));
  it("an unacked fault is the fault frame, an acked one drops to stale", () => {
    expect(feedLook(feed({ state: "fault" })).frame).toBe("fault");
    expect(feedLook(feed({ state: "fault", acked: true }))).toMatchObject({ frame: "stale", glyph: "fault" });
  });
  it("a disabled feed is offline whatever its state", () => expect(feedLook(feed({ enabled: false, state: "ok" })).glyph).toBe("offline"));
});

describe("formatting", () => {
  it("rounds half away from zero so cards and inspector agree", () => {
    expect(roundDp(2.3975, 3)).toBe(2.398);
    expect(fix(null, 1)).toBe("— — —");
  });
  it("derives names", () => {
    expect(siteName({ name: "LND-02 New Carrollton", short: "LND-02" })).toBe("NEW CARROLLTON");
  });
});

describe("findFeed", () => {
  const feeds = [{ id: "feed-bay" }, { id: "node-1" }];
  it("finds node ids and sim ids in both forms", () => {
    expect(findFeed(feeds, "node-1")).toBe(feeds[1]);
    expect(findFeed(feeds, "feed-bay")).toBe(feeds[0]);
    expect(findFeed(feeds, "bay")).toBe(feeds[0]);
  });
  it("is undefined for no name or an unknown one", () => {
    expect(findFeed(feeds, null)).toBeUndefined();
    expect(findFeed(feeds, "nope")).toBeUndefined();
  });
});

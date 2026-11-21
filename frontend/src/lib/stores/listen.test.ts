// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveSocketUrl } from "$lib/ws/client";

/** A fresh store, as a page load would create it (the singleton reads localStorage when it is imported). */
async function freshStores() {
  vi.resetModules();
  return {
    listen: (await import("./listen.svelte")).listen,
    prefs: (await import("./prefs.svelte")).prefs,
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("listen", () => {
  it("starts on the server's default and remembers a choice in this browser", async () => {
    const { listen } = await freshStores();
    expect(listen.feedId).toBeNull();
    listen.choose("node-2");
    expect(listen.feedId).toBe("node-2");
    expect((await freshStores()).listen.feedId).toBe("node-2"); // the next page load
  });

  it("tells the server once per change, and not when the choice is already the current one", async () => {
    const { listen } = await freshStores();
    const sent: string[] = [];
    listen.bind((feedId) => sent.push(feedId));
    listen.choose("node-1");
    listen.choose("node-1");
    listen.choose("node-2");
    expect(sent).toEqual(["node-1", "node-2"]);
  });

  it("works without storage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { listen } = await freshStores();
    expect(listen.feedId).toBeNull();
    listen.choose("node-3");
    expect(listen.feedId).toBe("node-3");
  });
});

describe("the socket URL", () => {
  it("asks for the node this browser chose, escaped, and for the default when it chose none", () => {
    expect(liveSocketUrl("node-2")).toMatch(/\/ws\/live\?listen=node-2$/);
    expect(liveSocketUrl("a b&c")).toMatch(/\?listen=a%20b%26c$/);
    expect(liveSocketUrl(null)).toMatch(/\/ws\/live$/);
  });
});

describe("prefs (mute, solo, volume) are this browser's own", () => {
  it("are remembered on this device and not read from anywhere shared", async () => {
    const { prefs } = await freshStores();
    prefs.toggle("muted", "csx-road");
    prefs.update({ volume: { "csx-road": 0.4 } });
    const again = (await freshStores()).prefs;
    expect([...again.muted]).toEqual(["csx-road"]);
    expect(again.value.volume).toEqual({ "csx-road": 0.4 });
    prefs.toggle("muted", "csx-road");
    expect((await freshStores()).prefs.muted.size).toBe(0);
  });

  it("ignores junk in storage", async () => {
    localStorage.setItem("sdrviz.prefs.v1", JSON.stringify({ muted: "x", solo: [1, "a"], volume: { a: 7, b: 0.5 } }));
    const { prefs } = await freshStores();
    expect(prefs.value).toEqual({ muted: [], solo: ["a"], record: [], volume: { b: 0.5 } });
  });
});

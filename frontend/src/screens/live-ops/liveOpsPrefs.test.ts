// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "sdrviz.liveops.v2";
const OLD_KEY = "sdrviz.liveops.v1";

/** A fresh copy of the store, so it reads whatever localStorage holds now. */
async function load() {
  vi.resetModules();
  return (await import("./liveOpsPrefs.svelte")).liveOpsPrefs;
}

describe("Live Ops preferences", () => {
  beforeEach(() => localStorage.clear());

  it("starts with the defaults when nothing is saved", async () => {
    const prefs = await load();
    expect([prefs.wall, prefs.pane, prefs.strip, prefs.selected]).toEqual([null, null, false, null]);
  });

  it("remembers what was saved, as fractions", async () => {
    const prefs = await load();
    prefs.wall = 0.5;
    prefs.strip = true;
    prefs.selected = "amtk-k-tower";
    prefs.save();
    const again = await load();
    expect([again.wall, again.pane, again.strip, again.selected]).toEqual([0.5, null, true, "amtk-k-tower"]);
  });

  it("ignores junk: bad JSON, out-of-range fractions, wrong types", async () => {
    localStorage.setItem(KEY, "{nope");
    expect((await load()).wall).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ wall: 7, pane: "x", strip: "yes", selected: 3 }));
    const prefs = await load();
    expect([prefs.wall, prefs.pane, prefs.strip, prefs.selected]).toEqual([null, null, false, null]);
  });

  it("discards a pane width saved before Sprint 6 but keeps the wall, the lid and the selection", async () => {
    localStorage.setItem(OLD_KEY, JSON.stringify({ wall: 0.5, pane: 0.4, density: "cmp", strip: true, selected: "amtk-k-tower" }));
    const prefs = await load();
    expect([prefs.wall, prefs.pane, prefs.strip, prefs.selected]).toEqual([0.5, null, true, "amtk-k-tower"]);
    prefs.pane = 0.3;
    prefs.save();
    expect((await load()).pane).toBe(0.3);
  });

  it("works when storage is blocked", async () => {
    const prefs = await load();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => prefs.save()).not.toThrow();
    vi.restoreAllMocks();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readSplit, SPLIT_KEY, writeSplit } from "./feedsPrefs.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the remembered split", () => {
  it("is one stored fraction", () => {
    writeSplit(0.4);
    expect(localStorage.getItem(SPLIT_KEY)).toBe("0.4");
    expect(readSplit()).toBe(0.4);
    writeSplit(null);
    expect(readSplit()).toBeNull();
  });
  it("falls back to the default for a bad value", () => {
    localStorage.setItem(SPLIT_KEY, "7");
    expect(readSplit()).toBeNull();
    localStorage.setItem(SPLIT_KEY, "{oops");
    expect(readSplit()).toBeNull();
  });
  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readSplit()).toBeNull();
    expect(() => writeSplit(0.3)).not.toThrow();
  });
});

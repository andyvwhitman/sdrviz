import { describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";
import { emptyNodeDraft, enrollCommand, hoursLeft, keyFile, toNewNode, validateNodeDraft } from "./nodeKey";

const KEY = "sdrviz-node1.eyJ1cmwiOiJodHRwczovL2V4YW1wbGUifQ";

describe("keyFile", () => {
  it("is named after the node and holds exactly the key", () => {
    expect(keyFile("Union Station roof", KEY)).toEqual({ filename: "Union-Station-roof.sdrviz-key", content: KEY });
  });
  it("copes with odd and empty names", () => {
    expect(keyFile("  ../etc/passwd ", KEY).filename).toBe("etc-passwd.sdrviz-key");
    expect(keyFile("***", KEY).filename).toBe("node.sdrviz-key");
  });
});

describe("enrollCommand", () => {
  it("is the sudo command with the key", () => {
    expect(enrollCommand(KEY)).toBe(`sudo sdrviz-node enroll ${KEY}`);
  });
});

describe("copyText", () => {
  it("uses the clipboard API when it works", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fallback = vi.fn(() => true);
    expect(await copyText(KEY, fallback, { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith(KEY);
    expect(fallback).not.toHaveBeenCalled();
  });
  it("falls back to select-and-copy when the API refuses", async () => {
    const fallback = vi.fn(() => true);
    expect(await copyText(KEY, fallback, { writeText: vi.fn().mockRejectedValue(new Error("denied")) })).toBe(true);
    expect(fallback).toHaveBeenCalledOnce();
  });
  it("falls back when there is no clipboard API, and reports a failure of that too", async () => {
    expect(await copyText(KEY, () => false, undefined)).toBe(false);
  });
});

describe("hoursLeft", () => {
  const now = Date.parse("2026-11-17T00:00:00Z");
  it("rounds up and never shows 0 while the key is valid", () => {
    expect(hoursLeft("2026-11-17T20:10:00Z", now)).toBe(21);
    expect(hoursLeft("2026-11-17T00:05:00Z", now)).toBe(1);
  });
  it("is 0 once expired and null without a key", () => {
    expect(hoursLeft("2026-11-16T23:00:00Z", now)).toBe(0);
    expect(hoursLeft(null, now)).toBeNull();
  });
});

describe("new node form", () => {
  const valid = { ...emptyNodeDraft(), name: " Roof ", lat: "38.9", lon: "-77" };
  it("accepts a good draft and trims and converts it", () => {
    expect(validateNodeDraft(valid)).toEqual({});
    expect(toNewNode(valid)).toEqual({ name: "Roof", location: { lat: 38.9, lon: -77 }, preset: "assigned" });
  });
  it("names each bad field, with the API's limits", () => {
    expect(Object.keys(validateNodeDraft(emptyNodeDraft())).sort()).toEqual(["lat", "lon", "name"]);
    expect(validateNodeDraft({ ...valid, name: "x".repeat(41) }).name).toBeDefined();
    expect(validateNodeDraft({ ...valid, lat: "91" }).lat).toBeDefined();
    expect(validateNodeDraft({ ...valid, lon: "-181" }).lon).toBeDefined();
    expect(validateNodeDraft({ ...valid, lat: "abc" }).lat).toBeDefined();
  });
});

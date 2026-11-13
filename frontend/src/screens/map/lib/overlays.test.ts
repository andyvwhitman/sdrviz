import { describe, expect, it } from "vitest";
import { countOnly, listFoldedByDefault } from "./overlays";

const view = (stageWidth: number, panelWidth = 0, mode: "geo" | "schematic" = "geo") => ({ stageWidth, panelWidth, mode });

describe("listFoldedByDefault", () => {
  it("is open on a wide stage", () => expect(listFoldedByDefault(view(2138))).toBe(false));
  it("folds under 1400", () => expect(listFoldedByDefault(view(1399))).toBe(true));
  it("stays open at exactly 1400 with no panel", () => expect(listFoldedByDefault(view(1400))).toBe(false));
  it("folds with a panel docked under 1700", () => {
    expect(listFoldedByDefault(view(1699, 440))).toBe(true);
    expect(listFoldedByDefault(view(1700, 440))).toBe(false);
  });
  it("folds in schematic mode", () => expect(listFoldedByDefault(view(2138, 0, "schematic"))).toBe(true));
});

describe("countOnly", () => {
  it("is full when there is room", () => expect(countOnly(view(1295))).toBe(false));
  it("shrinks when the panel leaves under 900", () => {
    expect(countOnly(view(1295, 440))).toBe(true);
    expect(countOnly(view(1340, 440))).toBe(false);
  });
});

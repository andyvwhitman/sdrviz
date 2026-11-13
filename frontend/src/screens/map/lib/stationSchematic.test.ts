import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DetailCollection } from "./detail";
import { layoutStation, stationFacts, stationFor } from "./stationSchematic";

const detail = JSON.parse(readFileSync(join(__dirname, "../../../../../data/geo/rail_detail.geojson"), "utf8")) as DetailCollection;
const union = stationFor("union")!;

describe("station schematic", () => {
  const facts = stationFacts(detail, union);

  it("finds Union Station's tracks in order across the platforms", () => {
    const order = facts.tracks.map((t) => t.ref);
    console.log(order.join(" "), "| through:", facts.tracks.filter((t) => t.through).map((t) => t.ref).join(" "), "| pairs:", facts.pairs.map((p) => p.join("/")).join(" "));
    expect(order.length).toBeGreaterThanOrEqual(20);
    expect(order.indexOf("7")).toBeLessThan(order.indexOf("20"));
    expect(order.indexOf("20")).toBeLessThan(order.indexOf("22"));
  });

  it("knows the stub tracks from the through tracks", () => {
    const through = new Set(facts.tracks.filter((t) => t.through).map((t) => t.ref));
    expect(through.has("7")).toBe(false);
    expect(through.has("22")).toBe(true);
  });

  it("opens from the terminal square or the area id", () => {
    expect(stationFor("wash-union")).toBe(union);
    expect(stationFor("penn")).toBeUndefined();
  });

  it("lays out every route and stays inside its box", () => {
    const layout = layoutStation(union, facts);
    for (const name of ["NEC", "CSX METRO SUB", "CSX CAPITAL SUB", "IVY CITY YARD", "K TOWER"]) expect(layout.texts.some((t) => t.text === name)).toBe(true);
    for (const t of layout.texts) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(layout.width);
      expect(t.y).toBeLessThanOrEqual(layout.height);
    }
  });
});

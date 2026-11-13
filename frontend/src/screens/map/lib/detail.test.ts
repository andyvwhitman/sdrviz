import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { along, areasOf, DETAIL_ZOOM, MAX_ZOOM, trackLabels, viewCentredOn, visibleAreas, type DetailCollection } from "./detail";
import type { Pt } from "./geom";
import { defaultBase, Projection, type LonLat } from "./project";

const detail = JSON.parse(readFileSync(join(__dirname, "../../../../../data/geo/rail_detail.geojson"), "utf8")) as DetailCollection;
const UNION: LonLat = [-77.00626, 38.89731];
const PENN: LonLat = [-76.6153, 39.3071];
const [W, H] = [1376, 804];
const base = defaultBase(W, H, UNION, PENN);
const areas = areasOf(detail);

describe("terminal detail", () => {
  it("lists every area with a short button label", () => {
    expect(areas.map((a) => a.id)).toContain("union");
    expect(areas.find((a) => a.id === "union")!.short).toBe("WASHINGTON UNION STATION");
  });

  it("has Union Station's numbered tracks and no Metro", () => {
    const union = detail.features.filter((f) => f.properties.area === "union" && f.properties.kind === "track");
    const refs = new Set(union.map((f) => f.properties.ref));
    for (const n of ["1", "7", "15", "23"]) expect(refs.has(n)).toBe(true);
    expect(detail.features.some((f) => f.properties.operator?.includes("Metropolitan Area Transit"))).toBe(false);
  });

  it("shows every terminal in the regional view and only the nearby ones zoomed in", () => {
    const regional = new Projection(base, { k: 1, tx: 0, ty: 0 });
    expect(visibleAreas(areas, regional.project, W, H)).toHaveLength(areas.length);
    const zoomed = new Projection(base, viewCentredOn(base, areas.find((a) => a.id === "union")!, DETAIL_ZOOM, W, H));
    const near = visibleAreas(areas, zoomed.project, W, H).map((a) => a.id);
    expect(near).toContain("union");
    expect(near).not.toContain("penn");
  });

  it("centres a terminal at the detail zoom", () => {
    const union = areas.find((a) => a.id === "union")!;
    const view = viewCentredOn(base, union, DETAIL_ZOOM, W, H);
    const [x, y] = new Projection(base, view).project(union.centre);
    expect(view.k).toBe(DETAIL_ZOOM);
    expect(x).toBeCloseTo(W / 2, 6);
    expect(y).toBeCloseTo(H / 2, 6);
    expect(DETAIL_ZOOM).toBeLessThan(MAX_ZOOM);
  });
});

describe("track labels", () => {
  it("walks a line at even spacing, or labels a short one in the middle", () => {
    expect(along([[0, 0], [1000, 0]], 200).map((p) => p[0])).toEqual([100, 300, 500, 700, 900]);
    expect(along([[0, 0], [50, 0]], 200)).toEqual([[25, 0]]);
  });

  it("numbers a stub track past its buffer stop, then along its length", () => {
    const labels = trackLabels([{ ref: "7", pts: [[100, 100], [700, 100]] }], [[100, 100]], 1000, 500);
    expect(labels[0]).toEqual({ at: [90, 100], text: "7", end: true });
    expect(labels.filter((l) => !l.end).length).toBeGreaterThanOrEqual(2);
  });

  it("never prints two numbers on top of each other", () => {
    const tracks = [
      { ref: "7", pts: [[100, 100], [700, 100]] as Pt[] },
      { ref: "8", pts: [[100, 104], [700, 104]] as Pt[] },
    ];
    const labels = trackLabels(tracks, [], 1000, 500);
    for (const a of labels) for (const b of labels) if (a !== b) expect(Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1])).toBeGreaterThanOrEqual(16);
  });
});

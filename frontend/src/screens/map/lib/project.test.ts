import { describe, expect, it } from "vitest";
import { describePointer, milepostSegments } from "./pointer";
import { defaultBase, destination, distanceKm, Projection, zoomAbout, type LonLat } from "./project";

const UNION: LonLat = [-77.00626, 38.89731];
const PENN: LonLat = [-76.6153, 39.3071];

describe("projection", () => {
  const base = defaultBase(1856, 984, UNION, PENN);

  it("levels the Union Station to Penn Station chord, left to right", () => {
    const [u, p] = [base.project(UNION), base.project(PENN)];
    expect(p[0]).toBeGreaterThan(u[0]);
    expect(Math.abs(p[1] - u[1])).toBeLessThanOrEqual(0.02 * 984);
  });

  it("fits both 20 mi circles inside the canvas", () => {
    for (const centre of [UNION, PENN]) {
      for (const bearing of [0, 90, 180, 270]) {
        const [x, y] = base.project(destination(centre, bearing, 32.18));
        expect(x).toBeGreaterThanOrEqual(-1);
        expect(x).toBeLessThanOrEqual(1857);
        expect(y).toBeGreaterThanOrEqual(-1);
        expect(y).toBeLessThanOrEqual(985);
      }
    }
  });

  it("inverts what it projects", () => {
    const [lon, lat] = base.invert(base.project(PENN));
    expect(distanceKm([lon, lat], PENN)).toBeLessThan(0.001);
  });

  it("zooms about a point without moving it", () => {
    const view = zoomAbout({ k: 1, tx: 0, ty: 0 }, 2, [500, 300], 0.3);
    const projection = new Projection(base, view);
    const before = new Projection(base, { k: 1, tx: 0, ty: 0 }).invert([500, 300]);
    const after = projection.invert([500, 300]);
    expect(distanceKm(before, after)).toBeLessThan(0.001);
    expect(view.k).toBe(2);
  });
});

describe("pointer readout", () => {
  const routes = [
    {
      id: "r",
      name: "R",
      points: [
        { place_id: "a", name: "A", kind: "station", lat: 39.0, lon: -77.0, route_mi: 0, mp_label: "NEC 100.0" },
        { place_id: "b", name: "B", kind: "station", lat: 39.1, lon: -77.0, route_mi: 10, mp_label: "NEC 110.0" },
      ],
    },
  ];

  it("shows coordinates and the nearest milepost within 250 m", () => {
    expect(describePointer([-77.0, 39.05], milepostSegments(routes))).toMatch(/39\.0500 N · 77\.0000 W · NEC 105\.0/);
  });

  it("shows only coordinates away from any route", () => {
    expect(describePointer([-76.5, 39.05], milepostSegments(routes))).toBe("39.0500 N · 76.5000 W");
  });
});

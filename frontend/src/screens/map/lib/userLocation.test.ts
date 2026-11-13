import { describe, expect, it } from "vitest";
import { BaseProjection, Projection } from "./project";
import { accuracyRadiusPx, MAX_ACCURACY_M, viewCentredAt } from "./userLocation";

describe("accuracyRadiusPx", () => {
  it("scales metres by pixels per km", () => {
    expect(accuracyRadiusPx(500, 20)).toBeCloseTo(10);
  });
  it("hides vague or invalid fixes", () => {
    expect(accuracyRadiusPx(MAX_ACCURACY_M + 1, 20)).toBeNull();
    expect(accuracyRadiusPx(0, 20)).toBeNull();
    expect(accuracyRadiusPx(Number.NaN, 20)).toBeNull();
  });
});

describe("viewCentredAt", () => {
  it("lands the point in the middle of the area", () => {
    const base = new BaseProjection(1000, 600, [[-77.5, 38.5], [-76.05, 39.6]]);
    const at: [number, number] = [-76.9, 39.0];
    const [x, y] = new Projection(base, viewCentredAt(base, at, 4, 800, 500)).project(at);
    expect(x).toBeCloseTo(400);
    expect(y).toBeCloseTo(250);
  });
});

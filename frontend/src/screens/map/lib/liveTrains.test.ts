import { describe, expect, it } from "vitest";
import { snapVehicle } from "./liveTrains";
import type { Route, RoutePoint } from "./types";

const point = (place_id: string, lat: number, lon: number, route_mi: number): RoutePoint => ({
  place_id, name: place_id, kind: "station", lat, lon, route_mi, mp_label: "",
});

// two routes: one running due north along lon -77.0, one due east along lat 39.0
const north: Route = { id: "r-north", name: "North", points: [point("a", 38.0, -77.0, 0), point("b", 38.5, -77.0, 34.5)] };
const east: Route = { id: "r-east", name: "East", points: [point("c", 39.0, -77.0, 0), point("d", 39.0, -76.5, 27)] };

describe("snapVehicle", () => {
  it("picks the nearest route and interpolates the route mile", () => {
    const snap = snapVehicle([north, east], { lat: 38.25, lon: -77.001, bearing: null })!;
    expect(snap.routeId).toBe("r-north");
    expect(snap.routeMi).toBeCloseTo(17.25, 0);
    expect(snap.distKm).toBeLessThan(0.2);
    expect(snap.sign).toBe(0);
  });

  it("reads the direction of travel from the bearing", () => {
    const at = { lat: 38.25, lon: -77.0 };
    expect(snapVehicle([north], { ...at, bearing: 5 })!.sign).toBe(1); // north = rising miles
    expect(snapVehicle([north], { ...at, bearing: 185 })!.sign).toBe(-1);
  });

  it("follows a route whose miles run the other way", () => {
    const reversed: Route = { id: "r-rev", name: "Rev", points: [point("a", 38.5, -77.0, 0), point("b", 38.0, -77.0, 34.5)] };
    expect(snapVehicle([reversed], { lat: 38.25, lon: -77.0, bearing: 5 })!.sign).toBe(-1);
  });

  it("clamps to a route end and drops vehicles far from every route", () => {
    expect(snapVehicle([north], { lat: 37.99, lon: -77.0, bearing: null })!.routeMi).toBe(0);
    expect(snapVehicle([north, east], { lat: 38.25, lon: -76.7, bearing: null })).toBeNull();
  });
});

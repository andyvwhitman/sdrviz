/** Shapes of the map's static data: GET /api/geo/{rail,water,places,routes}. */

import type { LonLat } from "./project";

export interface GeoFeatureCollection {
  features: { properties: { class?: string; name?: string }; geometry: { coordinates: LonLat[] } }[];
}

export type RailClass = "nec" | "passenger" | "freight";

export interface Place {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  lines?: string[];
  milepost?: string;
}

export interface Places {
  stations: Place[];
  landmarks: Place[];
  detectors: Place[];
  feeds: Place[];
}

export interface RoutePoint {
  place_id: string;
  name: string;
  short?: string;
  kind: string;
  lat: number;
  lon: number;
  route_mi: number;
  mp_label: string;
  equation?: string;
}

export interface Route {
  id: string;
  name: string;
  points: RoutePoint[];
}

export interface RoutesDoc {
  routes: Route[];
  derived_points?: Place[];
}

export interface MapData {
  rail: GeoFeatureCollection;
  water: GeoFeatureCollection;
  places: Places;
  routes: RoutesDoc;
}

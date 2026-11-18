/** A response shaped like GET /transit/approaching, for the tests and for screenshots without a backend. */

import type { Approaching, ApproachingTrain } from "$lib/types/transit";

const base: ApproachingTrain = {
  key: "marc:Train537@2026-11-17",
  trip_id: "marc:Train537",
  vehicle_id: "marc:000012",
  source: "marc",
  agency: "MARC",
  train: "537",
  route_name: "PENN - WASHINGTON",
  headsign: "WASHINGTON UNION STATION",
  origin: "PERRYVILLE",
  destination: "WASHINGTON",
  route_id: "marc:11705",
  delay_suspect: false,
  basis: "live",
  state: "approaching",
  eta: "2026-11-17T19:34:00-05:00",
  eta_in_s: 240,
  scheduled: "2026-11-17T19:33:00-05:00",
  delay_s: 60,
  status: "on_time",
  eta_basis: "position",
  pass_distance_m: 40,
  to_go_km: 6.4,
  station: { id: "st:odn", name: "ODENTON", distance_m: 120, stops: true, scheduled: "2026-11-17T19:33:00-05:00", eta: "2026-11-17T19:34:00-05:00", delay_s: 60 },
  between: { previous: "BOWIE STATE", next: "ODENTON" },
  direction: { bearing: 225, cardinal: "SW", label: "SB", toward: "WASHINGTON" },
  vehicle: { lat: 39.03, lon: -76.74, speed_mph: 62, age_s: 18, stale: false, position: "realtime", next_stop: "ODENTON" },
};

const train = (over: Partial<ApproachingTrain>): ApproachingTrain => ({ ...base, ...over });

export const APPROACHING: Approaching = {
  generated: "2026-11-17T19:30:00Z",
  position: {
    lat: 39.0869,
    lon: -76.7065,
    radius_km: 2,
    nearest_line: { id: "marc:11705", name: "PENN - WASHINGTON", agency: "MARC", source: "marc", distance_m: 40, lat: 39.0866, lon: -76.7067 },
  },
  trains: [
    train({ key: "a", train: "2160", agency: "Amtrak", source: "amtrak", state: "passed", basis: "live", eta_in_s: -180, station: { id: "st:odn", name: "ODENTON", distance_m: 120, stops: false, scheduled: null, eta: null, delay_s: null }, direction: { bearing: 41, cardinal: "NE", label: "NB", toward: "BOSTON" }, origin: "WASHINGTON", destination: "BOSTON" }),
    train({}),
    train({ key: "b", train: "171", agency: "Amtrak", source: "amtrak", eta_in_s: 540, station: { id: "st:odn", name: "ODENTON", distance_m: 120, stops: false, scheduled: null, eta: null, delay_s: null }, vehicle: { lat: 38.9, lon: -76.9, speed_mph: 80, age_s: 200, stale: true, position: "realtime", next_stop: null }, basis: "stale", direction: { bearing: 41, cardinal: "NE", label: "NB", toward: "BOSTON" }, origin: "ROANOKE", destination: "BOSTON" }),
    train({ key: "c", train: "540", eta_in_s: 720, station: { id: "st:odn", name: "ODENTON", distance_m: 120, stops: true, role: "origin", scheduled: null, eta: null, delay_s: null }, eta_basis: "schedule", basis: "schedule", vehicle: null, vehicle_id: null, to_go_km: null, direction: { bearing: 41, cardinal: "NE", label: "NB", toward: "BOSTON" }, origin: "WASHINGTON", destination: "PERRYVILLE", delay_s: null, status: "unknown" }),
    train({ key: "d", train: "448", eta_in_s: 300, station: { id: "st:odn", name: "ODENTON", distance_m: 120, stops: false, role: null, scheduled: null, eta: null, delay_s: null }, eta_basis: "realtime", basis: "estimated", vehicle: null, direction: { bearing: 41, cardinal: "NE", label: "NB", toward: "BOSTON" }, origin: "WASHINGTON", destination: "BALTIMORE" }),
    train({ key: "e", train: "2163", agency: "Amtrak", source: "amtrak", eta_in_s: 1500, station: { id: "st:odn", name: "ODENTON", distance_m: 120, stops: false, scheduled: null, eta: null, delay_s: null }, delay_s: 780, status: "late", origin: "BOSTON", destination: "WASHINGTON" }),
  ],
  meta: { sources: [{ id: "marc", agency: "MARC", state: "ok", rt_age_s: 14, trains: 6 }], window_from: "2026-11-17T19:20:00Z", window_to: "2026-11-17T20:30:00Z", truncated: false },
};

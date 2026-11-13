/**
 * The placers against the real sim day, as the mockup's html[data-audit] expectations: a terminal is always named
 * in geo, no schematic leader collides, names drop in priority order, a leader never runs along rail.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as fmt from "$lib/hud/fmt";
import type { LiveState } from "$lib/types/live";
import { Boxes } from "./geom";
import { leaderRunsAlongRail } from "./blockPlacer";
import { activeInput, feedInput, trainInput } from "./inputs";
import { layoutGeo, type GeoInput } from "./geoLayout";
import { nameRank, shortName } from "./labelPlacer";
import { estimateMeasure } from "./measure";
import { defaultBase, Projection } from "./project";
import { railLines } from "./rail";
import { layoutSchematic } from "./schematicLayout";
import type { MapData, Place } from "./types";

const DATA = join(__dirname, "../../../../../data");
const json = <T>(path: string): T => JSON.parse(readFileSync(join(DATA, path), "utf8")) as T;

const data: MapData = {
  rail: json("geo/rail.geojson"),
  water: json("geo/water.geojson"),
  places: json("seed/places.json"),
  routes: json("sim/routes.json"),
};
const SIZES = { 1920: [1856, 984], 1440: [1376, 804] } as const;
const SCENARIOS = ["listening", "keyed", "fault", "fault-acked"] as const;

const scenario = (name: string): LiveState => json<LiveState>(`sim/scenarios/${name}.json`);

function geoInput(name: string, size: keyof typeof SIZES): GeoInput {
  const [width, height] = SIZES[size];
  const scn = scenario(name);
  const place = (id: string): Place => data.places.stations.find((s) => s.id === id)!;
  const base = defaultBase(width, height, [place("wash-union").lon, place("wash-union").lat], [place("baltimore-penn").lon, place("baltimore-penn").lat]);
  const projection = new Projection(base, { k: 1, tx: 0, ty: 0 });
  return {
    width, height,
    project: projection.project,
    invert: projection.invert,
    data,
    lines: railLines(data.rail, projection.project),
    feeds: scn.feeds.map(feedInput),
    trains: scn.trains.positions.map(trainInput),
    active: scn.active_transmissions.map(activeInput),
    overlays: [{ x0: 16, y0: 8, x1: 520, y1: 190 }, { x0: width - 330, y0: 8, x1: width - 16, y1: 48 }],
    inspectorWidth: 0,
    scaleBox: { x0: 16, y0: height - 96, x1: 260, y1: height - 44 },
    northBox: { x0: width - 78, y0: 58, x1: width - 14, y1: 98 },
    measure: estimateMeasure,
    snrText: fmt.snr,
  };
}

function schematicInput(name: string, size: keyof typeof SIZES): Parameters<typeof layoutSchematic>[0] {
  const [width, height] = SIZES[size];
  const scn = scenario(name);
  const placeById: Record<string, Place> = {};
  for (const p of [...data.places.stations, ...data.places.landmarks, ...data.places.detectors]) placeById[p.id] = p;
  const talkAdjacent = new Set<string>();
  for (const tx of scn.active_transmissions) {
    if (!tx.train_id) continue;
    if (tx.place_id) talkAdjacent.add(tx.place_id);
    const next = scn.trains.positions.find((t) => t.train_id === tx.train_id)?.next_stop;
    if (next) talkAdjacent.add(next);
  }
  return {
    width, height,
    routes: data.routes.routes,
    placeById,
    trains: scn.trains.positions.map((t) => ({ id: fmt.trainId(t.train_id), routeId: t.route_id, routeMi: t.route_mi, sim: t.sim, l2: t.data_block[1] })),
    feeds: scn.feeds.map((f) => ({ id: f.id, short: f.short, lat: f.lat, lon: f.lon, radiusKm: f.coverage_radius_km })),
    talkAdjacent,
    overlays: [{ x0: 8, y0: 0, x1: 528, y1: 198 }, { x0: width - 340, y0: 0, x1: width, y1: 56 }],
    measure: estimateMeasure,
  };
}

describe.each(Object.keys(SIZES).map(Number) as (keyof typeof SIZES)[])("at %i", (size) => {
  describe.each(SCENARIOS)("geo %s", (name) => {
    const layout = layoutGeo(geoInput(name, size));

    it("always names both terminals", () => {
      expect(layout.audit.terminalsPlaced).toBe(2);
      expect(layout.terminals.map((t) => t.id).sort()).toEqual(["baltimore-penn", "wash-union"]);
    });

    it("keeps every leader within 64 px and places a block for every train and feed", () => {
      expect(layout.audit.maxLeader).toBeLessThanOrEqual(64);
      expect(Object.keys(layout.trainBlocks)).toHaveLength(scenario(name).trains.positions.length);
      expect(Object.keys(layout.feedBlocks)).toHaveLength(4);
    });

    it("drops names in priority order", () => {
      const talk = new Set<string>();
      const rank = (shortNameText: string): number => {
        const s = data.places.stations.find((p) => shortName(p) === shortNameText)!;
        return nameRank(s, talk);
      };
      const ranks = layout.audit.namesDropped.map(rank);
      // placement order is priority order, so a dropped list can never go back to a higher priority
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      expect(ranks.every((r) => r > 0)).toBe(true);
    });
  });

  describe.each(SCENARIOS)("schematic %s", (name) => {
    const layout = layoutSchematic(schematicInput(name, size));

    it("has no leader collisions", () => {
      expect(layout.audit.leaderLeader + layout.audit.leaderLabel).toBe(0);
      expect(layout.audit.leaderBlock).toBe(0);
      expect(layout.audit.blockLabel).toBe(0);
    });

    it("places every train block within 64 px of leader", () => {
      expect(layout.audit.unplaced).toEqual([]);
      expect(layout.audit.maxLeader).toBeLessThanOrEqual(64);
    });

    it("uses only 0/45/90 degree leaders", () => {
      for (const b of Object.values(layout.blocks)) expect(["ne", "nw", "se", "sw", "n", "s"]).toContain(b!.dir);
    });
  });
});

describe("leaderRunsAlongRail", () => {
  const rail = { all: [[[0, 100], [200, 100]]] as [[number, number], [number, number]][], byLine: [] };
  const leader = (from: [number, number], to: [number, number]): { lead: [number, number][] } => ({ lead: [from, to] });

  it("rejects a leader that runs along the rail", () => {
    expect(leaderRunsAlongRail(rail, leader([20, 102], [100, 102]))).toBe(true);
  });

  it("accepts a leader that crosses the rail at 45 degrees", () => {
    expect(leaderRunsAlongRail(rail, leader([60, 60], [140, 140]))).toBe(false);
  });
});

describe("Boxes", () => {
  it("counts overlaps and refuses boxes outside the canvas", () => {
    const boxes = new Boxes(100, 100);
    boxes.add({ x0: 10, y0: 10, x1: 30, y1: 30 });
    expect(boxes.hits({ x0: 20, y0: 20, x1: 40, y1: 40 })).toBe(1);
    expect(boxes.hits({ x0: 50, y0: 50, x1: 60, y1: 60 })).toBe(0);
    expect(boxes.hits({ x0: -5, y0: 50, x1: 10, y1: 60 })).toBe(Infinity);
  });
});

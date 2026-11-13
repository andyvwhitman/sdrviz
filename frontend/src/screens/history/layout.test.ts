import { describe, expect, it } from "vitest";
import { buildStringline } from "./layout";
import type { HistoryRow, Route, RoutePoint, Train } from "./types";

const point = (place_id: string, route_mi: number, prefix: string, mp: number): RoutePoint => ({
  place_id,
  name: place_id,
  kind: "station",
  lat: 39,
  lon: -77,
  prefix,
  mp,
  mp_approx: false,
  mp_label: `${prefix} ${mp}`,
  route_mi,
});

const route: Route = { id: "r-test", name: "TEST", length_mi: 20, points: [point("a", 0, "CFP", 100), point("b", 20, "CFP", 120)] };
const train: Train = {
  train_id: "MARC 410",
  line: "Penn Line",
  direction: "SB",
  start_t: 0,
  end_t: 3600,
  routes: ["r-test"],
  stops: [
    { place_id: "a", route_id: "r-test", route_mi: 0, t: 0 },
    { place_id: "b", route_id: "r-test", route_mi: 20, t: 3600 },
  ],
};

const row = (id: string, kind: HistoryRow["kind"], mi: number | null, t: number): HistoryRow =>
  ({ id, kind, mi, onRoute: true, t_offset_s: t, aar: "CH54", clock: "00:30:00", train_id: kind === "train" ? "MARC 410" : null, speaker: "x", sim: false, duration_s: 3 }) as HistoryRow;

const build = (rows: HistoryRow[], pick: HistoryRow | null, now: number | null = 3600) =>
  buildStringline({
    route,
    rows,
    trains: [train],
    range: { start_t: 0, end_t: 3600, live: now != null },
    now,
    tz: "EST",
    selectedTrain: pick?.train_id ?? null,
    pick,
    pickPoint: null,
    width: 1000,
    height: 392,
  });

describe("stringline layout", () => {
  it("draws one string per train on the route, the selected one in select", () => {
    const tick = row("tx-1", "train", 10, 1800);
    const scene = build([tick], tick);
    const strings = scene.plot.filter((p) => p.t === "path" && p.cls.startsWith("s-"));
    expect(strings).toHaveLength(1);
    expect(strings[0]).toMatchObject({ cls: "s-active k-select" });
  });

  it("makes every tick on the plot and the rail clickable", () => {
    const scene = build([row("tx-1", "train", 10, 1800), row("tx-2", "rail", null, 600)], null);
    expect(scene.hits.map((h) => h.id).sort()).toEqual(["tx-1", "tx-2"]);
  });

  it("counts off-view ticks instead of drawing them", () => {
    const scene = build([row("tx-1", "train", 25, 1800)], null);
    expect(scene.after.some((p) => p.t === "text" && p.s === "1 OFF VIEW ▸")).toBe(true);
    expect(scene.hits).toHaveLength(0);
  });

  it("draws the NOW line only for a live range", () => {
    expect(build([], null, 3600).after.some((p) => p.t === "text" && p.s === "NOW")).toBe(true);
    expect(build([], null, null).after.some((p) => p.t === "text" && p.s === "NOW")).toBe(false);
  });

  it("puts a rail pick's data block in the margin column", () => {
    const rail = row("tx-9", "rail", null, 900);
    const scene = build([rail], rail);
    const block = scene.after.find((p) => p.t === "block");
    expect(block).toBeDefined();
    if (block?.t === "block") expect(block.g.box.x1).toBeLessThan(248 - 12);
  });
});

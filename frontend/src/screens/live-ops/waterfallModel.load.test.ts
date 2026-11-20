import { beforeEach, describe, expect, it, vi } from "vitest";

const { waterfall } = vi.hoisted(() => ({ waterfall: vi.fn() }));
vi.mock("$lib/api/client", () => ({ api: { feeds: { waterfall } } }));

import { NO_SAMPLE_DBFS, WaterfallModel } from "./waterfallModel.svelte";

const BINS = 4;
const fill = (rows: number[][], rowSeconds = 0.5) => ({
  data: Int8Array.from(rows.flat()),
  bins: BINS,
  rowSeconds,
  centerMhz: 160.9,
  spanMhz: 2,
});
const real = (db: number) => [db, db, db, db];
const none = [NO_SAMPLE_DBFS, NO_SAMPLE_DBFS, NO_SAMPLE_DBFS, NO_SAMPLE_DBFS];

beforeEach(() => waterfall.mockReset());

describe("WaterfallModel backfill", () => {
  it("drops rows the receiver never delivered: a real receiver's empty backfill adds nothing", async () => {
    waterfall.mockResolvedValue(fill([none, none, none]));
    const model = new WaterfallModel();
    await model.load("node-1");
    expect(model.rows).toHaveLength(0);
  });

  it("keeps the real rows of a backfill, oldest first", async () => {
    waterfall.mockResolvedValue(fill([none, real(-60), real(-50)]));
    const model = new WaterfallModel();
    await model.load("feed-bay");
    expect(model.rows.map((r) => r.bins[0])).toEqual([-60, -50]);
  });

  it("a reload never leaves fewer real rows than were held (a taller box asks again)", async () => {
    const model = new WaterfallModel();
    waterfall.mockResolvedValueOnce(fill([none]));
    await model.load("node-1");
    for (const db of [-70, -65, -60]) model.push({ kind: "spectrum", flags: 0, centerMhz: 160.9, spanMhz: 2, tMs: model.rows.length * 600, bins: Int8Array.from(real(db)) });
    expect(model.rows).toHaveLength(3);
    waterfall.mockResolvedValueOnce(fill([none, none, none, none]));
    await model.load("node-1");
    expect(model.rows.map((r) => r.bins[0])).toEqual([-70, -65, -60]);
  });

  it("a backfill only supplies rows older than the oldest held", async () => {
    const model = new WaterfallModel();
    waterfall.mockResolvedValueOnce(fill([real(-80), real(-79)]));
    await model.load("feed-bay");
    waterfall.mockResolvedValueOnce(fill([real(-80), real(-79)]));
    await model.load("feed-bay");
    expect(model.rows).toHaveLength(2);
  });

  it("changing feed starts empty", async () => {
    const model = new WaterfallModel();
    waterfall.mockResolvedValueOnce(fill([real(-60)]));
    await model.load("feed-bay");
    waterfall.mockResolvedValueOnce(fill([none]));
    await model.load("node-1");
    expect(model.rows).toHaveLength(0);
  });
});

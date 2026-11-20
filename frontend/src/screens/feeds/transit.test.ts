import { describe, expect, it } from "vitest";
import type { SourceState, TransitSource } from "$lib/types/sources";
import { transitSummary } from "./transit";

const NOW = Date.parse("2026-11-20T12:00:00Z");

const source = (name: string, state: SourceState, over: Partial<TransitSource> = {}, rtAgo?: string): TransitSource =>
  ({
    id: name.toLowerCase(),
    name,
    enabled: true,
    status: { state, error: null, static_loaded_at: null, static_version: null, rt_updated_at: rtAgo ?? null, counts: { routes: 0, stops: 0, trips: 0, vehicles: 0 } },
    ...over,
  }) as TransitSource;

describe("transitSummary", () => {
  it("counts enabled sources that are fresh", () => {
    const s = transitSummary([source("A", "ok"), source("B", "ok"), source("C", "disabled", { enabled: false })], NOW);
    expect(s).toEqual({ fresh: 2, enabled: 2, worst: null });
  });

  it("names a stale source with its age, in the stale tone", () => {
    const s = transitSummary([source("MARC", "stale", {}, "2026-11-20T11:57:00Z"), source("AMTK", "ok")], NOW);
    expect(s.worst).toEqual({ text: "MARC · STALE 3M", tone: "is-stale" });
    expect(s.fresh).toBe(1);
  });

  it("calls an errored source a fault", () => {
    expect(transitSummary([source("MARC", "error")], NOW).worst).toEqual({ text: "MARC · ERROR", tone: "is-fault" });
  });

  it("ignores disabled sources", () => {
    expect(transitSummary([source("OLD", "stale", { enabled: false })], NOW).worst).toBeNull();
  });
});

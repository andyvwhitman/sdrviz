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

  it("names a stale source, the part that is late and its age, in the stale tone", () => {
    const realtime = { rt_trip_updates_url: "https://x/rt", rt_poll_s: 30 };
    const s = transitSummary([source("MARC", "stale", realtime, "2026-11-20T11:57:00Z"), source("AMTK", "ok")], NOW);
    expect(s.worst).toEqual({ text: "MARC · STALE REALTIME 3M", tone: "is-stale" });
    expect(s.fresh).toBe(1);
  });

  it("reads the static age, not the fresh realtime one, when only the static load failed", () => {
    const stale = source("BRIGHTLINE", "stale", { rt_trip_updates_url: "https://x/rt", rt_poll_s: 30 }, "2026-11-20T11:59:50Z");
    stale.status.static_loaded_at = "2026-11-19T12:00:00Z";
    expect(transitSummary([stale], NOW).worst?.text).toBe("BRIGHTLINE · STALE STATIC 1D 0H");
  });

  it("calls an errored source a fault", () => {
    expect(transitSummary([source("MARC", "error")], NOW).worst).toEqual({ text: "MARC · ERROR", tone: "is-fault" });
  });

  it("ignores disabled sources", () => {
    expect(transitSummary([source("OLD", "stale", { enabled: false })], NOW).worst).toBeNull();
  });
});

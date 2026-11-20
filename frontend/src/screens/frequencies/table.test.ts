import { describe, expect, it } from "vitest";
import type { Frequency, NodeColumn } from "$lib/types/frequencies";
import { DEFAULT_SORT, NO_FILTERS, countsOf, filtered, glyphOf, isFiltered, nextSort, sharedIds, sorted, stateCounts, statusLine, viewFromQuery, viewToQuery } from "./table";

const f = (id: string, label: string, mhz: number, assignments: [string, boolean][] = [], railroad = "Amtrak"): Frequency => ({
  id,
  label,
  freq_mhz: mhz,
  aar_channel: Math.round((mhz - 160.11) / 0.015),
  railroad,
  use: "road",
  line: "",
  mode: "NFM",
  confidence: "high",
  notes: "",
  sources: [],
  assignments: assignments.map(([feed_id, enabled]) => ({ feed_id, enabled })),
});

const rows = [
  f("c", "CSX LNDVR", 161.07, [["a", true]], "CSX"),
  f("b", "NS BAYVIEW", 161.07, [["a", false]], "NS"),
  f("a", "AMTK NEC", 160.92, [["a", true], ["b", true]]),
  f("d", "UNUSED", 160.5),
];
const columns: NodeColumn[] = [
  { feedId: "a", short: "SDR-01", state: "ok" },
  { feedId: "b", short: "SDR-02", state: "stale" },
];

describe("filters", () => {
  it("keeps everything with no filters", () => {
    expect(filtered(rows, NO_FILTERS)).toHaveLength(4);
    expect(isFiltered(NO_FILTERS)).toBe(false);
  });

  it("filters by state over all nodes, or on one node", () => {
    expect(filtered(rows, { ...NO_FILTERS, state: "enabled" }).map((r) => r.id)).toEqual(["c", "a"]);
    expect(filtered(rows, { ...NO_FILTERS, state: "unassigned" }).map((r) => r.id)).toEqual(["d"]);
    expect(filtered(rows, { ...NO_FILTERS, node: "b", state: "enabled" }).map((r) => r.id)).toEqual(["a"]);
    expect(filtered(rows, { ...NO_FILTERS, node: "a", state: "disabled" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("searches label, MHz, the AAR pair and railroad", () => {
    const ids = (search: string) => filtered(rows, { ...NO_FILTERS, search }).map((r) => r.id);
    expect(ids("nec")).toEqual(["a"]);
    expect(ids("161.07")).toEqual(["c", "b"]);
    expect(ids("5454")).toEqual(["a"]);
    expect(ids("CH54")).toEqual(["a"]);
    expect(ids("csx")).toEqual(["c"]);
  });

  it("counts the state chips within the other filters", () => {
    expect(stateCounts(rows, NO_FILTERS)).toEqual({ all: 4, enabled: 2, disabled: 1, unassigned: 1 });
    expect(stateCounts(rows, { ...NO_FILTERS, railroad: "Amtrak" })).toEqual({ all: 2, enabled: 1, disabled: 0, unassigned: 1 });
  });
});

describe("sorting", () => {
  it("sorts low to high by default and reverses", () => {
    expect(sorted(rows, DEFAULT_SORT).map((r) => r.id)).toEqual(["d", "a", "c", "b"]);
    expect(sorted(rows, { key: "mhz", dir: "desc" }).map((r) => r.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("breaks ties by MHz then label, in either direction", () => {
    const all = [...rows, f("e", "AMTK B", 160.95)];
    expect(sorted(all, { key: "railroad", dir: "desc" }).map((r) => r.id)).toEqual(["b", "c", "d", "a", "e"]);
    expect(sorted(all, { key: "railroad", dir: "asc" }).map((r) => r.id)).toEqual(["d", "a", "e", "c", "b"]);
  });

  it("orders a node column on, off, unassigned", () => {
    expect(sorted(rows, { key: "node:a", dir: "asc" }).map((r) => r.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("goes ascending on the first click and descending on the second", () => {
    const first = nextSort(DEFAULT_SORT, "label");
    expect(first).toEqual({ key: "label", dir: "asc" });
    expect(nextSort(first, "label")).toEqual({ key: "label", dir: "desc" });
    expect(nextSort({ key: "label", dir: "desc" }, "mhz")).toEqual({ key: "mhz", dir: "asc" });
  });
});

describe("numbers", () => {
  it("counts enabled overall and per node", () => {
    expect(countsOf(rows, columns)).toEqual({ enabled: 2, total: 4, perNode: { a: 2, b: 1 } });
    expect(countsOf(rows, columns, "b").enabled).toBe(1);
  });

  it("picks the glyph: keyed, idle, stale, offline", () => {
    expect(glyphOf(rows[2], columns, true)).toBe("tx");
    expect(glyphOf(rows[2], columns, false)).toBe("idle");
    expect(glyphOf(f("x", "X", 160.2, [["b", true]]), columns, false)).toBe("stale");
    expect(glyphOf(f("y", "Y", 160.3, [["gone", true]]), columns, false)).toBe("offline");
  });

  it("shows no glyph for a disabled or unassigned row", () => {
    expect(glyphOf(rows[1], columns, false)).toBeNull();
    expect(glyphOf(rows[3], columns, false)).toBeNull();
  });

  it("writes the status line", () => {
    expect(statusLine({ enabled: 8, total: 31, perNode: {} }, 1)).toBe("FREQUENCIES 31 · 8 ENABLED ON 1 NODE · ENABLED = RECORDED + TRANSCRIBED");
  });

  it("finds frequencies that share an MHz", () => {
    expect([...sharedIds(rows)].sort()).toEqual(["b", "c"]);
  });
});

describe("the URL", () => {
  it("leaves the defaults out", () => {
    expect(viewToQuery({ filters: NO_FILTERS, sort: DEFAULT_SORT })).toEqual({ node: null, state: null, rr: null, q: null, sort: null, dir: null });
  });

  it("round-trips a view", () => {
    const view = { filters: { node: "a", state: "enabled" as const, railroad: "CSX", search: "ny" }, sort: { key: "label" as const, dir: "desc" as const } };
    const query = viewToQuery(view);
    expect(viewFromQuery((name) => query[name] ?? null)).toEqual(view);
  });

  it("falls back on junk", () => {
    const view = viewFromQuery((name) => ({ state: "bogus", sort: "nope", dir: "sideways" })[name] ?? null);
    expect(view).toEqual({ filters: NO_FILTERS, sort: DEFAULT_SORT });
  });
});

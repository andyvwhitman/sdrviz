/** The Frequencies table's pure logic: slots, filters, sorting, counts, the row glyph, and the URL. */

import type { GlyphState } from "$lib/hud/tile";
import { overallSlot, slotOf } from "$lib/slots";
import type { Frequency, NodeColumn, Slot } from "$lib/types/frequencies";

// ---- filters

export type StateFilter = "all" | "enabled" | "disabled" | "unassigned";
export const STATE_FILTERS: StateFilter[] = ["all", "enabled", "disabled", "unassigned"];

export interface Filters {
  /** a node's feed id, or null for all nodes */
  node: string | null;
  state: StateFilter;
  railroad: string | null;
  search: string;
}

export const NO_FILTERS: Filters = { node: null, state: "all", railroad: null, search: "" };

/** The slot a filter looks at: the chosen node's, or all nodes together. */
const viewedSlot = (f: Frequency, node: string | null): Slot => (node ? slotOf(f, node) : overallSlot(f));

const STATE_SLOT: Record<Exclude<StateFilter, "all">, Slot> = { enabled: "on", disabled: "off", unassigned: "none" };

const matchesSearch = (f: Frequency, search: string): boolean => {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const aar = String(f.aar_channel).padStart(2, "0");
  return [f.label, f.freq_mhz.toFixed(3), aar + aar, `ch${aar}`, f.railroad, f.use, f.line].some((text) => text.toLowerCase().includes(needle));
};

/** The rows that pass the node, railroad and search filters (the state chips count within these). */
export const scoped = (rows: Frequency[], filters: Filters): Frequency[] => rows.filter((f) => (!filters.railroad || f.railroad === filters.railroad) && matchesSearch(f, filters.search));

export const passesState = (f: Frequency, filters: Filters): boolean => filters.state === "all" || viewedSlot(f, filters.node) === STATE_SLOT[filters.state];

export const filtered = (rows: Frequency[], filters: Filters): Frequency[] => scoped(rows, filters).filter((f) => passesState(f, filters));

/** The counts on the state chips, within the other filters. */
export function stateCounts(rows: Frequency[], filters: Filters): Record<StateFilter, number> {
  const inScope = scoped(rows, filters);
  const count = (state: StateFilter): number => inScope.filter((f) => passesState(f, { ...filters, state })).length;
  return { all: inScope.length, enabled: count("enabled"), disabled: count("disabled"), unassigned: count("unassigned") };
}

export const isFiltered = (filters: Filters): boolean => filters.node !== null || filters.state !== "all" || filters.railroad !== null || filters.search.trim() !== "";

/** The railroads in use, for the select and the phone chips. */
export const railroadsOf = (rows: Frequency[]): string[] => [...new Set(rows.map((f) => f.railroad).filter(Boolean))].sort((a, b) => a.localeCompare(b));

// ---- sorting

export type SortKey = "mhz" | "aar" | "label" | "railroad" | "use" | "line" | `node:${string}`;
export interface Sort {
  key: SortKey;
  dir: "asc" | "desc";
}

export const DEFAULT_SORT: Sort = { key: "mhz", dir: "asc" };

const SLOT_ORDER: Record<Slot, number> = { on: 0, off: 1, none: 2 };

function compareBy(key: SortKey, a: Frequency, b: Frequency): number {
  if (key.startsWith("node:")) return SLOT_ORDER[slotOf(a, key.slice(5))] - SLOT_ORDER[slotOf(b, key.slice(5))];
  switch (key) {
    case "mhz":
      return a.freq_mhz - b.freq_mhz;
    case "aar":
      return a.aar_channel - b.aar_channel;
    case "railroad":
      return a.railroad.localeCompare(b.railroad);
    case "use":
      return a.use.localeCompare(b.use);
    case "line":
      return a.line.localeCompare(b.line);
    default:
      return a.label.localeCompare(b.label);
  }
}

/** Sorted by the chosen column; ties always break by MHz, then label, whatever the direction. */
export function sorted(rows: Frequency[], sort: Sort): Frequency[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * compareBy(sort.key, a, b) || a.freq_mhz - b.freq_mhz || a.label.localeCompare(b.label));
}

/** A click on a header: the first click sorts ascending, the next on the same column descending. */
export const nextSort = (current: Sort, key: SortKey): Sort => (current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

// ---- numbers

export interface Counts {
  /** frequencies enabled on at least one node (or on the filtered node) */
  enabled: number;
  total: number;
  /** enabled count per node feed id */
  perNode: Record<string, number>;
}

export function countsOf(rows: Frequency[], columns: NodeColumn[], node: string | null = null): Counts {
  const perNode = Object.fromEntries(columns.map((c) => [c.feedId, rows.filter((f) => slotOf(f, c.feedId) === "on").length]));
  return { enabled: rows.filter((f) => viewedSlot(f, node) === "on").length, total: rows.length, perNode };
}

/** The row glyph: tx while keyed; idle when enabled on a node that is ok; stale when only on stale nodes; else offline. */
export function glyphOf(f: Frequency, columns: NodeColumn[], keyed: boolean): GlyphState {
  if (keyed) return "tx";
  const states = f.assignments.filter((a) => a.enabled).map((a) => columns.find((c) => c.feedId === a.feed_id)?.state);
  if (states.includes("ok")) return "idle";
  return states.includes("stale") ? "stale" : "offline";
}

/** The status line when the page is quiet. */
export function statusLine(counts: Counts, nodes: number): string {
  return `FREQUENCIES ${counts.total} · ${counts.enabled} ENABLED ON ${nodes} NODE${nodes === 1 ? "" : "S"} · ENABLED = RECORDED + TRANSCRIBED`;
}

/** Two rows on one MHz (a shared frequency): the ids of those rows. */
export function sharedIds(rows: Frequency[]): Set<string> {
  const byMhz = new Map<number, string[]>();
  for (const f of rows) byMhz.set(f.freq_mhz, [...(byMhz.get(f.freq_mhz) ?? []), f.id]);
  return new Set([...byMhz.values()].filter((ids) => ids.length > 1).flat());
}

// ---- the URL

export interface View {
  filters: Filters;
  sort: Sort;
}

const SORT_KEYS = ["mhz", "aar", "label", "railroad", "use", "line"];

/** The view in a query string: `?node=feed-alx&state=enabled&rr=Amtrak&q=nec&sort=label&dir=desc`; defaults are left out. */
export function viewToQuery(view: View): Record<string, string | null> {
  const { filters, sort } = view;
  return {
    node: filters.node,
    state: filters.state === "all" ? null : filters.state,
    rr: filters.railroad,
    q: filters.search.trim() || null,
    sort: sort.key === DEFAULT_SORT.key ? null : sort.key,
    dir: sort.dir === DEFAULT_SORT.dir ? null : sort.dir,
  };
}

/** The view a query string describes; an unknown value falls back to the default. */
export function viewFromQuery(get: (name: string) => string | null): View {
  const state = get("state");
  const key = get("sort");
  return {
    filters: {
      node: get("node") || null,
      state: STATE_FILTERS.includes(state as StateFilter) ? (state as StateFilter) : "all",
      railroad: get("rr") || null,
      search: get("q") ?? "",
    },
    sort: { key: key && (SORT_KEYS.includes(key) || key.startsWith("node:")) ? (key as SortKey) : DEFAULT_SORT.key, dir: get("dir") === "desc" ? "desc" : "asc" },
  };
}

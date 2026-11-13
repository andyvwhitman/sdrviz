/** The side panel's state as the map's query parameters (decision D1): `?page=station|trip|route&id=…[&date=…][&full=1]`. */

export type PanelKind = "station" | "trip" | "route";

export interface PanelState {
  kind: PanelKind;
  id: string;
  /** a route's service day, YYYY-MM-DD; null is today */
  date: string | null;
  /** maximized over the page area */
  full: boolean;
}

const KINDS: readonly string[] = ["station", "trip", "route"];

/** The panel a query describes, or null when it names none. */
export function parsePanel(get: (name: string) => string | null): PanelState | null {
  const [kind, id] = [get("page"), get("id")];
  if (!kind || !id || !KINDS.includes(kind)) return null;
  const date = get("date");
  return { kind: kind as PanelKind, id, date: kind === "route" && date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, full: get("full") === "1" };
}

/** The query changes that put `state` in the URL (null removes the panel), for `router.setQuery`. */
export function panelQuery(state: PanelState | null): Record<string, string | null> {
  return {
    page: state?.kind ?? null,
    id: state?.id ?? null,
    date: state?.kind === "route" ? state.date : null,
    full: state?.full ? "1" : null,
  };
}

const isoDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const today = (): string => isoDay(new Date());

/** `date` moved by `days` (calendar days, no timezone drift). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + days));
}

/**
 * The id the map highlights for the open panel: a station's canonical id once the board has said it (a member stop
 * id such as `amtrak:WAS` or a MARC platform resolves to the group `st:was`), else the id in the URL.
 */
export function stationHighlight(state: PanelState | null, canonicalId: { for: string; id: string } | null): string | null {
  if (state?.kind !== "station") return null;
  return canonicalId?.for === state.id ? canonicalId.id : state.id;
}

/**
 * Typed REST client: one function per row of the REST contract (docs/build-plan.md 3.3).
 * The shapes the shared layer uses are typed in $lib/types; the resources owned by a screen
 * return the loose `Json` type until `npm run gen:api` produces schema.gen.ts from the backend.
 */

import type { LiveState } from "$lib/types/live";
import type { Approaching, ApproachingQuery, Board, Line, RouteTimetable, Stop, StationBoard, TransitSourceStatus, Trip, Vehicle } from "$lib/types/transit";
import type { BackendStats, SourceConfig, TransitSource } from "../../screens/settings/types";
import type { Prefs, SessionInfo, SimJump, SimStatus } from "$lib/types/api";

/** A JSON object whose fields the owning screen narrows. Replace with schema.gen.ts types. */
export type Json = Record<string, unknown>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** the Retry-After header of a 429 or 423, in seconds */
    readonly retryAfterS: number | null = null,
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};

/** The router registers this so any 401 sends the user to /login. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query, signal?: AbortSignal): Promise<T> {
  const response = await fetch(withQuery(`/api${path}`, query), {
    method,
    signal,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401 && path !== "/auth/login") onUnauthorized();
  if (!response.ok) {
    const detail = await response.json().then(
      (j: { detail?: unknown }) => String(j.detail ?? response.statusText),
      () => response.statusText,
    );
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new ApiError(response.status, detail, retryAfter > 0 ? retryAfter : null);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const get = <T = Json>(path: string, query?: Query, signal?: AbortSignal) => request<T>("GET", path, undefined, query, signal);
const post = <T = Json>(path: string, body?: unknown, query?: Query) => request<T>("POST", path, body ?? {}, query);
const put = <T = Json>(path: string, body: unknown) => request<T>("PUT", path, body);
const del = <T = void>(path: string, query?: Query) => request<T>("DELETE", path, undefined, query);
const patch = <T = Json>(path: string, body: unknown) => request<T>("PATCH", path, body);

/** The verbs, for API modules that live in their own file (see api/nodes.ts). */
export const http = { get, post, patch };

export const api = {
  auth: {
    login: (password: string) => post<void>("/auth/login", { password }),
    logout: () => post<void>("/auth/logout"),
    session: () => get<SessionInfo>("/auth/session"),
  },
  system: () => get<LiveState["system"] & { version: string; sim: boolean }>("/system"),
  backend: () => get<BackendStats>("/system/backend"),
  liveState: () => get<LiveState>("/live/state"),
  prefs: {
    get: () => get<Prefs>("/prefs"),
    put: (prefs: Prefs) => put<Prefs>("/prefs", prefs),
  },
  sim: {
    get: () => get<SimStatus>("/sim"),
    jump: (jump: SimJump) => post<SimStatus>("/sim/jump", jump),
  },
  frequencies: {
    list: () => get<Json[]>("/frequencies"),
    create: (frequency: Json) => post("/frequencies", frequency),
    get: (id: string) => get(`/frequencies/${id}`),
    update: (id: string, frequency: Json) => put(`/frequencies/${id}`, frequency),
    remove: (id: string, force = false) => del(`/frequencies/${id}`, { force }),
  },
  banks: {
    list: () => get<Json[]>("/banks"),
    create: (bank: Json) => post("/banks", bank),
    get: (id: string) => get(`/banks/${id}`),
    update: (id: string, bank: Json) => put(`/banks/${id}`, bank),
    remove: (id: string) => del(`/banks/${id}`),
    activate: (id: string) => post<Prefs>(`/banks/${id}/activate`),
    /** listen to an AAR channel: it joins the live bank, and nodes on the banks preset start decoding it */
    addLive: (aarChannel: number, feedId: string) => post<Json>("/banks/live/channels", { aar_channel: aarChannel, feed_id: feedId }),
    removeLive: (aarChannel: number) => del(`/banks/live/channels/${aarChannel}`),
  },
  feeds: {
    list: () => get<Json[]>("/feeds"),
    create: (feed: Json) => post("/feeds", feed),
    get: (id: string) => get(`/feeds/${id}`),
    update: (id: string, feed: Json) => put(`/feeds/${id}`, feed),
    remove: (id: string) => del(`/feeds/${id}`),
    ack: (id: string, reason?: string) => post(`/feeds/${id}/ack`, { reason }),
    health: (id: string, minutes = 60) => get(`/feeds/${id}/health`, { minutes }),
    /** Binary backfill: rows x bins int8 dBFS; geometry in the X-* response headers. */
    async waterfall(id: string, rows = 120) {
      const response = await fetch(withQuery(`/api/feeds/${id}/waterfall`, { rows }), { credentials: "same-origin" });
      if (response.status === 401) onUnauthorized();
      if (!response.ok) throw new ApiError(response.status, response.statusText);
      const header = (name: string) => Number(response.headers.get(name));
      return {
        data: new Int8Array(await response.arrayBuffer()),
        bins: header("X-Bins"),
        rowSeconds: header("X-Row-Seconds"),
        centerMhz: header("X-Center-MHz"),
        spanMhz: header("X-Span-MHz"),
      };
    },
  },
  lofar: (minutes = 60) => get("/lofar", { minutes }),
  radio: {
    status: () => get<Json>("/radio"),
    settings: () => get<Json>("/radio/settings"),
    saveSettings: (settings: Json) => put<Json>("/radio/settings", settings),
  },
  trains: {
    list: (query: { start?: string; end?: string; route?: string; q?: string } = {}) => get("/trains", query),
    live: () => get<Json[]>("/trains/live"),
  },
  transit: {
    sources: () => get<TransitSourceStatus[]>("/transit/sources"),
    vehicles: (bbox?: string) => get<Vehicle[]>("/transit/vehicles", { bbox }),
    /** route lines and parent stations for a "west,south,east,north" box at a map zoom */
    lines: (bbox: string, zoom: number) => get<{ lines: Line[] }>("/transit/lines", { bbox, zoom }),
    stops: (bbox: string, zoom: number) => get<{ stops: Stop[] }>("/transit/stops", { bbox, zoom }),
    /** `passes` also lists the stations the train runs through without stopping (decision 17) */
    trip: (tripId: string, { passes = false } = {}) => get<Trip>(`/transit/trips/${encodeURIComponent(tripId)}`, passes ? { passes: 1 } : undefined),
    /** a station or station group; `agency` (name) and `source` (id) keep only those rows */
    station: (stopId: string, query: { back?: number; ahead?: number; date?: string; agency?: string; source?: string; passing?: 1 } = {}) =>
      get<StationBoard>(`/transit/stations/${encodeURIComponent(stopId)}`, query),
    /** every train that will reach (or just passed) a position, with an ETA and how it was worked out */
    approaching: (query: ApproachingQuery, signal?: AbortSignal) => get<Approaching>("/transit/approaching", { ...query }, signal),
    route: (routeId: string, date?: string) => get<RouteTimetable>(`/transit/routes/${encodeURIComponent(routeId)}`, { date }),
    board: (placeId: string, query: { back?: number; ahead?: number } = {}) =>
      get<Board>(`/transit/stations/${encodeURIComponent(placeId)}/board`, query),
  },
  /** Settings page: the transit data sources (docs/transit-api.md). Changes apply live on the backend. */
  transitSources: {
    list: () => get<TransitSource[]>("/transit/sources"),
    create: (source: SourceConfig) => post<TransitSource>("/transit/sources", source),
    update: (id: string, source: SourceConfig) => put<TransitSource>(`/transit/sources/${encodeURIComponent(id)}`, source),
    remove: (id: string) => del(`/transit/sources/${encodeURIComponent(id)}`),
    refresh: (id: string) => post<TransitSource>(`/transit/sources/${encodeURIComponent(id)}/refresh`),
  },
  geo: {
    rail: () => get("/geo/rail"),
    railDetail: () => get("/geo/rail-detail"),
    water: () => get("/geo/water"),
    places: () => get("/geo/places"),
    routes: () => get("/geo/routes"),
  },
};

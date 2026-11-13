/**
 * Typed REST client: one function per row of the REST contract (docs/build-plan.md 3.3).
 * The shapes the shared layer uses are typed in $lib/types; the resources owned by a screen
 * return the loose `Json` type until `npm run gen:api` produces schema.gen.ts from the backend.
 */

import type { LiveState } from "$lib/types/live";
import type { Prefs, SessionInfo, SimJump, SimStatus } from "$lib/types/api";

/** A JSON object whose fields the owning screen narrows. Replace with schema.gen.ts types. */
export type Json = Record<string, unknown>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
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

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const response = await fetch(withQuery(`/api${path}`, query), {
    method,
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
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const get = <T = Json>(path: string, query?: Query) => request<T>("GET", path, undefined, query);
const post = <T = Json>(path: string, body?: unknown, query?: Query) => request<T>("POST", path, body ?? {}, query);
const put = <T = Json>(path: string, body: unknown) => request<T>("PUT", path, body);
const del = <T = void>(path: string, query?: Query) => request<T>("DELETE", path, undefined, query);

/** Filters shared by GET /transmissions and /transmissions/summary. */
export interface TransmissionQuery extends Query {
  start?: string;
  end?: string;
  frequency_id?: string;
  aar?: string;
  feed_id?: string;
  role?: string;
  train_id?: string;
  place_id?: string;
  bank_id?: string;
  state?: string;
  min_duration?: number;
  defect?: boolean;
  q?: string;
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

export const api = {
  auth: {
    login: (password: string) => post<void>("/auth/login", { password }),
    logout: () => post<void>("/auth/logout"),
    session: () => get<SessionInfo>("/auth/session"),
  },
  system: () => get<LiveState["system"] & { version: string; sim: boolean }>("/system"),
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
  transmissions: {
    list: (query: TransmissionQuery = {}) => get("/transmissions", query),
    summary: (query: TransmissionQuery = {}) => get("/transmissions/summary", query),
    get: (id: string) => get(`/transmissions/${id}`),
    audioUrl: (id: string) => `/api/transmissions/${encodeURIComponent(id)}/audio`,
    waveform: (id: string, bins = 240) => get<{ duration_s: number; peaks: number[] }>(`/transmissions/${id}/waveform`, { bins }),
  },
  stats: (range: "today" | "yesterday" | "rolling_24h" = "today") => get("/stats", { range }),
  trains: {
    list: (query: { start?: string; end?: string; route?: string; q?: string } = {}) => get("/trains", query),
    live: () => get<Json[]>("/trains/live"),
  },
  geo: {
    rail: () => get("/geo/rail"),
    water: () => get("/geo/water"),
    places: () => get("/geo/places"),
    routes: () => get("/geo/routes"),
  },
};

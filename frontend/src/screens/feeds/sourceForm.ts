/** The transit source form: kind defaults, string drafts for the inputs, validation and the request body. */

import type { SourceConfig, SourceKind, TransitSource } from "$lib/types/sources";

export const KINDS: { value: SourceKind; text: string }[] = [
  { value: "gtfs", text: "GTFS (+ REALTIME)" },
  { value: "amtraker", text: "AMTRAKER" },
  { value: "lines", text: "LINES ONLY" },
];

/** What the backend shows for a stored key: the key itself never comes back. */
export const KEY_MASK = "***";

/** Every field as the text of an input. */
export interface SourceDraft {
  id: string;
  name: string;
  agency: string;
  kind: SourceKind;
  enabled: boolean;
  static_url: string;
  rt_trip_updates_url: string;
  rt_vehicle_positions_url: string;
  rt_alerts_url: string;
  api_key: string;
  /** a key is stored on the backend (leave `api_key` empty to keep it) */
  has_key: boolean;
  clear_key: boolean;
  key_header: string;
  route_types: string;
  static_refresh_h: string;
  rt_poll_s: string;
}

export type SourceErrors = Partial<Record<keyof SourceDraft, string>>;

const DEFAULTS: Record<SourceKind, Pick<SourceDraft, "static_refresh_h" | "rt_poll_s" | "route_types" | "key_header">> = {
  gtfs: { static_refresh_h: "24", rt_poll_s: "15", route_types: "", key_header: "" },
  amtraker: { static_refresh_h: "24", rt_poll_s: "60", route_types: "", key_header: "" },
  lines: { static_refresh_h: "168", rt_poll_s: "15", route_types: "2", key_header: "" },
};

/** Defaults that follow the kind while the user has not typed their own. */
export function emptyDraft(kind: SourceKind = "gtfs"): SourceDraft {
  return {
    id: "",
    name: "",
    agency: "",
    kind,
    enabled: true,
    static_url: "",
    rt_trip_updates_url: "",
    rt_vehicle_positions_url: "",
    rt_alerts_url: "",
    api_key: "",
    has_key: false,
    clear_key: false,
    ...DEFAULTS[kind],
  };
}

/** Switching kind in the new-source form resets the numbers the kind decides. */
export function withKind(draft: SourceDraft, kind: SourceKind): SourceDraft {
  return { ...draft, kind, ...DEFAULTS[kind] };
}

export function draftFrom(source: SourceConfig): SourceDraft {
  return {
    id: source.id,
    name: source.name,
    agency: source.agency,
    kind: source.kind,
    enabled: source.enabled,
    static_url: source.static_url ?? "",
    rt_trip_updates_url: source.rt_trip_updates_url ?? "",
    rt_vehicle_positions_url: source.rt_vehicle_positions_url ?? "",
    rt_alerts_url: source.rt_alerts_url ?? "",
    api_key: "",
    has_key: !!source.api_key,
    clear_key: false,
    key_header: source.key_header ?? "",
    route_types: source.route_types?.join(", ") ?? "",
    static_refresh_h: String(source.static_refresh_h),
    rt_poll_s: String(source.rt_poll_s),
  };
}

const isUrl = (text: string): boolean => /^https?:\/\/\S+$/i.test(text);
const positive = (text: string): boolean => text.trim() !== "" && Number(text) > 0;

export const parseRouteTypes = (text: string): number[] | null => {
  const types = text.split(/[,\s]+/).filter(Boolean).map(Number);
  return types.length ? types : null;
};

export function validateSource(draft: SourceDraft, isNew: boolean, existingIds: string[]): SourceErrors {
  const errors: SourceErrors = {};
  if (!/^[a-z0-9][a-z0-9-]*$/.test(draft.id)) errors.id = "Lowercase letters, digits and dashes";
  else if (isNew && existingIds.includes(draft.id)) errors.id = "Already in use";
  if (!draft.name.trim()) errors.name = "Required";
  if (!draft.agency.trim()) errors.agency = "Required";
  if (draft.kind !== "amtraker" && !isUrl(draft.static_url.trim())) errors.static_url = "An http(s) URL";
  for (const key of ["static_url", "rt_trip_updates_url", "rt_vehicle_positions_url", "rt_alerts_url"] as const) {
    if (draft[key].trim() && !isUrl(draft[key].trim())) errors[key] = "An http(s) URL";
  }
  if (!positive(draft.static_refresh_h)) errors.static_refresh_h = "Hours, above 0";
  if (!positive(draft.rt_poll_s)) errors.rt_poll_s = "Seconds, above 0";
  if (parseRouteTypes(draft.route_types)?.some((t) => !Number.isInteger(t) || t < 0)) errors.route_types = "Numbers, e.g. 2";
  return errors;
}

const orNull = (text: string): string | null => text.trim() || null;

export function configFrom(draft: SourceDraft): SourceConfig {
  const realtime = draft.kind === "gtfs";
  let apiKey: string | null = draft.api_key.trim() || null;
  if (!apiKey && draft.has_key && !draft.clear_key) apiKey = KEY_MASK; // untouched: the backend keeps its key
  return {
    id: draft.id,
    name: draft.name.trim(),
    agency: draft.agency.trim(),
    kind: draft.kind,
    enabled: draft.enabled,
    static_url: orNull(draft.static_url),
    rt_trip_updates_url: realtime ? orNull(draft.rt_trip_updates_url) : null,
    rt_vehicle_positions_url: realtime ? orNull(draft.rt_vehicle_positions_url) : null,
    rt_alerts_url: realtime ? orNull(draft.rt_alerts_url) : null,
    api_key: apiKey,
    key_header: orNull(draft.key_header),
    route_types: parseRouteTypes(draft.route_types),
    static_refresh_h: Number(draft.static_refresh_h),
    rt_poll_s: Number(draft.rt_poll_s),
  };
}

/** The same source with only `enabled` changed (the list's toggle). */
export const withEnabled = (source: TransitSource, enabled: boolean): SourceConfig => {
  const { status: _status, ...config } = source;
  return { ...config, enabled };
};

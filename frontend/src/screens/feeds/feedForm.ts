/** Draft, validation and conversion for the feed add/edit form. Pure, so it is unit-tested. */

import type { FeedConfig } from "./types";

export const DRIVERS = ["rtl_tcp", "sdrviz-agent", "file"] as const;

/** The form edits text; numbers are parsed on save. */
export interface FeedDraft {
  id: string;
  name: string;
  short: string;
  site: string;
  lat: string;
  lon: string;
  coverage_radius_km: string;
  driver: string;
  host: string;
  port: string;
  center_mhz: string;
  sample_rate_msps: string;
  gain_db: string;
  ppm: string;
  noise_floor_dbfs: string;
  hears: string[];
  enabled: boolean;
  sim: boolean;
}

export const emptyDraft = (): FeedDraft => ({
  id: "",
  name: "",
  short: "",
  site: "",
  lat: "",
  lon: "",
  coverage_radius_km: "18",
  driver: "rtl_tcp",
  host: "",
  port: "1234",
  center_mhz: "160.890",
  sample_rate_msps: "2.4",
  gain_db: "30",
  ppm: "0",
  noise_floor_dbfs: "-45",
  hears: [],
  enabled: true,
  sim: false,
});

/**
 * The draft of an existing feed. GET /feeds/{id} merges live health over the configuration, so a
 * feed with no measurement reports null for gain, ppm and noise floor: those fall back to the defaults.
 */
export const draftFrom = (feed: FeedConfig): FeedDraft => {
  const defaults = emptyDraft();
  const text = (value: number | null | undefined, fallback: string): string => (value == null ? fallback : String(value));
  return {
    id: feed.id,
    name: feed.name,
    short: feed.short ?? "",
    site: feed.site,
    lat: String(feed.lat),
    lon: String(feed.lon),
    coverage_radius_km: String(feed.coverage_radius_km),
    driver: feed.driver,
    host: feed.host,
    port: text(feed.port, ""),
    center_mhz: text(feed.center_mhz, defaults.center_mhz),
    sample_rate_msps: text(feed.sample_rate_msps, defaults.sample_rate_msps),
    gain_db: text(feed.gain_db, defaults.gain_db),
    ppm: text(feed.ppm, defaults.ppm),
    noise_floor_dbfs: text(feed.noise_floor_dbfs, defaults.noise_floor_dbfs),
    hears: [...feed.hears],
    enabled: feed.enabled,
    sim: feed.sim,
  };
};

export type FeedErrors = Partial<Record<keyof FeedDraft, string>>;

const NUMBER_RULES: { key: keyof FeedDraft; label: string; min: number; max: number; integer?: boolean }[] = [
  { key: "lat", label: "Latitude", min: -90, max: 90 },
  { key: "lon", label: "Longitude", min: -180, max: 180 },
  { key: "coverage_radius_km", label: "Radius", min: 1, max: 200 },
  { key: "center_mhz", label: "Centre", min: 24, max: 1766 },
  { key: "sample_rate_msps", label: "Sample rate", min: 0.25, max: 3.2 },
  { key: "gain_db", label: "Gain", min: 0, max: 60 },
  { key: "ppm", label: "PPM", min: -200, max: 200, integer: true },
  { key: "noise_floor_dbfs", label: "Noise floor", min: -120, max: 0 },
];

/** Field errors for a draft; empty when it can be saved. `isNew` also checks the id. */
export function validateFeed(draft: FeedDraft, isNew: boolean, existingIds: string[]): FeedErrors {
  const errors: FeedErrors = {};
  if (isNew) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(draft.id)) errors.id = "Lower-case letters, digits and dashes";
    else if (existingIds.includes(draft.id)) errors.id = "Already in use";
  }
  if (!draft.name.trim()) errors.name = "Required";
  for (const { key, label, min, max, integer } of NUMBER_RULES) {
    const text = String(draft[key]).trim();
    const value = Number(text);
    if (text === "" || !Number.isFinite(value)) errors[key] = "A number";
    else if (value < min || value > max) errors[key] = `${label} ${min} to ${max}`;
    else if (integer && !Number.isInteger(value)) errors[key] = "A whole number";
  }
  if (draft.driver !== "file") {
    if (!draft.host.trim()) errors.host = "Required";
    const port = Number(draft.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) errors.port = "1 to 65535";
  }
  return errors;
}

/** The request body for a validated draft. */
export function configFrom(draft: FeedDraft): FeedConfig {
  const withPort = draft.driver !== "file";
  return {
    id: draft.id,
    name: draft.name.trim(),
    short: draft.short.trim() || null,
    site: draft.site.trim(),
    lat: Number(draft.lat),
    lon: Number(draft.lon),
    coverage_radius_km: Number(draft.coverage_radius_km),
    hears: draft.hears,
    driver: draft.driver,
    host: withPort ? draft.host.trim() : "",
    port: withPort ? Number(draft.port) : null,
    center_mhz: Number(draft.center_mhz),
    sample_rate_msps: Number(draft.sample_rate_msps),
    gain_db: Number(draft.gain_db),
    ppm: Number(draft.ppm),
    noise_floor_dbfs: Number(draft.noise_floor_dbfs),
    enabled: draft.enabled,
    sim: draft.sim,
  };
}

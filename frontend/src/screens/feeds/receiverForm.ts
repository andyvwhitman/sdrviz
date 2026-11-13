/** Draft, validation and conversion for the receiver (rtl_tcp) settings form. Pure, so it is unit-tested. */

/** The receiver's own feed row in the live feed list. */
export const LIVE_FEED_ID = "feed-live";

/** Every channel is decimated from the sample rate down to this baseband rate, so the rate must divide by it. */
export const IF_RATE = 48_000;

/** The RTL-SDR samples at 0.225 to 0.3 or 0.9 to 3.2 MS/s. */
const RATE_RANGES: readonly (readonly [number, number])[] = [
  [225_001, 300_000],
  [900_001, 3_200_000],
];

/** The body of GET and PUT /api/radio/settings. */
export interface ReceiverSettings {
  name: string;
  host: string;
  port: number;
  freq_hz: number;
  rate: number;
  /** null is automatic gain */
  gain_db: number | null;
  squelch_db: number;
  lat: number;
  lon: number;
  enabled: boolean;
}

/** GET /api/radio: the connection as the backend sees it. */
export interface RadioStatus {
  state: "off" | "disabled" | "starting" | "streaming" | "reconnecting";
  host?: string;
  tuner?: string;
  center_hz?: number;
  rate?: number;
  gain_db?: number | null;
  /** 1.0 is the full sample rate arriving */
  throughput?: number | null;
  error?: string | null;
}

/** The form edits text; frequencies and the rate are in MHz and MS/s, the units people think in. */
export interface ReceiverDraft {
  name: string;
  host: string;
  port: string;
  freq_mhz: string;
  rate_msps: string;
  gain_db: string;
  auto_gain: boolean;
  squelch_db: string;
  lat: string;
  lon: string;
  enabled: boolean;
}

export type ReceiverErrors = Partial<Record<keyof ReceiverDraft, string>>;

export const draftFrom = (s: ReceiverSettings): ReceiverDraft => ({
  name: s.name,
  host: s.host,
  port: String(s.port),
  freq_mhz: String(s.freq_hz / 1e6),
  rate_msps: String(s.rate / 1e6),
  gain_db: String(s.gain_db ?? 30),
  auto_gain: s.gain_db == null,
  squelch_db: String(s.squelch_db),
  lat: String(s.lat),
  lon: String(s.lon),
  enabled: s.enabled,
});

const hz = (mhz: number): number => Math.round(mhz * 1e6);

/** The valid sample rates (in S/s) next to `rate`, for the error message. */
export function nearbyRates(rate: number): number[] {
  const below = Math.floor(rate / IF_RATE) * IF_RATE;
  return [below, below + IF_RATE].filter((r) => RATE_RANGES.some(([lo, hi]) => r >= lo && r <= hi));
}

const msps = (rate: number): string => (rate / 1e6).toFixed(3);

function numberIn(text: string, label: string, min: number, max: number): string | null {
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value)) return "A number";
  return value < min || value > max ? `${label} ${min} to ${max}` : null;
}

/** Field errors for a draft; empty when it can be saved. Mirrors the backend's ReceiverIn. */
export function validateReceiver(draft: ReceiverDraft): ReceiverErrors {
  const errors: ReceiverErrors = {};
  const check = (key: keyof ReceiverDraft, text: string, label: string, min: number, max: number) => {
    const error = numberIn(text, label, min, max);
    if (error) errors[key] = error;
  };

  if (!draft.name.trim()) errors.name = "Required";
  if (!/^[A-Za-z0-9._-]*$/.test(draft.host.trim())) errors.host = "Letters, digits, dots and dashes";
  else if (draft.enabled && !draft.host.trim()) errors.host = "Required while enabled";
  const port = Number(draft.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.port = "1 to 65535";
  check("freq_mhz", draft.freq_mhz, "Centre", 24, 1766);
  check("squelch_db", draft.squelch_db, "Squelch", 1, 30);
  check("lat", draft.lat, "Latitude", -90, 90);
  check("lon", draft.lon, "Longitude", -180, 180);
  if (!draft.auto_gain) check("gain_db", draft.gain_db, "Gain", 0, 50);

  const rate = hz(Number(draft.rate_msps));
  if (draft.rate_msps.trim() === "" || !Number.isFinite(rate)) errors.rate_msps = "A number";
  else if (rate % IF_RATE) {
    const near = nearbyRates(rate).map(msps).join(" or ");
    errors.rate_msps = `Not a multiple of 0.048${near ? `; try ${near}` : ""}`;
  } else if (!RATE_RANGES.some(([lo, hi]) => rate >= lo && rate <= hi)) errors.rate_msps = "RTL-SDR: 0.225-0.3 or 0.9-3.2";
  return errors;
}

/** The request body for a validated draft. */
export const settingsFrom = (draft: ReceiverDraft): ReceiverSettings => ({
  name: draft.name.trim(),
  host: draft.host.trim(),
  port: Number(draft.port),
  freq_hz: hz(Number(draft.freq_mhz)),
  rate: hz(Number(draft.rate_msps)),
  gain_db: draft.auto_gain ? null : Number(draft.gain_db),
  squelch_db: Number(draft.squelch_db),
  lat: Number(draft.lat),
  lon: Number(draft.lon),
  enabled: draft.enabled,
});

/** One line for the status readout. */
export function describeStatus(status: RadioStatus): string {
  switch (status.state) {
    case "streaming":
      return "STREAMING";
    case "reconnecting":
      return "RECONNECTING";
    case "starting":
      return "CONNECTING";
    case "disabled":
      return "DISABLED";
    default:
      return "NOT CONFIGURED";
  }
}

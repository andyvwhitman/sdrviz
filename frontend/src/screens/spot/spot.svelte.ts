import { api } from "$lib/api/client";
import { TRANSIT_POLL_MS } from "$lib/hud/transitChips";
import type { Approaching, Stop } from "$lib/types/transit";
import { type LatLon, validLatLon } from "./spot";

/** Where a spot came from; the spot bar says so. */
export type SpotSource = "gps" | "station" | "typed" | "link";

export interface Spot extends LatLon {
  source: SpotSource;
  /** a station name, when the user picked one */
  name?: string;
  /** GPS accuracy in metres */
  accuracyM?: number;
}

export type LocateStatus = "idle" | "locating" | "ok" | "denied" | "unavailable";

export const HORIZONS = [30, 60, 120] as const;
const BACK_MIN = 10;
const STORAGE_KEY = "sdrviz.spot";
const RECENT_MAX = 5;
/** where the picker looks before there is a spot: Washington */
const DEFAULT_REGION = { lat: 38.9, lon: -77 };

/** The browser's storage, or nothing: it can throw (private windows, blocked site data). */
function readSaved(): { last: Spot | null; recent: Spot[] } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const keep = (s: Spot) => s && validLatLon(s);
    return { last: keep(saved?.last) ? saved.last : null, recent: Array.isArray(saved?.recent) ? saved.recent.filter(keep) : [] };
  } catch {
    return { last: null, recent: [] };
  }
}

/**
 * The SPOT page's state: where the user stands, the trains converging on it (polled while the page is open and the
 * tab visible; a failed poll keeps the last table), and the clock the countdowns run on.
 */
export class SpotStore {
  spot = $state<Spot | null>(null);
  recent = $state<Spot[]>([]);
  locate = $state<LocateStatus>("idle");
  data = $state.raw<Approaching | null>(null);
  /** when `data` arrived (ms): countdowns run from here, so a wrong device clock cannot skew them */
  fetchedAt = $state(0);
  failed = $state(false);
  loading = $state(false);
  horizonMin = $state<number>(60);
  /** operator filter, an agency name; null shows all */
  agency = $state<string | null>(null);
  now = $state(Date.now());
  /** the picker's stations, loaded once */
  stops = $state.raw<Stop[]>([]);

  #timer: ReturnType<typeof setTimeout> | undefined;
  #tick: ReturnType<typeof setInterval> | undefined;
  #abort: AbortController | undefined;
  #running = false;
  #regions = new Set<string>();

  /** seconds since the response was made */
  elapsedS = $derived(this.fetchedAt ? Math.max(0, (this.now - this.fetchedAt) / 1000) : 0);

  /** Start polling; returns the stop function, for `onMount`. */
  start(): () => void {
    this.#running = true;
    const saved = readSaved();
    this.recent = saved.recent;
    if (!this.spot && saved.last) this.spot = saved.last;
    this.#tick = setInterval(() => (this.now = Date.now()), 1000);
    document.addEventListener("visibilitychange", this.#visibility);
    void this.refresh();
    void this.#loadStops(this.spot?.lat ?? DEFAULT_REGION.lat, this.spot?.lon ?? DEFAULT_REGION.lon);
    return () => {
      this.#running = false;
      clearTimeout(this.#timer);
      clearInterval(this.#tick);
      this.#abort?.abort();
      document.removeEventListener("visibilitychange", this.#visibility);
    };
  }

  #visibility = (): void => {
    if (!document.hidden) void this.refresh();
  };

  /**
   * The stations around a position, for the picker and the "near" name. The server thins stops by the size of the
   * box it is asked about, so ask for a region (about 5 by 4 degrees) and keep what earlier regions returned.
   */
  async #loadStops(lat: number, lon: number): Promise<void> {
    const region = `${Math.round(lat)},${Math.round(lon)}`;
    if (this.#regions.has(region)) return;
    this.#regions.add(region);
    try {
      const box = [lon - 2.5, lat - 2, lon + 2.5, lat + 2].map((n) => n.toFixed(2)).join(",");
      const { stops } = await api.transit.stops(box, 400);
      const known = new Map(this.stops.map((s) => [s.id, s]));
      for (const stop of stops) known.set(stop.id, stop);
      this.stops = [...known.values()];
    } catch {
      this.#regions.delete(region); // the picker then offers coordinates only; try again next time
    }
  }

  /** Make a position the spot: remembered, and the table follows. */
  setSpot(spot: Spot): void {
    if (!validLatLon(spot)) return;
    this.spot = spot;
    this.data = null;
    this.agency = null;
    const known = (s: Spot) => s.lat === spot.lat && s.lon === spot.lon;
    this.recent = spot.source === "gps" ? this.recent : [spot, ...this.recent.filter((s) => !known(s))].slice(0, RECENT_MAX);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ last: spot, recent: this.recent }));
    } catch {
      // not remembered
    }
    void this.refresh();
    void this.#loadStops(spot.lat, spot.lon);
  }

  setHorizon(minutes: number): void {
    this.horizonMin = minutes;
    void this.refresh();
  }

  /** Ask the browser where the user is; denial and absence are states, not errors. */
  useMyLocation(): void {
    if (!("geolocation" in navigator) || !window.isSecureContext) {
      this.locate = "unavailable";
      return;
    }
    this.locate = "locating";
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.locate = "ok";
        this.setSpot({ lat: coords.latitude, lon: coords.longitude, source: "gps", accuracyM: coords.accuracy });
      },
      (error) => (this.locate = error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
  }

  async refresh(): Promise<void> {
    clearTimeout(this.#timer);
    this.#abort?.abort();
    const spot = this.spot;
    if (spot && this.#running && !document.hidden) {
      const abort = (this.#abort = new AbortController());
      this.loading = this.data === null;
      try {
        const data = await api.transit.approaching(
          { lat: spot.lat, lon: spot.lon, ahead_min: this.horizonMin, back_min: BACK_MIN, limit: 100 },
          abort.signal,
        );
        this.data = data;
        this.fetchedAt = Date.now();
        this.now = this.fetchedAt;
        this.failed = false;
      } catch (error) {
        if (abort.signal.aborted) return; // superseded by a newer request or the page closed
        this.failed = true;
      } finally {
        if (!abort.signal.aborted) this.loading = false;
      }
    }
    if (this.#running) this.#timer = setTimeout(() => void this.refresh(), TRANSIT_POLL_MS);
  }
}

export const spotStore = new SpotStore();

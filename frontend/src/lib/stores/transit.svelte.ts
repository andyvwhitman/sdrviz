import { session } from "$lib/stores/session.svelte";
import { api } from "$lib/api/client";
import type { Line, Stop, TransitSourceStatus, Vehicle } from "$lib/types/transit";
import { TRANSIT_POLL_MS } from "$lib/hud/transitChips";
import { type Bbox, bboxParam, bucketZoom, snapBbox, zoomBucket } from "../../screens/map/lib/transitView";

const POLL_MS = TRANSIT_POLL_MS;
/** the clock the header chips age the data against */
const TICK_MS = 5_000;
/** Wait for a pan or zoom to settle before asking for the layers. */
const LAYER_DEBOUNCE_MS = 300;
const LAYER_CACHE_MAX = 40;
const LAYER_TTL_MS = 10 * 60_000;

interface Layers {
  lines: Line[];
  stops: Stop[];
  at: number;
}

/**
 * Transit data for the map: real train positions, polled while a screen that draws them is open (a failed poll
 * keeps the last positions), and the route lines and stops for the current view, fetched per box and zoom,
 * debounced and cached.
 */
class TransitStore {
  vehicles = $state.raw<Vehicle[]>([]);
  /** when `vehicles` arrived (ms), for ageing their reported freshness */
  fetchedAt = $state(0);
  /** the last poll failed (the server is unreachable); an agency feed being down just yields no vehicles */
  failed = $state(false);

  /** each source's state, polled with the vehicles, for the header chips */
  sources = $state.raw<Pick<TransitSourceStatus, "agency" | "enabled" | "status">[]>([]);
  /** ticks while the map polls, so "older than two polls" is noticed when the polls stop coming */
  now = $state(Date.now());
  /** a screen that draws transit data is open and polling */
  active = $state(false);

  /** the route lines and stops of the last view that finished loading */
  lines = $state.raw<Line[]>([]);
  stops = $state.raw<Stop[]>([]);

  #users = 0;
  #timer: ReturnType<typeof setInterval> | undefined;
  #tick: ReturnType<typeof setInterval> | undefined;
  #layerTimer: ReturnType<typeof setTimeout> | undefined;
  #wanted = "";
  #cache = new Map<string, Layers>();

  /** Start polling (reference counted); returns the stop function, for `onMount`. */
  start(): () => void {
    if (this.#users++ === 0) {
      this.active = true;
      void this.refresh();
      this.#timer = setInterval(() => void this.refresh(), POLL_MS);
      this.#tick = setInterval(() => (this.now = Date.now()), TICK_MS);
    }
    return () => {
      if (--this.#users === 0) {
        this.active = false;
        clearInterval(this.#timer);
        clearInterval(this.#tick);
        clearTimeout(this.#layerTimer);
      }
    };
  }

  async refresh(): Promise<void> {
    // the chips are decoration, and the source list is admin-only (a viewer would get a 403)
    if (session.isAdmin) api.transit.sources().then((sources) => (this.sources = sources), () => {});
    try {
      this.vehicles = await api.transit.vehicles();
      this.fetchedAt = Date.now();
      this.failed = false;
    } catch {
      this.failed = true;
    }
  }

  /** The lines and stops for a view: from the cache at once, else after the debounce. */
  requestLayers(bbox: Bbox, k: number): void {
    const box = snapBbox(bbox);
    const bucket = zoomBucket(k);
    const key = `${bboxParam(box)}@${bucket}`;
    this.#wanted = key;
    clearTimeout(this.#layerTimer);
    const cached = this.#cache.get(key);
    if (cached && Date.now() - cached.at < LAYER_TTL_MS) {
      [this.lines, this.stops] = [cached.lines, cached.stops];
      return;
    }
    this.#layerTimer = setTimeout(() => void this.#loadLayers(key, bboxParam(box), bucketZoom(bucket)), LAYER_DEBOUNCE_MS);
  }

  async #loadLayers(key: string, bbox: string, zoom: number): Promise<void> {
    const [lines, stops] = await Promise.allSettled([api.transit.lines(bbox, zoom), api.transit.stops(bbox, zoom)]);
    const layers: Layers = {
      lines: lines.status === "fulfilled" ? lines.value.lines : this.lines,
      stops: stops.status === "fulfilled" ? stops.value.stops : this.stops,
      at: Date.now(),
    };
    if (lines.status === "fulfilled" && stops.status === "fulfilled") {
      this.#cache.set(key, layers);
      if (this.#cache.size > LAYER_CACHE_MAX) this.#cache.delete(this.#cache.keys().next().value!);
    }
    if (key === this.#wanted) [this.lines, this.stops] = [layers.lines, layers.stops];
  }
}

export const transit = new TransitStore();

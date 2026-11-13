/**
 * History screen state: the range, the route tab, the selection and what the endpoints returned.
 * One instance per mounted screen. All reads go through `$lib/api/client`; nothing is filtered client side
 * beyond what the API returned (custom ranges and filters re-query).
 */

import { api, type TransmissionQuery } from "$lib/api/client";
import { router } from "$lib/router.svelte";
import { live } from "$lib/stores/live.svelte";
import { DAY_S, wrapDay } from "$lib/time";
import type { TxRow } from "$lib/types/live";
import { isoAt, simDate, toTxRow, type TransmissionOut, type TransmissionPage } from "./adapt";
import { hm, parseRange, rowRoute, routeOfPlaces, shiftTrain, trainMi, viewport } from "./geometry";
import type { FeedSpan, HistoryRow, PlaceCoords, Range, Route, RoutePoint, Summary, Train } from "./types";

export const SPANS = { "15 M": 900, "1 H": 3600, "4 H": 14400, "24 H": 86400 } as const;
export type SpanLabel = keyof typeof SPANS;

const PAGE = 500;
const MAX_PAGES = 4;

export interface Filters {
  q: string;
  bank_id: string;
  frequency_id: string;
  feed_id: string;
  role: string;
  state: string;
  defect: boolean;
  /** table limited to the selected train */
  trainOnly: boolean;
}

export const NO_FILTERS: Filters = { q: "", bank_id: "", frequency_id: "", feed_id: "", role: "", state: "", defect: false, trainOnly: false };

interface Places {
  stations: { id: string; lat: number; lon: number }[];
  landmarks: { id: string; lat: number; lon: number }[];
  detectors: { id: string; lat: number; lon: number }[];
  feeds: { id: string; lat: number; lon: number }[];
}

export class HistoryStore {
  // static data
  routes = $state.raw<Route[]>([]);
  places = $state.raw<PlaceCoords>({});
  channelLabels = $state.raw<Record<string, string>>({});

  // view
  range = $state.raw<Range | null>(null);
  span = $state<SpanLabel>("1 H");
  routeId = $state<string | null>(null);
  /** the user's (or the link's) selection; null lets the screen pick */
  selectedId = $state<string | null>(null);
  filters = $state<Filters>({ ...NO_FILTERS });

  // loaded
  summary = $state.raw<Summary | null>(null);
  trains = $state.raw<Train[]>([]);
  rawRows = $state.raw<TxRow[]>([]);
  spans = $state.raw<FeedSpan[]>([]);
  total = $state(0);
  /** the sim clock the data was loaded at; the NOW line and live ranges end here */
  loadedNow = $state<number | null>(null);
  loading = $state(true);
  error = $state<string | null>(null);

  private generation = 0;
  private linkTrain: string | null = null;

  // ------------------------------------------------------------------ derived
  state = $derived(live.state);
  now = $derived(this.state?.t_offset_s ?? null);
  route = $derived(this.routes.find((r) => r.id === this.routeId) ?? null);
  private owner = $derived(routeOfPlaces(this.routes));

  /** Every loaded row placed on the selected route (string tick, detector diamond or margin rail). */
  rows = $derived.by((): HistoryRow[] => {
    const route = this.route;
    if (!route) return [];
    const runs = new Map<string, Train[]>();
    for (const t of this.trains) runs.set(t.train_id, [...(runs.get(t.train_id) ?? []), t]);
    return this.rawRows.map((row) => {
      const detectorPoint = row.role_tag === "DET" ? this.pointOn(route.id, row.place_id) : null;
      // a train may have a run yesterday and one today in a 24 h window: take the run the row falls in
      const own = runs.get(row.train_id ?? "") ?? [];
      const train = own.find((t) => row.t_offset_s >= t.start_t && row.t_offset_s <= t.end_t) ?? own[0];
      let kind: HistoryRow["kind"] = "rail";
      let mi: number | null = null;
      if (detectorPoint) {
        kind = "det";
        mi = detectorPoint.route_mi;
      } else if (train?.routes.includes(route.id)) {
        mi = trainMi(train, row.t_offset_s);
        kind = mi == null ? "rail" : "train";
      }
      const onRoute = kind !== "rail" || rowRoute(this.routes, this.owner, this.places, row.place_id) === route.id;
      return { ...row, kind, mi, onRoute };
    });
  });

  /** The row the clip player and the cursors follow: the selection, else the screen's pick (spec 5.30). */
  pick = $derived.by((): HistoryRow | null => {
    const route = this.route;
    if (!route) return null;
    const chosen = this.selectedId ? this.rows.find((r) => r.id === this.selectedId) : null;
    if (chosen) return chosen;
    const hasWords = (r: HistoryRow) => r.state === "final" && r.words.length > 0;
    const [v0, v1] = viewport(route);
    const inView = (r: HistoryRow) => r.mi != null && r.mi > v0 + 2 && r.mi < v1 - 2;
    const wanted = this.linkTrain?.toLowerCase();
    const ofTrain = wanted ? this.rows.filter((r) => r.train_id?.toLowerCase() === wanted) : [];
    const trainRows = this.rows.filter((r) => r.onRoute && r.kind === "train");
    return (
      ofTrain.find((r) => !r.sim) ??
      ofTrain.find(hasWords) ??
      ofTrain[0] ??
      trainRows.find((r) => hasWords(r) && inView(r)) ??
      trainRows.find(hasWords) ??
      trainRows[0] ??
      this.rows.find((r) => r.state === "final") ??
      null
    );
  });

  selectedTrain = $derived(this.pick?.train_id ?? null);

  /** Rows per route tab, for the count badges (rail rows count on the nearest route). */
  routeCounts = $derived.by((): Record<string, number> => {
    const counts = Object.fromEntries(this.routes.map((r) => [r.id, 0]));
    const route = this.route;
    for (const row of this.rows) {
      const home = route && row.kind !== "rail" ? route.id : rowRoute(this.routes, this.owner, this.places, row.place_id);
      if (home && home in counts) counts[home]++;
    }
    return counts;
  });

  pointOn(routeId: string, placeId: string | null): RoutePoint | null {
    const points = this.routes.find((r) => r.id === routeId)?.points.filter((p) => p.place_id === placeId) ?? [];
    // a junction place can sit on two counts (Washington: CFP 112.6 | NEC 135.7); prefer the sourced one
    return points.find((p) => !p.mp_approx) ?? points[0] ?? null;
  }

  /** The place's point on any route, when it is not on the selected one. */
  anyPoint(placeId: string | null): RoutePoint | null {
    for (const route of this.routes) {
      const point = route.points.find((p) => p.place_id === placeId);
      if (point) return point;
    }
    return null;
  }

  // ------------------------------------------------------------------ boot
  /** Static data, then the link (`tx`, `train`, `range`, `route`, `span`) resolves into a range and a selection. */
  async start(): Promise<void> {
    const [routes, places, frequencies] = await Promise.all([api.geo.routes(), api.geo.places(), api.frequencies.list()]);
    const derived = (routes.derived_points ?? []) as { id: string; lat: number; lon: number }[];
    this.routes = routes.routes as unknown as Route[];
    this.places = placeCoords(places as unknown as Places, derived);
    this.channelLabels = Object.fromEntries((frequencies as { id: string; label: string }[]).map((f) => [f.id, f.label]));

    // wait for the first snapshot: its clock anchors every range
    while (!live.state) await new Promise((resolve) => setTimeout(resolve, 50));
    await this.resolveLink();
    await this.load();
    // the route tab: ?route= wins, else the one holding the linked row or train, else the NEC
    if (!this.routeId) {
      this.routeId = "r-nec";
      if (this.selectedId || this.linkTrain) this.routeId = this.routeForLink() ?? "r-nec";
    }
  }

  private async resolveLink(): Promise<void> {
    const now = live.state!.t_offset_s;
    const query = (name: string) => router.query(name);
    const spanParam = (query("span") ?? "").toUpperCase().replace(/(\d+)([MH])/, "$1 $2");
    if (spanParam in SPANS) this.span = spanParam as SpanLabel;
    const routeParam = query("route");
    if (routeParam && this.routes.some((r) => r.id === routeParam)) this.routeId = routeParam;

    let window = parseRange(query("range"));
    const txId = query("tx");
    const trainId = query("train");
    // ?train= without ?range=: that train's own row (its seed row first, else its latest final before now)
    // and the hour around it, exactly as ?tx= does
    let anchorId = txId;
    if (!window && !txId && trainId) {
      const page = (await api.transmissions.list({ train_id: trainId, limit: PAGE })) as unknown as TransmissionPage;
      const before = page.items.filter((t) => t.t_offset_s + t.duration_s <= now && t.transcript_state === "final");
      anchorId = (page.items.find((t) => !t.sim) ?? before[before.length - 1] ?? page.items[page.items.length - 1])?.id ?? null;
      this.linkTrain = trainId;
    }
    if (!window && anchorId) {
      const row = (await api.transmissions.get(anchorId).catch(() => null)) as TransmissionOut | null;
      if (row) {
        const hour = Math.floor(row.t_offset_s / 3600) * 3600;
        window = [hour, hour + 3600];
        if (txId) this.selectedId = txId;
      }
    }
    if (window) {
      const [a, b] = window;
      // a range that has not run yet today is yesterday's: the sim day repeats
      const shift = b > now ? -DAY_S : 0;
      this.range = { start_t: a + shift, end_t: b + shift, live: false };
    } else {
      this.range = { start_t: now - SPANS[this.span], end_t: now, live: true };
    }
  }

  /** The route tab for a link: the route holding the selected row, through its place first. */
  private routeForLink(): string | null {
    const row = this.pick;
    if (!row) return null;
    const train = this.trains.find((t) => t.train_id === row.train_id);
    if (this.linkTrain) return train?.routes[0] ?? null;
    const own = train?.routes.find((id) => this.routes.find((r) => r.id === id)?.points.some((p) => p.place_id === row.place_id));
    return own ?? rowRoute(this.routes, routeOfPlaces(this.routes), this.places, row.place_id) ?? train?.routes[0] ?? null;
  }

  // ------------------------------------------------------------------ loading
  /** Fetch everything for the current range and filters. Later calls win over earlier ones still in flight. */
  async load(): Promise<void> {
    const range = this.range;
    const state = live.state;
    if (!range || !state) return;
    const generation = ++this.generation;
    const now = state.t_offset_s;
    // a live range follows the clock
    const window: Range = range.live ? { start_t: now - SPANS[this.span], end_t: now, live: true } : range;
    const iso = (t: number) => isoAt(t, simDate(state), state.tz.utc_offset);
    const filter = this.apiFilters();
    const bounds = { start: iso(window.start_t), end: iso(window.end_t) };
    this.loading = true;
    try {
      const [summary, trains, page, spans] = await Promise.all([
        // the scrubber is always the 24 h ending now; a custom range needs its own totals
        (api.transmissions.summary({ ...filter, ...bounds }) as Promise<unknown>) as Promise<Summary>,
        api.trains.list(bounds) as Promise<unknown> as Promise<{ items: Train[] }>,
        this.fetchRows({ ...filter, ...bounds }),
        this.fetchSpans(),
      ]);
      const scrubber = window.live ? summary : ((await api.transmissions.summary({ ...filter, end: iso(now) })) as unknown as Summary);
      if (generation !== this.generation) return;
      const names = { labels: this.channelLabels, bank: bankFrequencies(state, filter.bank_id) };
      this.range = window;
      this.summary = { ...summary, scrubber_start_t: scrubber.scrubber_start_t, scrubber_airtime_per_min: scrubber.scrubber_airtime_per_min };
      this.trains = placeTrains(trains.items, window);
      // History lists released key-ups only: one still on the air is the header chip until it ends
      const released = page.items.filter((t) => !(t.t_offset_s <= now && t.t_offset_s + t.duration_s > now && window.end_t >= now));
      this.rawRows = released.map((t) => toTxRow(t, names));
      // the count agrees with the rows shown (and the hero): key-ups still on the air are not counted
      this.total = page.total - (page.items.length - released.length);
      this.spans = spans;
      this.loadedNow = now;
      this.error = null;
    } catch (error) {
      if (generation === this.generation) this.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  }

  private apiFilters() {
    const f = this.filters;
    return {
      q: f.q.trim() || undefined,
      bank_id: f.bank_id || undefined,
      frequency_id: f.frequency_id || undefined,
      feed_id: f.feed_id || undefined,
      role: f.role || undefined,
      state: f.state || undefined,
      defect: f.defect || undefined,
      train_id: f.trainOnly ? (this.selectedTrain ?? undefined) : undefined,
    };
  }

  /** Cursor-paged read of the whole range (the stringline needs every tick, the table reveals them in steps). */
  private async fetchRows(query: TransmissionQuery): Promise<TransmissionPage> {
    const items: TransmissionOut[] = [];
    let cursor: string | undefined;
    let total = 0;
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = (await api.transmissions.list({ ...query, order: "desc", limit: PAGE, cursor })) as unknown as TransmissionPage;
      items.push(...page.items);
      total = page.total;
      if (!page.next_cursor) break;
      cursor = page.next_cursor;
    }
    return { items, total, next_cursor: null };
  }

  /** Feed uptime over the scrubber's 24 h, one health call per feed. */
  async refreshSpans(): Promise<void> {
    this.spans = await this.fetchSpans();
  }

  private async fetchSpans(): Promise<FeedSpan[]> {
    const feeds = live.state?.feeds ?? [];
    const lists = await Promise.all(
      feeds.map(async (feed) => {
        const health = (await api.feeds.health(feed.id, 1440)) as unknown as { spans: Omit<FeedSpan, "feed_id">[] };
        return health.spans.map((s) => ({ ...s, feed_id: feed.id }));
      }),
    );
    return lists.flat();
  }

  // ------------------------------------------------------------------ actions
  select(id: string | null): void {
    this.selectedId = id;
    this.linkTrain = null;
    router.setQuery({ tx: id, train: null });
  }

  selectRoute(id: string): void {
    this.routeId = id;
    router.setQuery({ route: id });
  }

  setSpan(label: SpanLabel): void {
    this.span = label;
    const range = this.range;
    if (!range) return;
    this.range = range.live ? range : { ...range, start_t: range.end_t - SPANS[label] };
    this.syncRangeUrl();
    void this.load();
  }

  /** Move the window by `delta` seconds; reaching the clock makes it live again. */
  step(delta: number): void {
    const range = this.range;
    const now = this.now;
    if (!range || now == null) return;
    const end = Math.min(now, range.end_t + delta);
    this.range = end >= now ? { start_t: now - SPANS[this.span], end_t: now, live: true } : { start_t: end - SPANS[this.span], end_t: end, live: false };
    this.syncRangeUrl();
    void this.load();
  }

  toNow(): void {
    const now = this.now;
    if (now == null) return;
    this.range = { start_t: now - SPANS[this.span], end_t: now, live: true };
    this.syncRangeUrl();
    void this.load();
  }

  setFilter<K extends keyof Filters>(key: K, value: Filters[K]): void {
    this.filters[key] = value;
    void this.load();
  }

  /** `range=HH:MM-HH:MM` for an earlier range inside one day; a live range carries only `span`. */
  private syncRangeUrl(): void {
    const range = this.range;
    if (!range) return;
    const a = wrapDay(range.start_t);
    const b = a + (range.end_t - range.start_t);
    const text = !range.live && b <= DAY_S ? `${hm(a)}-${b === DAY_S ? "24:00" : hm(b)}` : null;
    router.setQuery({ range: text, span: this.span === "1 H" ? null : this.span.replace(" ", "").toLowerCase() });
  }
}

function placeCoords(places: Places, derived: { id: string; lat: number; lon: number }[]): PlaceCoords {
  const out: PlaceCoords = {};
  for (const p of [...places.stations, ...places.landmarks, ...places.detectors, ...places.feeds, ...derived]) out[p.id] = [p.lat, p.lon];
  return out;
}

/** The active bank (or the bank filter) as a set of frequency ids, to flag off-bank rows. */
function bankFrequencies(state: NonNullable<typeof live.state>, bankId?: string): Set<string> | null {
  const bank = state.banks.find((b) => b.id === (bankId || state.active_bank));
  return bank ? new Set(bank.frequency_ids) : null;
}

/** Trains whose run touches the window, shifted by whole days into it (the recorded day repeats). */
function placeTrains(items: Train[], window: Range): Train[] {
  const out: Train[] = [];
  for (const train of items) {
    for (const shift of [-DAY_S, 0, DAY_S]) {
      if (train.start_t + shift <= window.end_t && train.end_t + shift >= window.start_t) out.push(shiftTrain(train, shift));
    }
  }
  return out;
}

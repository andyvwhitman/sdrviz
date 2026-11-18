<script lang="ts">
  import { viewport } from "$lib/stores/viewport.svelte";
  /**
   * The map canvas: one SVG holding the geo layers (graticule, shore, coverage, rail, mileposts, stations,
   * detectors), the schematic layers, and the live layer (trains, links, feed sites, pings) that morphs between
   * them. Layouts are solved by the pure placers in ./lib; this component owns the view (pan and zoom) and keeps
   * a placement stable while trains creep along (it re-solves only when the view, the set of trains or a feed
   * state changes, or a train has moved 12 px from where it was placed).
   */
  import { untrack } from "svelte";
  import DataBlockSvg from "$lib/components/DataBlockSvg.svelte";
  import * as fmt from "$lib/hud/fmt";
  import type { GlyphState } from "$lib/hud/tile";
  import { live } from "$lib/stores/live.svelte";
  import { transit } from "$lib/stores/transit.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import CoverageDisc from "./CoverageDisc.svelte";
  import CoverageStrip from "./CoverageStrip.svelte";
  import FeedSite from "./FeedSite.svelte";
  import PingRing from "./PingRing.svelte";
  import ScaleBar from "./ScaleBar.svelte";
  import TransitLines from "./TransitLines.svelte";
  import TransitStops from "./TransitStops.svelte";
  import SchematicMap from "./SchematicMap.svelte";
  import SchematicText from "./SchematicText.svelte";
  import LiveTrains from "./LiveTrains.svelte";
  import TrainMark from "./TrainMark.svelte";
  import UserMark from "./UserMark.svelte";
  import { userLocation } from "$lib/stores/userLocation.svelte";
  import { accuracyRadiusPx, LOCATE_ZOOM, viewCentredAt } from "./lib/userLocation";
  import { easeInOut, easeInstrument } from "./lib/ease";
  import { dist, lerp, type Pt, type Rect } from "./lib/geom";
  import { measuredBlock } from "./lib/blockPlacer";
  import { layoutGeo, linkSpecs, trainGeometry, type GeoInput, type TrainInput } from "./lib/geoLayout";
  import { activeInput, feedInput, feedLook, trainInput } from "./lib/inputs";
  import { linkLabelAngle, linkLabelCentre, TERMINALS } from "./lib/labelPlacer";
  import type { Measure } from "./lib/measure";
  import { dPath } from "./lib/path";
  import { BaseProjection, CONTINENTAL_US, defaultBase, DEFAULT_VIEW, Projection, clampZoom, type LonLat, type View } from "./lib/project";
  import { areaRect, areasOf, DETAIL_ZOOM, MAX_ZOOM, TRACK_LABEL_ZOOM, trackLabels, viewCentredOn, visibleAreas, type DetailArea } from "./lib/detail";
  import { railLines } from "./lib/rail";
  import { scaleSpec } from "./lib/scale";
  import { layoutSchematic, schematicTrainPosition } from "./lib/schematicLayout";
  import { nearestStop, viewBbox } from "./lib/transitView";
  import type { Selection } from "./lib/selection";
  import type { MapData, Place } from "./lib/types";
  import type { Vehicle } from "$lib/types/transit";

  interface Ping {
    key: number;
    feedIds: string[];
    primary: string;
  }

  interface Props {
    data: MapData;
    measure: Measure;
    mode: "geo" | "schematic";
    width: number;
    height: number;
    selection: Selection | null;
    /** width of the inspector while something is selected, else 0 */
    inspectorWidth: number;
    /** the HTML overlays as canvas rectangles (label obstacles) */
    overlays: Rect[];
    /** key-up pings to draw (live) */
    pings: Ping[];
    /** motion study: ms since the squelch crossing, or null */
    demoMs: number | null;
    onselect: (key: string) => void;
    onpointer: (lonLat: LonLat | null) => void;
    onview: (zoom: number, moved: boolean) => void;
    /** the terminals with track detail inside the current view (for the terminal buttons) */
    onareas: (areas: DetailArea[]) => void;
    /** a terminal button was pressed: centre it at the detail zoom (`n` changes on every press) */
    focus: { id: string; n: number } | null;
    /** the LOCATE chip was pressed: centre on the user's fix (`n` changes on every press) */
    locate?: { n: number } | null;
    onstation?: (placeId: string) => void;
    onpingdone: (key: number) => void;
    /** the highlighted train and stop (the ones whose windows are open) */
    vehicleId?: string | null;
    stopId?: string | null;
    onvehicle: (id: string) => void;
    onstop: (stopId: string) => void;
    /** the trains drawn in the window, for the list */
    onwindow: (vehicles: Vehicle[]) => void;
    /** the NATIONAL chip was pressed: show the whole continental US (`n` changes on every press) */
    national?: { n: number } | null;
    /** a train was picked in the list: centre it (`n` changes on every pick) */
    centre?: { lon: number; lat: number; n: number } | null;
    /** a panel opened on something at this place: pan only if the panel would hide it (`n` changes on every request) */
    reveal?: { lon: number; lat: number; n: number } | null;
    /** width of the side panel docked on the right while one is open, else 0 */
    panelWidth?: number;
  }
  let { data, measure, mode, width, height, selection, inspectorWidth, overlays, pings, demoMs, onselect, onpointer, onview, onareas, focus, locate = null, onstation, onpingdone, vehicleId = null, stopId = null, onvehicle, onstop, onwindow, centre = null, reveal = null, panelWidth = 0, national = null }: Props = $props();

  const snap = $derived(live.state!);
  /** the canvas the side panel leaves uncovered */
  const free = $derived(width - panelWidth);
  const stations = $derived(data.places.stations);
  const lonLatOf = (id: string): LonLat => {
    const s = stations.find((p) => p.id === id)!;
    return [s.lon, s.lat];
  };
  const base: BaseProjection = $derived(defaultBase(width, height, lonLatOf("wash-union"), lonLatOf("baltimore-penn")));
  // zooming out stops at the whole continental US (the base is a local fit, so this is far below 1)
  const MIN_ZOOM = $derived(base.zoomToFit(CONTINENTAL_US));

  // ---- view: committed (drives the placers) and pending (a CSS transform while a gesture runs)
  const panned = (v: View, sel: Selection | null): View => {
    if (!sel || mode !== "geo") return v;
    const at = new Projection(base, v).project(selectionLonLat(sel));
    return { ...v, tx: v.tx + Math.round((width - inspectorWidth) / 2 - at[0]), ty: v.ty + Math.round(height / 2 - at[1]) };
  };
  const selectionLonLat = (sel: Selection): LonLat =>
    sel.kind === "train" ? [sel.train.lon, sel.train.lat] : sel.kind === "feed" ? [sel.feed.lon, sel.feed.lat] : [sel.place.lon, sel.place.lat];

  let view = $state<View>(untrack(() => panned(DEFAULT_VIEW, selection)));
  let pending = $state({ s: 1, tx: 0, ty: 0 });
  let commitTimer: ReturnType<typeof setTimeout> | undefined;
  let panning = $state(false);

  // selecting pans the view (zoom unchanged) to centre the object in the canvas the inspector leaves uncovered
  let lastSelected = untrack(() => selection?.id);
  $effect(() => {
    const id = selection?.id;
    if (id === lastSelected) return;
    lastSelected = id;
    untrack(() => (view = panned(view, selection)));
  });

  const projection = $derived(new Projection(base, view));
  const project = $derived(projection.project);
  const pxPerKm = $derived(projection.pxPerKm());
  const isDefaultView = $derived(view.k === 1 && view.tx === 0 && view.ty === 0);
  $effect(() => onview(view.k, !isDefaultView));
  // the regional detail (rail, stations, names, coverage) fades out between these zooms, leaving the national lines
  const REGIONAL_FADE = [0.25, 0.6];
  const regional = $derived(Math.max(0, Math.min(1, (view.k - REGIONAL_FADE[0]) / (REGIONAL_FADE[1] - REGIONAL_FADE[0]))));
  const regionalStyle = $derived(`opacity:${regional.toFixed(2)};${regional === 0 ? "display:none" : ""}`);

  // the route lines and stops for what the canvas shows (the schematic always shows the corridor)
  $effect(() => {
    const v = mode === "schematic" ? DEFAULT_VIEW : view;
    transit.requestLayers(viewBbox(new Projection(base, v).invert, width, height), v.k);
  });

  function commit(): void {
    clearTimeout(commitTimer);
    commitTimer = undefined;
    view = { k: view.k * pending.s, tx: view.tx * pending.s + pending.tx, ty: view.ty * pending.s + pending.ty };
    pending = { s: 1, tx: 0, ty: 0 };
  }
  const scheduleCommit = (): void => {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commit, 160);
  };

  let svgEl = $state<SVGSVGElement>();
  const local = (e: MouseEvent | WheelEvent): Pt => {
    const r = svgEl!.getBoundingClientRect();
    return [((e.clientX - r.left) * width) / r.width, ((e.clientY - r.top) * height) / r.height];
  };

  /** Scale the pending view by `factor` about the canvas point (x, y), within the zoom limits. */
  function zoomAt([x, y]: Pt, factor: number): void {
    const s = clampZoom(view.k * pending.s * factor, MIN_ZOOM, MAX_ZOOM) / view.k;
    const f = s / pending.s;
    pending = { s, tx: x - (x - pending.tx) * f, ty: y - (y - pending.ty) * f };
    scheduleCommit();
  }

  function onwheel(e: WheelEvent): void {
    if (mode !== "geo") return;
    e.preventDefault();
    zoomAt(local(e), Math.exp(-e.deltaY * 0.0015));
  }
  // Safari's own pinch (gesture events) would zoom the whole page; the pointer handlers below do the map zoom
  const noGesture = (e: Event): void => e.preventDefault();
  $effect(() => {
    const el = svgEl;
    if (!el) return;
    el.addEventListener("wheel", onwheel, { passive: false });
    const gestures = ["gesturestart", "gesturechange", "gestureend"];
    gestures.forEach((g) => el.addEventListener(g, noGesture));
    return () => {
      el.removeEventListener("wheel", onwheel);
      gestures.forEach((g) => el.removeEventListener(g, noGesture));
    };
  });

  // ---- pointers: one pans, two pinch (zoom about their midpoint while it pans), a double tap zooms in
  const DOUBLE_TAP_MS = 300;
  const pointers = new Map<number, Pt>();
  let drag: { from: Pt; moved: boolean } | null = null;
  let lastTap: { at: Pt; t: number } | null = null;
  const pinchOf = (pts: Pt[]): { mid: Pt; gap: number } => ({
    mid: [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2],
    gap: Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]),
  });

  function pointerdown(e: PointerEvent): void {
    if (mode !== "geo" || (e.pointerType === "mouse" && e.button !== 0)) return;
    pointers.set(e.pointerId, local(e));
    // a second finger turns the pan into a pinch
    drag = pointers.size === 1 ? { from: local(e), moved: false } : null;
  }
  function pointermove(e: PointerEvent): void {
    const at = local(e);
    const before = pointers.get(e.pointerId);
    if (before && pointers.size === 2) {
      const old = pinchOf([...pointers.values()]);
      pointers.set(e.pointerId, at);
      const now = pinchOf([...pointers.values()]);
      panning = true;
      svgEl!.setPointerCapture(e.pointerId);
      pending = { ...pending, tx: pending.tx + now.mid[0] - old.mid[0], ty: pending.ty + now.mid[1] - old.mid[1] };
      if (old.gap > 0) zoomAt(now.mid, now.gap / old.gap);
      scheduleCommit();
      return;
    }
    if (before) pointers.set(e.pointerId, at);
    if (drag) {
      const [dx, dy] = [at[0] - drag.from[0], at[1] - drag.from[1]];
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      panning = true;
      // capture only once it is a drag: a captured press would send its click to the map instead of the mark under it
      svgEl!.setPointerCapture(e.pointerId);
      pending = { ...pending, tx: pending.tx + dx, ty: pending.ty + dy };
      drag.from = at;
      scheduleCommit();
    }
    if (mode === "geo") onpointer(projection.invert([(at[0] - pending.tx) / pending.s, (at[1] - pending.ty) / pending.s]));
  }
  function pointerup(e: PointerEvent): void {
    const tapped = e.pointerType === "touch" && pointers.size === 1 && drag !== null && !drag.moved;
    pointers.delete(e.pointerId);
    // the finger left behind carries on as a pan
    const [rest] = pointers.values();
    drag = rest ? { from: rest, moved: true } : null;
    if (!rest) panning = false;
    if (!tapped) {
      lastTap = null;
      return;
    }
    const at = local(e);
    if (lastTap && e.timeStamp - lastTap.t < DOUBLE_TAP_MS && dist(lastTap.at, at) < 30) {
      zoomAt(at, 2);
      lastTap = null;
    } else {
      lastTap = { at, t: e.timeStamp };
    }
  }
  function pointerleave(): void {
    onpointer(null);
  }
  // a station of the regional map opens the window of the GTFS stop at the same place, else its own inspector
  function onplace(id: string): void {
    const place = stations.find((p) => p.id === id);
    const stop = place && nearestStop(transit.stops, place.lon, place.lat);
    if (stop) onstop(stop.id);
    else onselect(id);
  }
  // a click on empty map clears the selection; objects stop the event
  const background = (): void => {
    if (!panning && selection) onselect("");
  };

  // ---- live inputs
  const feeds = $derived(snap.feeds);
  const demoTx = $derived(demoMs === null ? undefined : snap.active_transmissions.find((t) => t.train_id));
  const txByFeed = $derived.by(() => {
    const out: Record<string, number> = {};
    for (const t of snap.active_transmissions) {
      if (t === demoTx && demoMs! < 250) continue;
      for (const r of t.receptions ?? []) out[r.feed_id] = (out[r.feed_id] ?? 0) + 1;
    }
    return out;
  });
  const looks = $derived(
    Object.fromEntries(
      feeds.map((f) => {
        const squelch = demoMs !== null && demoMs >= 0 && demoMs < 250 && !!demoTx?.receptions?.some((r) => r.feed_id === f.id);
        return [f.id, feedLook(f, txByFeed[f.id] ?? 0, squelch)];
      }),
    ),
  );
  const isTalking = (id: string, flag: boolean): boolean => (demoTx && fmt.trainId(demoTx.train_id) === id ? demoMs! >= 250 : flag);

  /** a phone shows a feed block as its name and SIM tag; the KM and SNR line is in the feed sheet (faults and stale keep theirs) */
  const phoneFeedInput = (f: (typeof feeds)[number]): ReturnType<typeof feedInput> => {
    const input = feedInput(f);
    return viewport.phone && !input.l2Class ? { ...input, l2: "" } : input;
  };
  const feedsKey = $derived(JSON.stringify(feeds.map(phoneFeedInput)));
  const activeKey = $derived(JSON.stringify(snap.active_transmissions.map(activeInput)));
  const liveTrains = $derived(snap.trains.positions.map(trainInput));

  // a placement stays until the set of trains changes or one has moved 12 px
  const REPLACE_MIN_MS = 3000;
  let placedAt = performance.now();
  let placed = $state.raw<TrainInput[]>(untrack(() => liveTrains));
  $effect(() => {
    const next = liveTrains;
    untrack(() => {
      const before = new Map(placed.map((t) => [t.id, t]));
      const same = next.length === placed.length && next.every((t) => before.has(t.id));
      const drifted = same && next.some((t) => dist(project([t.lon, t.lat]), project([before.get(t.id)!.lon, before.get(t.id)!.lat])) > 12);
      // a fast-forwarded sim drifts every tick; re-solve at most every 3 s for drift alone
      if (!same || (drifted && performance.now() - placedAt > REPLACE_MIN_MS)) {
        placed = next;
        placedAt = performance.now();
      }
    });
  });

  const lines = $derived(railLines(data.rail, project));

  // ---- terminal detail: from DETAIL_ZOOM each terminal swaps the regional lines for its own tracks
  const areas = $derived(data.detail ? areasOf(data.detail) : []);
  const inView = $derived(mode === "geo" ? visibleAreas(areas, project, width, height) : []);
  $effect(() => onareas(inView));
  const showDetail = $derived(view.k >= DETAIL_ZOOM && inView.length > 0);
  const detailRects = $derived(inView.map((a) => ({ area: a, r: areaRect(a, project) })));
  const detail = $derived.by(() => {
    if (!showDetail || !data.detail) return { tracks: [], platforms: [], points: [], labels: [] };
    const ids = new Set(inView.map((a) => a.id));
    const tracks: { d: string; cls: string }[] = [];
    const platforms: string[] = [];
    const points: { kind: string; at: Pt }[] = [];
    const numbered: { ref: string; pts: Pt[] }[] = [];
    for (const f of data.detail.features) {
      const p = f.properties;
      if (!ids.has(p.area)) continue;
      if (f.geometry.type === "Point") {
        points.push({ kind: p.kind, at: project(f.geometry.coordinates) });
        continue;
      }
      const pts = f.geometry.coordinates.map(project);
      if (p.kind === "platform") {
        platforms.push(dPath(pts));
        continue;
      }
      tracks.push({ d: dPath(pts), cls: p.service === "main" || p.service === "crossover" ? "s-hair k-line" : "s-hair k-faint" });
      if (p.ref) numbered.push({ ref: p.ref, pts });
    }
    const stops = points.filter((q) => q.kind === "buffer_stop").map((q) => q.at);
    const labels = view.k >= TRACK_LABEL_ZOOM ? trackLabels(numbered, stops, width - inspectorWidth, height) : [];
    return { tracks, platforms, points, labels };
  });

  // a terminal button centres its terminal at the zoom where the detail first shows
  let lastFocus = untrack(() => focus?.n);
  $effect(() => {
    if (!focus || focus.n === lastFocus) return;
    lastFocus = focus.n;
    const area = areas.find((a) => a.id === focus.id);
    if (area) untrack(() => ((view = viewCentredOn(base, area, DETAIL_ZOOM, width - inspectorWidth, height)), (pending = { s: 1, tx: 0, ty: 0 })));
  });

  // the LOCATE chip centres the map on the user's fix (keeping the zoom unless it is further out than LOCATE_ZOOM)
  let lastLocate = untrack(() => locate?.n);
  $effect(() => {
    if (!locate || locate.n === lastLocate) return;
    lastLocate = locate.n;
    const fix = userLocation.fix;
    if (fix) untrack(() => ((view = viewCentredAt(base, [fix.lon, fix.lat], Math.max(view.k * pending.s, LOCATE_ZOOM), width - inspectorWidth, height)), (pending = { s: 1, tx: 0, ty: 0 })));
  });

  // the NATIONAL chip fits the continental US to the canvas
  let lastNational = untrack(() => national?.n);
  $effect(() => {
    if (!national || national.n === lastNational) return;
    lastNational = national.n;
    untrack(() => {
      const pts = CONTINENTAL_US.map((p) => base.project(p));
      const [xs, ys] = [pts.map((p) => p[0]), pts.map((p) => p[1])];
      const [mx, my] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
      view = { k: MIN_ZOOM, tx: width / 2 - mx * MIN_ZOOM, ty: height / 2 - my * MIN_ZOOM };
      pending = { s: 1, tx: 0, ty: 0 };
    });
  });

  // picking a train in the list centres it (the zoom is kept unless the map is zoomed far out)
  const CENTRE_ZOOM = 2;
  let lastCentre = untrack(() => centre?.n);
  $effect(() => {
    if (!centre || centre.n === lastCentre) return;
    lastCentre = centre.n;
    if (mode === "geo") untrack(() => ((view = viewCentredAt(base, [centre.lon, centre.lat], Math.max(view.k * pending.s, CENTRE_ZOOM), free, height)), (pending = { s: 1, tx: 0, ty: 0 })));
  });

  // a panel that opens on something under it pans it into the free part of the canvas
  const REVEAL_PAD = 60;
  let lastReveal = untrack(() => reveal?.n);
  $effect(() => {
    if (!reveal || reveal.n === lastReveal) return;
    lastReveal = reveal.n;
    const target: LonLat = [reveal.lon, reveal.lat];
    if (mode !== "geo") return;
    untrack(() => {
      const [x, y] = projection.project(target);
      if (x >= REVEAL_PAD && x <= free - REVEAL_PAD && y >= REVEAL_PAD && y <= height - REVEAL_PAD) return;
      view = { ...view, tx: view.tx + Math.round(free / 2 - x), ty: view.ty + Math.round(height / 2 - y) };
    });
  });

  // ---- morph between the two views
  let u = $state(untrack(() => (mode === "schematic" ? 1 : 0)));
  $effect(() => {
    const target = mode === "schematic" ? 1 : 0;
    if (untrack(() => u) === target) return;
    if (ui.motion === "reduced") {
      u = target;
      return;
    }
    const from = untrack(() => u);
    const t0 = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const p = Math.min(1, (now - t0) / 600);
      u = from + (target - from) * p;
      if (p < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  });

  // ---- geo layout (lazy: only while geo is on screen or morphing)
  // the scale bar hangs in the bottom-right corner; its length follows the zoom
  const SCALE_RIGHT = 24;
  const scaleY = $derived(height - 70);
  // each layout is solved only while its view is on screen (the schematic search is the expensive one)
  const wantGeo = $derived(mode === "geo" || u < 1);
  const wantSch = $derived(mode === "schematic" || u > 0);
  const geoLayout = $derived.by(() => {
    if (!wantGeo) return null;
    const { kmW, miW } = scaleSpec(pxPerKm);
    const input: GeoInput = {
      phone: viewport.phone,
      width, height, project, invert: projection.invert, data, lines,
      feeds: JSON.parse(feedsKey),
      trains: placed,
      active: JSON.parse(activeKey),
      overlays,
      inspectorWidth,
      scaleBox: { x0: free - SCALE_RIGHT - Math.max(kmW, miW) - 44, y0: scaleY - 26, x1: free - SCALE_RIGHT + 8, y1: scaleY + 26 },
      northBox: { x0: free - 48 - 30, y0: 92 - 34, x1: free - 48 + 34, y1: 92 + 6 },
      measure,
      snrText: fmt.snr,
    };
    return layoutGeo(input);
  });

  const placeById = $derived.by(() => {
    const out: Record<string, Place> = {};
    for (const p of [...stations, ...data.places.landmarks, ...data.places.detectors, ...data.places.feeds, ...(data.routes.derived_points ?? [])]) out[p.id] = p;
    return out;
  });
  const talkAdjacent = $derived.by(() => {
    const out = new Set<string>();
    for (const tx of snap.active_transmissions) {
      if (!tx.train_id) continue;
      if (tx.place_id) out.add(tx.place_id);
      const next = snap.trains.positions.find((t) => t.train_id === tx.train_id)?.next_stop;
      if (next) out.add(next);
    }
    return out;
  });
  const schLayout = $derived.by(() =>
    wantSch
      ? layoutSchematic({
          width, height, routes: data.routes.routes, placeById,
          trains: placed.map((t) => ({ id: t.id, routeId: t.routeId, routeMi: t.routeMi, sim: t.sim, l2: t.l2 })),
          feeds: JSON.parse(feedsKey).map((f: ReturnType<typeof feedInput>) => ({ id: f.id, short: f.short, lat: f.lat, lon: f.lon, radiusKm: f.radiusKm })),
          talkAdjacent,
          overlays: overlays.map((b) => ({ x0: b.x0 - 8, y0: b.y0 - 8, x1: b.x1 + 8, y1: b.y1 + 8 })),
          measure,
        })
      : null,
  );

  // geo position of each schematic item, for the morph
  const geoOf = $derived.by(() => {
    const out: Record<string, Pt> = {};
    for (const [key, it] of Object.entries(schLayout?.pos ?? {})) {
      const id = it.p.place_id;
      out[key] = geoLayout?.stationPos[id]?.pt ?? geoLayout?.detectorPos[id] ?? project([it.p.lon, it.p.lat]);
    }
    return out;
  });

  // the placement audit, as the mockup's html[data-audit]: a failed assertion is visible without reading the screen
  $effect(() => {
    const g = geoLayout?.audit;
    const sc = schLayout?.audit;
    const pass = mode === "geo" ? (g?.terminalsPlaced ?? 0) >= 2 : !!sc && sc.leaderLeader + sc.leaderLabel === 0;
    document.documentElement.dataset.audit = JSON.stringify({ mode, ...(mode === "geo" ? { geo: g } : { schematic: sc }), pass });
  });

  // ---- trains, live at 1 Hz
  const trainGeos = $derived(trainGeometry(liveTrains, { width, height, project, data, lines }));
  const eased = $derived(easeInOut(u));
  interface DrawnTrain {
    id: string;
    pos: Pt;
    angle: number;
    talking: boolean;
    tail: Pt[] | null;
    edge: boolean;
    sim: boolean;
    l2: string;
  }
  const drawn = $derived<DrawnTrain[]>(
    liveTrains.map((t, i) => {
      const g = trainGeos[i];
      const sch = schLayout ? schematicTrainPosition(schLayout.pos, t) : null;
      const pos = sch ? lerp(g.pt, sch.xy, eased) : g.pt;
      const heading = sch ? (u < 0.5 ? g.heading : sch.dir) : g.heading;
      const talking = isTalking(t.id, snap.trains.positions[i].talking);
      return { id: t.id, pos, angle: (Math.atan2(heading[1], heading[0]) * 180) / Math.PI, talking, tail: u === 0 ? g.tail : null, edge: g.off && u === 0, sim: t.sim, l2: t.l2 };
    }),
  );
  const trainBlockFor = (t: DrawnTrain) => {
    const common = { x: t.pos[0], y: t.pos[1], from: 7, l1: t.id, sim: t.sim, l2: t.l2, tx: t.talking, glyph: t.talking ? "tx" : undefined };
    if (mode === "schematic") {
      const b = schLayout?.blocks[t.id];
      return b ? measuredBlock(measure, { ...common, dir: b.dir, len: b.len, v: b.v, flip: b.flip }) : null;
    }
    const b = geoLayout?.trainBlocks[t.id];
    return b ? measuredBlock(measure, { ...common, dir: b.dir, len: b.len }) : null;
  };
  const showBlocks = $derived((u === 0 && regional > 0.5) || u === 1);

  // ---- links: feed to talking train, from live positions; label slots come from the layout
  const links = $derived.by(() => {
    if (u !== 0 || regional < 0.5) return [];
    return linkSpecs({ project, feeds: JSON.parse(feedsKey), active: JSON.parse(activeKey), snrText: fmt.snr }, trainGeos.map((g, i) => ({ ...g, id: liveTrains[i].id }))).map(({ spec, trainId }) => {
      const slot = geoLayout?.links.find((l) => l.spec.key === spec.key)?.label ?? null;
      const demo = demoTx && fmt.trainId(demoTx.train_id) === trainId;
      const op = demo ? (demoMs! < 250 ? 0 : Math.min(1, easeInstrument((demoMs! - 250) / 400))) : 1;
      return { spec, slot, op };
    });
  });

  // ---- coverage strip data
  const stripLabels = $derived(
    Object.fromEntries(
      (schLayout?.strip.rows ?? []).map((row) => {
        const look = looks[row.feed.id];
        return [row.feed.id, look.fault ? feeds.find((f) => f.id === row.feed.id)!.label : `${look.stale ? "STALE · " : ""}${row.ticks.length}/${row.inside}`];
      }),
    ),
  );
  const heard = $derived.by(() => {
    const out: Record<string, number[]> = {};
    if (!schLayout) return out;
    for (const tx of snap.active_transmissions) {
      if (!tx.train_id || (tx === demoTx && demoMs! < 250)) continue;
      const train = snap.trains.positions.find((t) => t.train_id === tx.train_id);
      const p = train && schematicTrainPosition(schLayout.pos, trainInput(train));
      if (!p) continue;
      for (const r of tx.receptions ?? []) (out[r.feed_id] ??= []).push(p.xy[0]);
    }
    return out;
  });

  // ---- pings: live ones animate; the motion study draws rings at a frozen point of the ease
  const pingAt = (feedId: string): Pt => {
    const row = u === 1 ? schLayout?.strip.rows.find((r) => r.feed.id === feedId) : undefined;
    const f = feeds.find((x) => x.id === feedId)!;
    return row ? [row.gx, row.gy] : project([f.lon, f.lat]);
  };
  const demoRings = $derived.by(() => {
    if (demoMs === null || !demoTx || demoMs < 250) return [];
    const p = (demoMs - 250) / 1200;
    if (p >= 1) return [];
    const e = easeInstrument(p);
    return (demoTx.receptions ?? []).map((r) => ({ feedId: r.feed_id, primary: r.feed_id === demoTx.feed_id, progress: e }));
  });

  // ---- selection and pointer
  const selectedTrain = $derived(selection?.kind === "train" ? fmt.trainId(selection.train.train_id) : null);
  const selectedFeed = $derived(selection?.kind === "feed" ? selection.feed.id : null);
  const feedBlock = (f: (typeof feeds)[number]) => {
    const b = geoLayout?.feedBlocks[f.id];
    const look = looks[f.id];
    const [x, y] = project([f.lon, f.lat]);
    return u === 0 && b && regional > 0.5
      ? measuredBlock(measure, { x, y, dir: b.dir, len: b.len, from: 10, l1: f.short, sim: f.sim, l2: viewport.phone && !look.l2Class ? "" : look.l2, l2Class: look.l2Class, glyph: "tx" })
      : null;
  };
  const north = $derived(projection.northDirection());
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
<svg
  bind:this={svgEl}
  class="hud mp-svg"
  {width}
  {height}
  viewBox="0 0 {width} {height}"
  role="img"
  aria-label="Map of US passenger rail around the DC–Baltimore corridor"
  onpointerdown={pointerdown}
  onpointermove={pointermove}
  onpointerup={pointerup}
  onpointercancel={pointerup}
  onpointerleave={pointerleave}
  onclick={background}
>
  <g transform="translate({pending.tx} {pending.ty}) scale({pending.s})">
    <!-- geo layers -->
    {#if geoLayout}
    <g style:opacity={1 - u} style:display={u === 1 ? "none" : ""}>
      <g class="graticule">
        {#each geoLayout.graticule as g (g.label)}<path class="s-hair k-grid" d={dPath(g.pts)} />{/each}
      </g>
      <TransitLines lines={transit.lines} {base} {view} />
      <g class="mp-regional" style={regionalStyle}>
      <g class="mp-water">
        {#each data.water.features as f, i (i)}<path class="s-hair k-faint" d={dPath(f.geometry.coordinates.map((c) => project(c)))} />{/each}
      </g>
      {#each feeds as f, i (f.id)}
        <CoverageDisc index={i} centre={[f.lon, f.lat]} radiusKm={f.coverage_radius_km} look={looks[f.id]} labels={geoLayout.ringLabels[f.id] ?? []} {project} {width} {height} />
      {/each}
      {#if showDetail}
        <!-- the regional lines are hidden inside each terminal that draws its own tracks -->
        <mask id="mp-detail-mask" maskUnits="userSpaceOnUse" x={-width} y={-height} width={width * 3} height={height * 3}>
          <rect x={-width} y={-height} width={width * 3} height={height * 3} fill="white" />
          {#each detailRects as { r } (r)}<rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} fill="black" />{/each}
        </mask>
      {/if}
      <g class="mp-rail" mask={showDetail ? "url(#mp-detail-mask)" : undefined}>
        {#each ["freight", "passenger", "nec"] as cls (cls)}
          {#each lines.filter((l) => l.cls === cls) as l, i (i)}
            <path class={cls === "nec" ? "s-emph k-line" : cls === "freight" ? "s-hair k-line d-measure" : "s-hair k-line"} d={dPath(l.pts)} />
          {/each}
        {/each}
      </g>
      {#if showDetail}
        <g class="mp-detail">
          {#each detail.platforms as d, i (i)}<path class="s-hair k-faint mp-platform" {d} />{/each}
          {#each detail.tracks as t, i (i)}<path class={t.cls} d={t.d} />{/each}
          {#each detail.points as p, i (i)}
            {#if p.kind === "switch"}
              <path class="s-hair k-line" d="M{p.at[0].toFixed(1)} {(p.at[1] - 2.5).toFixed(1)}l2.5 2.5l-2.5 2.5l-2.5 -2.5z" />
            {:else if p.kind === "signal"}
              <circle class="f-ink" cx={p.at[0].toFixed(1)} cy={p.at[1].toFixed(1)} r="1.2" />
            {:else if p.kind === "buffer_stop"}
              <rect class="s-hair k-faint" x={(p.at[0] - 2).toFixed(1)} y={(p.at[1] - 2).toFixed(1)} width="4" height="4" />
            {/if}
          {/each}
          {#each detail.labels as l, i (i)}
            <text class="mp-trackref" class:is-end={l.end} x={l.at[0].toFixed(1)} y={(l.at[1] + 3.5).toFixed(1)} text-anchor="middle">{l.text}</text>
          {/each}
        </g>
      {:else}
        <!-- where track detail is waiting, zoom in to see it -->
        <g class="mp-detail-hint">
          {#each detailRects as { r } (r)}<rect class="s-hair k-faint d-measure" x={r.x0.toFixed(1)} y={r.y0.toFixed(1)} width={(r.x1 - r.x0).toFixed(1)} height={(r.y1 - r.y0).toFixed(1)} />{/each}
        </g>
      {/if}
      <g class="mp-ticks">
        {#each geoLayout.mpTicks as [a, b], i (i)}<path class="s-hair k-line" d="M{a[0].toFixed(1)} {a[1].toFixed(1)}L{b[0].toFixed(1)} {b[1].toFixed(1)}" />{/each}
      </g>
      </g>
      <g class="graticule">
        {#each geoLayout.edgeLabels as l (`${l.text}@${l.x},${l.y}`)}
          <rect class="mp-f-void" x={l.box.x0.toFixed(1)} y={l.box.y0.toFixed(1)} width={(l.box.x1 - l.box.x0).toFixed(1)} height={(l.box.y1 - l.box.y0).toFixed(1)} />
          <text class="mp-coord" x={l.x.toFixed(1)} y={l.y}>{l.text}</text>
        {/each}
      </g>
      <g class="mp-regional" style={regionalStyle}>
      <g class="mp-linelabs">
        {#each geoLayout.lineLabels as l (l.text)}
          <text class="mp-linelab" text-anchor="middle" dy="4" transform="translate({l.x.toFixed(1)} {l.y.toFixed(1)}) rotate({(l.rotate ?? 0).toFixed(1)})">{l.text}</text>
        {/each}
      </g>
      <g class="mp-dets">
        {#each data.places.detectors as d (d.id)}
          {@const p = geoLayout.detectorPos[d.id]}
          <path class="s-hair k-line mp-f-void" d="M{p[0].toFixed(1)} {(p[1] - 4.5).toFixed(1)}l4.5 4.5l-4.5 4.5l-4.5 -4.5Z" />
        {/each}
      </g>
      <g class="mp-stations">
        {#each stations as s (s.id)}
          {@const sp = geoLayout.stationPos[s.id]}
          {@const h = TERMINALS.has(s.id) ? 6 : 3}
          {@const [nx, ny] = [-sp.dir[1], sp.dir[0]]}
          <g class="mp-hit" role="button" tabindex="-1" onclick={(e) => { e.stopPropagation(); onplace(s.id); }} onkeydown={(e) => e.key === "Enter" && onplace(s.id)}>
            <path class="s-emph k-ink" d="M{(sp.pt[0] - nx * h).toFixed(1)} {(sp.pt[1] - ny * h).toFixed(1)}L{(sp.pt[0] + nx * h).toFixed(1)} {(sp.pt[1] + ny * h).toFixed(1)}" />
            {#if TERMINALS.has(s.id)}
              <rect class="s-hair k-ink" x={(sp.pt[0] - 4.5).toFixed(1)} y={(sp.pt[1] - 4.5).toFixed(1)} width="9" height="9" transform="rotate({((Math.atan2(sp.dir[1], sp.dir[0]) * 180) / Math.PI).toFixed(1)} {sp.pt[0].toFixed(1)} {sp.pt[1].toFixed(1)})" />
            {/if}
          </g>
        {/each}
        {#each geoLayout.stationNames as l (l.text + l.x)}
          <text class="mp-stn" x={l.x.toFixed(1)} y={l.y.toFixed(1)} text-anchor={l.anchor}>{l.text}</text>
        {/each}
        {#each geoLayout.terminals as t (t.id)}
          {#if t.tie}<path class="s-hair k-ink3" d="M{t.tie[0][0].toFixed(1)} {t.tie[0][1].toFixed(1)}L{t.tie[1][0].toFixed(1)} {t.tie[1][1].toFixed(1)}" />{/if}
          <rect class="mp-f-void" x={t.box.x0.toFixed(1)} y={(t.box.y0 + 1).toFixed(1)} width={(t.box.x1 - t.box.x0).toFixed(1)} height={(t.box.y1 - t.box.y0 - 2).toFixed(1)} />
          {#each t.lines as l (l.text)}
            <text class="mp-term" x={l.x.toFixed(1)} y={l.y.toFixed(1)} text-anchor={l.anchor}>{l.text}</text>
          {/each}
        {/each}
      </g>
      </g>
      <TransitStops
        stops={transit.stops} {project} {width} {height} k={view.k} selectedId={stopId} onselect={onstop}
        avoid={regional > 0.5 ? Object.values(geoLayout.stationPos).map((p) => p.pt) : []}
      />
      <ScaleBar right={free - SCALE_RIGHT} y={scaleY} {pxPerKm} />
      <g class="mp-north">
        <circle class="s-hair k-faint" cx={free - 48} cy="92" r="2" />
        <path class="s-hair k-line" d="M{free - 48} 92l{(north[0] * 22).toFixed(1)} {(north[1] * 22).toFixed(1)}" />
        <text class="tx-lab" x={(free - 48 + north[0] * 32).toFixed(1)} y={(92 + north[1] * 32 + 4).toFixed(1)} text-anchor="middle">N</text>
      </g>
    </g>
    {/if}

    <!-- schematic layers -->
    {#if schLayout}<SchematicMap layout={schLayout} {geoOf} {u} onselect={onplace} {onstation} />{/if}

    <!-- links: feed to the talking train -->
    {#each links as { spec, slot, op } (spec.key)}
      <path class="{spec.primary ? 's-emph' : 's-hair'} k-tx d-measure" style:opacity={op.toFixed(2)} d="M{spec.A[0].toFixed(1)} {spec.A[1].toFixed(1)}L{spec.B[0].toFixed(1)} {spec.B[1].toFixed(1)}" />
      {#if slot}
        {@const c = linkLabelCentre(spec, slot, linkLabelAngle(spec))}
        <text class="mp-tx-lab" style:opacity={op.toFixed(2)} transform="translate({c[0].toFixed(1)} {c[1].toFixed(1)}) rotate({linkLabelAngle(spec).toFixed(1)})" dy="4" text-anchor="middle">{slot.text}</text>
      {/if}
    {/each}

    <!-- trains -->
    {#each drawn as t (t.id)}
      <TrainMark id={t.id} pos={t.pos} angle={t.angle} talking={t.talking} selected={selectedTrain === t.id} tail={t.tail} edge={t.edge} onselect={() => onselect(t.id)} />
    {/each}
    <!-- real trains (GTFS-Realtime, Amtraker) -->
    <LiveTrains
      vehicles={transit.vehicles} routes={data.routes.routes} {project} {schLayout} {u} {width} {height}
      k={view.k} fetchedAt={transit.fetchedAt} selectedId={vehicleId} onselect={onvehicle} ondrawn={onwindow}
    />
    <!-- blocks after every glyph, so text halos knock out any leader beneath -->
    {#if showBlocks}
      {#each drawn as t (t.id)}
        {@const g = trainBlockFor(t)}
        {#if g}<DataBlockSvg geometry={g} />{/if}
      {/each}
    {/if}

    {#if schLayout}<CoverageStrip strip={schLayout.strip} {looks} {heard} labels={stripLabels} right={free - 24} opacity={Math.min(1, u * 1.6)} />{/if}

    <!-- feed sites (geo) -->
    <g style:opacity={(1 - Math.min(1, u * 1.6)).toFixed(2)} style:display={u >= 0.625 ? "none" : ""}>
      {#each feeds as f (f.id)}
        {@const [x, y] = project([f.lon, f.lat])}
        <FeedSite {x} {y} look={looks[f.id]} selected={selectedFeed === f.id} block={feedBlock(f)} onselect={() => onselect(f.short)} />
      {/each}
    </g>

    <!-- the viewer (geo) -->
    {#if userLocation.fix && u < 0.625}
      {@const fix = userLocation.fix}
      {@const [ux, uy] = project([fix.lon, fix.lat])}
      <g style:opacity={(1 - Math.min(1, u * 1.6)).toFixed(2)}><UserMark x={ux} y={uy} accuracy={accuracyRadiusPx(fix.accuracyM, pxPerKm)} /></g>
    {/if}

    <!-- pings -->
    <g>
      {#each pings as p (p.key)}
        {#each p.feedIds as id (id)}
          {@const [x, y] = pingAt(id)}
          <PingRing {x} {y} primary={id === p.primary} ondone={() => onpingdone(p.key)} />
        {/each}
      {/each}
      {#each demoRings as r (r.feedId)}
        {@const [x, y] = pingAt(r.feedId)}
        <PingRing {x} {y} primary={r.primary} progress={r.progress} />
      {/each}
    </g>
  </g>
</svg>

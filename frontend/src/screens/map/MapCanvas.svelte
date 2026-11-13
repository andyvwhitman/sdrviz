<script lang="ts">
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
  import { ui } from "$lib/stores/ui.svelte";
  import CoverageDisc from "./CoverageDisc.svelte";
  import CoverageStrip from "./CoverageStrip.svelte";
  import FeedSite from "./FeedSite.svelte";
  import PingRing from "./PingRing.svelte";
  import ScaleBar from "./ScaleBar.svelte";
  import SchematicMap from "./SchematicMap.svelte";
  import SchematicText from "./SchematicText.svelte";
  import TrainMark from "./TrainMark.svelte";
  import { easeInOut, easeInstrument } from "./lib/ease";
  import { dist, lerp, type Pt, type Rect } from "./lib/geom";
  import { measuredBlock } from "./lib/blockPlacer";
  import { layoutGeo, linkSpecs, trainGeometry, type GeoInput, type TrainInput } from "./lib/geoLayout";
  import { activeInput, feedInput, feedLook, trainInput } from "./lib/inputs";
  import { linkLabelAngle, linkLabelCentre, TERMINALS } from "./lib/labelPlacer";
  import type { Measure } from "./lib/measure";
  import { dPath } from "./lib/path";
  import { BaseProjection, defaultBase, DEFAULT_VIEW, Projection, clampZoom, type LonLat, type View } from "./lib/project";
  import { railLines } from "./lib/rail";
  import { layoutSchematic, schematicTrainPosition } from "./lib/schematicLayout";
  import type { Selection } from "./lib/selection";
  import type { MapData, Place } from "./lib/types";

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
    onpingdone: (key: number) => void;
  }
  let { data, measure, mode, width, height, selection, inspectorWidth, overlays, pings, demoMs, onselect, onpointer, onview, onpingdone }: Props = $props();

  const snap = $derived(live.state!);
  const stations = $derived(data.places.stations);
  const lonLatOf = (id: string): LonLat => {
    const s = stations.find((p) => p.id === id)!;
    return [s.lon, s.lat];
  };
  const base: BaseProjection = $derived(defaultBase(width, height, lonLatOf("wash-union"), lonLatOf("baltimore-penn")));
  // the whole data extent (Quantico to Perryville) bounds zooming out
  const MIN_ZOOM = $derived(base.zoomToFit([[-77.5, 38.5], [-77.5, 39.6], [-76.05, 38.5], [-76.05, 39.6]]));

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

  function onwheel(e: WheelEvent): void {
    if (mode !== "geo") return;
    e.preventDefault();
    const [x, y] = local(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    const total = view.k * pending.s;
    const s = clampZoom(total * factor, MIN_ZOOM) / view.k;
    const f = s / pending.s;
    pending = { s, tx: x - (x - pending.tx) * f, ty: y - (y - pending.ty) * f };
    scheduleCommit();
  }
  $effect(() => {
    svgEl?.addEventListener("wheel", onwheel, { passive: false });
    return () => svgEl?.removeEventListener("wheel", onwheel);
  });

  let drag: { from: Pt; moved: boolean } | null = null;
  function pointerdown(e: PointerEvent): void {
    if (mode !== "geo" || e.button !== 0) return;
    drag = { from: local(e), moved: false };
    svgEl!.setPointerCapture(e.pointerId);
  }
  function pointermove(e: PointerEvent): void {
    const at = local(e);
    if (drag) {
      const [dx, dy] = [at[0] - drag.from[0], at[1] - drag.from[1]];
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      panning = true;
      pending = { ...pending, tx: pending.tx + dx, ty: pending.ty + dy };
      drag.from = at;
      scheduleCommit();
    }
    if (mode === "geo") onpointer(projection.invert([(at[0] - pending.tx) / pending.s, (at[1] - pending.ty) / pending.s]));
  }
  function pointerup(): void {
    drag = null;
    panning = false;
  }
  function pointerleave(): void {
    onpointer(null);
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

  const feedsKey = $derived(JSON.stringify(feeds.map(feedInput)));
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
  const scaleAt = $derived<Pt>([24, height - 70]);
  // each layout is solved only while its view is on screen (the schematic search is the expensive one)
  const wantGeo = $derived(mode === "geo" || u < 1);
  const wantSch = $derived(mode === "schematic" || u > 0);
  const geoLayout = $derived.by(() => {
    if (!wantGeo) return null;
    const kmW = Math.round(20 * pxPerKm);
    const miW = Math.round(10 * 1.609344 * pxPerKm);
    const input: GeoInput = {
      width, height, project, invert: projection.invert, data, lines,
      feeds: JSON.parse(feedsKey),
      trains: placed,
      active: JSON.parse(activeKey),
      overlays,
      inspectorWidth,
      scaleBox: { x0: scaleAt[0] - 8, y0: scaleAt[1] - 26, x1: scaleAt[0] + Math.max(kmW, miW) + 36, y1: scaleAt[1] + 26 },
      northBox: { x0: width - 48 - 30, y0: 92 - 34, x1: width - 48 + 34, y1: 92 + 6 },
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
  const showBlocks = $derived(u === 0 || u === 1);

  // ---- links: feed to talking train, from live positions; label slots come from the layout
  const links = $derived.by(() => {
    if (u !== 0) return [];
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
    return u === 0 && b
      ? measuredBlock(measure, { x, y, dir: b.dir, len: b.len, from: 10, l1: f.short, sim: f.sim, l2: look.l2, l2Class: look.l2Class, glyph: "tx" })
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
  aria-label="Map of the DC–Baltimore corridor"
  onpointerdown={pointerdown}
  onpointermove={pointermove}
  onpointerup={pointerup}
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
      <g class="mp-water">
        {#each data.water.features as f, i (i)}<path class="s-hair k-faint" d={dPath(f.geometry.coordinates.map((c) => project(c)))} />{/each}
      </g>
      {#each feeds as f, i (f.id)}
        <CoverageDisc index={i} centre={[f.lon, f.lat]} radiusKm={f.coverage_radius_km} look={looks[f.id]} labels={geoLayout.ringLabels[f.id] ?? []} {project} {width} {height} />
      {/each}
      <g class="mp-rail">
        {#each ["freight", "passenger", "nec"] as cls (cls)}
          {#each lines.filter((l) => l.cls === cls) as l, i (i)}
            <path class={cls === "nec" ? "s-emph k-line" : cls === "freight" ? "s-hair k-line d-measure" : "s-hair k-line"} d={dPath(l.pts)} />
          {/each}
        {/each}
      </g>
      <g class="mp-ticks">
        {#each geoLayout.mpTicks as [a, b], i (i)}<path class="s-hair k-line" d="M{a[0].toFixed(1)} {a[1].toFixed(1)}L{b[0].toFixed(1)} {b[1].toFixed(1)}" />{/each}
      </g>
      <g class="graticule">
        {#each geoLayout.edgeLabels as l (l.text + l.x)}
          <rect class="mp-f-void" x={l.box.x0.toFixed(1)} y={l.box.y0.toFixed(1)} width={(l.box.x1 - l.box.x0).toFixed(1)} height={(l.box.y1 - l.box.y0).toFixed(1)} />
          <text class="mp-coord" x={l.x.toFixed(1)} y={l.y}>{l.text}</text>
        {/each}
      </g>
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
          <g class="mp-hit" role="button" tabindex="-1" onclick={(e) => { e.stopPropagation(); onselect(s.id); }} onkeydown={(e) => e.key === "Enter" && onselect(s.id)}>
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
      <ScaleBar x={scaleAt[0]} y={scaleAt[1]} {pxPerKm} />
      <g class="mp-north">
        <circle class="s-hair k-faint" cx={width - 48} cy="92" r="2" />
        <path class="s-hair k-line" d="M{width - 48} 92l{(north[0] * 22).toFixed(1)} {(north[1] * 22).toFixed(1)}" />
        <text class="tx-lab" x={(width - 48 + north[0] * 32).toFixed(1)} y={(92 + north[1] * 32 + 4).toFixed(1)} text-anchor="middle">N</text>
      </g>
    </g>
    {/if}

    <!-- schematic layers -->
    {#if schLayout}<SchematicMap layout={schLayout} {geoOf} {u} onselect={(id) => onselect(id)} />{/if}

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
    <!-- blocks after every glyph, so text halos knock out any leader beneath -->
    {#if showBlocks}
      {#each drawn as t (t.id)}
        {@const g = trainBlockFor(t)}
        {#if g}<DataBlockSvg geometry={g} />{/if}
      {/each}
    {/if}

    {#if schLayout}<CoverageStrip strip={schLayout.strip} {looks} {heard} labels={stripLabels} right={width - 24} opacity={Math.min(1, u * 1.6)} />{/if}

    <!-- feed sites (geo) -->
    <g style:opacity={(1 - Math.min(1, u * 1.6)).toFixed(2)} style:display={u >= 0.625 ? "none" : ""}>
      {#each feeds as f (f.id)}
        {@const [x, y] = project([f.lon, f.lat])}
        <FeedSite {x} {y} look={looks[f.id]} selected={selectedFeed === f.id} block={feedBlock(f)} onselect={() => onselect(f.short)} />
      {/each}
    </g>

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

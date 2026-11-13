<script lang="ts">
  /**
   * /map: the DC to Baltimore corridor in pure SVG line work (brief 9.5, spec 4.5). Geo or schematic
   * (`?mode=schematic`), a selection (`?select=BWI-03 | MARC 433 | <place>`) with its inspector, the corner
   * readout, ON AIR list, pointer readout, OSM attribution, and the M14 ping on key-up.
   *
   * Motion study (as the mockup): `?motion=1` replays the CH54 key-up; `&t=<ms>` freezes it at that moment.
   */
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import Chip from "$lib/components/Chip.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import SimTag from "$lib/components/SimTag.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { params } from "$lib/params";
  import { router } from "$lib/router.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { simClock } from "$lib/stores/simClock.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import MapCanvas from "./MapCanvas.svelte";
  import MapInspector from "./MapInspector.svelte";
  import OnAirList from "./OnAirList.svelte";
  import RegMark from "./RegMark.svelte";
  import { feedLook } from "./lib/inputs";
  import type { Rect } from "./lib/geom";
  import { canvasMeasure, FONTS, type Measure } from "./lib/measure";
  import { describePointer, milepostSegments } from "./lib/pointer";
  import type { LonLat } from "./lib/project";
  import { resolveSelection } from "./lib/selection";
  import type { GeoFeatureCollection, MapData, Places, RoutesDoc } from "./lib/types";
  import "./map.css";

  const INSPECTOR_W = 480;
  const [width, height] = params.size === 1440 ? [1376, 804] : [1856, 984];
  const query = new URLSearchParams(location.search);
  const demo = query.get("motion") === "1";
  const frozenAt = query.get("t") ? Number(query.get("t")) : null;

  // ---- static data and fonts (text is measured for the label placers, so the fonts must be in)
  let data = $state.raw<MapData | null>(null);
  let measure = $state.raw<Measure | null>(null);
  let failure = $state<string | null>(null);

  onMount(() => {
    const geo = Promise.all([api.geo.rail(), api.geo.water(), api.geo.places(), api.geo.routes()]);
    const fonts = Promise.race([
      Promise.all(Object.values(FONTS).map((f) => document.fonts.load(f.css))).then(() => document.fonts.load('500 48px "JetBrains Mono"')),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
    Promise.all([geo, fonts])
      .then(([[rail, water, places, routes]]) => {
        data = { rail: rail as unknown as GeoFeatureCollection, water: water as unknown as GeoFeatureCollection, places: places as unknown as Places, routes: routes as unknown as RoutesDoc };
        measure = canvasMeasure(document.createElement("canvas").getContext("2d")!);
      })
      .catch((e: unknown) => (failure = e instanceof Error ? e.message : String(e)));
  });

  // ---- mode, selection
  const mode = $derived(router.query("mode") === "schematic" ? "schematic" : "geo");
  const snap = $derived(live.state);
  const selection = $derived(snap && data ? resolveSelection(router.query("select"), snap, data) : null);
  const setMode = (m: "geo" | "schematic"): void => router.setQuery({ mode: m === "geo" ? null : m });
  const select = (key: string): void => router.setQuery({ select: key || null });

  let zoom = $state(1);
  let moved = $state(false);
  $effect(() => {
    shell.scope = ["MODE", mode === "geo" ? "GEO" : "SCHEMATIC"];
    shell.statusFallback = `MAP · ${mode === "geo" ? "GEO" : "SCHEMATIC"} · ${moved ? "CUSTOM VIEW" : "DEFAULT VIEW"} · ZOOM ${zoom.toFixed(1)}×`;
  });

  // ---- overlays are label obstacles: measured (offset geometry, immune to the stage scale)
  let readoutEl = $state<HTMLElement>();
  let ctlEl = $state<HTMLElement>();
  let attribEl = $state<HTMLElement>();
  let cursorEl = $state<HTMLElement>();
  let overlays = $state.raw<Rect[] | null>(null);
  $effect(() => {
    const els = [readoutEl, ctlEl, attribEl, cursorEl];
    if (els.some((el) => !el)) return;
    const measureAll = (): void => {
      overlays = els.map((el) => ({ x0: el!.offsetLeft, y0: el!.offsetTop, x1: el!.offsetLeft + el!.offsetWidth, y1: el!.offsetTop + el!.offsetHeight }));
    };
    measureAll();
    const observer = new ResizeObserver(measureAll);
    els.forEach((el) => observer.observe(el!));
    return () => observer.disconnect();
  });

  // ---- the ON AIR timers count tenths on the sim clock
  onMount(() => simClock.start());
  $effect(() => {
    if (snap) simClock.sync(snap.t_offset_s);
  });

  // ---- corner readout
  const counts = $derived(data && snap ? { feeds: snap.feeds.length, stations: data.places.stations.length, detectors: data.places.detectors.length, trains: snap.trains.tracked_count } : null);
  const looks = $derived(
    Object.fromEntries(
      (snap?.feeds ?? []).map((f) => [f.id, feedLook(f, (snap?.active_transmissions ?? []).filter((t) => t.receptions?.some((r) => r.feed_id === f.id)).length)]),
    ),
  );

  // ---- pointer readout
  const segments = $derived(data ? milepostSegments(data.routes.routes) : []);
  let pointer = $state<LonLat | null>(null);
  const pointerText = $derived(mode === "geo" ? describePointer(pointer, segments) : fmt.BLANK);

  // ---- key-up pings: once per TX commit, on every receiving feed, 250 ms after the squelch crossing
  let pings = $state.raw<{ key: number; feedIds: string[]; primary: string }[]>([]);
  let pingKey = 0;
  $effect(() =>
    live.on("keyup", (msg) => {
      if (ui.motion === "reduced" || demo) return;
      const ring = { key: ++pingKey, feedIds: msg.receptions.map((r) => r.feed_id), primary: msg.feed_id };
      setTimeout(() => (pings = [...pings, ring]), 250);
    }),
  );
  const pingDone = (key: number): void => {
    pings = pings.filter((p) => p.key !== key);
  };

  // ---- motion study: replay one key-up
  const demoRow = $derived(demo ? snap?.active_transmissions.find((t) => t.train_id) : undefined);
  let demoMs = $state<number | null>(demo ? (frozenAt ?? -1) : null);
  onMount(() => {
    if (!demo || frozenAt !== null) return;
    let frame = 0;
    let t0 = 0;
    const tick = (now: number): void => {
      demoMs = now - t0;
      if (demoMs >= 5000) start();
      else frame = requestAnimationFrame(tick);
    };
    const start = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame((now) => {
        t0 = now;
        tick(now);
      });
    };
    replay = start;
    const timer = setTimeout(start, ui.motion === "reduced" ? 0 : 600);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  });
  let replay = (): void => {};
  const phase = (ms: number): string => (ms < 0 ? "IDLE" : ms < 250 ? "DETECT" : ms < 650 ? "COMMIT · CONNECT" : ms < 1450 ? "PING" : "POPULATE");
  const demoLabel = $derived(demoMs === null || demoMs < 0 ? "— — —" : `+${Math.round(demoMs)} MS · ${phase(demoMs)}`);

  // Escape closes the inspector
  $effect(() => {
    const onkey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && selection) select("");
    };
    addEventListener("keydown", onkey);
    return () => removeEventListener("keydown", onkey);
  });
</script>

<div class="mp-frame">
  <div class="mp-canvas bezel">
    {#if data && measure && snap && overlays}
      <MapCanvas
        {data} {measure} {mode} {width} {height} {selection} {overlays} {pings} {demoMs}
        inspectorWidth={selection ? INSPECTOR_W : 0}
        onselect={select}
        onpointer={(p) => (pointer = p)}
        onview={(k, m) => ((zoom = k), (moved = m))}
        onpingdone={pingDone}
      />
    {:else if failure}
      <EmptyState title="MAP DATA NOT AVAILABLE" detail={failure} />
    {/if}

    <div class="mp-readout" bind:this={readoutEl} aria-label="{counts?.feeds ?? 0} feeds · {counts?.stations ?? 0} stations · {counts?.trains ?? 0} trains tracked">
      <div class="mp-readout__row">
        <span class="hero__big">{counts?.trains ?? fmt.BLANK}</span>
        <span class="hero__stack">
          <span class="a">TRAIN{counts?.trains === 1 ? "" : "S"} TRACKED <SimTag /></span>
          <span class="b">{counts?.feeds ?? 0} FEEDS · {counts?.stations ?? 0} STATIONS · {counts?.detectors ?? 0} DETECTORS</span>
        </span>
      </div>
      <div class="mp-onair"><OnAirList rows={snap?.active_transmissions ?? []} {demoMs} {demoRow} /></div>
    </div>

    <div class="mp-ctl" bind:this={ctlEl}>
      <Chip text="GEO" kind="filter" button pressed={mode === "geo"} onclick={() => setMode("geo")} />
      <Chip text="SCHEMATIC" kind="filter" button pressed={mode === "schematic"} onclick={() => setMode("schematic")} />
      <span class="mp-zoom"><span class="k">ZOOM</span>{zoom.toFixed(1)}×</span>
    </div>

    <div class="mp-attrib" bind:this={attribEl}><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a></div>
    <div class="mp-cursor" bind:this={cursorEl}><span class="k">POINTER</span>{pointerText}</div>

    {#if demo}
      <div class="mp-demo">
        <span class="k">MAP PING · KEY-UP REPLAY</span>
        <span class="v">{demoRow?.aar ?? ""} · {fmt.trainId(demoRow?.train_id)}</span>
        <span class="k">T</span><span class="v">{demoLabel}</span>
        <Chip text="REPLAY" kind="nominal" button onclick={() => replay()} />
      </div>
    {/if}

    {#if selection && data}
      <MapInspector {selection} {data} {looks} onclose={() => select("")} />
    {/if}
  </div>
  <svg class="hud mp-origin" viewBox="-10.5 -10.5 21 21"><RegMark x={-0.5} y={-0.5} /></svg>
</div>

<script lang="ts">
  /**
   * /map: the DC to Baltimore corridor in pure SVG line work (brief 9.5, spec 4.5), with the country's Amtrak and
   * commuter rail around it. Geo or schematic (`?mode=schematic`), a selection (`?select=BWI-03 | <place>`) with
   * its inspector, the corner readout with the list of trains in view, ON AIR list, pointer readout, OSM
   * attribution, and the M14 ping on key-up. A train, station or route opens in the one side panel (`?page=trip|station|route&id=`).
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
  import { transit } from "$lib/stores/transit.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { stage } from "$lib/stores/stage.svelte";
  import { viewport } from "$lib/stores/viewport.svelte";
  import MapCanvas from "./MapCanvas.svelte";
  import MapInspector from "./MapInspector.svelte";
  import RoutePanel from "./RoutePanel.svelte";
  import StationPanel from "./StationPanel.svelte";
  import TrainList from "./TrainList.svelte";
  import TripPanel from "./TripPanel.svelte";
  import { panel } from "./panelStore.svelte";
  import { userLocation } from "$lib/stores/userLocation.svelte";
  import StationSchematic from "./StationSchematic.svelte";
  import { STATIONS, stationFor } from "./lib/stationSchematic";
  import RegMark from "./RegMark.svelte";
  import { feedLook } from "./lib/inputs";
  import type { Rect } from "./lib/geom";
  import { canvasMeasure, FONTS, type Measure } from "./lib/measure";
  import { describePointer, milepostSegments } from "./lib/pointer";
  import type { LonLat } from "./lib/project";
  import { countOnly, listFoldedByDefault } from "./lib/overlays";
  import { stationHighlight } from "./lib/panel";
  import { resolveSelection } from "./lib/selection";
  import type { GeoFeatureCollection, MapData, Places, RoutesDoc } from "./lib/types";
  import { DETAIL_ZOOM, type DetailArea, type DetailCollection } from "./lib/detail";
  import type { Vehicle } from "$lib/types/transit";
  import "./map.css";

  const INSPECTOR_W = 480;
  // The canvas follows the window: the stage's design size on a wide screen, its measured box on a phone.
  const phone = $derived(viewport.phone);
  let boxW = $state(0);
  let boxH = $state(0);
  const stageHeight = params.size === 1440 ? 804 : 984;
  /** the foot of a phone's canvas is for the mode chips and the attribution, not for the map */
  const PHONE_FOOT_PX = 120;
  const height = $derived(phone ? Math.max(0, boxH - PHONE_FOOT_PX) : stageHeight);
  const width = $derived(phone ? boxW : stage.width);
  const query = new URLSearchParams(location.search);
  const demo = query.get("motion") === "1";
  const frozenAt = query.get("t") ? Number(query.get("t")) : null;

  // ---- static data and fonts (text is measured for the label placers, so the fonts must be in)
  let data = $state.raw<MapData | null>(null);
  let measure = $state.raw<Measure | null>(null);
  let failure = $state<string | null>(null);

  onMount(() => {
    const geo = Promise.all([api.geo.rail(), api.geo.water(), api.geo.places(), api.geo.routes()]);
    const detail = api.geo.railDetail().catch((e: unknown) => (console.warn("no track detail", e), null)); // optional layer
    const fonts = Promise.race([
      Promise.all(Object.values(FONTS).map((f) => document.fonts.load(f.css))).then(() => document.fonts.load('500 48px "JetBrains Mono"')),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
    Promise.all([geo, fonts, detail])
      .then(([[rail, water, places, routes], , trackDetail]) => {
        data = {
          rail: rail as unknown as GeoFeatureCollection,
          water: water as unknown as GeoFeatureCollection,
          places: places as unknown as Places,
          routes: routes as unknown as RoutesDoc,
          detail: trackDetail as unknown as DetailCollection | null,
        };
        measure = canvasMeasure(document.createElement("canvas").getContext("2d")!);
      })
      .catch((e: unknown) => (failure = e instanceof Error ? e.message : String(e)));
  });

  // ---- mode, selection
  // the schematic does not fit a portrait phone: the URL keeps `mode=schematic`, a desktop opening it still gets it
  const mode = $derived(router.query("mode") === "schematic" && !phone ? ("schematic" as const) : ("geo" as const));
  const snap = $derived(live.state);
  const selection = $derived(snap && data ? resolveSelection(router.query("select"), snap, data) : null);
  const setMode = (m: "geo" | "schematic"): void => router.setQuery({ mode: m === "geo" ? null : m });
  const select = (key: string): void => router.setQuery({ select: key || null });

  let zoom = $state(1);
  const zoomText = $derived(zoom >= 1 ? zoom.toFixed(1) : zoom.toFixed(2));

  // ---- the side panel (`?page=station|trip|route&id=`): one at a time, and the trains in view
  const PANEL_W = 440;
  const current = $derived(panel.current);
  const overlayView = $derived({ stageWidth: phone ? viewport.width : stage.width, panelWidth: current && !phone ? PANEL_W : 0, mode });
  const heroCountOnly = $derived(countOnly(overlayView));
  const listFolded = $derived(listFoldedByDefault(overlayView));
  let inView = $state.raw<Vehicle[]>([]);
  let centre = $state<{ lon: number; lat: number; n: number } | null>(null);
  let reveal = $state<{ lon: number; lat: number; n: number } | null>(null);
  let national = $state<{ n: number } | null>(null);

  // the marks the panel highlights on the map
  const trainId = $derived(current?.kind === "trip" ? (transit.vehicles.find((v) => (v.trip_id ?? v.id) === current.id)?.id ?? null) : null);
  let canonical = $state<{ for: string; id: string } | null>(null);
  const stopId = $derived(stationHighlight(current, canonical));
  /** the board named the station's canonical id: address it by that (the URL id follows) */
  function onCanonical(asked: string, id: string): void {
    canonical = { for: asked, id };
    if (current?.kind === "station" && current.id === asked) panel.canonicalise(id);
  }
  const stopName = $derived(transit.stops.find((s) => s.id === stopId)?.name ?? "");

  /** the panel replaces the sim inspector, which would sit under it */
  function openPanel(kind: "station" | "trip" | "route", id: string): void {
    if (selection) select("");
    panel.open(kind, id);
  }
  function openTrain(id: string, andCentre = false): void {
    const v = transit.vehicles.find((x) => x.id === id);
    openPanel("trip", v?.trip_id ?? id);
    if (v && andCentre) centre = { lon: v.lon, lat: v.lat, n: (centre?.n ?? 0) + 1 };
  }
  /** a click on the train already open closes its panel */
  function toggleTrain(id: string): void {
    if (current?.kind === "trip" && trainId === id) panel.close();
    else openTrain(id);
  }
  const openStop = (id: string): void => openPanel("station", id);
  const openTrip = (id: string): void => openPanel("trip", id);
  const openRoute = (id: string): void => openPanel("route", id);
  /** keep what the panel shows from hiding under it */
  const revealAt = (at: { lon: number; lat: number }): void => {
    reveal = { lon: at.lon, lat: at.lat, n: (reveal?.n ?? 0) + 1 };
  };
  const controls = $derived({
    full: current?.full ?? false,
    onclose: () => panel.close(),
    onfull: (full: boolean) => panel.setFull(full),
    onback: panel.canGoBack ? () => panel.back() : null,
  });

  // ---- station schematic (`?station=union`): opened from the terminal square or the TERMINALS buttons
  const station = $derived(mode === "schematic" ? stationFor(router.query("station")) : undefined);
  const openStation = (key: string): void => {
    const s = stationFor(key);
    if (s) router.setQuery({ station: s.area, select: null });
  };
  const closeStation = (): void => router.setQuery({ station: null });

  // ---- terminal buttons: one per terminal with track detail inside the current view
  let terminals = $state.raw<DetailArea[]>([]);
  let focus = $state<{ id: string; n: number } | null>(null);
  const showTerminal = (id: string): void => {
    focus = { id, n: (focus?.n ?? 0) + 1 };
  };
  let moved = $state(false);
  /** a terminal is in view (geo) or has a schematic (schematic mode): the TERMINALS chip shows */
  const hasTerminals = $derived(mode === "geo" ? terminals.length > 0 : !!data?.detail);

  // ---- the viewer's own position (LOCATE centres the map on it)
  let locate = $state<{ n: number } | null>(null);
  onMount(() => {
    userLocation.start();
    return () => userLocation.stop();
  });
  const locateText = $derived(userLocation.status === "denied" || userLocation.status === "unavailable" ? "LOCATE N/A" : userLocation.fix ? "LOCATE" : "LOCATING");
  $effect(() => {
    shell.scope = ["MODE", mode === "geo" ? "GEO" : "SCHEMATIC"];
    shell.statusFallback = `MAP · ${mode === "geo" ? "GEO" : "SCHEMATIC"} · ${moved ? "CUSTOM VIEW" : "DEFAULT VIEW"} · ZOOM ${zoomText}X`;
  });

  // ---- overlays are label obstacles: measured (offset geometry, immune to the stage scale)
  let termsOpen = $state(false);
  let termsEl = $state<HTMLElement>();
  let readoutEl = $state<HTMLElement>();
  let ctlEl = $state<HTMLElement>();
  let attribEl = $state<HTMLElement>();
  let cursorEl = $state<HTMLElement>();
  let overlays = $state.raw<Rect[] | null>(null);
  $effect(() => {
    const els = [readoutEl, ctlEl, cursorEl];
    if (els.some((el) => !el)) return;
    if (attribEl) els.push(attribEl); // only on a phone: the footer carries the credit from 900 px
    if (termsEl) els.push(termsEl); // the open TERMINALS list is an obstacle too
    const measureAll = (): void => {
      overlays = els.map((el) => ({ x0: el!.offsetLeft, y0: el!.offsetTop, x1: el!.offsetLeft + el!.offsetWidth, y1: el!.offsetTop + el!.offsetHeight }));
    };
    measureAll();
    const observer = new ResizeObserver(measureAll);
    els.forEach((el) => observer.observe(el!));
    return () => observer.disconnect();
  });

  // ---- real trains (GTFS-Realtime, Amtraker), polled while the map is open
  onMount(() => transit.start());

  // ---- the ON AIR timers count tenths on the sim clock
  onMount(() => simClock.start());

  // ---- corner readout
  const counts = $derived(data && snap ? { feeds: snap.feeds.length, stations: data.places.stations.length, detectors: data.places.detectors.length, trains: snap.trains.tracked_count + transit.vehicles.length, live: transit.vehicles.length, sim: snap.trains.tracked_count } : null);
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

  // Escape closes the panel (maximized or docked: both go), then the station schematic, then the inspector
  $effect(() => {
    const onkey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (current) {
        e.preventDefault();
        panel.close();
      } else if (station) closeStation();
      else if (selection) select("");
    };
    addEventListener("keydown", onkey);
    return () => removeEventListener("keydown", onkey);
  });
</script>

<div class="mp-frame" class:is-phone={phone}>
  <div class="mp-canvas bezel" bind:clientWidth={boxW} bind:clientHeight={boxH} style:--pn-w={current && !phone ? `${PANEL_W}px` : null}>
    {#if station && data?.detail && width > 0}
      <StationSchematic config={station} detail={data.detail} {width} {height} />
    {:else if data && measure && snap && overlays && width > 0 && height > 0}
      <MapCanvas
        {data} {measure} {mode} {width} {height} {selection} {overlays} {pings} {demoMs}
        inspectorWidth={selection && !phone ? INSPECTOR_W : 0}
        onselect={select}
        onpointer={(p) => (pointer = p)}
        onview={(k, m) => ((zoom = k), (moved = m))}
        onareas={(a) => (terminals = a)}
        {focus}
        {locate}
        onstation={openStation}
        onpingdone={pingDone}
        vehicleId={trainId}
        {stopId}
        onvehicle={toggleTrain}
        onempty={() => current && panel.close()}
        onstop={openStop}
        onwindow={(v) => (inView = v)}
        {centre}
        {reveal}
        panelWidth={current && !phone ? PANEL_W : 0}
        {national}
      />
    {:else if failure}
      <EmptyState title="MAP DATA NOT AVAILABLE" detail={failure} />
    {/if}

    <div class="mp-readout" bind:this={readoutEl} aria-label="{counts?.feeds ?? 0} feeds · {counts?.stations ?? 0} stations · {counts?.trains ?? 0} trains tracked">
      <div class="mp-readout__row">
        <span class="hero__big">{counts?.trains ?? fmt.BLANK}</span>
        <span class="hero__stack">
          <span class="a">TRAIN{counts?.trains === 1 ? "" : "S"} TRACKED {#if counts?.sim}<SimTag />{/if}{#if counts?.live && !heroCountOnly}<span class="mp-live-n"> · {counts.live} LIVE</span>{/if}</span>
          <span class="b" class:is-hidden={heroCountOnly}>{fmt.plural(counts?.feeds ?? 0, "FEED")} · {fmt.plural(counts?.stations ?? 0, "STATION")} · {fmt.plural(counts?.detectors ?? 0, "DETECTOR")}</span>
        </span>
      </div>
      <TrainList fetchedAt={transit.fetchedAt} vehicles={inView} selectedId={trainId} onselect={(id) => openTrain(id, true)} compact={phone || width - (current ? PANEL_W : 0) < 1500} folded={listFolded} />
    </div>


    <div class="mp-ctl" bind:this={ctlEl}>
      <Chip text="GEO" kind="filter" button pressed={mode === "geo"} onclick={() => setMode("geo")} />
      {#if !phone}<Chip text="SCHEMATIC" kind="filter" button pressed={mode === "schematic"} onclick={() => setMode("schematic")} />{/if}
      {#if mode === "geo" && !station}
        <Chip text={locateText} kind="filter" button onclick={() => userLocation.fix && (locate = { n: (locate?.n ?? 0) + 1 })} />
      {/if}
      {#if mode === "geo" && !station}
        <Chip text="NATIONAL" kind="filter" button onclick={() => (national = { n: (national?.n ?? 0) + 1 })} />
      {/if}
      {#if hasTerminals}
        <Chip button kind="filter" pressed={termsOpen} onclick={() => (termsOpen = !termsOpen)}>TERMINALS<span class="mp-caret" aria-hidden="true"></span></Chip>
      {/if}
      {#if station}
        <Chip text="BACK" kind="filter" button onclick={closeStation} />
      {:else}
        <span class="mp-zoom" class:is-hidden={heroCountOnly}><span class="k">ZOOM</span>{zoomText}X</span>
      {/if}
    </div>

    {#if termsOpen && hasTerminals}
      <div class="mp-terms" bind:this={termsEl} aria-label="Terminals">
        {#if mode === "geo"}
          {#each terminals as t (t.id)}
            <Chip text={t.short} kind="filter" button pressed={focus?.id === t.id && zoom >= DETAIL_ZOOM} onclick={() => (showTerminal(t.id), (termsOpen = false))} />
          {/each}
        {:else}
          {#each STATIONS as s (s.area)}
            <Chip text={s.title.join(" ")} kind="filter" button pressed={station?.area === s.area} onclick={() => (station?.area === s.area ? closeStation() : openStation(s.area), (termsOpen = false))} />
          {/each}
        {/if}
      </div>
    {/if}

    {#if phone}
      <div class="mp-attrib" bind:this={attribEl}><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a></div>
    {/if}
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

    {#if current?.kind === "station"}
      <StationPanel stopId={current.id} name={stopName} {...controls} ontrip={openTrip} onroute={openRoute} onlocate={revealAt} oncanonical={onCanonical} />
    {:else if current?.kind === "trip"}
      <TripPanel tripId={current.id} vehicles={transit.vehicles} fetchedAt={transit.fetchedAt} {...controls} onstop={openStop} onroute={openRoute} onlocate={revealAt} />
    {:else if current?.kind === "route"}
      <RoutePanel routeId={current.id} date={current.date} {...controls} ondate={(d) => panel.setDate(d)} onstop={openStop} ontrip={openTrip} />
    {/if}
  </div>
  <svg class="hud mp-origin" viewBox="-10.5 -10.5 21 21"><RegMark x={-0.5} y={-0.5} /></svg>
</div>

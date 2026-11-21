<script lang="ts">
  /**
   * SPOT: what is coming past where I am standing, when, and how sure are we. A responsive page (layout: "page"),
   * phone first: the spot bar, the next-train hero and the timeline stay pinned while the table scrolls. Scrolling
   * the timeline moves the window (30 min, 1 h, 2 h) the hero and the table show; the data covers it all already.
   * Position: the device, a station, or typed coordinates; the spot is kept in the address and on the device.
   * No radio on this page (decision 25).
   */
  import { onMount } from "svelte";
  import { displayName } from "$lib/displayName";
  import { router } from "$lib/router.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { nearestStop } from "../map/lib/transitView";
  import Hero from "./Hero.svelte";
  import Timeline from "./Timeline.svelte";
  import SpotBar from "./SpotBar.svelte";
  import SpotPicker from "./SpotPicker.svelte";
  import TrainRows from "./TrainRows.svelte";
  import { armNames, bearingOf, parseLatLon, sortRows, type Row } from "./spot";
  import { spotStore as store, type Spot } from "./spot.svelte";
  import { clockAt, horizonText, inWindow, windowOf } from "./timeline";
  import "./spot.css";

  const NEAR_STATION_KM = 3;

  let pickerOpen = $state(false);
  let selected = $state<string | null>(null);
  /** the row opened in place */
  let expanded = $state<string | null>(null);
  let contrast = $state(false);
  let awake = $state(false);

  // ---- the spot: link, then the device if it already allowed it, then the last spot, else ask
  async function chooseStart(): Promise<void> {
    const lat = Number(router.query("lat"));
    const lon = Number(router.query("lon"));
    if (router.query("lat") && router.query("lon") && parseLatLon(`${lat},${lon}`)) {
      store.setSpot({ lat, lon, source: "link", name: router.query("name") ?? undefined });
      return;
    }
    const permission = await navigator.permissions?.query({ name: "geolocation" }).then((p) => p.state, () => "prompt");
    if (permission === "granted") store.useMyLocation();
    else if (!store.spot) {
      pickerOpen = true; // the reason for the question, and the other ways to answer it, in one place
      store.useMyLocation(); // a blocked permission fails at once, without a prompt, and the picker says so
    }
  }

  onMount(() => {
    try {
      contrast = localStorage.getItem("sdrviz.spot.contrast") === "1";
    } catch {
      // the default stands
    }
    const stop = store.start();
    void chooseStart();
    void keepAwake();
    document.addEventListener("visibilitychange", keepAwake);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", keepAwake);
      void lock?.release();
      shell.statusFallback = undefined;
      delete document.documentElement.dataset.contrast;
    };
  });

  // ---- Screen Wake Lock: the phone stays lit while this page is open; the status line says so
  let lock: WakeLockSentinel | null = null;
  async function keepAwake(): Promise<void> {
    if (document.hidden || lock) return;
    try {
      lock = await navigator.wakeLock.request("screen");
      awake = true;
      lock.addEventListener("release", () => ((lock = null), (awake = false)));
    } catch {
      awake = false;
    }
  }

  // ---- high contrast
  $effect(() => {
    if (contrast) document.documentElement.dataset.contrast = "high";
    else delete document.documentElement.dataset.contrast;
  });
  function setContrast(on: boolean): void {
    contrast = on;
    try {
      localStorage.setItem("sdrviz.spot.contrast", on ? "1" : "0");
    } catch {
      // not remembered
    }
  }

  // ---- the address follows the spot
  $effect(() => {
    const spot = store.spot;
    if (!spot) return;
    router.setQuery({ lat: spot.lat.toFixed(5), lon: spot.lon.toFixed(5), name: spot.name ?? null });
  });

  // ---- what the table shows
  const trains = $derived((store.data?.trains ?? []).filter((t) => !store.agency || t.agency === store.agency));
  /** every loaded train (the timeline draws them all) */
  const all = $derived(sortRows(trains, store.elapsedS));
  const win = $derived(windowOf(store.offsetMin, store.horizonMin));
  /** the trains inside the window (the hero and the table) */
  const rows = $derived({ passed: all.passed.filter((r) => inWindow(r, win)), coming: all.coming.filter((r) => inWindow(r, win)) });
  const next = $derived<Row | null>(rows.coming.find((r) => r.group === "coming" && r.remainingS >= win.fromS) ?? null);
  const fromClock = $derived(win.live ? null : clockAt(store.now, store.offsetMin));
  const windowText = $derived(win.live ? `NEXT ${horizonText(store.horizonMin)}` : `${fromClock}–${clockAt(store.now, store.offsetMin + store.horizonMin)}`);
  const agencies = $derived([...new Set((store.data?.trains ?? []).map((t) => t.agency))].sort());
  const line = $derived(store.data?.position.nearest_line ?? null);
  /** the way trains travel here, which decides what each arm of the ladder is called */
  const bearing = $derived(trains.length ? bearingOf(trains[0]) : null);
  const arms = $derived(armNames([...all.passed, ...all.coming], bearing));
  const radiusKm = $derived(store.data?.position.radius_km ?? 1);
  const near = $derived(store.spot ? nearestStop(store.stops, store.spot.lon, store.spot.lat, NEAR_STATION_KM) : null);
  const nearName = $derived(near ? displayName(near) : null);
  const spotLabel = $derived(store.spot?.name ?? nearName ?? "SPOT");

  const pending = $derived(!!store.spot && !store.data && !store.failed);
  const emptyText = $derived(
    !store.spot ? "PICK WHERE YOU ARE STANDING" : store.failed ? "NO LINK TO TRAIN DATA" : win.live ? `NO TRAINS IN THE ${windowText}` : `NO TRAINS ${windowText}`,
  );

  $effect(() => {
    const parts = ["SPOT"];
    if (store.spot) parts.push(spotLabel, `${rows.coming.length} TRAINS ${windowText}`);
    if (store.failed) parts.push("NO LINK · LAST TABLE");
    if (awake) parts.push("AWAKE");
    shell.statusFallback = parts.join(" · ").toUpperCase();
  });

  function pick(spot: Spot): void {
    store.setSpot(spot);
    pickerOpen = false;
  }
  /** a tap on the timeline opens that train's row in the table (moving the window to it first), and brings it into view */
  function openRow(row: Row): void {
    if (!inWindow(row, win)) store.offsetMin = Math.max(-60, Math.round(row.remainingS / 60) - 5);
    expanded = expanded === row.train.key ? null : row.train.key;
    if (expanded) requestAnimationFrame(() => document.querySelector(`[data-key="${CSS.escape(row.train.key)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }
  function useSnap(): void {
    if (line) pick({ lat: line.lat, lon: line.lon, source: "typed" });
  }
</script>

<div class="sp">
  <div class="sp__top">
    <div class="sp__bar">
      <SpotBar spot={store.spot} {line} {radiusKm} {nearName} locate={store.locate} open={pickerOpen} ontoggle={() => (pickerOpen = !pickerOpen)} onsnap={useSnap} />
      {#if pickerOpen}
        <SpotPicker
          stops={store.stops}
          recent={store.recent}
          locate={store.locate}
          inline={!store.spot}
          {contrast}
          onlocate={() => store.useMyLocation()}
          onpick={pick}
          oncontrast={setContrast}
          onclose={() => (pickerOpen = false)}
        />
      {/if}
    </div>
    <div class="sp__hero"><Hero {next} empty={emptyText} {pending} after={fromClock} /></div>
    <div class="sp__timeline">
      <Timeline
        rows={[...all.passed, ...all.coming]}
        bind:offsetMin={store.offsetMin}
        horizonMin={store.horizonMin}
        nowMs={store.now}
        leftArm={arms.left}
        rightArm={arms.right}
        onhorizon={(minutes) => store.setHorizon(minutes)}
        onopen={openRow}
      />
    </div>
  </div>

  <div class="sp__filters">
    <span class="sp__count">{rows.coming.length} {rows.coming.length === 1 ? "TRAIN" : "TRAINS"} · {windowText}</span>
    {#if agencies.length > 1}
      <label class="sp__opr">
        <span class="sp__opr-k">OPERATOR</span>
        <select bind:value={store.agency}>
          <option value={null}>ALL</option>
          {#each agencies as agency (agency)}<option value={agency}>{agency.toUpperCase()}</option>{/each}
        </select>
      </label>
    {/if}
  </div>

  {#if store.failed && store.data}
    <p class="sp__note">NO LINK TO TRAIN DATA · SHOWING THE LAST TABLE</p>
  {/if}

  {#if rows.passed.length || rows.coming.length}
    <TrainRows {rows} {selected} bind:expanded onselect={(key) => (selected = key)} />
  {:else if store.data}
    <p class="sp__empty">{emptyText}</p>
  {/if}
</div>

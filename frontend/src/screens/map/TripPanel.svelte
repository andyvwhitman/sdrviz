<script lang="ts">
  /**
   * A trip in the side panel: who and where (service, operator, next stop with its ETA, delay, speed), how fresh the
   * position is and whether it is measured or estimated, and every stop of the trip (GET /transit/trips) with the
   * passed ones dimmed and the current or next one lit. The panel is addressed by trip id; when that trip is
   * running, its live vehicle is shown, and a train that stops being reported keeps its last known state.
   */
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import KeyValue from "$lib/components/KeyValue.svelte";
  import { BLANK } from "$lib/hud/fmt";
  import type { Trip, TripStop, Vehicle } from "$lib/types/transit";
  import Panel, { type PanelControls } from "./Panel.svelte";
  import Delay from "./Delay.svelte";
  import { estMark, stopCode, stopTimes, TRACK_STATIONS } from "./lib/boardView";
  import { ageNow, ageText, clockOf, delayCell, hhmm, hhmmss, isStale, timeTag, trainTitle } from "./lib/transitView";

  interface Props extends PanelControls {
    /** a trip id, or the id of a running train that has none */
    tripId: string;
    vehicles: Vehicle[];
    /** when `vehicles` arrived (ms), to age their freshness */
    fetchedAt: number;
    /** a stop of the trip was clicked (a station id: a group's, or "<source>:<stop id>") */
    onstop: (stopId: string) => void;
    onroute: (routeId: string) => void;
    /** the train was found: where it is, to keep it in view */
    onlocate?: (at: { lon: number; lat: number }) => void;
  }
  let { tripId, vehicles, fetchedAt, onstop, onroute, onlocate, ...controls }: Props = $props();

  const REFRESH_MS = 30_000;

  const reported = $derived(vehicles.find((v) => (v.trip_id ?? v.id) === tripId));
  let lastKnown = $state.raw<Vehicle | null>(null);
  $effect(() => {
    lastKnown = reported ?? (lastKnown && (lastKnown.trip_id ?? lastKnown.id) === tripId ? lastKnown : null);
  });

  let trip = $state.raw<Trip | null>(null);
  let failed = $state(false);
  // a running train with no trip id has no stop list to fetch
  const fetchId = $derived(reported && !reported.trip_id ? null : tripId);
  $effect(() => {
    const id = fetchId;
    trip = null;
    failed = false;
    if (!id) return;
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const next = await api.transit.trip(id);
        if (alive) [trip, failed] = [next, false];
      } catch {
        if (alive) failed = true;
      }
    };
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  });

  let located = "";
  $effect(() => {
    if (reported && located !== tripId) [located] = [tripId, onlocate?.(reported)];
  });

  let now = $state(Date.now());
  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

  const vehicle = $derived(reported ?? (lastKnown && (lastKnown.trip_id ?? lastKnown.id) === tripId ? lastKnown : (trip?.vehicle ?? null)));
  const gone = $derived(!!vehicle && !reported && vehicle === lastKnown);
  const age = $derived(vehicle ? ageNow(vehicle.age_s, fetchedAt, now) : null);
  const stale = $derived(gone || (!!vehicle && isStale(age, vehicle.stale_after_s)));
  const stops = $derived(trip?.stops ?? []);
  const cur = $derived(stops.findIndex((s) => s.state === "current" || s.state === "next"));
  const routeId = $derived(vehicle?.route_id ?? trip?.route_id ?? null);
  const service = $derived(vehicle?.route_name ?? trip?.route_name ?? null);
  const agency = $derived(vehicle?.agency ?? trip?.agency ?? BLANK);
  const title = $derived(vehicle ? trainTitle(vehicle) : trip ? `${trip.agency} ${trip.train ?? ""}`.trim() : tripId);

  /** the track of a stop: its own, or TBD for an Amtrak train at a station that announces tracks */
  const trackOf = (s: TripStop): string => s.track ?? (agency === "Amtrak" && TRACK_STATIONS.includes(stopCode(s.stop_id) ?? "") ? "TBD" : "");
  const tagOf = (s: TripStop): string =>
    s.state === "skipped" ? "SKIPPED" : s.state === "current" ? `${estMark(s.state_basis)}AT STOP` : s.state === "next" ? `${estMark(s.state_basis)}NEXT` : "";
  /** the glance form of the freshness, for the panel's subheader */
  const glance = $derived(
    !vehicle ? "SCHEDULE ONLY" : gone ? "NOT REPORTING" : age == null ? "AGE —" : `${vehicle.position === "realtime" ? "LIVE" : "EST"} · ${ageText(age)} AGO`,
  );

  /** the list opens on the current stop, a little below the top */
  let listEl = $state<HTMLElement>();
  $effect(() => {
    const el = listEl;
    const row = cur;
    if (!el || row < 0) return;
    const target = el.querySelector<HTMLElement>(".tw-stop.is-cur");
    if (target) el.scrollTop = Math.max(0, target.offsetTop - el.offsetTop - 48);
  });
</script>

<Panel {title} kind={service ?? agency} label="Trip {title}" {...controls}>
  {#snippet status()}<span class="tw-glance" class:tw-stale={stale} class:tw-live={!stale && vehicle?.position === "realtime"}>{glance}{stale && !gone ? " · STALE" : ""}</span>{/snippet}
  <div class="tw-cols" class:is-wide={controls.full}>
    <section class="inspector__sec">
      <h4>STATUS</h4>
      <KeyValue label="SERVICE">
        {#if routeId && service}<button class="tw-link" title="Timetable of this route" onclick={() => onroute(routeId)}>{service}</button>{:else}{service ?? BLANK}{/if}
      </KeyValue>
      <KeyValue label="OPERATOR" value={agency} />
      <KeyValue label="ROUTE" value="{vehicle?.origin ?? BLANK} → {vehicle?.destination ?? vehicle?.headsign ?? trip?.headsign ?? BLANK}" />
      {#if vehicle}
        <KeyValue label="NEXT STOP">
          {#if vehicle.next_stop}{vehicle.next_stop.name} · {hhmm(vehicle.next_stop.eta ?? vehicle.next_stop.scheduled)}{:else}{BLANK}{/if}
        </KeyValue>
        <KeyValue label="DELAY"><Delay {...delayCell(vehicle.delay_s, true)} suspect={vehicle.delay_suspect} /></KeyValue>
        <KeyValue label="SPEED" value={vehicle.speed_mph == null ? BLANK : String(Math.round(vehicle.speed_mph))} unit="MPH" />
        <KeyValue label="POSITION"><span class:tw-est={vehicle.position === "estimated"}>{vehicle.position === "realtime" ? "REALTIME" : "ESTIMATED FROM SCHEDULE"}</span></KeyValue>
        <div class="tw-fresh" class:is-stale={stale}>
          <KeyValue label="DATA AS OF" value={hhmmss(vehicle.updated)} />
          <KeyValue label="AGE">
            <span class:tw-stale={stale}>{gone ? "NO LONGER REPORTING" : age == null ? BLANK : `${ageText(age)} AGO${stale ? " · STALE" : ""}`}</span>
          </KeyValue>
          <KeyValue label="LAST REFRESH" value={clockOf(fetchedAt)} />
        </div>
      {:else}
        <KeyValue label="POSITION" value="NO LIVE POSITION" />
        {#if trip}<KeyValue label="SERVICE DATE" value={trip.service_date} />{/if}
      {/if}
    </section>

    <section class="inspector__sec tw-stops">
      <h4>STOPS{stops.length ? ` · ${stops.length}` : ""}</h4>
      {#if stops.length}
        <div class="tw-list" bind:this={listEl}>
          {#each stops as s (s.seq)}
            {@const t = stopTimes(s)}
            <button class="tw-stop is-{s.state}" title={t.title} class:is-cur={s.state === "current" || s.state === "next"} onclick={() => onstop(s.stop_id)}>
              <span class="tw-mark" aria-hidden="true"></span>
              <span class="tw-name">{s.name}</span>
              {#if tagOf(s) || trackOf(s)}<span class="tw-tag tw-sub">{[tagOf(s), trackOf(s) && `TRK ${trackOf(s)}`].filter(Boolean).join(" · ")}</span>{/if}
              <span class="tw-t">{#if t.arrival}<span class="tw-arr">{t.arrival}</span> {/if}{t.time}</span>
              <span class="tw-t tw-tag"><Delay {...timeTag(s.delay_s, s.dep_estimated ?? s.arr_estimated)} /></span>
            </button>
          {/each}
        </div>
      {:else if reported && !reported.trip_id}
        <div class="tw-none">NO SCHEDULE FOR THIS TRAIN</div>
      {:else if failed}
        <div class="tw-none">STOP LIST UNAVAILABLE</div>
      {:else}
        <div class="tw-none">LOADING STOPS</div>
      {/if}
    </section>
  </div>
</Panel>

<style>
  .tw-cols { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
  .tw-cols.is-wide { display: grid; grid-template-columns: minmax(340px, 420px) 1fr; gap: 32px; align-items: start; }
  .tw-cols.is-wide .tw-stops { align-self: stretch; }
  .is-stale { opacity: 0.75; }
  .tw-est { color: var(--ink-2); }
  .tw-stale { color: var(--state-fault); }
  .tw-link { padding: 0; border: 0; background: none; font: inherit; color: var(--ink); text-transform: inherit; text-decoration: underline dotted var(--ink-3); text-underline-offset: 3px; cursor: pointer; }
  .tw-link:hover { color: var(--state-idle); }
  .tw-stops { flex: 1; min-height: 160px; display: flex; flex-direction: column; }
  .tw-list { flex: 1; min-height: 0; position: relative; overflow-y: auto; margin-right: -8px; padding-right: 8px; }
  .tw-stop {
    display: grid; grid-template-columns: 14px 1fr 84px 92px; grid-template-areas: "m n t g" ". k k ."; align-items: baseline; column-gap: 8px; width: 100%;
    padding: 5px 4px; border: 0; border-bottom: 1px solid var(--grid); background: none; text-align: left; cursor: pointer;
    font: 400 var(--fs-12)/1.2 var(--font-data); color: var(--ink); text-transform: uppercase;
  }
  .tw-stop:hover { background: var(--bg-panel); }
  .tw-mark { align-self: center; width: 7px; height: 7px; border: 1px solid var(--line); border-radius: 50%; }
  .tw-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tw-tag { font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: 0.08em; color: var(--ink-3); white-space: nowrap; }
  .tw-t { font-variant-numeric: tabular-nums; text-align: right; }
  .tw-arr { color: var(--ink-3); margin-right: 6px; }
  .tw-sub { grid-area: k; margin-top: 2px; }
  .tw-mark { grid-area: m; } .tw-name { grid-area: n; }
  .tw-t { grid-area: t; } .tw-tag.tw-t { grid-area: g; }
  .tw-live { color: var(--state-idle); }
  .is-passed { color: var(--ink-3); }
  .is-passed .tw-mark { background: var(--line-faint); border-color: var(--line-faint); }
  .is-skipped .tw-name { text-decoration: line-through; color: var(--ink-3); }
  .is-cur { background: var(--bg-panel); box-shadow: inset 2px 0 0 var(--state-idle); color: var(--ink); font-weight: 600; }
  .is-cur .tw-mark { background: var(--state-idle); border-color: var(--state-idle); box-shadow: 0 0 6px var(--state-idle); }
  .is-cur .tw-tag { color: var(--state-idle); }
  .tw-none { padding: 8px 0; font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: 0.08em; color: var(--ink-3); }
</style>

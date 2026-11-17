<script lang="ts">
  /**
   * A route in the side panel: its timetable for a day (GET /transit/routes/{id}?date=), one grid per direction with
   * the stops down the side and the trips across, scrolling sideways when there are more trips than room.
   */
  import { api } from "$lib/api/client";
  import Chip from "$lib/components/Chip.svelte";
  import { cleanName } from "$lib/displayName";
  import type { RouteTimetable } from "$lib/types/transit";
  import Panel, { type PanelControls } from "./Panel.svelte";
  import { hhmm } from "./lib/transitView";
  import { shiftDate, today } from "./lib/panel";

  interface Props extends PanelControls {
    routeId: string;
    /** the service day, YYYY-MM-DD; null is today */
    date: string | null;
    ondate: (date: string) => void;
    onstop: (stopId: string) => void;
    ontrip: (tripId: string) => void;
  }
  let { routeId, date, ondate, onstop, ontrip, ...controls }: Props = $props();

  const day = $derived(date ?? today());

  let timetable = $state.raw<RouteTimetable | null>(null);
  let failed = $state(false);
  $effect(() => {
    const [id, d] = [routeId, day];
    timetable = null;
    failed = false;
    let alive = true;
    api.transit
      .route(id, d)
      .then((next) => alive && (timetable = next))
      .catch(() => alive && (failed = true));
    return () => (alive = false);
  });

  const route = $derived(timetable?.route);
</script>

<Panel title={route?.name ?? "ROUTE"} kind="{route?.agency ?? ''} · TIMETABLE" label="Route {route?.name ?? routeId}" {...controls}>
  <div class="rp-day">
    {#if route?.color}<span class="rp-swatch" style:background="#{route.color}" aria-hidden="true"></span>{/if}
    <Chip text="‹" button kind="filter" title="Previous day" onclick={() => ondate(shiftDate(day, -1))} />
    <span class="rp-date">{day}{date === null || date === today() ? " · TODAY" : ""}</span>
    <Chip text="›" button kind="filter" title="Next day" onclick={() => ondate(shiftDate(day, 1))} />
    {#if day !== today()}<Chip text="TODAY" button kind="filter" onclick={() => ondate(today())} />{/if}
  </div>
  {#if timetable}
    {#each timetable.directions as d (d.id)}
      <section class="inspector__sec rp-dir" class:is-wide={controls.full}>
        <h4>TO {d.headsign} · {d.trips.length} TRIP{d.trips.length === 1 ? "" : "S"}</h4>
        {#if d.trips.length}
          <div class="rp-scroll">
            <table class="rp-grid">
              <thead>
                <tr>
                  <th class="rp-stop"></th>
                  {#each d.trips as t (t.trip_id)}
                    <th><button class="rp-train" title="Open this trip" onclick={() => ontrip(t.trip_id)}>{t.train ?? "—"}</button></th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each d.stops as s, i (`${s.stop_id}-${i}`)}
                  <tr>
                    <th class="rp-stop"><button class="rp-name" title="{s.name}: open this station" onclick={() => onstop(s.stop_id)}>{cleanName(s.name, d.stops.map((x) => x.name))}</button></th>
                    {#each d.trips as t (t.trip_id)}<td class:rp-none={!t.times[i]}>{t.times[i] ? hhmm(t.times[i]) : "·"}</td>{/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="rp-empty">NO TRIPS THIS DAY</div>
        {/if}
      </section>
    {:else}
      <div class="rp-empty">NO TIMETABLE FOR THIS DAY</div>
    {/each}
  {:else}
    <div class="rp-empty">{failed ? "TIMETABLE UNAVAILABLE" : "LOADING TIMETABLE"}</div>
  {/if}
</Panel>

<style>
  .rp-day { display: flex; align-items: center; gap: 8px; }
  .rp-swatch { width: 12px; height: 12px; }
  .rp-date { font: 500 var(--fs-12)/1 var(--font-data); color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .rp-dir { min-width: 0; }
  .rp-scroll { overflow-x: auto; padding-bottom: 6px; }
  .rp-grid { border-collapse: collapse; font: var(--type-num); color: var(--ink); text-transform: uppercase; }
  .rp-grid th, .rp-grid td { padding: 4px 8px; border-bottom: 1px solid var(--grid); text-align: right; white-space: nowrap; font-weight: 400; font-variant-numeric: tabular-nums; }
  .rp-grid thead th { font: 600 var(--fs-12)/1.2 var(--font-data); position: sticky; top: 0; background: var(--bg-raised); }
  .rp-stop { position: sticky; left: 0; z-index: 1; min-width: 150px; max-width: 190px; text-align: left !important; background: var(--bg-raised); overflow: hidden; text-overflow: ellipsis; }
  .is-wide .rp-stop { min-width: 260px; max-width: 320px; }
  .is-wide .rp-name { max-width: 310px; }
  .rp-name, .rp-train { padding: 0; border: 0; background: none; font: inherit; color: inherit; text-transform: inherit; cursor: pointer; }
  .rp-name { font: var(--type-name); letter-spacing: var(--track-name); }
  .rp-name { max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
  .rp-name:hover, .rp-train:hover { color: var(--state-idle); }
  .rp-none { color: var(--ink-3); }
  .rp-empty { padding: 8px 0; font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: 0.08em; color: var(--ink-3); }
</style>

<script lang="ts">
  /**
   * A station in the side panel: what left in the last hour and what leaves or arrives in the next four
   * (GET /transit/stations/{id}), scheduled against realtime. A station group is one board merged across agencies,
   * with a chip per agency to filter it. Maximized, it has room for both the scheduled and the expected time.
   */
  import { api } from "$lib/api/client";
  import Chip from "$lib/components/Chip.svelte";
  import { BLANK } from "$lib/hud/fmt";
  import type { BoardRow, Stop, StationBoard } from "$lib/types/transit";
  import Panel, { type PanelControls } from "./Panel.svelte";
  import Delay from "./Delay.svelte";
  import { hhmm, timeTag } from "./lib/transitView";

  interface Props extends PanelControls {
    stopId: string;
    /** the stop's name while the board loads */
    name?: string;
    /** a train row was clicked (its trip id) */
    ontrip: (tripId: string) => void;
    /** a route chip was clicked */
    onroute: (routeId: string) => void;
    /** the board arrived for a stop id: where the station is, to keep it in view */
    onlocate?: (stop: Stop) => void;
  }
  let { stopId, name = "", ontrip, onroute, onlocate, ...controls }: Props = $props();

  const REFRESH_MS = 30_000;
  const BACK_MIN = 60;
  const AHEAD_MIN = 240;

  let board = $state.raw<StationBoard | null>(null);
  let failed = $state(false);
  let tab = $state<"departures" | "arrivals">("departures");
  let agency = $state<string | null>(null);

  $effect(() => {
    const id = stopId;
    board = null;
    failed = false;
    agency = null;
    let alive = true;
    let located = false;
    const load = async (): Promise<void> => {
      try {
        const next = await api.transit.station(id, { back: BACK_MIN, ahead: AHEAD_MIN });
        if (!alive) return;
        [board, failed] = [next, false];
        if (!located) [located] = [true, onlocate?.(next.stop)];
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

  const agencies = $derived(board ? [...new Set([...board.departures, ...board.arrivals].map((r) => r.agency))].sort() : []);
  const rows = $derived((board?.[tab] ?? []).filter((r) => !agency || r.agency === agency));
  const passed = $derived(rows.filter((r) => r.state === "passed"));
  const ahead = $derived(rows.filter((r) => r.state !== "passed"));
  const timeTitle = (r: BoardRow): string =>
    [r.route_name, `SCHEDULED ${hhmm(r.scheduled)}`, r.estimated ? `EXPECTED ${hhmm(r.estimated)}` : "NO REALTIME"].filter(Boolean).join(" · ");
  const stateText = (r: BoardRow): string => (r.track ? `TRK ${r.track}` : r.state === "passed" ? (tab === "departures" ? "LEFT" : "IN") : "");

  /** scroll to the first upcoming row */
  let listEl = $state<HTMLElement>();
  $effect(() => {
    const el = listEl;
    void board;
    void tab;
    void agency;
    if (!el) return;
    const mark = el.querySelector<HTMLElement>(".sw-now");
    el.scrollTop = mark ? Math.max(0, mark.offsetTop - el.offsetTop - 72) : 0;
  });
</script>

{#snippet line(r: BoardRow)}
  {@const tag = timeTag(r.delay_s, r.estimated)}
  <button class="sw-row is-{r.state}" onclick={() => ontrip(r.trip_id)} title={timeTitle(r)}>
    {#if controls.full}
      <span class="sw-t">{hhmm(r.scheduled)}</span>
      <span class="sw-t">{r.estimated ? hhmm(r.estimated) : BLANK}</span>
    {:else}
      <span class="sw-t">{hhmm(r.estimated ?? r.scheduled)}</span>
    {/if}
    <span class="sw-n">{r.agency} {r.train ?? ""}</span>
    {#if controls.full}<span class="sw-d">{r.route_name ?? BLANK}</span>{/if}
    <span class="sw-d">{r.headsign ?? r.route_name ?? BLANK}</span>
    <span class="sw-k sw-tag">{#if r.state === "cancelled"}CANCELLED{:else}<Delay {...tag} />{/if}</span>
    <span class="sw-k">{stateText(r)}</span>
  </button>
{/snippet}

<Panel title={board?.stop.name ?? name ?? stopId} kind="STATION · {board?.stop.kind ?? 'STOP'}" label="Station {board?.stop.name ?? name}" {...controls}>
  {#if board?.routes.length}
    <div class="sw-chips sw-routes" class:is-wide={controls.full}>{#each board.routes as r (r.id)}<Chip text={r.name} kind="filter" button title="{r.agency} · {r.name}: timetable" onclick={() => onroute(r.id)} />{/each}</div>
  {/if}
  <div class="sw-chips">
    <Chip text="DEPARTURES" kind="filter" button pressed={tab === "departures"} onclick={() => (tab = "departures")} />
    <Chip text="ARRIVALS" kind="filter" button pressed={tab === "arrivals"} onclick={() => (tab = "arrivals")} />
  </div>
  {#if agencies.length > 1}
    <div class="sw-chips" aria-label="Agency">
      <Chip text="ALL" kind="filter" button pressed={agency === null} onclick={() => (agency = null)} />
      {#each agencies as a (a)}<Chip text={a.toUpperCase()} kind="filter" button pressed={agency === a} onclick={() => (agency = a)} />{/each}
    </div>
  {/if}
  <section class="inspector__sec sw-board" class:is-wide={controls.full}>
    <h4>{tab === "departures" ? "LEFT / LEAVING" : "ARRIVED / ARRIVING"} · LAST {BACK_MIN} MIN · NEXT {AHEAD_MIN / 60} H</h4>
    {#if board}
      <div class="sw-row sw-head" aria-hidden="true">
        {#if controls.full}<span>SCHEDULED</span><span>EXPECTED</span>{:else}<span>TIME</span>{/if}
        <span>TRAIN</span>{#if controls.full}<span>SERVICE</span>{/if}<span>{tab === "departures" ? "TO" : "FROM"}</span><span>STATUS</span><span></span>
      </div>
      <div class="sw-list" bind:this={listEl}>
        {#each passed as r (`${r.trip_id}-${r.scheduled}`)}{@render line(r)}{/each}
        <div class="sw-now" role="separator"><span>NOW</span></div>
        {#each ahead as r (`${r.trip_id}-${r.scheduled}`)}{@render line(r)}{:else}<div class="sw-none">NOTHING IN THE NEXT {AHEAD_MIN / 60} HOURS</div>{/each}
      </div>
    {:else}
      <div class="sw-none">{failed ? "BOARD UNAVAILABLE" : "LOADING BOARD"}</div>
    {/if}
  </section>
</Panel>

<style>
  .sw-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  /* docked, the routes are one row to scroll sideways; maximized they wrap */
  .sw-routes:not(.is-wide) { flex-wrap: nowrap; overflow-x: auto; flex: none; padding-bottom: 4px; }
  .sw-board { flex: 1; min-height: 160px; display: flex; flex-direction: column; }
  .sw-list { flex: 1; min-height: 0; overflow-y: auto; margin-right: -8px; padding-right: 8px; }
  .sw-row {
    display: grid; grid-template-columns: 44px 104px 1fr 92px auto; column-gap: 8px; align-items: baseline; width: 100%; padding: 5px 4px;
    border: 0; border-bottom: 1px solid var(--grid); background: none; text-align: left; cursor: pointer;
    font: 400 var(--fs-12)/1.2 var(--font-data); color: var(--ink); text-transform: uppercase;
  }
  .sw-board.is-wide .sw-row { grid-template-columns: 84px 84px 130px 1fr 1fr 100px 64px; }
  .sw-head { cursor: default; padding-top: 0; font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: 0.08em; color: var(--ink-3); }
  .sw-tag { text-align: right; }
  .sw-row:hover:not(.sw-head) { background: var(--bg-panel); }
  .sw-t { font-variant-numeric: tabular-nums; }
  .sw-n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sw-d { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-2); }
  .sw-k { font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: 0.08em; color: var(--ink-3); white-space: nowrap; }
  .is-passed { color: var(--ink-3); }
  .is-passed .sw-d { color: var(--ink-3); }
  .is-cancelled .sw-n, .is-cancelled .sw-k { color: var(--state-fault); text-decoration: line-through; }
  .sw-now { display: flex; align-items: center; gap: 8px; margin: 4px 0; font: 600 var(--fs-11)/1 var(--font-label); letter-spacing: 0.14em; color: var(--state-idle); }
  .sw-now::before, .sw-now::after { content: ""; flex: 1; height: 1px; background: var(--state-idle); opacity: 0.5; }
  .sw-none { padding: 8px 0; font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: 0.08em; color: var(--ink-3); }
</style>

<script lang="ts">
  /**
   * The honest table: every train in the horizon, soonest first. Trains that have just passed sit dimmed above
   * a NOW divider (a phone shows the latest two; the rest open on tap). A row opens in place with the train's next
   * stops and the age of its position, and a link to the full trip on the map, so the spot and the countdowns stay.
   */
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { cleanName } from "$lib/displayName";
  import { BLANK } from "$lib/hud/fmt";
  import { followLink } from "$lib/router.svelte";
  import type { Trip } from "$lib/types/transit";
  import Delay from "../map/Delay.svelte";
  import { delayCell, hhmm } from "../map/lib/transitView";
  import FreshMark from "./FreshMark.svelte";
  import { basisLine, directionText, positionAge, rowEta, stopWord, type Row, type Rows } from "./spot";

  interface Props {
    rows: Rows;
    selected: string | null;
    /** the key of the row open in place */
    expanded: string | null;
    onselect: (key: string | null) => void;
  }
  let { rows, selected, expanded = $bindable(), onselect }: Props = $props();

  /** a phone shows only the latest passed rows */
  const PASSED_SHOWN = 2;
  const query = matchMedia("(min-width: 900px)");
  let wide = $state(query.matches);
  onMount(() => {
    const change = () => (wide = query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  });
  let allPassed = $state(false);
  const hidden = $derived(wide || allPassed ? 0 : Math.max(0, rows.passed.length - PASSED_SHOWN));
  const passed = $derived(hidden ? rows.passed.slice(hidden) : rows.passed);

  const tripId = (row: Row): string => row.train.trip_id ?? row.train.vehicle_id ?? "";
  const tripHref = (row: Row): string => `/map?page=trip&id=${encodeURIComponent(tripId(row))}`;
  /** where lines run side by side (Halethorpe), each row says which line it is on */
  const mixed = $derived(new Set([...rows.passed, ...rows.coming].map((r) => r.train.line).filter(Boolean)).size > 1);
  const route = (row: Row): string => (mixed && row.train.line ? `${row.train.line.toUpperCase()} · ` : "") + ([row.train.origin, row.train.destination].filter(Boolean).map((name) => cleanName(name!)).join(" → ") || BLANK);
  /** the arrow points the way the train moves on the ladder */
  const heading = (row: Row): string => (row.side === "left" ? `${directionText(row.train)} ▶` : `◀ ${directionText(row.train)}`);
  const at = (row: Row): string => (row.group === "overdue" ? BLANK : `${row.approx ? "~" : ""}${hhmm(row.train.eta)}`);
  const miles = (row: Row): string => (row.train.to_go_km == null ? BLANK : `${row.basis === "tracked" ? "" : "≈"}${(row.train.to_go_km * 0.621371).toFixed(1)} MI`);
  const late = (row: Row): boolean => delayCell(row.train.delay_s).tone === "late";

  // ---- a row opened in place fetches its trip once
  let trips = $state<Record<string, Trip | "loading" | "failed">>({});
  async function loadTrip(row: Row): Promise<void> {
    const id = tripId(row);
    if (!id || trips[id]) return;
    trips[id] = "loading";
    try {
      trips[id] = await api.transit.trip(id);
    } catch {
      trips[id] = "failed";
    }
  }
  function toggle(row: Row): void {
    expanded = expanded === row.train.key ? null : row.train.key;
    if (expanded) void loadTrip(row);
  }
  $effect(() => {
    const open = [...rows.passed, ...rows.coming].find((r) => r.train.key === expanded);
    if (open) void loadTrip(open); // opened from the ladder
  });

  const nextStops = (trip: Trip) => trip.stops.filter((s) => s.state !== "passed" && s.state !== "skipped").slice(0, 4);
  const stopTime = (s: Trip["stops"][number]): string => hhmm(s.arr_estimated ?? s.arr_scheduled ?? s.dep_estimated ?? s.dep_scheduled);
  const fix = (row: Row): string => {
    const v = row.train.vehicle;
    if (!v) return "NO POSITION · TIMETABLE ONLY";
    const speed = v.speed_mph != null ? ` · ${Math.round(v.speed_mph)} MPH` : "";
    return `${v.position === "realtime" ? "GPS FIX" : "ESTIMATED POSITION"} ${positionAge(v.age_s).replace("POS ", "") || BLANK} OLD${speed}`;
  };
</script>

{#snippet line(row: Row, dim: boolean)}
  {@const open = expanded === row.train.key}
  <button
    type="button"
    class="tr"
    class:is-dim={dim}
    class:is-sel={selected === row.train.key || open}
    aria-expanded={open}
    data-key={row.train.key}
    onclick={() => toggle(row)}
    onpointerenter={() => onselect(row.train.key)}
    onpointerleave={() => onselect(null)}
    onfocus={() => onselect(row.train.key)}
    onblur={() => onselect(null)}
  >
    <span class="tr__when">
      <span class="tr__eta">{rowEta(row)}</span>
      <span class="tr__at">{at(row)}</span>
    </span>
    <span class="tr__id">
      <span class="tr__train">{row.tag}</span>
      <span class="tr__dir">{heading(row)}</span>
      <span class="tr__stops">{stopWord(row.train)}</span>
    </span>
    <span class="tr__opr">{row.train.agency}</span>
    <span class="tr__route">
      {#if late(row)}<span class="tr__late"><Delay {...delayCell(row.train.delay_s)} /></span>{/if}
      <span class="tr__path">{route(row)}</span>
      <span class="tr__bw">· {basisLine(row, false)}</span>
    </span>
    <span class="tr__dist">{miles(row)}</span>
    <span class="tr__delay"><Delay {...delayCell(row.train.delay_s)} suspect={row.train.delay_suspect} /></span>
    <span class="tr__basis"><span class="tr__word">{basisLine(row, false)}</span></span>
    <span class="tr__mark"><FreshMark {row} /></span>
  </button>
  {#if open}
    {@const trip = trips[tripId(row)]}
    <div class="tx">
      <div class="tx__fix">{fix(row)}</div>
      {#if trip === "loading" || trip === undefined}
        <div class="tx__note">LOADING STOPS…</div>
      {:else if trip === "failed"}
        <div class="tx__note">STOPS UNAVAILABLE</div>
      {:else}
        <ul class="tx__stops">
          {#each nextStops(trip) as stop (stop.seq)}
            <li><span>{cleanName(stop.name)}</span><span class="tx__t">{stopTime(stop)}</span></li>
          {/each}
        </ul>
      {/if}
      <a class="tx__open" href={tripHref(row)} onclick={followLink}>OPEN TRIP ON MAP ›</a>
    </div>
  {/if}
{/snippet}

<div class="tb">
  <div class="tb__cols" aria-hidden="true">
    <span>ETA</span><span>AT</span><span>TRAIN</span><span>DIR</span><span>STOPS</span><span>OPERATOR</span><span>FROM → TO</span><span>DIST</span><span>DELAY</span><span>BASIS</span><span></span>
  </div>
  {#if hidden}
    <button type="button" class="tb__more" onclick={() => (allPassed = true)}>+{hidden} EARLIER</button>
  {/if}
  {#each passed as row (row.train.key)}
    {@render line(row, true)}
  {/each}
  <div class="tb__now" role="separator"><span>NOW</span></div>
  {#each rows.coming as row (row.train.key)}
    {@render line(row, false)}
  {/each}
</div>

<style>
  .tb { display: grid; }
  .tb__now { display: flex; align-items: center; gap: 12px; padding: 6px 16px; color: var(--ink-2); font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); }
  .tb__now::before, .tb__now::after { content: ""; flex: 1; border-top: 1px solid var(--line); }
  .tb__more { height: 32px; padding: 0 16px; text-align: left; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); border-bottom: 1px solid var(--grid); }
  .tb__cols { display: none; }

  /* phone: two lines, the whole row is the tap target */
  .tr {
    display: grid; grid-template-columns: 104px minmax(0, 1fr) auto; grid-template-areas: "when id mark" "when route route";
    column-gap: 8px; row-gap: 2px; align-items: center; width: 100%; min-height: 64px; padding: 8px 16px; text-align: left; color: var(--ink);
    border-bottom: 1px solid var(--grid);
  }
  .tr:hover, .tr.is-sel { background: var(--bg-raised); }
  .tr.is-dim, .tr.is-dim .tr__eta, .tr.is-dim .tr__train, .tr.is-dim .tr__path { color: var(--ink-3); }
  .tr.is-dim :global(.fm) { border-color: var(--ink-3); background-color: var(--ink-3); }
  .tr > span { min-width: 0; }
  .tr__when { grid-area: when; display: grid; }
  .tr__eta { font: 400 var(--fs-18)/1.1 var(--font-data); font-variant-numeric: tabular-nums; color: var(--ink); white-space: nowrap; }
  .tr.is-dim .tr__eta { font-size: var(--fs-12); }
  .tr__at { font: 400 var(--fs-11)/1.3 var(--font-data); color: var(--ink-2); white-space: nowrap; }
  .tr.is-dim .tr__at { color: var(--ink-3); }
  .tr__id { grid-area: id; display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  .tr__dir, .tr__stops { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink); white-space: nowrap; }
  .tr.is-dim .tr__dir, .tr.is-dim .tr__stops { color: var(--ink-3); }
  .tr__train { font: 400 var(--fs-15)/1.2 var(--font-data); color: var(--ink); white-space: nowrap; }
  .tr__mark { grid-area: mark; }
  .tr__route { grid-area: route; display: flex; gap: 8px; min-width: 0; font: 400 var(--fs-11)/1.3 var(--font-label); color: var(--ink-2); }
  .tr__path { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.04em; }
  .tr__late { flex: none; font: 400 var(--fs-11)/1.3 var(--font-data); }
  .tr__bw { flex: none; font: 400 var(--fs-11)/1.3 var(--font-data); color: var(--ink-2); white-space: nowrap; }
  .tr__opr, .tr__dist, .tr__delay, .tr__basis { display: none; }
  .tr__word { font: 400 var(--fs-11)/1.2 var(--font-data); }

  /* the row opened in place */
  .tx { display: grid; gap: 6px; padding: 10px 16px 12px; background: var(--bg-raised); border-bottom: 1px solid var(--grid); }
  .tx__fix, .tx__note { font: 400 var(--fs-11)/1.3 var(--font-data); color: var(--ink-2); }
  .tx__stops { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .tx__stops li { display: flex; justify-content: space-between; gap: 12px; font: 500 var(--fs-12)/1.3 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink); }
  .tx__t { font: 400 var(--fs-12)/1.3 var(--font-data); color: var(--ink-2); }
  .tx__open { display: inline-flex; align-items: center; min-height: 44px; font: 600 var(--fs-11) var(--font-label); letter-spacing: 0.12em; }

  @media (min-width: 900px) {
    .tb__now, .tb__more { padding-left: var(--margin-x); padding-right: var(--margin-x); }
    .tx { padding-left: var(--margin-x); padding-right: var(--margin-x); }
    .tb__cols, .tr {
      display: grid; align-items: center; column-gap: 16px; padding-left: var(--margin-x); padding-right: var(--margin-x);
      grid-template-columns: 112px 72px 112px 72px 84px 88px minmax(0, 1fr) 80px 92px 190px 14px;
      grid-template-areas: none;
    }
    .tb__cols { padding-top: 6px; padding-bottom: 6px; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); border-bottom: 1px solid var(--grid); }
    .tr { min-height: 48px; padding-top: 4px; padding-bottom: 4px; row-gap: 0; }
    .tr > span { grid-area: auto !important; }
    .tr__when, .tr__id { display: contents; }
    .tr__opr, .tr__dist, .tr__delay, .tr__basis { display: block; }
    .tr__at { font: 400 var(--fs-12)/1 var(--font-data); }
    .tr__opr { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-2); }
    .tr__dist, .tr__delay { font: 400 var(--fs-11)/1 var(--font-data); color: var(--ink-2); }
    .tr__late, .tr__bw { display: none; }
    .tr__basis { font: 400 var(--fs-11)/1 var(--font-data); color: var(--ink-2); }
    .tr__route { display: block; }
    .tr__eta { font-size: var(--fs-24); }
    .tr.is-dim .tr__eta { font-size: var(--fs-15); }
  }
</style>

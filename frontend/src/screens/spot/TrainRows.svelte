<script lang="ts">
  /**
   * The honest table: every train in the horizon, soonest first. Trains that have just passed sit dimmed above
   * a NOW divider. Two lines per row on a phone, one wide row on a desktop. A row opens the train's trip.
   */
  import { followLink } from "$lib/router.svelte";
  import { cleanName } from "$lib/displayName";
  import { BLANK } from "$lib/hud/fmt";
  import Delay from "../map/Delay.svelte";
  import { delayCell, hhmm } from "../map/lib/transitView";
  import FreshMark from "./FreshMark.svelte";
  import { basisLine, directionText, rowEta, type Row, type Rows } from "./spot";

  interface Props {
    rows: Rows;
    selected: string | null;
    onselect: (key: string | null) => void;
  }
  let { rows, selected, onselect }: Props = $props();

  const tripHref = (row: Row): string => `/map?page=trip&id=${encodeURIComponent(row.train.trip_id ?? row.train.vehicle_id ?? "")}`;
  const route = (row: Row): string => [row.train.origin, row.train.destination].filter(Boolean).map((name) => cleanName(name!)).join(" → ") || BLANK;
  /** the arrow points the way the train moves on the ladder */
  const heading = (row: Row): string => (row.side === "left" ? `${directionText(row.train)} ▶` : `◀ ${directionText(row.train)}`);
  const at = (row: Row): string => (row.group === "overdue" ? BLANK : `${row.approx ? "~" : ""}${hhmm(row.train.eta)}`);
  const miles = (row: Row): string => (row.train.to_go_km == null ? BLANK : `${row.basis === "tracked" ? "" : "≈"}${(row.train.to_go_km * 0.621371).toFixed(1)} MI`);
  const late = (row: Row): boolean => delayCell(row.train.delay_s).tone === "late";
</script>

{#snippet line(row: Row, dim: boolean)}
  <a
    class="tr"
    class:is-dim={dim}
    class:is-sel={selected === row.train.key}
    href={tripHref(row)}
    data-key={row.train.key}
    onclick={followLink}
    onpointerenter={() => onselect(row.train.key)}
    onpointerleave={() => onselect(null)}
    onfocus={() => onselect(row.train.key)}
    onblur={() => onselect(null)}
  >
    <span class="tr__eta">{rowEta(row)}</span>
    <span class="tr__at">{at(row)}</span>
    <span class="tr__id">
      <span class="tr__train">{row.tag}</span>
      <span class="tr__dir">{heading(row)}</span>
      <span class="tr__stops">{row.passes ? "PASSES" : "STOPS"}</span>
    </span>
    <span class="tr__opr">{row.train.agency}</span>
    <span class="tr__route">
      {#if late(row)}<span class="tr__late"><Delay {...delayCell(row.train.delay_s)} /></span>{/if}
      <span class="tr__path">{route(row)}</span>
    </span>
    <span class="tr__dist">{miles(row)}</span>
    <span class="tr__delay"><Delay {...delayCell(row.train.delay_s)} suspect={row.train.delay_suspect} /></span>
    <span class="tr__basis"><span class="tr__word">{basisLine(row)}</span></span>
    <span class="tr__mark"><FreshMark {row} /></span>
  </a>
{/snippet}

<div class="tb" role="list">
  <div class="tb__cols" aria-hidden="true">
    <span>ETA</span><span>AT</span><span>TRAIN</span><span>DIR</span><span>STOPS</span><span>OPERATOR</span><span>FROM → TO</span><span>DIST</span><span>DELAY</span><span>BASIS</span><span></span>
  </div>
  {#each rows.passed as row (row.train.key)}
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
  .tb__cols { display: none; }

  /* phone: two lines, a 64 px row (the whole row is the tap target) */
  .tr {
    display: grid; grid-template-columns: 104px minmax(0, 1fr) auto; grid-template-areas: "eta id mark" "eta route route";
    column-gap: 8px; row-gap: 2px; align-items: center; min-height: 64px; padding: 8px 16px; border: 0; color: var(--ink);
    border-bottom: 1px solid var(--grid);
  }
  .tr:hover, .tr.is-sel { background: var(--bg-raised); color: var(--ink); }
  .tr.is-dim { color: var(--ink-3); }
  .tr.is-dim .tr__eta, .tr.is-dim .tr__train, .tr.is-dim .tr__path { color: var(--ink-3); }
  .tr > span { min-width: 0; }
  .tr__eta { grid-area: eta; font: 400 var(--fs-18)/1.1 var(--font-data); font-variant-numeric: tabular-nums; color: var(--ink); white-space: nowrap; }
  .tr.is-dim .tr__eta { font-size: var(--fs-12); }
  .tr__id { grid-area: id; display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  .tr__dir, .tr__stops { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink); white-space: nowrap; }
  .tr__train { font: 400 var(--fs-15)/1.2 var(--font-data); color: var(--ink); }
  .tr__mark { grid-area: mark; }
  .tr__route { grid-area: route; display: flex; gap: 8px; min-width: 0; font: 400 var(--fs-11)/1.3 var(--font-label); color: var(--ink-2); }
  .tr__path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.04em; }
  .tr__late { font: 400 var(--fs-11)/1.3 var(--font-data); flex: none; }
  /* phone: direction and stops join the train on line 1; the rest waits for room */
  .tr__at, .tr__opr, .tr__dist, .tr__delay, .tr__basis { display: none; }
  .tr__word { font: 400 var(--fs-11)/1.2 var(--font-data); }

  @media (min-width: 900px) {
    .tb__now { padding: 6px var(--margin-x); }
    .tb__cols, .tr {
      display: grid; align-items: center; column-gap: 16px; padding-left: var(--margin-x); padding-right: var(--margin-x);
      grid-template-columns: 112px 72px 112px 72px 84px 88px minmax(0, 1fr) 80px 92px 190px 14px;
      grid-template-areas: none;
    }
    .tb__cols { padding-top: 6px; padding-bottom: 6px; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); border-bottom: 1px solid var(--grid); }
    .tr { min-height: 48px; padding-top: 4px; padding-bottom: 4px; row-gap: 0; }
    .tr > span { grid-area: auto !important; }
    .tr__id { display: contents; }
    .tr__at, .tr__opr, .tr__dist, .tr__delay, .tr__basis { display: block; }
    .tr__at { font: 400 var(--fs-12)/1 var(--font-data); color: var(--ink-2); }
    .tr__opr { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-2); }
    .tr__dist, .tr__delay { font: 400 var(--fs-11)/1 var(--font-data); color: var(--ink-2); }
    .tr__late { display: none; }
    .tr__basis { font: 400 var(--fs-11)/1 var(--font-data); color: var(--ink-2); }
    .tr__route { display: block; }
    .tr__eta { font-size: var(--fs-24); }
    .tr.is-dim .tr__eta { font-size: var(--fs-15); }
  }
</style>

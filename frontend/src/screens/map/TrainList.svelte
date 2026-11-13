<script lang="ts">
  /**
   * Every tracked train in the map window: number, service, operator, origin, next station, destination, whether it
   * is on time, and a dot for how fresh its data is (white, amber past the source's limit, red past ten minutes)
   * that pulses when new data arrives. Collapsible; a row opens the train's panel.
   */
  import { BLANK } from "$lib/hud/fmt";
  import type { Vehicle } from "$lib/types/transit";
  import { onMount } from "svelte";
  import { ageNow, delayShort, delayTone, freshness, sinceText, trainTitle } from "./lib/transitView";

  interface Props {
    vehicles: Vehicle[];
    selectedId: string | null;
    onselect: (id: string) => void;
    /** drop the origin and destination columns on a narrow stage */
    compact?: boolean;
    /** when `vehicles` arrived (ms), to age each position */
    fetchedAt?: number;
    /** the list starts folded; the header chevron opens or folds it by hand until this changes */
    folded?: boolean;
  }
  let { vehicles, selectedId, onselect, compact = false, fetchedAt = 0, folded = false }: Props = $props();

  let open = $state(true);
  $effect(() => {
    open = !folded;
  });
  let now = $state(Date.now());
  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });
  const ageOf = (v: Vehicle): number | null => ageNow(v.age_s, fetchedAt, now);

  const byNumber = (a: Vehicle, b: Vehicle): number =>
    a.agency.localeCompare(b.agency) || (Number.parseInt(a.train ?? "") || 0) - (Number.parseInt(b.train ?? "") || 0) || a.id.localeCompare(b.id);
  const sorted = $derived([...vehicles].sort(byNumber));

  /** Replay the pulse each time `updated` changes (not on first show). */
  function pulse(node: HTMLElement, _updated: string | null) {
    return {
      update() {
        node.classList.remove("is-pulse");
        void node.offsetWidth; // restart the animation
        node.classList.add("is-pulse");
      },
    };
  }
</script>

<div class="tl" class:is-compact={compact}>
  <button class="tl__head" aria-expanded={open} onclick={() => (open = !open)}>
    <span class="tl__caret" class:is-open={open} aria-hidden="true"></span>
    TRAINS IN VIEW · {vehicles.length}
  </button>
  {#if open}
    {#if sorted.length}
      <div class="tl__rows" role="table" aria-label="Trains in view">
        <div class="tl__row tl__cols" role="row">
          <span>TRAIN</span><span>SERVICE</span><span>OPERATOR</span>
          {#if !compact}<span>ORIGIN</span>{/if}<span>NEXT STATION</span>{#if !compact}<span>DESTINATION</span>{/if}<span class="r">STATUS</span><span></span>
        </div>
        {#each sorted as v (v.id)}
          <button class="tl__row" class:is-sel={selectedId === v.id} role="row" onclick={() => onselect(v.id)}>
            <span class="num">{v.train ?? BLANK}</span>
            <span>{v.route_name ?? BLANK}</span>
            <span>{v.agency}</span>
            {#if !compact}<span>{v.origin ?? BLANK}</span>{/if}
            <span>{v.next_stop?.name ?? BLANK}</span>
            {#if !compact}<span>{v.destination ?? v.headsign ?? BLANK}</span>{/if}
            <span class="r mp-tone-{delayTone(v.delay_s)}" title={trainTitle(v)}>{delayShort(v.delay_s)}</span>
            <span class="tl__dot is-{freshness(ageOf(v), v.stale_after_s)}" use:pulse={v.updated} title="{sinceText(ageOf(v))} since fresh data"></span>
          </button>
        {/each}
      </div>
    {:else}
      <div class="tl__none">NO TRAINS IN THIS VIEW</div>
    {/if}
  {/if}
</div>

<style>
  .tl { display: grid; gap: 4px; pointer-events: auto; }
  .tl__head {
    display: flex; align-items: center; gap: 8px; width: fit-content; padding: 0; border: 0; background: none; cursor: pointer;
    font: 500 var(--fs-11)/16px var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-3);
  }
  .tl__head:hover { color: var(--ink-2); }
  @media (pointer: coarse) { .tl__head { min-height: 32px; } }
  .tl__caret { width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid currentColor; transform: rotate(-90deg); transition: transform var(--t-micro); }
  .tl__caret.is-open { transform: none; }
  .tl__rows { max-height: calc(9 * 23px); /* the header and 8 rows, then scroll */ overflow-y: auto; overflow-x: hidden; }
  .tl__row {
    display: grid; grid-template-columns: 52px 180px 76px 120px 160px 120px 84px 8px; column-gap: 10px; align-items: baseline; width: 100%;
    min-height: 22px; padding: 2px 6px 2px 0; border: 0; border-bottom: 1px solid var(--grid); background: none; text-align: left; cursor: pointer;
    font: 400 var(--fs-12)/1.2 var(--font-data); color: var(--ink); text-transform: uppercase; white-space: nowrap;
  }
  .is-compact .tl__row { grid-template-columns: 52px 170px 76px 160px 84px 8px; }
  .tl__row > span { overflow: hidden; text-overflow: ellipsis; }
  .tl__row .r { text-align: right; }
  .tl__dot {
    align-self: center; justify-self: center; width: 7px; height: 7px; border-radius: 50%; background: var(--ink);
    transition: background-color 300ms ease;
  }
  .tl__dot.is-stale { background: var(--state-recent); }
  .tl__dot.is-old { background: var(--state-fault); }
  .tl__dot.is-unknown { background: var(--ink-3); }
  .tl__dot:global(.is-pulse) { animation: tl-pulse 420ms ease-out; }
  @keyframes tl-pulse {
    35% { transform: scale(1.9); background: var(--ink); }
    100% { transform: scale(1); }
  }
  @media (prefers-reduced-motion: reduce) { .tl__dot:global(.is-pulse) { animation: none; } }
  .tl__row .num { font-weight: 600; }
  .tl__row:hover { background: var(--bg-raised); }
  .tl__row.is-sel { background: var(--bg-raised); box-shadow: inset 2px 0 0 var(--state-select); }
  .tl__cols { position: sticky; top: 0; cursor: default; background: var(--bg-void); font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); }
  .tl__cols:hover { background: var(--bg-void); }
  .tl__none { font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: 0.08em; color: var(--ink-3); padding: 4px 0; }
</style>

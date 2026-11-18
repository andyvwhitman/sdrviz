<script lang="ts">
  /**
   * The hero datum: how long until the next train reaches the spot, and how sure we are. With the timeline scrolled
   * away from now it gives the first train after that moment, as a clock time.
   */
  import { BLANK } from "$lib/hud/fmt";
  import { hhmm } from "../map/lib/transitView";
  import { basisLine, directionText, etaText, stopWord, type Row } from "./spot";
  import FreshMark from "./FreshMark.svelte";

  interface Props {
    /** the next train to reach the spot, or null */
    next: Row | null;
    /** why there is none: nothing yet, or the horizon */
    empty: string;
    pending: boolean;
    /** the start of a scrolled window ("21:30"), or null when the window follows now */
    after?: string | null;
  }
  let { next, empty, pending, after = null }: Props = $props();

  /** "NEXT AT SPOT", or "FIRST AFTER 21:30 · IN 1 H 12" for a scrolled window */
  const label = $derived(!after ? "NEXT AT SPOT" : next ? `FIRST AFTER ${after} · IN ${etaText({ ...next, approx: false })}` : `AFTER ${after}`);
  const big = $derived(pending || !next ? BLANK : after ? `${next.approx ? "~" : ""}${hhmm(next.train.eta)}` : etaText(next));
</script>

<section class="nx" aria-live="polite">
  <div class="nx__k">{label}</div>
  <div class="nx__big">{big}</div>
  <div class="nx__text">
    {#if next}
      <span class="nx__tag">{next.tag}</span>
      <span class="nx__who">{directionText(next.train)} · {stopWord(next.train)}</span>
    {:else if !pending}
      <span class="nx__who nx__who--empty">{empty}</span>
    {/if}
  </div>
  {#if next}
    <div class="nx__basis">
      <FreshMark row={next} />
      <span>{basisLine(next)}</span>
    </div>
  {/if}
</section>

<style>
  .nx {
    display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "k k" "big text" "basis basis";
    column-gap: 16px; row-gap: 2px; align-items: center; padding: 6px 16px 8px; min-width: 0;
  }
  .nx__k { grid-area: k; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
  .nx__big { grid-area: big; font: 400 var(--fs-32)/1.05 var(--font-data); font-variant-numeric: tabular-nums; color: var(--ink); white-space: nowrap; }
  .nx__text { grid-area: text; display: grid; min-width: 0; }
  .nx__tag { font: 400 var(--fs-15)/1.3 var(--font-data); color: var(--ink); white-space: nowrap; }
  .nx__who { font: 500 var(--fs-15)/1.3 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink); white-space: nowrap; }
  .nx__who--empty { white-space: normal; }
  .nx__basis { grid-area: basis; display: flex; align-items: center; gap: 8px; white-space: nowrap; font: 400 var(--fs-11)/1.4 var(--font-data); color: var(--ink-2); }
  @media (min-width: 900px) {
    .nx__big { font-size: var(--fs-48); }
    .nx { display: flex; align-items: baseline; gap: 20px; padding: 12px var(--margin-x); }
    .nx__text { display: flex; align-items: baseline; gap: 12px; }
  }
</style>

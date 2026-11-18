<script lang="ts">
  /** The hero datum: how long until the next train reaches the spot, and how sure we are. */
  import { BLANK } from "$lib/hud/fmt";
  import { basisLine, directionText, etaText, type Row } from "./spot";
  import FreshMark from "./FreshMark.svelte";

  interface Props {
    /** the next train to reach the spot, or null */
    next: Row | null;
    /** why there is none: nothing yet, or the horizon */
    empty: string;
    pending: boolean;
  }
  let { next, empty, pending }: Props = $props();

  const big = $derived(pending ? BLANK : next ? etaText(next) : BLANK);
  const detail = $derived(
    next ? [next.tag, directionText(next.train), next.passes ? "PASSES" : "STOPS"].join(" · ") : pending ? "" : empty,
  );
</script>

<section class="nx" aria-live="polite">
  <div class="nx__k">NEXT AT SPOT</div>
  <div class="nx__big">{big}</div>
  <div class="nx__text">
    <div class="nx__who">{detail}</div>
    {#if next}
      <div class="nx__basis">
        <FreshMark row={next} />
        <span>{basisLine(next)}</span>
      </div>
    {/if}
  </div>
</section>

<style>
  .nx { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "k k" "big text"; column-gap: 16px; align-items: center; padding: 8px 16px 8px; min-width: 0; }
  .nx__k { grid-area: k; }
  .nx__big { grid-area: big; }
  .nx__text { grid-area: text; min-width: 0; }
  .nx__k { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
  .nx__big { font: 400 var(--fs-48)/1.1 var(--font-data); font-variant-numeric: tabular-nums; color: var(--ink); white-space: nowrap; }
  .nx__who { font: 500 var(--fs-15)/1.3 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink); }
  .nx__basis { display: flex; align-items: center; gap: 8px; font: 400 var(--fs-11)/1.4 var(--font-data); color: var(--ink-2); }
  @media (min-width: 900px) {
    .nx { display: flex; align-items: baseline; gap: 20px; padding: 12px var(--margin-x); }
    .nx__text { display: flex; align-items: baseline; gap: 16px; }
  }
</style>

<script lang="ts">
  /** Link quality as a 5-step meter, the number and a word. No quality (node not ONLINE) is the blank. */
  import { BLANK } from "$lib/hud/fmt";
  import { LINK_STEPS, linkLabel, linkSteps } from "$lib/hud/nodes";

  interface Props {
    quality: number | null;
  }
  let { quality }: Props = $props();

  const lit = $derived(linkSteps(quality));
  const label = $derived(linkLabel(quality));
</script>

<span class="lm" class:is-poor={label === "POOR"} title={quality == null ? "" : `link quality ${quality} of 100`}>
  <span class="lm__bars" aria-hidden="true">
    {#each { length: LINK_STEPS } as _, i}<i class:is-lit={i < lit} style:height="{4 + i * 3}px"></i>{/each}
  </span>
  <span class="mono">{quality ?? BLANK}</span>
  <span class="lm__word">{label === BLANK ? "" : label}</span>
</span>

<style>
  .lm { display: inline-flex; align-items: flex-end; gap: 8px; white-space: nowrap; }
  .lm__bars { display: inline-flex; align-items: flex-end; gap: 2px; }
  .lm__bars i { display: block; width: 4px; background: none; box-shadow: inset 0 0 0 1px var(--ink-3); }
  .lm__bars i.is-lit { background: var(--ink); box-shadow: none; }
  .lm__word { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); }
  /* a poor link is dimmer, not red: it is a state of the network, not a fault */
  .is-poor .lm__bars i.is-lit { background: var(--state-stale); }
  .is-poor .mono, .is-poor .lm__word { color: var(--state-stale); }
</style>

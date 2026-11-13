<script lang="ts">
  /** Key/value row (spec 5.25). `na` prints "— — —  N/A · <source>" for telemetry this feed type cannot report. */
  import type { Snippet } from "svelte";
  import { BLANK } from "$lib/hud/fmt";
  import LevelMeter from "./LevelMeter.svelte";
  import SimTag from "./SimTag.svelte";

  interface Props {
    label: string;
    value?: string;
    unit?: string;
    na?: string;
    sim?: boolean;
    /** a meter under the value; with `na` it draws the empty scale */
    meter?: { w?: number; db?: number | null; peak?: number | null; floor?: number | null };
    children?: Snippet;
  }
  let { label, value, unit, na, sim = false, meter, children }: Props = $props();
</script>

<div class="kv" class:is-na={!!na}>
  <span class="k">{label}</span>
  <span class="v">
    {#if na}
      {BLANK}<span class="na">N/A · {na}</span>
    {:else}
      {#if children}{@render children()}{:else}{value}{/if}{#if unit}<span class="u">{unit}</span>{/if}{#if sim}
        <SimTag />{/if}
    {/if}
  </span>
  {#if meter}<LevelMeter w={meter.w ?? 200} db={meter.db} peak={meter.peak} floor={meter.floor} na={!!na} />{/if}
</div>

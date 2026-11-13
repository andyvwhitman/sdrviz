<svelte:options namespace="svg" />

<script lang="ts">
  /** M6 glyph for inside an <svg class="hud">, centred on (cx, cy). Ported from HUD.svg.glyph. */
  import type { GlyphState } from "$lib/hud/tile";

  interface Props {
    cx: number;
    cy: number;
    state?: GlyphState;
  }
  let { cx, cy, state = "idle" }: Props = $props();

  const DOT_CLASS: Partial<Record<GlyphState, string>> = { idle: "f-idle", squelch: "f-idle", tx: "f-tx" };
  const DOTS: Partial<Record<GlyphState, [number, number][]>> = {
    idle: [[-6, 0], [0, 0], [6, 0]],
    squelch: [[-6, 6], [0, 0], [6, -6]],
    tx: [[0, -6], [0, 0], [0, 6]],
    stale: [[-6, 0], [0, 0], [6, 0]],
  };
  const triangle = $derived(`M${cx} ${cy - 5}L${cx + 5} ${cy + 4}L${cx - 5} ${cy + 4}Z`);
  const cross = $derived(`M${cx - 5.5} ${cy - 5.5}L${cx + 5.5} ${cy + 5.5}M${cx + 5.5} ${cy - 5.5}L${cx - 5.5} ${cy + 5.5}`);
</script>

{#if state === "offline"}
  <path class="s-emph k-stale" d={cross} />
{:else if state === "fault"}
  <path class="f-fault" d={triangle} />
{:else if state === "fault-past"}
  <path class="s-hair k-stale" d={triangle} />
{:else}
  {#each DOTS[state] ?? [] as [dx, dy]}
    {#if state === "stale"}
      <circle class="s-hair k-stale" cx={cx + dx} cy={cy + dy} r="2" />
    {:else}
      <circle class={DOT_CLASS[state]} cx={cx + dx} cy={cy + dy} r="2.5" />
    {/if}
  {/each}
{/if}

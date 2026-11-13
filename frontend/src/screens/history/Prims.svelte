<svelte:options namespace="svg" />

<script lang="ts">
  /** Renders layout primitives inside an <svg class="hud">. */
  import DataBlockSvg from "$lib/components/DataBlockSvg.svelte";
  import PositionGlyphSvg from "$lib/components/PositionGlyphSvg.svelte";
  import type { Prim } from "./prims";

  interface Props {
    prims: Prim[];
  }
  let { prims }: Props = $props();
</script>

{#each prims as p, i (i)}
  {#if p.t === "line"}
    <path class={p.cls} d="M{p.x1} {p.y1}L{p.x2} {p.y2}" />
  {:else if p.t === "path"}
    <path class={p.cls} d={p.d} />
  {:else if p.t === "rect"}
    <rect class={p.cls} x={p.x} y={p.y} width={p.w} height={p.h} />
  {:else if p.t === "text"}
    <text class={p.cls} x={p.x} y={p.y} text-anchor={p.anchor ?? "start"}>{p.s}{#if p.sim}<tspan class="tx-lab" dx="6">SIM</tspan>{/if}</text>
  {:else if p.t === "glyph"}
    <PositionGlyphSvg cx={p.cx} cy={p.cy} state={p.state} />
  {:else if p.t === "block"}
    <DataBlockSvg geometry={p.g} knockout={false} />
  {/if}
{/each}

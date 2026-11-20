<script lang="ts">
  /** The MHz scale strip under the waterfall (E-2 section 6): numerals hang from 4 px ticks off the waterfall's bottom edge. */
  import { scaleLayout } from "./freqRuler";

  interface Props {
    width: number;
    height: number;
    fontPx: number;
  }
  let { width, height, fontPx }: Props = $props();

  const numerals = $derived(scaleLayout(width, fontPx));
</script>

<svg class="hud" {width} {height} viewBox="0 0 {width} {height}" style:font-size="{fontPx}px" aria-hidden="true">
  <path d="M0.5 0V{height - 0.5}H{width - 0.5}V0" class="edge" />
  {#each numerals as n (n.ch)}
    <path d="M{n.x} 0V4" class="tick" />
    <text x={n.textX} y={4 + fontPx * 0.95} text-anchor="middle">{n.text}</text>
  {/each}
</svg>

<style>
  svg { display: block; overflow: visible; shape-rendering: crispEdges; }
  path { fill: none; stroke-width: 1; }
  .edge { stroke: var(--line-faint); }
  .tick { stroke: var(--line); }
  text { font-family: var(--font-data); fill: var(--ink-3); shape-rendering: auto; }
</style>

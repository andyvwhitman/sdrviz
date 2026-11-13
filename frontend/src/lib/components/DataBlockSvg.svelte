<svelte:options namespace="svg" />

<script lang="ts">
  /** M8 data block with leader, for inside an <svg class="hud">. Geometry from $lib/hud/dataBlock. */
  import { polyline, type BlockGeometry } from "$lib/hud/dataBlock";
  import type { GlyphState } from "$lib/hud/tile";
  import PositionGlyphSvg from "./PositionGlyphSvg.svelte";

  interface Props {
    geometry: BlockGeometry;
    /** plate behind the type so no hairline runs through it */
    knockout?: boolean;
  }
  let { geometry: g, knockout = true }: Props = $props();

  const f1 = (v: number) => v.toFixed(1);
  // line 1 is anchored so the whole tag sits on the leader's side
  const l1x = $derived(g.left ? g.tx_ - g.w1 : g.tx_ + g.glyphWidth);
</script>

<g class="datablock-svg">
  {#if knockout}
    <rect class="f-void" x={f1(g.box.x0)} y={f1(g.box.y0 + 1)} width={f1(g.box.x1 - g.box.x0)} height={f1(g.box.y1 - g.box.y0 - 1)} />
  {/if}
  <path class="s-hair {g.tx ? 'k-tx' : 'k-ink3'}" fill="none" d={polyline(g.lead)} />
  {#if g.glyph}<PositionGlyphSvg cx={l1x - 11} cy={g.ty - 4} state={g.glyph as GlyphState} />{/if}
  <text class="tx-data" class:is-tx={g.tx} x={f1(l1x)} y={f1(g.ty)}>{g.l1}{#if g.sim}<tspan class="tx-lab" dx="6">SIM</tspan>{/if}</text>
  <text class="tx-num2 {g.l2Class ?? ''}" x={f1(g.tx_)} y={f1(g.ty + 15)} text-anchor={g.left ? "end" : "start"}>{g.l2}</text>
</g>

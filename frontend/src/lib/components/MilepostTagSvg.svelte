<svelte:options namespace="svg" />

<script lang="ts">
  /** M9 milepost tag for inside an <svg class="hud">, top-left at (x, y). */
  import * as fmt from "$lib/hud/fmt";

  interface Props {
    x: number;
    y: number;
    mp: string;
  }
  let { x, y, mp }: Props = $props();

  const parts = $derived(fmt.mpParts(mp));
  const [whole, decimal] = $derived((parts?.num ?? "0.0").split("."));
  const snap = (v: number) => Math.round(v) + 0.5;
</script>

{#if parts}
  <g class="mp-tag-svg">
    <rect class="s-hair k-line" x={snap(x)} y={snap(y)} width="31" height="47" />
    <text class="tx-lab" x={x + 16} y={y + 15} text-anchor="middle" style="letter-spacing:.04em">{parts.derived ? "≈" : ""}{parts.prefix}</text>
    <text class="tx-data" style="font-size:11px" x={x + 16} y={y + 28} text-anchor="middle">{whole}</text>
    <text class="tx-num2" style="font-size:11px" x={x + 16} y={y + 41} text-anchor="middle">.{decimal}</text>
  </g>
{/if}

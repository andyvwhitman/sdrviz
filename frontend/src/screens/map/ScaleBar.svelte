<svelte:options namespace="svg" />
<script lang="ts">
  /**
   * Scale bar: two M2 rulers on one baseline, km numerals above and mi numerals below. The length follows the zoom
   * (see lib/scale) and the bar hangs from `right`, so it stays in its corner whatever length it takes.
   */
  import { scaleLabel, scaleSpec } from "./lib/scale";

  interface Props {
    /** right edge of the bar and its unit labels */
    right: number;
    y: number;
    pxPerKm: number;
  }
  let { right, y, pxPerKm }: Props = $props();

  const spec = $derived(scaleSpec(pxPerKm));
  const LABEL_W = 24;
  const x = $derived(right - Math.max(spec.kmW, spec.miW) - LABEL_W);
  const STEPS = 20;
  const tick = (w: number, v: number): number => x + 0.5 + Math.round((v / STEPS) * (w - 1));
  const steps = Array.from({ length: STEPS + 1 }, (_, i) => i);
  /** a numeral at every major tick, or at every other one when the numerals would touch */
  const MIN_LABEL_GAP = 52;
  const labelEvery = (w: number): number => (w / 4 < MIN_LABEL_GAP ? 10 : 5);
</script>

<g class="mp-scale">
  <path class="s-hair k-faint" d="M{x} {y + 0.5}H{x + spec.kmW + 1}" />
  {#each steps as v (v)}
    {@const major = v % 5 === 0}
    <path class="s-hair {major ? 'k-line' : 'k-faint'}" d="M{tick(spec.kmW + 1, v)} {y}V{y - (major ? 8 : 4)}" />
    {#if v % labelEvery(spec.kmW) === 0}<text class="tx-num" x={tick(spec.kmW + 1, v)} y={y - 12} text-anchor="middle">{scaleLabel((v / STEPS) * spec.km)}</text>{/if}
  {/each}
  <text class="tx-lab" x={x + spec.kmW + 12} y={y - 8}>KM</text>
  <path class="s-hair k-faint" d="M{x} {y + 1.5}H{x + spec.miW + 1}" />
  {#each steps as v (v)}
    {@const major = v % 5 === 0}
    <path class="s-hair {major ? 'k-line' : 'k-faint'}" d="M{tick(spec.miW + 1, v)} {y + 1}V{y + 1 + (major ? 8 : 4)}" />
    {#if v % labelEvery(spec.miW) === 0}<text class="tx-num" x={tick(spec.miW + 1, v)} y={y + 21} text-anchor="middle">{scaleLabel((v / STEPS) * spec.mi)}</text>{/if}
  {/each}
  <text class="tx-lab" x={x + spec.miW + 12} y={y + 16}>MI</text>
</g>

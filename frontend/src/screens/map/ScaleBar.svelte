<svelte:options namespace="svg" />
<script lang="ts">
  /** Scale bar: two M2 rulers on one baseline, km numerals above and mi numerals below. */
  import { MI_KM } from "./lib/project";

  interface Props {
    x: number;
    y: number;
    pxPerKm: number;
  }
  let { x, y, pxPerKm }: Props = $props();

  const KM = 20;
  const MI = 10;
  const kmW = $derived(Math.round(KM * pxPerKm));
  const miW = $derived(Math.round(MI * MI_KM * pxPerKm));
  const tick = (w: number, max: number, v: number): number => x + 0.5 + Math.round((v / max) * (w - 1));
  const steps = (max: number): number[] => Array.from({ length: max + 1 }, (_, i) => i);
</script>

<g class="mp-scale">
  <path class="s-hair k-faint" d="M{x} {y + 0.5}H{x + kmW + 1}" />
  {#each steps(KM) as v (v)}
    {@const major = v % 5 === 0}
    <path class="s-hair {major ? 'k-line' : 'k-faint'}" d="M{tick(kmW + 1, KM, v)} {y}V{y - (major ? 8 : 4)}" />
    {#if major}<text class="tx-num" x={tick(kmW + 1, KM, v)} y={y - 12} text-anchor="middle">{v}</text>{/if}
  {/each}
  <text class="tx-lab" x={x + kmW + 12} y={y - 8}>KM</text>
  <path class="s-hair k-faint" d="M{x} {y + 1.5}H{x + miW + 1}" />
  {#each steps(MI) as v (v)}
    {@const major = v % 5 === 0}
    <path class="s-hair {major ? 'k-line' : 'k-faint'}" d="M{tick(miW + 1, MI, v)} {y + 1}V{y + 1 + (major ? 8 : 4)}" />
    {#if major}<text class="tx-num" x={tick(miW + 1, MI, v)} y={y + 21} text-anchor="middle">{v}</text>{/if}
  {/each}
  <text class="tx-lab" x={x + miW + 12} y={y + 16}>MI</text>
</g>

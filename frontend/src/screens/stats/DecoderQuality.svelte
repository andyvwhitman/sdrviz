<script lang="ts">
  /** Transcript confidence histogram (10 bins) beside the median decode latency. */
  import * as fmt from "$lib/hud/fmt";
  import { pad2, snap } from "./stats";
  import type { StatsView } from "./types";

  interface Props {
    stats: StatsView;
    width: number;
    compact: boolean;
    /** decoder queue length now; null for a closed range */
    queue: number | null;
  }
  let { stats, width: W, compact, queue }: Props = $props();

  const decoder = $derived(stats.decoder);
  const latencyWidth = $derived(compact ? 132 : 168);
  const hw = $derived(W - latencyWidth - 24);
  const hh = $derived(compact ? 124 : 142);
  const hist = $derived(decoder.confidence_histogram);
  const hmax = $derived(Math.max(1, ...hist));
  const binW = $derived(hw / Math.max(1, hist.length));
  const baseY = $derived(hh - 38);
  const bars = $derived(
    hist.map((v, k) => {
      const height = v ? Math.max(2, Math.round((v / hmax) * (baseY - 20))) : 0;
      return { v, height, x: Math.round(k * binW) + 2, w: Math.round(binW) - 4 };
    }),
  );
  const ticks = $derived(Array.from({ length: 11 }, (_, k) => ({ k, x: Math.min(hw - 1, k * binW) })));
</script>

<div class="panel__head">
  <span class="t-panel">DECODER QUALITY</span>
  <span class="t-micro">{decoder.engine.toUpperCase()} · <b>{decoder.final_rows}</b> FINAL ROWS</span>
</div>
<div class="st-split">
  <div>
    <svg class="hud" width={hw} height={hh} viewBox="0 0 {hw} {hh}" aria-hidden="true">
      {#if hist.length === 0}
        <text class="st-dim" x="0" y="60">N/A · ENGINE REPORTS NO CONFIDENCE</text>
      {:else}
        {#each bars as b}
          {#if b.height}
            <rect class="st-bar" x={b.x + 0.5} y={baseY - b.height + 0.5} width={b.w - 1} height={b.height - 1} />
            <text class="st-val" x={b.x + b.w / 2} y={baseY - b.height - 5} text-anchor="middle">{b.v}</text>
          {:else}
            <path class="s-hair k-grid" d="M{b.x} {snap(baseY - 1)}L{b.x + b.w} {snap(baseY - 1)}" />
          {/if}
        {/each}
        <path class="s-hair k-faint" d="M0 {snap(baseY)}L{hw} {snap(baseY)}" />
        {#each ticks as { k, x }}
          {@const major = k % 2 === 0}
          <path class="s-hair {major ? 'k-line' : 'k-faint'}" d="M{snap(x)} {baseY}L{snap(x)} {baseY + (major ? 8 : 4)}" />
          {#if major}
            <text class="tx-num" x={Math.round(Math.min(hw - 12, Math.max(8, k * binW)))} y={baseY + 20} text-anchor="middle">{(k / 10).toFixed(1)}</text>
          {/if}
        {/each}
        <text class="tx-lab" x={hw} y={baseY + 34} text-anchor="end">{compact ? "CONFIDENCE" : "TRANSCRIPT CONFIDENCE"}</text>
      {/if}
    </svg>
  </div>
  <div class="st-lat">
    <span class="t-micro">{compact ? "MEDIAN LATENCY" : "MEDIAN DECODE LATENCY"}</span>
    <span class="big">{decoder.median_latency_s != null ? decoder.median_latency_s.toFixed(1) : fmt.BLANK}<small>S</small></span>
    <span class="t-micro st-gap-lg">DECODED</span>
    <span class="mono st-small">{decoder.final_rows} <span class="c-ink-3">/ {stats.totals.count} TX</span></span>
    <span class="t-micro st-gap-sm">QUEUE NOW</span>
    <span class="mono st-small">{queue ?? fmt.BLANK}</span>
  </div>
</div>

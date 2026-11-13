<script lang="ts">
  /** Channel x hour heatmap: single-hue ramp (spec 1.5); rows share their baselines with the ridgeline. */
  import * as fmt from "$lib/hud/fmt";
  import { rampColor } from "$lib/hud/ramp";
  import { pad2, type Rhythm, type SeriesSet } from "./stats";
  import type { StatsRange, StatsView } from "./types";

  interface Props {
    stats: StatsView;
    set: SeriesSet;
    layout: Rhythm;
    width: number;
    height: number;
    range: StatsRange;
    nowT: number | null;
  }
  let { stats, set, layout, width: W, height, range, nowT }: Props = $props();

  const RAMP_STOPS = [0, 1, 2, 3, 4, 5];
  const { series } = $derived(set);
  const labelX = $derived(W < 520 ? 104 : 112);
  /** calendar days always lay out 24 columns (hours not yet run are dots); a rolling window prints what the backend sent */
  const columns = $derived(range === "rolling_24h" ? stats.hour_labels.length : 24);
  const hourLabel = (h: number) => (range === "rolling_24h" ? stats.hour_labels[h] : pad2(h));
  const cellW = $derived(Math.floor((W - labelX - 36) / columns));
  const gridW = $derived(cellW * columns);
  const max = $derived(Math.max(1, ...series.map((s) => Math.max(...s.hours))));
  const half = $derived(layout.pitch / 2);
  /** hours of the range already run (today only; the rest print as dots) */
  const hoursDone = $derived(range === "today" ? (stats.end_t - stats.hour_bins_start_t) / 3600 : columns);
  const scaleY = $derived(layout.allBase - layout.ampAll + 4);
  const scaleW = $derived(Math.min(192, Math.round(gridW * 0.4)));
  const hottest = $derived(
    series
      .flatMap((s, i) => s.hours.map((v, h) => ({ v, h, i })))
      .reduce<{ v: number; h: number; i: number } | null>((best, c) => (!best || c.v > best.v ? c : best), null),
  );
  const nowColumn = $derived(nowT == null ? null : Math.floor((nowT - stats.hour_bins_start_t) / 3600));

  const cellFill = (hours: number[], h: number) => {
    const v = hours[h] ?? 0;
    return v > 0 ? rampColor(0.1 + 0.9 * Math.min(1, v / max)) : "var(--ramp-1)";
  };
</script>

<div class="panel__head">
  <span class="t-panel">CHANNEL × HOUR</span>
  <span class="t-micro">AIRTIME S / H · ROWS ALIGN WITH RIDGES</span>
</div>

<svg class="hud" width={W} {height} viewBox="0 0 {W} {height}" aria-hidden="true">
  <!-- scale first, level with the ALL ridge: the ramp as an axis, not a legend -->
  <defs>
    <linearGradient id="st-ramp">
      {#each RAMP_STOPS as k (k)}<stop offset={k / 5} style="stop-color:var(--ramp-{k})" />{/each}
    </linearGradient>
  </defs>
  <text class="tx-lab" x="0" y={scaleY + 8}>SCALE</text>
  <rect x={labelX} y={scaleY} width={scaleW} height="6" fill="url(#st-ramp)" />
  <rect class="s-hair k-faint" x={labelX + 0.5} y={scaleY + 0.5} width={scaleW - 1} height="5" />
  <text class="tx-num" x={labelX} y={scaleY + 20}>0</text>
  <text class="tx-num" x={labelX + scaleW / 2} y={scaleY + 20} text-anchor="middle">{Math.round(max / 2)}</text>
  <text class="tx-num" x={labelX + scaleW} y={scaleY + 20} text-anchor="end">{Math.round(max)} S</text>
  {#if hottest}
    <text class="st-val" x={labelX + gridW} y={scaleY + 8} text-anchor="end">
      MAX {series[hottest.i].aar} {hourLabel(hottest.h)}:00 · {fmt.num(hottest.v, 0)} S
    </text>
  {/if}
  {#if range === "today"}
    <text class="tx-lab" x={labelX + gridW} y={scaleY + 20} text-anchor="end">· = HOURS NOT YET RUN</text>
  {/if}

  <!-- hour columns -->
  {#each { length: columns } as _, h (h)}
    {@const label = hourLabel(h)}
    {#if Number(label) % 3 === 0}
      <text class="tx-num" x={labelX + h * cellW + cellW / 2} y={layout.base(0) - half - 6} text-anchor="middle">{label}</text>
    {/if}
  {/each}

  {#each series as s, i (s.key)}
    {@const yc = layout.base(i)}
    {@const y0 = Math.round(yc - half) + 1}
    {@const y1 = Math.round(yc + half) - 1}
    <text x="0" y={yc + 4}>
      <tspan class="st-ch">{s.aar}</tspan><tspan class="st-lab" dx="6">{s.label.slice(0, 10)}</tspan>
    </text>
    {#each { length: columns } as _, h}
      {#if h >= hoursDone}
        <rect class="f-line st-notyet" x={labelX + h * cellW + cellW / 2 - 1} y={yc - 1} width="2" height="2" />
      {:else}
        <rect
          x={labelX + h * cellW}
          y={y0}
          width={cellW - 1}
          height={y1 - y0}
          style="fill:{cellFill(s.hours, h)};fill-opacity:{(s.hours[h] ?? 0) > 0 ? 1 : 0.5}"
        />
      {/if}
    {/each}
    <text class="st-val" x={W} y={yc + 4} text-anchor="end">{Math.round(s.share * 100)}%</text>
  {/each}

  <!-- the running hour -->
  {#if nowColumn != null && nowColumn >= 0 && nowColumn < columns}
    {@const x = labelX + nowColumn * cellW + cellW / 2}
    {@const yt = layout.base(0) - half}
    <path class="s-hair k-idle" d="M{Math.round(x) + 0.5} {yt - 2}L{Math.round(x) + 0.5} {yt + 1}" />
    <path class="f-idle" d="M{x - 4} {yt - 3}H{x + 4}L{x} {yt + 1}Z" />
  {/if}
</svg>

<script lang="ts">
  /**
   * M20 ridgeline. Hidden-line plot: each ridge is a 30 min running mean of its 10 min bins, drawn as a
   * hairline over a bg-void fill so lower ridges occlude upper ones. Channel ridges share one scale,
   * clipped at the 95th percentile, so no spike climbs more than one ridge up (clipped runs are marked).
   * The ALL CHANNELS ridge on top is 3 pitches tall on its own scale and carries the AM / PM peak
   * dimensions (M12). Right-hand totals are the unsmoothed sim figures. Channels that are keyed now
   * carry a 2 x 11 px state-tx tick at the now-line.
   */
  import * as fmt from "$lib/hud/fmt";
  import { capRuns, mean3, pad2, peakHours, completeHours, quantile, snap, TimeAxis, type Rhythm, type SeriesSet } from "./stats";
  import type { StatsRange, StatsView } from "./types";

  interface Props {
    stats: StatsView;
    set: SeriesSet;
    layout: Rhythm;
    width: number;
    height: number;
    range: StatsRange;
    /** sim time of the now-line; null for a closed range */
    nowT: number | null;
    /** "14:07" label for the now-line */
    nowLabel: string;
    zone: string;
    /** frequency ids keyed right now */
    liveFrequencies: Set<string>;
    compact: boolean;
  }
  let { stats, set, layout, width: W, height, range, nowT, nowLabel, zone, liveFrequencies, compact }: Props = $props();

  const X0 = 132;
  const { series } = $derived(set);
  const x1 = $derived(W - 100);
  const axis = $derived(new TimeAxis(range === "rolling_24h" ? stats.start_t : 0, X0, x1));
  const xe = $derived(Math.min(axis.x(stats.end_t), x1));
  const isToday = $derived(range === "today");
  const lastRow = $derived(layout.base(series.length - 1));
  const rulerY = $derived(lastRow + 8);

  const smooth = $derived(series.map((s) => mean3(s.bins)));
  /** P95 of the bins with traffic: one pitch and a half */
  const cap = $derived(Math.max(1, quantile(smooth.flat().filter((v) => v > 0), 0.95)));
  const allSmooth = $derived(mean3(set.allBins));
  const allMax = $derived(Math.max(1, ...allSmooth));
  const peaks = $derived(peakHours(stats, completeHours(stats)));

  const binX = (k: number) => Math.min(Math.max(axis.x(stats.ten_min_bins_start_t + k * 600 + 300), X0), xe);

  function ridgePath(values: number[], y: number, amplitude: number, top: number): string {
    const points = values.map((v, k) => `L${binX(k).toFixed(1)} ${(y - (amplitude * Math.min(v, top)) / top).toFixed(1)}`);
    return `M${X0} ${y}${points.join("")}L${xe.toFixed(1)} ${y}`;
  }

  const allPath = $derived(ridgePath(allSmooth, layout.allBase, layout.ampAll, allMax));
  const dimY = $derived(layout.plotTop - 10);
  const ridgeY = (t: number) => {
    const k = Math.max(0, Math.min(allSmooth.length - 1, Math.round((t - stats.ten_min_bins_start_t) / 600 - 0.5)));
    return layout.allBase - (layout.ampAll * Math.min(allSmooth[k] ?? 0, allMax)) / allMax;
  };
</script>

<div class="panel__head">
  <span class="t-panel">RHYTHM · AIRTIME PER 10 MIN · 30 MIN MEAN</span>
  <span class="t-micro">
    ALL + {series.length} RIDGES · {set.topCount} CHANNELS BY AIRTIME{set.restCount ? " + OTHER" : ""}{compact
      ? ` · ${set.heard} OF ${set.monitored} HEARD`
      : " · ON AND OFF BANK"}
  </span>
</div>

<svg class="hud" width={W} {height} viewBox="0 0 {W} {height}" aria-hidden="true">
  <text class="tx-lab" x={W} y={layout.allBase - layout.ampAll - 6} text-anchor="end">HH:MM:SS  SHARE</text>

  <!-- hourly graticule behind the ridges; the void fills occlude it -->
  {#each axis.hours() as { t, hour, label } (t)}
    <path class="s-hair {hour % 6 === 0 ? 'k-faint' : 'k-grid'}" d="M{snap(axis.x(t))} {layout.plotTop}L{snap(axis.x(t))} {lastRow}" />
  {/each}

  <!-- ALL CHANNELS: void fill, a flat 12 % line wash, then the 2 px ink trace -->
  <path class="st-path is-all" d="{allPath}Z" style="stroke:none" />
  <path class="st-all-wash" d="{allPath}Z" />
  <path class="st-path is-all" d={allPath} style="fill:none" />
  {#if isToday && xe < x1}
    <path class="s-hair k-grid" d="M{xe.toFixed(1)} {snap(layout.allBase)}L{x1} {snap(layout.allBase)}" />
  {/if}
  <text x="0" y={layout.allBase + 4}><tspan class="st-ch">ALL</tspan><tspan class="st-lab" dx="8">CHANNELS</tspan></text>
  <text class="st-val" x={W} y={layout.allBase + 4} text-anchor="end">{stats.totals.airtime_label}  100%</text>

  <!-- the shared channel scale, stated once, and the key for the capped mark -->
  <text class="tx-lab" x="0" y={layout.allBase - 44}>RIDGE SCALE · P95</text>
  <text class="st-dim" x="0" y={layout.allBase - 31}>{fmt.num(cap, 0)} S / 10 MIN</text>
  <text class="st-dim" x="0" y={layout.allBase - 17}>CAPPED</text>
  {@render capMark(52, 82, layout.allBase - 21)}

  {#each series as s, i (s.key)}
    {@const y = layout.base(i)}
    {@const d = ridgePath(smooth[i], y, layout.amp, cap)}
    <path class="st-path" class:is-other={s.other} d="{d}Z" style="stroke:none" />
    <path class="st-path" class:is-other={s.other} {d} style="fill:none" />
    {#each capRuns(smooth[i], cap) as [k0, k1]}
      {@const xa = Math.round(binX(k0))}
      {@render capMark(xa, Math.max(Math.round(binX(k1)), xa + 4), y - layout.amp)}
    {/each}
    {#if isToday && xe < x1}
      <path class="s-hair k-grid" d="M{xe.toFixed(1)} {snap(y)}L{x1} {snap(y)}" />
    {/if}
    <text x="0" y={y + 4}><tspan class="st-ch">{s.aar}</tspan><tspan class="st-lab" dx="8">{s.label}</tspan></text>
    <text class="st-val" x={W} y={y + 4} text-anchor="end">{fmt.total(s.airtimeS)}  {Math.round(s.share * 100)}%</text>
    {#if s.frequencyId && nowT != null && liveFrequencies.has(s.frequencyId)}
      <path class="st-livetick" d="M{snap(axis.x(nowT)) + 3} {y - 10}L{snap(axis.x(nowT)) + 3} {y + 1}" />
    {/if}
  {/each}

  <!-- hour ruler (M2) -->
  <path class="s-hair k-faint" d="M{X0} {snap(rulerY)}L{x1} {snap(rulerY)}" />
  {#each axis.hours() as { t, hour, label } (t)}
    {@const major = hour % 3 === 0}
    <path class="s-hair {major ? 'k-line' : 'k-faint'}" d="M{snap(axis.x(t))} {rulerY}L{snap(axis.x(t))} {rulerY + (major ? 8 : 4)}" />
    {#if major}
      <text class="tx-num" x={Math.round(axis.x(t))} y={rulerY + 20} text-anchor="middle">{pad2(label)}:00</text>
    {/if}
  {/each}
  <text class="tx-lab" x="0" y={rulerY + 20}>{zone}</text>

  <!-- peak-hour dimension lines (M12), hung off the ALL ridge -->
  {#each peaks as p (p.name)}
    {@const a = Math.round(axis.x(p.t))}
    {@const b = Math.round(axis.x(p.t + 3600))}
    <path class="s-hair k-line d-measure" d="M{snap(a)} {Math.round(ridgeY(p.t)) - 3}V{dimY - 4}M{snap(b)} {Math.round(ridgeY(p.t + 3599)) - 3}V{dimY - 4}" />
    <path class="s-hair k-line" d="M{a} {snap(dimY)}L{b} {snap(dimY)}" />
    <path class="s-hair k-line" d="M{a + 0.5} {dimY - 4}L{a + 0.5} {dimY + 3}" />
    <path class="s-hair k-line" d="M{b - 0.5} {dimY - 4}L{b - 0.5} {dimY + 3}" />
    <text class="st-val" x={b + 8} y={dimY + 4}>{p.name} {pad2(p.hour)}–{pad2((p.hour + 1) % 24)} · {fmt.total(p.airtimeS)} · {p.times}× MIDDAY</text>
  {/each}

  <!-- now-line (state-idle) -->
  {#if nowT != null}
    <path class="s-hair k-idle" d="M{snap(axis.x(nowT))} {layout.plotTop - 14}L{snap(axis.x(nowT))} {rulerY}" />
    {#if isToday}
      <text class="st-now" x={Math.round(axis.x(nowT)) + 6} y={layout.allBase - Math.round(layout.ampAll / 2) + 4}>NOW {nowLabel}</text>
    {/if}
  {/if}
</svg>

{#snippet capMark(xa: number, xb: number, y: number)}
  <!-- the capped mark: void knock-out of the solid flat, dashed flat between 1 px end ticks -->
  <path class="st-cap-ko" d="M{xa} {snap(y)}L{xb} {snap(y)}" />
  <path class="s-hair d-threshold k-line st-cap" d="M{xa} {snap(y)}L{xb} {snap(y)}" />
  <path class="s-hair k-line" d="M{snap(xa)} {y - 3}L{snap(xa)} {y + 4}" />
  <path class="s-hair k-line" d="M{snap(xb) - 1} {y - 3}L{snap(xb) - 1} {y + 4}" />
{/snippet}

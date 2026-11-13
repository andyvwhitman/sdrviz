<script lang="ts">
  /**
   * Feed uptime: a solid bar for ok, dash-stale for stale, dash-offline for offline, a hollow
   * triangle (fault-past) over a past fault, red only for a fault now. Every non-ok span is at least
   * 8 px wide, in its own dash between 1 px end ticks, so a two minute stale still shows its geometry.
   */
  import PositionGlyphSvg from "$lib/components/PositionGlyphSvg.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { feedName } from "$lib/hud/roles";
  import { pad2, snap, TimeAxis } from "./stats";
  import type { StatsRange, StatsView, UptimeSpan } from "./types";

  interface Props {
    stats: StatsView;
    width: number;
    range: StatsRange;
    nowT: number | null;
    rangeSpan: string;
  }
  let { stats, width: W, range, nowT, rangeSpan }: Props = $props();

  const ROW_H = 26;
  const feeds = $derived(Object.keys(stats.feed_uptime));
  const height = $derived(14 + 4 * ROW_H + 22);
  const x0 = 64;
  const x1 = $derived(W - 64);
  const axis = $derived(new TimeAxis(range === "rolling_24h" ? stats.start_t : 0, x0, x1));
  const endT = $derived(stats.end_t);
  const rulerY = $derived(14 + feeds.length * ROW_H - 6);
  const elapsed = $derived(endT - stats.start_t);
  const isToday = $derived(range === "today");

  interface Span extends UptimeSpan {
    a: number;
    b: number;
    live: boolean;
  }

  function spansOf(feed: string): Span[] {
    return stats.feed_uptime[feed]
      .map((s) => ({ ...s, a: Math.max(stats.start_t, s.start_t), b: Math.min(endT, s.end_t) }))
      .filter((s) => s.b > s.a)
      .map((s) => ({ ...s, live: s.active && s.b >= endT - 1 }));
  }

  /** pixel extent of a span's dash */
  function extent(s: Span): [number, number] {
    let a = Math.round(axis.x(s.a));
    let b = Math.round(axis.x(s.b));
    if (b - a < 8) {
      a = Math.round((a + b) / 2 - 4);
      b = a + 8;
    }
    if (s.live) {
      b = Math.round(axis.x(endT));
      a = Math.min(Math.round(axis.x(s.a)), b - 8);
    }
    return [a, b];
  }

  const dashClass = (s: Span) => (s.state === "fault" && s.live ? "st-up-fault" : s.state === "offline" ? "st-up-off" : "st-up-stale");

  /** percent up; a feed with any downtime never rounds up to 100 */
  function uptimePct(spans: Span[]): string {
    const down = spans.reduce((a, s) => a + (s.b - s.a), 0);
    const pct = 100 * (1 - down / elapsed);
    return `${pct >= 99.95 && down > 0 ? "99.9" : pct.toFixed(1)}%`;
  }

  /** the live span of a feed, a fault ranking above the rest */
  const liveSpan = (spans: Span[]) => spans.filter((s) => s.live).sort((p, q) => Number(q.state === "fault") - Number(p.state === "fault"))[0];
</script>

<div class="panel__head st-up-head">
  <span class="t-panel">FEED UPTIME</span>
  <span class="t-micro">{rangeSpan}</span>
</div>
<svg class="hud" width={W} {height} viewBox="0 0 {W} {height}" aria-hidden="true">
  <!-- now-line first, so the glyphs at now paint over it -->
  {#if nowT != null}
    <path class="s-hair k-idle" d="M{snap(axis.x(nowT))} 2L{snap(axis.x(nowT))} {rulerY}" />
  {/if}
  {#each feeds as feed, i (feed)}
    {@const y = 14 + i * ROW_H}
    {@const spans = spansOf(feed)}
    {@const live = liveSpan(spans)}
    <text class="st-ch" x="0" y={y + 4}>{feedName(feed)}</text>
    <path class="st-up" d="M{axis.x(stats.start_t)} {snap(y)}L{axis.x(endT).toFixed(1)} {snap(y)}" />
    {#if isToday}
      <path class="s-hair k-grid" d="M{axis.x(endT).toFixed(1)} {snap(y)}L{x1} {snap(y)}" />
    {/if}
    {#each spans as s (s.start_t)}
      {@const [a, b] = extent(s)}
      {@const tick = s.state === "fault" && s.live ? "k-fault" : "k-stale"}
      <path class="st-gap" d="M{a - 1} {snap(y)}L{b + 1} {snap(y)}" />
      <path class={dashClass(s)} d="M{a} {snap(y)}L{b} {snap(y)}" />
      <path class="s-hair {tick}" d="M{snap(a)} {y - 4}L{snap(a)} {y + 4}" />
      <path class="s-hair {tick}" d="M{snap(b) - 1} {y - 4}L{snap(b) - 1} {y + 4}" />
      {#if s.state === "fault" && !s.live}
        <PositionGlyphSvg cx={Math.round((a + b) / 2)} cy={y - 9} state="fault-past" />
      {/if}
    {/each}
    <!-- live now: the glyph sits on the now end of its own bar, the label in the empty future beside it -->
    {#if live && nowT != null}
      {@const xn = Math.round(axis.x(endT))}
      <PositionGlyphSvg cx={xn - 4} cy={y - 9} state={live.state} />
      {@const future = range !== "rolling_24h"}
      <text class={live.state === "fault" ? "st-fault-t" : "st-stale-t"} x={future ? xn + 10 : xn - 14} y={y + 4} text-anchor={future ? "start" : "end"}>{live.label}</text>
      <text class="st-dim" x={future ? xn + 10 : xn - 14} y={y + 16} text-anchor={future ? "start" : "end"}>SINCE {live.start.slice(0, 5)} · AGE {fmt.age(nowT - live.start_t, "age")}</text>
    {/if}
    <text class="st-val" x={W} y={y + 4} text-anchor="end">{uptimePct(spans)}</text>
  {/each}

  <path class="s-hair k-faint" d="M{x0} {snap(rulerY)}L{x1} {snap(rulerY)}" />
  {#each axis.hours().filter((h) => h.hour % 3 === 0) as { t, hour, label } (t)}
    {@const major = hour % 6 === 0}
    <path class="s-hair {major ? 'k-line' : 'k-faint'}" d="M{snap(axis.x(t))} {rulerY}L{snap(axis.x(t))} {rulerY + (major ? 8 : 4)}" />
    {#if major}
      <text class="tx-num" x={Math.round(axis.x(t))} y={rulerY + 20} text-anchor="middle">{pad2(label)}</text>
    {/if}
  {/each}
  <text class="tx-lab" x={W} y={rulerY + 20} text-anchor="end">UP</text>
</svg>

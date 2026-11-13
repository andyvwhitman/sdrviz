<script lang="ts">
  /** 15-minute sample-rate stability, one value per minute (spec 5.30). Zero or missing minutes are a gap. */
  import RegMark from "../system/RegMark.svelte";

  interface Props {
    width: number;
    /** MS/s per minute, oldest first; null or 0 means no samples */
    values: (number | null)[];
  }
  let { width, values }: Props = $props();

  const HEIGHT = 70;
  const RATE_MIN = 2.39;
  const RATE_MAX = 2.4;
  const plotW = $derived(width - 44);

  const y = (v: number): number => Math.round(((RATE_MAX - Math.max(RATE_MIN, Math.min(RATE_MAX, v))) / (RATE_MAX - RATE_MIN)) * (HEIGHT - 1));
  const x = (i: number): number => Math.round((i / (values.length - 1)) * (plotW - 1));

  const segments = $derived.by(() => {
    const out: string[] = [];
    let current = "";
    values.forEach((v, i) => {
      if (v) current += `${current ? "L" : "M"}${x(i)} ${y(v) + 0.5}`;
      else if (current) {
        out.push(current);
        current = "";
      }
    });
    return current ? [...out, current] : out;
  });
  const gaps = $derived(values.flatMap((v, i) => (v ? [] : [i])));
  const gap = $derived.by(() => {
    if (!gaps.length) return null;
    const last = gaps[gaps.length - 1];
    return { from: Math.max(0, gaps[0] - 1), to: last + (last < values.length - 1 ? 1 : 0) };
  });
</script>

<svg class="hud fb-svg" {width} height={HEIGHT + 22} viewBox="0 0 {width} {HEIGHT + 22}">
  {#each [RATE_MAX, (RATE_MIN + RATE_MAX) / 2, RATE_MIN] as v}
    <path class="s-hair {v === RATE_MAX ? 'k-faint d-threshold' : 'k-grid'}" d="M0 {y(v) + 0.5}H{plotW}" />
    <text class="num" x={plotW + 6} y={y(v) + 4}>{v.toFixed(3)}</text>
  {/each}
  {#each segments as d}<path class="s-hair k-line" {d} />{/each}
  {#each values as v, i}
    {#if v}<rect class="f-line" x={x(i) - 1} y={y(v) - 1} width="3" height="3" />{/if}
  {/each}
  {#if gap}
    <path class="s-hair k-stale d-offline" d="M{x(gap.from)} {HEIGHT - 0.5}H{x(gap.to)}" />
    <text class="lab" x={x(gap.to)} y={HEIGHT - 6} text-anchor="end">NO SAMPLES</text>
  {/if}
  <text class="num" x="0" y={HEIGHT + 16}>−15M</text>
  <text class="num" x={plotW} y={HEIGHT + 16} text-anchor="end">NOW</text>
</svg>

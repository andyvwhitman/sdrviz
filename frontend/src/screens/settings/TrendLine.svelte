<script lang="ts">
  /** A line over the last 30 minutes: x is time, y is the value up to `max`. A null value breaks the line. */
  import { HISTORY_MS } from "$lib/nodeHealth";

  interface Props {
    /** `[t ms, value]` pairs, oldest first */
    points: [number, number | null][];
    /** the value at the top of the chart */
    max: number;
    /** the right edge of the window, ms */
    now: number;
    label: string;
  }
  let { points, max, now, label }: Props = $props();

  const W = 300;
  const H = 48;

  /** runs of consecutive values as `x,y x,y …` strings */
  const runs = $derived.by(() => {
    const out: string[][] = [];
    for (const [t, value] of points) {
      if (value == null) {
        out.push([]);
        continue;
      }
      const x = ((t - (now - HISTORY_MS)) / HISTORY_MS) * W;
      const y = H - Math.min(1, Math.max(0, value / max)) * (H - 2) - 1;
      if (!out.length) out.push([]);
      out[out.length - 1].push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return out.filter((run) => run.length > 0);
  });
</script>

<svg class="tl" viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label={label}>
  <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} class="tl__base" />
  {#each runs as run}
    {#if run.length > 1}<polyline points={run.join(" ")} class="tl__line" />{:else}<circle cx={run[0].split(",")[0]} cy={run[0].split(",")[1]} r="1.5" class="tl__dot" />{/if}
  {/each}
</svg>

<style>
  .tl { display: block; width: 100%; height: 48px; }
  .tl__base { stroke: var(--line-faint); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .tl__line { fill: none; stroke: var(--ink); stroke-width: 1.25; vector-effect: non-scaling-stroke; }
  .tl__dot { fill: var(--ink); }
</style>

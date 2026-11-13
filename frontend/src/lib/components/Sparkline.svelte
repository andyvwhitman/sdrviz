<script lang="ts">
  /**
   * M22 sparkline: 60 values (seconds of airtime per minute, oldest first, last = current minute).
   * 59 past columns at x 0..58, a 4 px gap, the current minute at x 63. Full scale 30 s/min.
   */
  interface Props {
    values: number[];
    /** highlight the current minute (the channel is keyed) */
    live?: boolean;
  }
  let { values, live = false }: Props = $props();

  const COLUMNS = 60;
  const FULL_SCALE_S = 30;
  const HEIGHT = 14;

  const columns = $derived.by(() => {
    const recent = values.slice(-COLUMNS);
    const padded = [...new Array<number>(COLUMNS - recent.length).fill(0), ...recent];
    return padded.map((seconds, i) => ({
      x: i < COLUMNS - 1 ? i : 63,
      height: seconds > 0 ? Math.max(1, Math.round((Math.min(seconds, FULL_SCALE_S) / FULL_SCALE_S) * HEIGHT)) : 0,
      now: i === COLUMNS - 1 && live,
    }));
  });
</script>

<svg class="spark-svg" width="64" height="14" viewBox="0 0 64 14" aria-hidden="true">
  {#each columns as c}
    {#if c.height}
      <rect class="col" class:is-now={c.now} x={c.x} y={HEIGHT - c.height} width="1" height={c.height} />
    {:else}
      <rect class="col is-zero" x={c.x} y="13" width="1" height="1" />
    {/if}
  {/each}
</svg>

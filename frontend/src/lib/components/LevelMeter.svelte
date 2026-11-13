<script lang="ts">
  /** M16 level meter, -60..0 dBFS. Ported from HUD.c.meter. */
  interface Props {
    w?: number;
    db?: number | null;
    peak?: number | null;
    /** feed noise floor */
    floor?: number | null;
    tx?: boolean;
    muted?: boolean;
    /** not available (N/A · RTL_TCP): scale only */
    na?: boolean;
  }
  let { w = 120, db = null, peak = null, floor = null, tx = false, muted = false, na = false }: Props = $props();

  const MIN_DB = -60;
  const x = (value: number): number => Math.round(((Math.max(MIN_DB, Math.min(0, value)) - MIN_DB) / -MIN_DB) * (w - 1));
  const ticks = Array.from({ length: 13 }, (_, i) => MIN_DB + i * 5);
  const barWidth = $derived(db == null ? 0 : Math.max(1, x(db)));
</script>

<svg class="meter-svg" class:is-na={na} width={w} height="12" viewBox="0 0 {w} 12" aria-hidden="true">
  {#each ticks as d}
    {@const major = d % 10 === 0}
    <rect class="tick" class:major x={x(d)} y={major ? 2 : 4} width="1" height={major ? 4 : 2} />
  {/each}
  <rect class="base" x="0" y="9" width={w} height="1" />
  {#if !na}
    {#if db != null}
      {#if muted}
        <rect class="bar is-muted" class:is-tx={tx} class:is-idle={!tx} x="0.5" y="7.5" width={barWidth - 1} height="2" />
      {:else}
        <rect class="bar" class:is-tx={tx} x="0" y="8" width={barWidth} height="2" />
      {/if}
      {#if peak != null}<rect class="peak" x={x(peak)} y="2" width="1" height="8" />{/if}
    {/if}
    {#if floor != null}<rect class="floor" x={x(floor)} y="6" width="1" height="4" />{/if}
  {/if}
</svg>

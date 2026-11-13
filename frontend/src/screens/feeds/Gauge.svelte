<script lang="ts">
  /** Small horizontal gauge in the M16 anatomy, for non-dB quantities (HOST card, agent telemetry). */
  interface Props {
    w?: number;
    v: number | null;
    min: number;
    max: number;
    major: number;
    minor: number;
    /** threshold values drawn as dashed lines */
    thr?: number[];
    stale?: boolean;
  }
  let { w = 120, v, min, max, major, minor, thr = [], stale = false }: Props = $props();

  const x = (value: number): number => Math.round(((Math.max(min, Math.min(max, value)) - min) / (max - min)) * (w - 1));
  const ticks = $derived(
    Array.from({ length: Math.floor((max - min) / minor + 1e-9) + 1 }, (_, i) => {
      const value = min + i * minor;
      const k = (value - min) / major;
      return { x: x(value), major: Math.abs(k - Math.round(k)) < 1e-6 };
    }),
  );
</script>

<svg class="fb-gauge" width={w} height="12" viewBox="0 0 {w} 12" aria-hidden="true">
  {#each ticks as t}
    <rect class="tick" x={t.x} y={t.major ? 2 : 4} width="1" height={t.major ? 4 : 2} />
  {/each}
  <rect class="base" x="0" y="9" width={w} height="1" />
  {#each thr as t}
    <path class="thr" d="M{x(t) + 0.5} 0V12" />
  {/each}
  {#if v != null}
    <rect class="bar" class:is-stale={stale} x="0" y="8" width={Math.max(1, x(v))} height="2" />
  {/if}
</svg>

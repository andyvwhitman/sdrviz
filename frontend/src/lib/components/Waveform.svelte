<script lang="ts">
  /** M15 waveform: a 1 px min/max envelope, `env` = [[min, max], ...] in -1..1. Ported from HUD.svg.waveform. */
  interface Props {
    env: [number, number][];
    width: number;
    height: number;
    /** keyed audio: TX orange with glow */
    live?: boolean;
  }
  let { env, width, height, live = false }: Props = $props();

  const path = $derived.by(() => {
    const mid = height / 2;
    const step = width / Math.max(1, env.length);
    return env
      .map(([lo, hi], i) => `M${Math.round(i * step) + 0.5} ${(mid - hi * mid).toFixed(1)}V${(mid - lo * mid).toFixed(1)}`)
      .join("");
  });
</script>

<svg class="wave-svg hud" class:is-live={live} {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
  {#if live}<path class="s-hair k-tx glow-1" d={path} />{/if}
  <path class="s-hair {live ? 'k-tx' : 'k-line'}" d={path} />
</svg>

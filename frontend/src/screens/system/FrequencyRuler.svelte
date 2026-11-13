<script lang="ts">
  /** M2 frequency ruler (spec 5.17). Draws inside an <svg class="hud">; `x`/`y` place it. */
  import { rulerGeometry, snap, type RulerOptions } from "./ruler";

  interface Props extends RulerOptions {
    x?: number;
    y?: number;
  }
  let { x = 0, y = 0, ...options }: Props = $props();

  const geometry = $derived(rulerGeometry(options));
</script>

<g class="ruler" transform="translate({x} {y})">
  <path class="s-hair k-faint" d="M0 {snap(0)}H{options.w}" />
  {#each geometry.ticks as t}
    <path class="s-hair {t.tone === 'line' ? 'k-line' : 'k-faint'}" d="M{t.x} 0V{t.len}" />
  {/each}
  {#each geometry.numerals as n}
    <text class={n.bright ? "tx-num2" : "tx-num"} style="font-size:11px" x={n.x.toFixed(1)} y={n.y} text-anchor="middle">{n.text}</text>
  {/each}
</g>

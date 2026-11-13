<script lang="ts">
  /** M2 frequency ruler across the AAR band. Layout is `rulerLayout`; this draws it. */
  import { rulerLayout, type RulerInput } from "./freqRuler";

  type Props = RulerInput & { dimmed?: boolean };
  let { width, height, hears, bank, extra, majorLabels, dimmed = false }: Props = $props();

  const layout = $derived(rulerLayout({ width, height, hears, bank, extra, majorLabels }));
</script>

<svg class="hud" class:lo-wall-frozen={dimmed} {width} {height} viewBox="0 0 {width} {height}">
  <g class="ruler">
    <path class="s-hair k-faint" d="M0 {Math.round(0) + 0.5}H{width}" />
    {#each layout.ticks as t}
      <path class="s-hair k-{t.tone}" d="M{t.x} 0V{t.length}" />
    {/each}
    {#each layout.labels as l}
      <text class={l.tone === "channel" ? "tx-num2" : "tx-num"} style="font-size:11px" x={l.x} y={l.y} text-anchor="middle">{l.text}</text>
    {/each}
  </g>
</svg>

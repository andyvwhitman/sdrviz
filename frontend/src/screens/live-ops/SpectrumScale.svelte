<script lang="ts">
  /**
   * The spectrum's dB division numerals (E-2 section 5), in the right label margin: one per gridline from the top,
   * `−10` (the reference) in ink-2 and the rest in ink-3, every division when they are 14 px apart or more, else every
   * other one from the top. They replace the old in-plot REF caption.
   */
  import * as fmt from "$lib/hud/fmt";
  import { DB_DIVS, REF_DBFS } from "./wall";

  interface Props {
    /** the plot's width: the numerals start 4 px to its right */
    plotWidth: number;
    margin: number;
    height: number;
    fontPx: number;
  }
  let { plotWidth, margin, height, fontPx }: Props = $props();

  const step = $derived(height / DB_DIVS >= 14 ? 1 : 2);
  const rows = $derived(Array.from({ length: DB_DIVS }, (_, j) => j).filter((j) => j % step === 0));
  /** the top numeral hangs from the top edge so it stays inside the bezel; the rest are centred on their gridline */
  const baseline = (j: number): number => (j === 0 ? fontPx * 0.8 : (height * j) / DB_DIVS + fontPx * 0.35);
</script>

<svg class="hud sc" width={margin} {height} style:left="{plotWidth}px" style:font-size="{fontPx}px" aria-hidden="true">
  {#each rows as j (j)}
    <text x="4" y={baseline(j)} class:is-ref={j === 0}>{fmt.num(REF_DBFS - j * 10, 0)}</text>
  {/each}
</svg>

<style>
  .sc { position: absolute; top: 0; overflow: visible; }
  text { font-family: var(--font-data); fill: var(--ink-3); }
  text.is-ref { fill: var(--ink-2); }
</style>

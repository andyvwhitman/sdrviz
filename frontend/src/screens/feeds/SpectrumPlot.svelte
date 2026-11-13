<script lang="ts">
  /** Feed inspector spectrum: M3 graticule, TX slots, the trace, the M2 ruler (spec 5.30). */
  import { MINUS } from "$lib/hud/fmt";
  import FrequencyRuler from "../system/FrequencyRuler.svelte";
  import RegMark from "../system/RegMark.svelte";
  import { snap } from "../system/ruler";
  import { channelX, dbY, slotWidth, tracePath, type Reception } from "./traces";

  interface Props {
    /** inner width of the inspector */
    width: number;
    /** 28 px left gutter for the axis labels */
    gutter: number;
    /** trace dB per plot pixel, null while the feed delivers no samples */
    trace: number[] | null;
    floorDbfs: number | null;
    receptions: Reception[];
    noSamplesText: string;
    heard: number[];
    bank: number[];
    extraLabels: { x: number; text: string }[];
  }
  let { width, gutter, trace, floorDbfs, receptions, noSamplesText, heard, bank, extraLabels }: Props = $props();

  const HEIGHT = 96;
  const RULER_H = 40;
  const plotW = $derived(width - gutter);
  const slot = $derived(slotWidth(plotW));

  const vLines = $derived(Array.from({ length: 9 }, (_, i) => `M${snap((plotW * (i + 1)) / 10)} 0V${HEIGHT}`).join(""));
  const hLines = $derived(Array.from({ length: 7 }, (_, j) => `M0 ${snap((HEIGHT * (j + 1)) / 8)}H${plotW}`).join(""));
  /** minor ticks on the centre axes only */
  const minor = $derived(
    Array.from({ length: 49 }, (_, i) => `M${snap((plotW * (i + 1)) / 50)} ${HEIGHT / 2 - 2}v4`).join("") +
      Array.from({ length: 39 }, (_, j) => `M${plotW / 2 - 2} ${snap((HEIGHT * (j + 1)) / 40)}h4`).join(""),
  );
  const path = $derived(trace ? tracePath(trace, HEIGHT) : "");
</script>

<svg class="hud fb-svg" {width} height={HEIGHT + RULER_H} viewBox="0 0 {width} {HEIGHT + RULER_H}">
  {#each [-20, -40, -60] as db}
    <text class="num" x={gutter - 4} y={dbY(db, HEIGHT) + 4} text-anchor="end">{MINUS}{-db}</text>
  {/each}
  <g transform="translate({gutter} 0)">
    <rect x="0" y="0" width={plotW} height={HEIGHT} fill="var(--bg-void)" />
    <g class="graticule"><path class="s-hair k-grid" d={vLines + hLines} /><path class="s-hair k-faint" d={minor} /></g>
    <text class="num" x={plotW - 6} y="14" text-anchor="end">10 dB/div · 135 kHz/div</text>
    {#each receptions as rx}
      {@const x = gutter + channelX(rx.channel, plotW) - gutter - slot / 2}
      <rect class="f-wash-tx-plot" x={x.toFixed(1)} y="0" width={slot.toFixed(1)} height={HEIGHT} />
      <rect class="s-hair k-tx" x={Math.round(x) + 0.5} y="0.5" width={Math.max(1, Math.round(slot) - 1)} height={HEIGHT - 1} />
    {/each}
    {#if trace}
      <path class="s-emph k-line glow-1" d={path} /><path class="s-emph k-line" d={path} />
      {#if floorDbfs != null}<path class="s-hair k-idle-dim" d="M0 {dbY(floorDbfs, HEIGHT) + 0.5}h6" />{/if}
    {:else}
      <text class="lab" x={plotW / 2} y={HEIGHT / 2 + 4} text-anchor="middle">{noSamplesText}</text>
    {/if}
    <rect class="s-hair k-faint" x="0.5" y="0.5" width={plotW - 1} height={HEIGHT - 1} />
    <RegMark x={0} y={0} />
    <FrequencyRuler y={HEIGHT} w={plotW} h={RULER_H} hears={heard} {bank} {extraLabels} />
  </g>
</svg>

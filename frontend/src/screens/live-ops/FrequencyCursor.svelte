<script lang="ts">
  /**
   * Hover readout for the front wall: a hairline through the spectrum and waterfall, a diamond on the
   * ruler, and the frequency under the pointer (plus the nearest AAR channel) just below the ruler.
   * Purely visual: it ignores the pointer, FrontWall tracks it.
   */
  import { BAND, chToMhz, mhzToCh } from "$lib/hud/band";
  import type { Channel } from "$lib/types/live";
  import { boxStyle, type Box } from "./geometry";

  interface Props {
    /** pointer x inside the plots, in pixels */
    x: number;
    spectrum: Box;
    ruler: Box;
    waterfall: Box;
    channels: Channel[];
  }
  let { x, spectrum, ruler, waterfall, channels }: Props = $props();

  const [left, top, width] = $derived(spectrum);
  const height = $derived(waterfall[1] + waterfall[3] - top);
  const rulerTop = $derived(ruler[1] - top);
  const rulerBottom = $derived(rulerTop + ruler[3]);
  const px = $derived(Math.round(Math.min(width - 1, Math.max(0, x))) + 0.5);

  const mhz = $derived(BAND.lo + (px / (width - 1)) * (BAND.hi - BAND.lo));
  const ch = $derived(mhzToCh(mhz));
  const onSlot = $derived(ch >= BAND.first && ch <= BAND.last && Math.abs(mhz - chToMhz(ch)) <= BAND.step / 2);
  const aar = $derived(`CH${String(ch).padStart(2, "0")}`);
  const label = $derived(onSlot ? channels.find((c) => c.aar === aar)?.label : undefined);
  const text = $derived(`${mhz.toFixed(4)} MHZ` + (onSlot ? ` · ${aar}` : "") + (label ? ` ${label.toUpperCase()}` : ""));

  /* keep the readout inside the plot near either edge */
  const anchor = $derived(px < 140 ? "start" : px > width - 140 ? "end" : "middle");
  const textX = $derived(anchor === "start" ? px + 8 : anchor === "end" ? px - 8 : px);
  const textY = $derived(rulerBottom + 16);
  const backW = $derived(text.length * 7.4 + 12);
  const backX = $derived(anchor === "start" ? textX - 6 : anchor === "end" ? textX - backW + 6 : textX - backW / 2);
</script>

<div class="lo-box lo-cursor" style={boxStyle([left, top, width, height])}>
  <svg class="hud" {width} {height} viewBox="0 0 {width} {height}">
    <path class="s-hair k-select d-measure" d="M{px} 0V{rulerTop - 5}M{px} {rulerBottom}V{height}" />
    <path class="f-void s-emph k-select" d="M{px} {rulerTop - 5}L{px + 5} {rulerTop}L{px} {rulerTop + 5}L{px - 5} {rulerTop}Z" />
    <path class="s-hair k-select" d="M{px - 4} {rulerBottom - 4}L{px} {rulerBottom}L{px + 4} {rulerBottom - 4}" />
    <rect class="f-void lo-cursor__back" x={backX} y={textY - 12} width={backW} height="17" />
    <text class="tx-data lo-cursor__text" x={textX} y={textY} text-anchor={anchor}>{text}</text>
  </svg>
</div>

<style>
  .lo-cursor { pointer-events: none; z-index: 2; }
  .lo-cursor svg { position: absolute; left: 0; top: 0; overflow: visible; }
  .lo-cursor__back { fill-opacity: 0.85; }
  .hud .lo-cursor__text { font-weight: 500; fill: var(--ink); letter-spacing: 0.04em; }
</style>

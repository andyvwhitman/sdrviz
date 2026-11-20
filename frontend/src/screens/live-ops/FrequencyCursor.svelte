<script lang="ts">
  /**
   * Hover readout for the front wall: a hairline through the spectrum and waterfall, a diamond on the
   * ruler, and the frequency under the pointer (plus the nearest AAR channel) just below the ruler.
   * Purely visual: it ignores the pointer, FrontWall tracks it. After a dwell on a slot the second line says what a press does.
   */
  import { BAND, chToMhz, mhzToCh } from "$lib/hud/band";
  import * as fmt from "$lib/hud/fmt";
  import type { Channel } from "$lib/types/live";
  import { dwellHint } from "./gesture";
  import { boxStyle, type Box } from "./wall";

  interface Props {
    isAdmin?: boolean;
    /** show the dwell hint (not on the phone, not while listening) */
    hints?: boolean;
    /** pointer x inside the plots, in pixels */
    x: number;
    spectrum: Box;
    ruler: Box;
    waterfall: Box;
    channels: Channel[];
    /** replaces the frequency readout (the phone's held touch also reads the level) */
    readout?: string;
  }
  let { x, spectrum, ruler, waterfall, channels, isAdmin = false, hints = true, readout }: Props = $props();

  /** how far the cursor reaches into the ruler: a labelled tick (8 px) and 2 */
  const STUB = 10;
  const [left, top, width] = $derived(spectrum);
  const height = $derived(waterfall[1] + waterfall[3] - top);
  const rulerTop = $derived(ruler[1] - top);
  const rulerBottom = $derived(rulerTop + ruler[3]);
  const px = $derived(Math.round(Math.min(width - 1, Math.max(0, x))) + 0.5);

  const mhz = $derived(BAND.lo + (px / (width - 1)) * (BAND.hi - BAND.lo));
  const ch = $derived(mhzToCh(mhz));
  const onSlot = $derived(ch >= BAND.first && ch <= BAND.last && Math.abs(mhz - chToMhz(ch)) <= BAND.step / 2);
  const aar = $derived(fmt.ch(ch));
  const channel = $derived(onSlot ? channels.find((c) => c.aar === aar) : undefined);
  const label = $derived(channel && channel.label.toUpperCase() !== aar ? channel.label : undefined);
  const text = $derived(readout ?? `${mhz.toFixed(4)} MHz` + (onSlot ? ` \u00b7 ${aar}` : "") + (label ? ` ${label.toUpperCase()}` : ""));

  /* the instruction appears after a short dwell on a slot, so a sweep across the band reads only the frequency */
  const DWELL_MS = 600;
  let dwelled = $state(false);
  $effect(() => {
    dwelled = false;
    if (!onSlot) return;
    const timer = setTimeout(() => (dwelled = true), DWELL_MS);
    return () => clearTimeout(timer);
  });

  const hint = $derived(dwelled && hints && onSlot ? dwellHint(channel !== undefined, isAdmin) : null);

  /* keep the readout inside the plot near either edge, and clear of the waterfall's time-axis labels */
  const AXIS_GUTTER = 56;
  const anchor = $derived(px < 140 ? "start" : px > width - 140 ? "end" : "middle");
  const textX = $derived(anchor === "start" ? Math.max(px + 8, AXIS_GUTTER) : anchor === "end" ? px - 8 : px);
  const textY = $derived(rulerBottom + 16);
  const textW = $derived(Math.max(text.length * 7.4, (hint?.length ?? 0) * 7.6) + 12);
  const backX = $derived(anchor === "start" ? textX - 6 : anchor === "end" ? textX - textW + 6 : textX - textW / 2);
</script>

<div class="lo-box lo-cursor" style={boxStyle([left, top, width, height])}>
  <svg class="hud" {width} {height} viewBox="0 0 {width} {height}">
    <!-- column marks stop at the spectrum's bottom edge and resume at the waterfall's top; in the ruler the cursor
         only reaches its own tick (E-2 section 8) -->
    <path class="s-hair k-select d-measure" d="M{px} 0V{rulerTop}M{px} {rulerBottom}V{height}" />
    <path class="s-hair k-select" d="M{px} {rulerBottom}V{rulerBottom - STUB}" />
    <path class="s-hair k-select" d="M{px - 4} {rulerBottom - 4}L{px} {rulerBottom}L{px + 4} {rulerBottom - 4}" />
    <rect class="f-void lo-cursor__back" x={backX} y={textY - 12} width={textW} height={hint ? 36 : 17} />
    <text class="tx-data lo-cursor__text" x={textX} y={textY} text-anchor={anchor}>{text}</text>
    {#if hint}
      <text class="lo-cursor__hint" x={textX} y={textY + 18} text-anchor={anchor}>{hint}</text>
    {/if}
  </svg>
</div>

<style>
  .lo-cursor { pointer-events: none; z-index: 2; }
  .lo-cursor svg { position: absolute; left: 0; top: 0; overflow: visible; }
  .lo-cursor__back { fill-opacity: 0.85; }
  .hud .lo-cursor__text { font-weight: 500; fill: var(--ink); letter-spacing: 0.04em; }
  .hud .lo-cursor__hint { fill: var(--ink-3); font: 500 var(--fs-11) var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; }
</style>

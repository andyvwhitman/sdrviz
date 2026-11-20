<script lang="ts">
  /**
   * The bracket round a channel that is being listened to (direction 5.2): two lines at the slot edges through the
   * spectrum and the waterfall (not through the ruler text), with corner arms at the top and the bottom. Dashed while
   * the node is tuning, solid once it listens. White: the user's own selection, not a transmission.
   */
  import { BAND, chToMhz } from "$lib/hud/band";
  import { bandX, boxStyle, slotWidth, type Box } from "./wall";

  interface Props {
    channel: number;
    tuning: boolean;
    spectrum: Box;
    ruler: Box;
    waterfall: Box;
  }
  let { channel, tuning, spectrum, ruler, waterfall }: Props = $props();

  const ARM = 8;
  const [left, top, width] = $derived(spectrum);
  const height = $derived(waterfall[1] + waterfall[3] - top);
  const rulerTop = $derived(ruler[1] - top);
  const rulerBottom = $derived(rulerTop + ruler[3]);
  const half = $derived(slotWidth(width) / 2);
  const centre = $derived(bandX(chToMhz(Math.min(BAND.last, Math.max(BAND.first, channel))), width));
  const x0 = $derived(Math.round(centre - half) + 0.5);
  const x1 = $derived(Math.round(centre + half) + 0.5);
</script>

<div class="lo-box hm" style={boxStyle([left, top, width, height])}>
  <svg class="hud" {width} {height} viewBox="0 0 {width} {height}">
    <!-- each half draws on from the ruler outward -->
    <g class="hm__up" style="transform-origin: 0 {rulerTop}px">
      <path class="s-emph k-select" class:d-measure={tuning} d="M{x0 + ARM} 0.75H{x0}V{rulerTop}M{x1 - ARM} 0.75H{x1}V{rulerTop}" />
    </g>
    <g class="hm__down" style="transform-origin: 0 {rulerBottom}px">
      <path class="s-emph k-select" class:d-measure={tuning} d="M{x0} {rulerBottom}V{height - 0.75}H{x0 + ARM}M{x1} {rulerBottom}V{height - 0.75}H{x1 - ARM}" />
    </g>
  </svg>
</div>

<style>
  .hm { pointer-events: none; z-index: 2; }
  .hm svg { position: absolute; left: 0; top: 0; overflow: visible; }
  .hm__up, .hm__down { animation: hm-draw var(--t-commit) ease-out; }
  @keyframes hm-draw { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  @media (prefers-reduced-motion: reduce) { .hm__up, .hm__down { animation: none; } }
</style>

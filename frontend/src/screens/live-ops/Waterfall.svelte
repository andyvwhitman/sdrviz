<script lang="ts">
  /**
   * Live waterfall (spec 5.30): canvas, newest row on top, 2 rows per second, the shared single-hue
   * ramp clamped just under the floor and just over the strongest signal in view. A faulted or
   * stale feed freezes the wall at its last sample. After a link drop the rows newer than the drop
   * never arrived: they stay void above a dash-offline edge (brief 8.6).
   */
  import { untrack } from "svelte";
  import { RAMP } from "$lib/hud/ramp";
  import { spectrum } from "$lib/stores/spectrum.svelte";
  import { BAND } from "$lib/hud/band";
  import type { Snippet } from "svelte";
  import { WaterfallModel, NO_SAMPLE_DBFS } from "./waterfallModel.svelte";
  import { bandX, hash, rampClamp, slotWidth, type Carrier } from "./wall";

  interface Props {
    width: number;
    height: number;
    feedId: string;
    floor: number;
    carriers: Carrier[];
    live: boolean;
    /** seconds since the backend link dropped, null while it is up */
    dropAge: number | null;
    /** the ramp clamp in dBFS, reported for the LOFAR legend */
    clamp?: { lo: number; hi: number };
    children?: Snippet;
  }
  let { width, height, feedId, floor, carriers, live, dropAge, clamp = $bindable({ lo: 0, hi: 0 }), children }: Props = $props();

  const rampRgb = RAMP.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const colour = (t: number): number[] => {
    const x = Math.min(1, Math.max(0, t)) * (rampRgb.length - 1);
    const i = Math.min(rampRgb.length - 2, Math.floor(x));
    return rampRgb[i].map((v, k) => v + (rampRgb[i + 1][k] - v) * (x - i));
  };

  const model = new WaterfallModel(untrack(() => height));
  let canvas = $state<HTMLCanvasElement>();

  $effect(() => {
    model.load(feedId);
  });
  $effect(() => {
    const frame = spectrum.latest;
    if (frame && live) untrack(() => model.push(frame));
  });

  /** `height` rows in the canvas; the backend provides oldest first, row 0 on screen is the newest. */
  function draw(): void {
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const image = ctx.createImageData(width, height);
    const rows = model.rows;
    const void0 = rampRgb[0];
    const gap = dropAge == null ? 0 : Math.min(height, Math.ceil(dropAge * 2));

    // band x -> bin of the feed's span
    const lo = model.centerMhz - model.spanMhz / 2;
    const binCount = rows[0]?.bins.length ?? 0;
    const binOf = Int16Array.from({ length: width }, (_, x) => {
      const mhz = BAND.lo + (x / (width - 1)) * (BAND.hi - BAND.lo);
      return Math.min(binCount - 1, Math.max(0, Math.round(((mhz - lo) / model.spanMhz) * binCount)));
    });

    let strongest = -Infinity;
    for (const row of rows) for (let x = 0; x < width; x += 4) strongest = Math.max(strongest, row.bins[binOf[x]]);
    const { lo: low, hi: high } = rampClamp(floor, Number.isFinite(strongest) ? strongest : null);
    if (clamp.lo !== low || clamp.hi !== high) clamp = { lo: low, hi: high };

    for (let r = 0; r < height; r++) {
      const row = rows[rows.length - 1 - r];
      for (let x = 0; x < width; x++) {
        const p = (r * width + x) * 4;
        let rgb = void0;
        if (r >= gap) {
          let v = row ? row.bins[binOf[x]] : floor + (hash(x, r) - 0.5) * 4;
          if (v <= NO_SAMPLE_DBFS) v = floor + (hash(x, r) - 0.5) * 4; // a frozen feed shows its floor, not black
          rgb = colour((v - low) / (high - low));
        }
        image.data[p] = rgb[0];
        image.data[p + 1] = rgb[1];
        image.data[p + 2] = rgb[2];
        image.data[p + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    if (gap) {
      ctx.save();
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--state-stale").trim();
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 5]);
      ctx.beginPath();
      ctx.moveTo(0, gap + 0.5);
      ctx.lineTo(width, gap + 0.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  $effect(() => {
    void model.rows;
    void floor;
    void dropAge;
    void canvas;
    draw();
  });

  const slot = $derived(slotWidth(width));
  const ticks = $derived(Array.from({ length: Math.floor((height / 2 - 1) / 10) }, (_, i) => (i + 1) * 10));
  const snap = (v: number) => Math.round(v) + 0.5;
</script>

<div class="lo-plot lo-fall" class:lo-wall-frozen={!live}>
  <canvas bind:this={canvas} {width} {height}></canvas>
  <svg class="hud" {width} {height}>
    {#each carriers as c (c.channel)}
      {@const x0 = Math.round(bandX(c.mhz, width) - slot / 2)}
      {@const rows = Math.min(height, Math.round(c.elapsedS * 2))}
      {#if rows > 0}
        <rect class="f-wash-tx-plot" x={x0} y="0" width={Math.round(slot)} height={rows} />
        <rect class="s-hair k-tx" x={x0 + 0.5} y="0.5" width={Math.round(slot) - 1} height={Math.max(0, rows - 1)} />
      {/if}
    {/each}
    {#each ticks as sec}
      {@const major = sec % 20 === 0}
      <path class="s-hair {major ? 'k-line' : 'k-faint'}" d="M1 {snap(sec * 2)}H{major ? 9 : 5}" />
      {#if major}<text class="tx-num" x="13" y={snap(sec * 2) + 4}>{sec} S</text>{/if}
    {/each}
  </svg>
  <span class="lo-bezel"></span>
  {@render children?.()}
</div>

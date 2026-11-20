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
  import { WaterfallModel, NO_SAMPLE_DBFS, PX_PER_S, ROW_PX, rowsFor, secondsFor } from "./waterfallModel.svelte";
  import { bandX, rampClamp, slotWidth, type Carrier } from "./wall";

  interface Props {
    /** the box, in CSS px (the parent measures it once) */
    width: number;
    height: number;
    feedId: string;
    floor: number;
    carriers: Carrier[];
    live: boolean;
    /** seconds since the backend link dropped, null while it is up */
    dropAge: number | null;
    /** the box is being dragged to a new size: keep the canvas as drawn (CSS-stretched) and redraw once on release */
    frozen?: boolean;
    /** the ramp clamp in dBFS, reported for the LOFAR legend */
    clamp?: { lo: number; hi: number };
    children?: Snippet;
  }
  let { width, height, feedId, floor, carriers, live, dropAge, frozen = false, clamp = $bindable({ lo: 0, hi: 0 }), children }: Props = $props();

  const rampRgb = RAMP.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const colour = (t: number): number[] => {
    const x = Math.min(1, Math.max(0, t)) * (rampRgb.length - 1);
    const i = Math.min(rampRgb.length - 2, Math.floor(x));
    return rampRgb[i].map((v, k) => v + (rampRgb[i + 1][k] - v) * (x - i));
  };

  const model = new WaterfallModel();
  let canvas = $state<HTMLCanvasElement>();
  /** device pixels per CSS pixel: the canvas backing store is `css px x ratio` */
  let ratio = $state(devicePixelRatio || 1);
  /** the size the canvas was last drawn for: it follows the box except while the box is being dragged */
  let drawnFor = $state.raw(untrack(() => ({ width, height })));
  $effect(() => {
    if (!frozen) drawnFor = { width, height };
  });
  const backW = $derived(Math.max(1, Math.round(drawnFor.width * ratio)));
  const backH = $derived(Math.max(1, Math.round(drawnFor.height * ratio)));

  $effect(() => {
    model.load(feedId);
  });
  $effect(() => {
    model.grow(rowsFor(drawnFor.height));
  });
  $effect(() => {
    const frame = spectrum.latest;
    if (frame && live) untrack(() => model.push(frame));
  });

  /** One source row is ROW_PX CSS pixels tall; the backend provides oldest first, row 0 on screen is the newest. */
  function draw(): void {
    const ctx = canvas?.getContext("2d");
    const { width, height } = drawnFor;
    if (!ctx || !canvas || width < 2 || height < 2) return;
    const image = ctx.createImageData(backW, backH);
    const rows = model.rows;
    const rowH = ROW_PX * ratio;
    const gap = dropAge == null ? 0 : Math.min(backH, Math.ceil(dropAge * PX_PER_S * ratio));

    // canvas x -> bin of the feed's span
    const lo = model.centerMhz - model.spanMhz / 2;
    const binCount = rows[0]?.bins.length ?? 0;
    const cssX = (x: number) => Math.min(width - 1, Math.floor(x / ratio));
    const binOf = Int16Array.from({ length: backW }, (_, x) => {
      const mhz = BAND.lo + (cssX(x) / (width - 1)) * (BAND.hi - BAND.lo);
      return Math.min(binCount - 1, Math.max(0, Math.round(((mhz - lo) / model.spanMhz) * binCount)));
    });

    let strongest = -Infinity;
    for (const row of rows) for (let x = 0; x < backW; x += 4 * ratio) strongest = Math.max(strongest, row.bins[binOf[Math.floor(x)]]);
    const { lo: low, hi: high } = rampClamp(floor, Number.isFinite(strongest) ? strongest : null);
    if (clamp.lo !== low || clamp.hi !== high) clamp = { lo: low, hi: high };

    // each source row is coloured once, then copied into the pixel rows it covers
    const line = new Uint8ClampedArray(backW * 4);
    const void0 = rampRgb[0];
    const fillLine = (source: number): void => {
      const row = rows[rows.length - 1 - source];
      for (let x = 0; x < backW; x++) {
        // history that never happened is void: a row the model does not hold, or a bin the receiver never delivered
        const v = row ? row.bins[binOf[x]] : NO_SAMPLE_DBFS;
        const rgb = v <= NO_SAMPLE_DBFS ? void0 : colour((v - low) / (high - low));
        line.set([rgb[0], rgb[1], rgb[2], 255], x * 4);
      }
    };
    let filled = -1;
    for (let y = 0; y < backH; y++) {
      if (y < gap) {
        for (let x = 0; x < backW; x++) image.data.set([void0[0], void0[1], void0[2], 255], (y * backW + x) * 4);
        continue;
      }
      const source = Math.floor(y / rowH);
      if (source !== filled) (fillLine(source), (filled = source));
      image.data.set(line, y * backW * 4);
    }
    ctx.putImageData(image, 0, 0);
    if (gap) {
      ctx.save();
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--state-stale").trim();
      ctx.lineWidth = ratio;
      ctx.setLineDash([ratio, 5 * ratio]);
      ctx.beginPath();
      ctx.moveTo(0, gap + 0.5 * ratio);
      ctx.lineTo(backW, gap + 0.5 * ratio);
      ctx.stroke();
      ctx.restore();
    }
  }

  $effect(() => {
    void model.rows;
    void floor;
    void dropAge;
    void canvas;
    void backW;
    void backH;
    draw();
  });

  // dragging a window between monitors changes the ratio
  $effect(() => {
    const query = matchMedia(`(resolution: ${ratio}dppx)`);
    const changed = () => (ratio = devicePixelRatio || 1);
    query.addEventListener("change", changed, { once: true });
    return () => query.removeEventListener("change", changed);
  });

  const slot = $derived(slotWidth(width));
  /** time ticks: every 5 s (labelled every 10 s) while under a minute shows, then every 10 s (labelled every 30 s) */
  const ticks = $derived.by(() => {
    const long = secondsFor(height) >= 60;
    const [minor, major] = long ? [10, 30] : [5, 10];
    return Array.from({ length: Math.floor((secondsFor(height) - 1) / minor) }, (_, i) => ({ sec: (i + 1) * minor, major: ((i + 1) * minor) % major === 0 }));
  });
  const snap = (v: number) => Math.round(v) + 0.5;
</script>

<div class="lo-plot lo-fall" class:lo-wall-frozen={!live}>
  <canvas bind:this={canvas} width={backW} height={backH}></canvas>
  <svg class="hud" {width} {height}>
    {#each carriers as c (c.channel)}
      {@const x0 = Math.round(bandX(c.mhz, width) - slot / 2)}
      {@const rows = Math.min(height, Math.round(c.elapsedS * PX_PER_S))}
      {#if rows > 0}
        <rect class="f-wash-tx-plot" x={x0} y="0" width={Math.round(slot)} height={rows} />
        <rect class="s-hair k-tx" x={x0 + 0.5} y="0.5" width={Math.round(slot) - 1} height={Math.max(0, rows - 1)} />
      {/if}
    {/each}
    {#each ticks as { sec, major }}
      <path class="s-hair {major ? 'k-line' : 'k-faint'}" d="M1 {snap(sec * PX_PER_S)}H{major ? 9 : 5}" />
      {#if major}<text class="tx-num wf-t" x="13" y={snap(sec * PX_PER_S) + 4}>{sec} S</text>{/if}
    {/each}
  </svg>
  <span class="lo-bezel"></span>
  {@render children?.()}
</div>

<style>
  /* the time labels sit on data: a void halo keeps them readable */
  .wf-t { paint-order: stroke; stroke: var(--bg-void); stroke-width: 3px; stroke-linejoin: round; }
</style>

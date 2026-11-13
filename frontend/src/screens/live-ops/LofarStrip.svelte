<script lang="ts">
  /**
   * LOFAR strip (spec 5.30): LAST 60 MIN (48 at 1440) of 30 s max-hold rows, one 2 px column per AAR
   * channel, through the shared `lofarT` mapping so Live Ops, Feeds and System read alike. Also draws
   * the ramp legend above it and the mini ruler. Rows newer than a link drop stay void.
   */
  import { BAND } from "$lib/hud/band";
  import * as fmt from "$lib/hud/fmt";
  import { lofarT, rampColor } from "$lib/hud/ramp";
  import { boxStyle, type Box } from "./geometry";
  import type { Lofar } from "$lib/types/live";
  import { lofarCells } from "./lofarCells";
  import { hash } from "./wall";

  interface Props {
    lofar: Lofar;
    feedId: string;
    feedShort: string;
    floor: number;
    heard: number[];
    rows: number;
    boxes: { head: Box; ruler: Box; strip: Box };
    rampTop: number;
    clamp: { lo: number; hi: number };
    rowSeconds: number;
    dropAge: number | null;
    dimmed: boolean;
  }
  let { lofar, feedId, feedShort, floor, heard, rows, boxes, rampTop, clamp, rowSeconds, dropAge, dimmed }: Props = $props();

  const WIDTH = 184;
  let canvas = $state<HTMLCanvasElement>();

  function draw(): void {
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const cells = lofarCells(lofar, feedId);
    const heardSet = new Set(heard);
    const gap = dropAge == null ? 0 : Math.min(rows, Math.ceil(dropAge / rowSeconds));
    ctx.clearRect(0, 0, WIDTH, rows);
    for (let ch = BAND.first; ch <= BAND.last; ch++) {
      const x = 1 + (ch - BAND.first) * 2;
      for (let r = gap; r < rows; r++) {
        ctx.fillStyle = rampColor(lofarT(floor + (hash(ch * 31, r) - 0.5) * (heardSet.has(ch) ? 4 : 3)));
        ctx.fillRect(x, r, 2, 1);
      }
      for (const [row, db] of cells.get(ch) ?? []) {
        if (row < rows && row >= gap) {
          ctx.fillStyle = rampColor(lofarT(db));
          ctx.fillRect(x, row, 2, 1);
        }
      }
    }
    if (gap) {
      ctx.save();
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--state-stale").trim();
      ctx.setLineDash([1, 5]);
      ctx.beginPath();
      ctx.moveTo(0, gap + 0.5);
      ctx.lineTo(WIDTH, gap + 0.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  $effect(() => {
    void feedId;
    void floor;
    void dropAge;
    void canvas;
    void lofarCells(lofar, feedId);
    draw();
  });

  const minutes = $derived((rows * rowSeconds) / 60);
  const snap = (v: number) => Math.round(v) + 0.5;
  const markers = Array.from({ length: 9 }, (_, i) => (i + 1) * 10);
  const noteTop = $derived(rampTop + 10);
</script>

<div class="lo-box lo-lofar-head" class:lo-wall-frozen={dimmed} style={boxStyle(boxes.head)}>
  <span class="lo-scale" style="left:0;top:0">WATERFALL RAMP · dBFS</span>
  <span class="lo-ramp" style:top="{rampTop}px"></span>
  <span class="lo-scale" style="left:0;top:{noteTop}px"><span class="mono">{fmt.num(clamp.lo, 0)}</span></span>
  <span class="lo-scale" style="right:0;top:{noteTop}px"><span class="mono">{fmt.num(clamp.hi, 0)}</span></span>
  <span class="lo-scale" style="left:0;bottom:4px">LAST {minutes} MIN</span>
  <span class="lo-scale" style="right:0;bottom:4px">{feedShort}</span>
</div>
<div class="lo-box lo-plot" class:lo-wall-frozen={dimmed} style={boxStyle(boxes.ruler)}>
  <svg class="hud" width={WIDTH} height="16">
    {#each markers as ch}
      {@const x = snap(1 + (ch - BAND.first) * 2 + 1)}
      {@const major = ch % 20 === 10}
      <path class="s-hair {major ? 'k-line' : 'k-faint'}" d="M{x} 16V{major ? 10 : 12}" />
      {#if major}<text class="tx-num" {x} y="9" text-anchor="middle">{ch}</text>{/if}
    {/each}
  </svg>
</div>
<div class="lo-box lo-plot lo-lofar" class:lo-wall-frozen={dimmed} style={boxStyle(boxes.strip)}>
  <canvas bind:this={canvas} width={WIDTH} height={rows}></canvas>
  <span class="lo-bezel"></span>
</div>

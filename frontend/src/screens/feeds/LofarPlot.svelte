<script lang="ts">
  /**
   * Feed inspector waterfall: the last 60 minutes as LOFAR rows, newest at top. A row with samples is
   * painted with the feed's floor in one flat ramp tone, a row without stays void behind a dotted edge.
   */
  import * as fmt from "$lib/hud/fmt";
  import { rampColor, lofarT } from "$lib/hud/ramp";
  import RegMark from "../system/RegMark.svelte";
  import { snap } from "../system/ruler";
  import { channelX, runsOf, slotWidth, type Cells, type Reception } from "./traces";

  interface Props {
    width: number;
    gutter: number;
    rows: number;
    rowS: number;
    cells: Cells;
    sampled: boolean[];
    floorDbfs: number | null;
    /** AAR channels to draw guides for */
    guides: number[];
    /** live key-ups on this feed, for the TX slot carried down from the spectrum */
    receptions: (Reception & { elapsedS: number })[];
    /** the sim clock in seconds of day, for the void run labels */
    nowS: number;
    zone: string;
    /** no samples now: the first void run reads "NO SAMPLES SINCE hh:mm:ss" */
    measured: boolean;
    sinceClock: string;
  }
  let { width, gutter, rows, rowS, cells, sampled, floorDbfs, guides, receptions, nowS, zone, measured, sinceClock }: Props = $props();

  /** the data rows sit 1 px inside the plot frame: no hairline ever covers the newest row */
  const INSET = 1;
  const plotW = $derived(width - gutter);
  const slot = $derived(slotWidth(plotW));
  const runs = $derived(runsOf(sampled));
  const floorFill = $derived(floorDbfs == null ? null : rampColor(lofarT(floorDbfs)));
  const guidePath = $derived(
    runs
      .filter((run) => run.sampled)
      .map((run) =>
        guides
          .map((ch) => {
            const x = channelX(ch, plotW);
            return `M${snap(x - slot / 2)} ${run.from}V${run.to}M${snap(x + slot / 2)} ${run.from}V${run.to}`;
          })
          .join(""),
      )
      .join(""),
  );
  const cellRects = $derived(
    Object.entries(cells).flatMap(([ch, list]) =>
      list.filter(([row]) => sampled[row]).map(([row, level]) => ({ x: channelX(+ch, plotW) - slot / 2, y: row, fill: rampColor(lofarT(level)) })),
    ),
  );
  const voidRuns = $derived(
    runs
      .filter((run) => !run.sampled)
      .map((run) => {
        const edges = run.to - run.from <= 2 ? [run.from + 0.5] : [run.from > 0 ? run.from + 0.5 : null, run.to < rows ? run.to - 0.5 : null].filter((y): y is number => y != null);
        const hm = (row: number): string => fmt.clock(nowS - row * rowS, zone).slice(0, 5);
        const words = run.from === 0 && !measured ? `NO SAMPLES SINCE ${sinceClock}` : `NO SAMPLES · ${hm(run.to)}–${hm(run.from)}`;
        return { edges, words, y: Math.min(rows - 4, run.to + 14) };
      }),
  );
</script>

<svg class="hud fb-svg" {width} height={rows + 2 * INSET} viewBox="0 0 {width} {rows + 2 * INSET}">
  {#each Array.from({ length: Math.ceil(rows / 30) - 1 }, (_, i) => (i + 1) * 30) as r}
    <path class="s-hair k-faint" d="M{gutter - 3} {r + INSET + 0.5}h3" />
    <text class="num" x={gutter - 5} y={r + INSET + 4} text-anchor="end">{(r * rowS) / 60}M</text>
  {/each}
  <g transform="translate({gutter} {INSET})">
    <rect x="0" y="0" width={plotW} height={rows} fill="var(--bg-void)" />
    {#if floorFill}
      {#each runs.filter((run) => run.sampled) as run}
        <rect x="0" y={run.from} width={plotW} height={run.to - run.from} fill={floorFill} />
      {/each}
    {/if}
    {#if guidePath}<path class="s-hair k-grid" d={guidePath} />{/if}
    {#each receptions as rx}
      {@const x = channelX(rx.channel, plotW) - slot / 2}
      {@const h = Math.min(rows, Math.max(4, Math.ceil(rx.elapsedS / rowS)))}
      <rect class="f-wash-tx-plot" x={x.toFixed(1)} y="0" width={slot.toFixed(1)} height={h} />
      <path class="s-hair k-tx" d="M{Math.round(x) + 0.5} 0V{h - 0.5}H{Math.round(x) + 0.5 + Math.max(1, Math.round(slot) - 1)}V0" />
    {/each}
    {#each cellRects as c}
      <rect x={c.x.toFixed(1)} y={c.y} width={slot.toFixed(1)} height="1" fill={c.fill} />
    {/each}
    {#each voidRuns as run}
      {#each run.edges as y}<path class="s-hair k-stale d-offline" d="M0 {y}H{plotW}" />{/each}
      <text class="lab" x={plotW - 8} y={run.y} text-anchor="end">{run.words}</text>
    {/each}
    <rect class="s-hair k-faint" x="0.5" y="-0.5" width={plotW - 1} height={rows + 1} />
    <RegMark x={0} y={-1} />
  </g>
</svg>

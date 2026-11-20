<script lang="ts">
  /**
   * Live spectrum trace (spec 5.30, brief 9.1.2): M3 graticule (10 dB/div, 135 kHz/div), M17 squelch
   * lines, TX slots, the trace itself and the M13 sweep. The trace comes from the watched feed's
   * binary frames; when the feed delivers none (fault, stale, first paint) it is drawn at the noise
   * floor with the same deterministic ripple the mockup uses, in the stale tone.
   */
    import { BAND } from "$lib/hud/band";
  import { SQUELCH_OVER_FLOOR_DB } from "$lib/hud/tile";
  import { spectrum } from "$lib/stores/spectrum.svelte";
    import RegMark from "./RegMark.svelte";
  import { bandX, DB_DIVS, frameDbAt, hash, nfmShape, REF_DBFS, slotWidth, xToMhz, type Carrier } from "./wall";

  interface Props {
    width: number;
    height: number;
    floor: number;
    /** channel numbers the displayed feed hears */
    heard: number[]; // AAR numbers; two bank channels can share one
    carriers: Carrier[];
    /** the displayed feed delivers samples */
    live: boolean;
    /** the sweep runs: nothing keyed, no squelch open, link up */
    sweeping: boolean;
    /** age of the last sample, shown on a frozen wall */
    frozenAge?: string | null;
    /** no data yet: graticule and bezel only */
    blank?: boolean;
  }
  let { width, height, floor, heard, carriers, live, sweeping, frozenAge = null, blank = false }: Props = $props();

  const snap = (v: number) => Math.round(v) + 0.5;
  const yDb = (db: number) => ((REF_DBFS - db) / (DB_DIVS * 10)) * height;
  const slot = $derived(slotWidth(width));

  const grid = $derived.by(() => {
    let d = "";
    for (let i = 1; i < 10; i++) d += `M${snap((width * i) / 10)} 0V${height}`;
    for (let j = 1; j < DB_DIVS; j++) d += `M0 ${snap((height * j) / DB_DIVS)}H${width}`;
    return d;
  });
  /** minor ticks on the centre axes only */
  const minor = $derived.by(() => {
    const cy = snap((height * Math.floor(DB_DIVS / 2)) / DB_DIVS);
    const cx = snap(width / 2);
    let d = "";
    for (let i = 0; i <= 50; i++) d += `M${snap((width * i) / 50)} ${cy - 2}V${cy + 2}`;
    for (let j = 0; j <= DB_DIVS * 5; j++) d += `M${cx - 2} ${snap((height * j) / (DB_DIVS * 5))}H${cx + 2}`;
    return d;
  });

  const slotX = (channelMhz: number) => Math.round(bandX(channelMhz, width) - slot / 2);

  /* The carrier in a mockup frame stands in for a real one only when no frames arrive. */
  const dbAt = $derived.by(() => {
    const frame = live ? spectrum.latest : null;
    if (frame) return (x: number) => frameDbAt(frame, xToMhz(x, width));
    let smooth = 0;
    return (x: number) => {
      smooth = x === 0 ? (hash(x, 7) - 0.5) * 3.2 : smooth + 0.4 * ((hash(x, 7) - 0.5) * 3.2 - smooth) * 1.1;
      const mhz = xToMhz(x, width);
      return carriers.reduce(
        (v, c) => Math.max(v, c.rssiDbfs + nfmShape(Math.abs(mhz - c.mhz) * 1000) + (hash(x, 11) - 0.5) * 0.8),
        floor + smooth,
      );
    };
  });

  const trace = $derived.by(() => {
    let d = "";
    for (let x = 0; x <= width; x += 2) d += `${x ? "L" : "M"}${x} ${yDb(dbAt(x)).toFixed(1)}`;
    return d;
  });

  const open = (channel: number) => carriers.some((c) => c.channel === channel);
  const squelchY = $derived(snap(yDb(floor + SQUELCH_OVER_FLOOR_DB)));
</script>

<div class="lo-plot lo-spec" class:lo-wall-frozen={!live}>
  <svg class="hud" {width} {height} viewBox="0 0 {width} {height}">
    <path class="s-hair k-grid graticule" d={grid} />
    {#if height >= 64}<path class="s-hair k-faint graticule" d={minor} />{/if}

    {#each carriers as c (c.channel)}
      {@const x0 = slotX(c.mhz)}
      <rect class="f-wash-tx-plot" x={x0} y="0" width={Math.round(slot)} {height} />
      <rect class="s-hair k-tx" x={x0 + 0.5} y="0.5" width={Math.round(slot) - 1} height={height - 1} />
    {/each}

    {#each blank ? [] : [...new Set(heard)] as channel (channel)}
      {@const xc = bandX(BAND.lo + (channel - BAND.first) * BAND.step, width)}
      <path
        class="s-hair {open(channel) ? 'k-tx' : 'k-faint d-threshold'}"
        d="M{Math.round(xc - slot / 2 + 2)} {squelchY}H{Math.round(xc + slot / 2 - 2)}"
      />
    {/each}

    {#if !blank}
      {#if live}<path class="s-emph k-line glow-1" d={trace} />{/if}
      <path class="s-emph {live ? 'k-line' : 'k-stale'}" d={trace} />
    {/if}
    <RegMark />
  </svg>
  {#if live}<div class="sweep" class:is-paused={!sweeping} style:--sweep-w="{width}px"></div>{/if}
  <span class="lo-bezel"></span>
  {#if !live && frozenAge}
    <span class="lo-scale" style="left:16px;top:5px">FROZEN · AGE <span class="mono">{frozenAge}</span></span>
  {/if}
</div>

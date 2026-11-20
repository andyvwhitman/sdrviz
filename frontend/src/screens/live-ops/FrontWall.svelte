<script lang="ts">
  /**
   * The front wall (spec 4.3, brief 9.1.2): spectrum trace, M2 ruler and waterfall of the
   * displayed feed, wired to the spectrum store. A faulted or stale feed freezes it
   * (FrontWallMessage); a dropped link voids the rows it never delivered.
   */
  import { onDestroy } from "svelte";
  import { session } from "$lib/stores/session.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { spectrum } from "$lib/stores/spectrum.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { BAND, mhzToCh, chToMhz } from "$lib/hud/band";
  import type { Channel, Feed, LiveState } from "$lib/types/live";
    import FrequencyCursor from "./FrequencyCursor.svelte";
  import FrequencyRuler from "./FrequencyRuler.svelte";
  import FrontWallMessage from "./FrontWallMessage.svelte";
  import SpectrumTrace from "./SpectrumTrace.svelte";
  import Waterfall from "./Waterfall.svelte";
  import { listenFlash } from "./listenFlash.svelte";
  import { carriersOn, channelNumber, frameDbAt, heardChannels, noiseFloor, type Box } from "./wall";
  import { METRICS, phoneClass, type AxisClass } from "./freqRuler";
  import ScaleStrip from "./ScaleStrip.svelte";
  import SpectrumScale from "./SpectrumScale.svelte";

  interface Props {
    state: LiveState;
    /** channel numbers of the displayed bank */
    bankChannels: number[];
    /** seconds since the link dropped, null while it is up */
    dropAge: number | null;
    /** no data yet (loading, connecting): empty boxes */
    blank?: boolean;
    /** the displayed feed, when the bank has none of its own */
    feed: Feed;
    /** the wall is being resized: the waterfall stays as drawn (stretched) until the release */
    resizing?: boolean;
    /** the phone's spectrum view: no click-to-listen; a touch held on a plot reads the cursor, and nothing else */
    viewOnly?: boolean;
    /** the selected frequency's channel number, marked on the ruler */
    selectedChannel?: number | null;
  }
  let { state: snapshot, bankChannels, dropAge, blank = false, feed, resizing = false, viewOnly = false, selectedChannel = null }: Props = $props();

  // the server streams spectrum frames only for the feed being watched
  $effect(() => {
    if (!blank) spectrum.watch(feed.id);
  });
  onDestroy(() => spectrum.watch(null));

  const delivering = $derived(feed.state === "ok");
  const fault = $derived(snapshot.faults.find((f) => f.object === feed.id));
  const floor = $derived(noiseFloor(feed));
  const heard = $derived(heardChannels(feed, snapshot.channels));
  const carriers = $derived(carriersOn(snapshot.active_transmissions, feed.id, delivering && dropAge == null));
  const listening = $derived(
    delivering && dropAge == null && !snapshot.active_transmissions.length && !snapshot.channels.some((c: Channel) => c.state === "squelch"),
  );
  const frozenAge = $derived(feed.last_sample_age_s == null ? null : fmt.age(feed.last_sample_age_s, "age"));

  /**
   * The wall is CSS boxes: the spectrum takes its clamp, the ruler and the scale strip their fixed heights, the waterfall
   * the rest. Each plot is the wall's width less E-2's right label margin; the heights are measured once for drawing.
   */
  let wallW = $state(0);
  let spectrumH = $state(0);
  let rulerH = $state(0);
  let fallH = $state(0);
  /** the handset layer takes the phone forms: portrait under 600 px of wall, landscape above (the CSS asks the same) */
  const cls = $derived<AxisClass>(viewOnly ? phoneClass(wallW) : "desktop");
  const m = $derived(METRICS[cls]);
  const plotW = $derived(Math.max(0, wallW - m.M));
  const spectrumBox = $derived<Box>([0, 0, plotW, spectrumH]);
  const rulerBox = $derived<Box>([0, spectrumH, plotW, rulerH]);
  const waterfallBox = $derived<Box>([0, spectrumH + rulerH, plotW, fallH]);

  /** what the ruler labels: the bank's channels this feed hears; off-bank keyed channels and the selection ride along as extras */
  const labelled = $derived(blank ? [] : bankChannels.filter((ch) => heard.includes(ch)));
  const keyedChannels = $derived(snapshot.active_transmissions.map((row) => channelNumber(row.aar)));
  const inBand = (ch: number): boolean => ch >= BAND.first && ch <= BAND.last;
  const extras = $derived(blank ? [] : [...keyedChannels, ...(selectedChannel === null ? [] : [selectedChannel])].filter((ch) => inBand(ch) && !labelled.includes(ch)));

  /** pointer x over the spectrum, ruler or waterfall (they share x), for the hover readout */
  let hoverX = $state<number | null>(null);
  const layoutX = (event: MouseEvent): number => event.clientX - (event.currentTarget as HTMLElement).getBoundingClientRect().left;
  /** a pointer in the right margin is off the plot */
  const onPlot = (x: number): boolean => x >= 0 && x <= plotW;
  const hover = {
    onpointerdown: (event: PointerEvent) => viewOnly && (hoverX = onPlot(layoutX(event)) ? layoutX(event) : null),
    onpointermove: (event: PointerEvent) => (hoverX = onPlot(layoutX(event)) ? layoutX(event) : null),
    onpointerleave: () => (hoverX = null),
    onpointercancel: () => (hoverX = null),
    onclick: (event: MouseEvent) => !viewOnly && listen(event),
  };
  /** the readout of a held touch: channel, frequency and the level under the finger */
  const touchReadout = $derived.by(() => {
    if (!viewOnly || hoverX === null || plotW < 2) return undefined;
    const mhz = BAND.lo + (Math.min(plotW - 1, Math.max(0, hoverX)) / (plotW - 1)) * (BAND.hi - BAND.lo);
    const ch = channelAt(hoverX);
    const frame = spectrum.latest;
    const level = frame && delivering ? ` · ${fmt.dbfs(frameDbAt(frame, mhz))}` : "";
    return `${ch === null ? "" : `${fmt.ch(ch)} · `}${fmt.freq(mhz)} MHz${level}`;
  });

  /** the AAR channel under the pointer, or null between channel slots and outside the band */
  function channelAt(x: number): number | null {
    const width = plotW;
    const mhz = BAND.lo + (Math.min(width - 1, Math.max(0, x)) / (width - 1)) * (BAND.hi - BAND.lo);
    const ch = mhzToCh(mhz);
    const onSlot = ch >= BAND.first && ch <= BAND.last && Math.abs(mhz - chToMhz(ch)) <= BAND.step / 2;
    return onSlot ? ch : null;
  }

  /** left of the waterfall's time-axis labels */
  const FLASH_X = 56;

  /** click: the bank endpoints are gone (sprint 5); I-2 replaces this with hold-to-listen and right-click-to-add */
  function listen(_event: MouseEvent) {}
</script>

<div class="lo-wall" class:is-view={viewOnly} bind:clientWidth={wallW}>
  <div class="lo-cell lo-cell--spectrum" bind:clientHeight={spectrumH} {...hover} role="presentation">
    {#if plotW > 0 && spectrumH > 0}
      <SpectrumTrace width={plotW} height={spectrumH} {floor} {heard} {carriers} live={delivering && !blank} sweeping={listening} {frozenAge} {blank} />
      {#if m.M > 0}<SpectrumScale plotWidth={plotW} margin={m.M} height={spectrumH} fontPx={m.f} />{/if}
    {/if}
  </div>
  <div class="lo-cell lo-cell--ruler" bind:clientHeight={rulerH} {...hover} role="presentation">
    {#if plotW > 0}
      <FrequencyRuler width={plotW} {cls} hears={blank ? [] : heard} {labelled} {extras} keyed={keyedChannels} selected={selectedChannel} stale={!delivering} />
    {/if}
  </div>
  <div class="lo-cell lo-cell--fall" bind:clientHeight={fallH} {...hover} role="presentation">
    {#if plotW > 0 && fallH > 0}
      <Waterfall width={plotW} height={fallH} feedId={feed.id} {floor} {carriers} live={delivering} {dropAge} frozen={resizing}>
        {#if !delivering}
          <FrontWallMessage
            feedShort={feed.short}
            label={fault ? fault.label : feed.label}
            kind={fault ? "fault" : "stale"}
            acked={!!fault?.acked}
            frozenAt={snapshot.t_offset_s - (feed.last_sample_age_s ?? 0)}
            sampleAgeS={feed.last_sample_age_s}
          />
        {/if}
      </Waterfall>
    {/if}
  </div>
  <div class="lo-cell lo-cell--strip">
    {#if plotW > 0}<ScaleStrip width={plotW} height={m.strip} fontPx={m.f} />{/if}
  </div>

  {#if hoverX !== null && !blank}
    <FrequencyCursor listenable={session.isAdmin && !viewOnly} readout={touchReadout} x={hoverX} spectrum={spectrumBox} ruler={rulerBox} waterfall={waterfallBox} channels={snapshot.channels} flash={listenFlash.text} />
  {:else if listenFlash.text && !viewOnly}
    <!-- the confirmation outlives the pointer: a tap or a mouse that moved away still sees what happened -->
    <div class="lo-box lo-flash" style="left:{FLASH_X}px;top:{spectrumH + rulerH + 4}px" role="status">{listenFlash.text}</div>
  {/if}
</div>

<style>
  .lo-flash { font: 500 var(--fs-11)/20px var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-2); background: var(--bg-void); padding: 0 6px; white-space: nowrap; pointer-events: none; z-index: 2; }
</style>

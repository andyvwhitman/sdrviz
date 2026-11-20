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
  import { api } from "$lib/api/client";
  import { BAND, mhzToCh, chToMhz } from "$lib/hud/band";
  import type { Channel, Feed, LiveState } from "$lib/types/live";
    import FrequencyCursor from "./FrequencyCursor.svelte";
  import FrequencyRuler from "./FrequencyRuler.svelte";
  import FrontWallMessage from "./FrontWallMessage.svelte";
  import SpectrumTrace from "./SpectrumTrace.svelte";
  import Waterfall from "./Waterfall.svelte";
  import { listenFlash } from "./listenFlash.svelte";
  import { carriersOn, heardChannels, noiseFloor, type Box } from "./wall";

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
  }
  let { state: snapshot, bankChannels, dropAge, blank = false, feed }: Props = $props();

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
   * The three plots are CSS boxes that fill the wall (the spectrum takes its clamp, the ruler its fixed height, the
   * waterfall the rest); each reports its size once so the canvas and SVG can be drawn to it.
   */
  let spectrumW = $state(0);
  let spectrumH = $state(0);
  let rulerW = $state(0);
  let rulerH = $state(0);
  let fallW = $state(0);
  let fallH = $state(0);
  const spectrumBox = $derived<Box>([0, 0, spectrumW, spectrumH]);
  const rulerBox = $derived<Box>([0, spectrumH, rulerW, rulerH]);
  const waterfallBox = $derived<Box>([0, spectrumH + rulerH, fallW, fallH]);

  /** pointer x over the spectrum, ruler or waterfall (they share x), for the hover readout */
  let hoverX = $state<number | null>(null);
  const layoutX = (event: MouseEvent): number => event.clientX - (event.currentTarget as HTMLElement).getBoundingClientRect().left;
  const hover = {
    onpointermove: (event: PointerEvent) => (hoverX = layoutX(event)),
    onpointerleave: () => (hoverX = null),
    onclick: (event: MouseEvent) => listen(event),
  };

  /** the AAR channel under the pointer, or null between channel slots and outside the band */
  function channelAt(x: number): number | null {
    const width = spectrumW;
    const mhz = BAND.lo + (Math.min(width - 1, Math.max(0, x)) / (width - 1)) * (BAND.hi - BAND.lo);
    const ch = mhzToCh(mhz);
    const onSlot = ch >= BAND.first && ch <= BAND.last && Math.abs(mhz - chToMhz(ch)) <= BAND.step / 2;
    return onSlot ? ch : null;
  }

  /** left of the waterfall's time-axis labels */
  const FLASH_X = 56;

  /** click: listen to the channel (it joins the live bank, which becomes active); alt-click: drop it */
  let busy = false; // one request at a time: a double click must not add and activate twice
  async function listen(event: MouseEvent) {
    if (blank || busy || !session.isAdmin) return; // changing the live bank is an admin action
    const ch = channelAt(layoutX(event)); // from the click itself: a touch tap has no hover first
    if (ch === null) return;
    busy = true;
    const name = fmt.ch(ch);
    try {
      if (event.altKey) {
        await api.banks.removeLive(ch);
        listenFlash.say(`${name} REMOVED FROM LIVE`);
      } else {
        await api.banks.addLive(ch, feed.id);
        await api.banks.activate("bank-live");
        listenFlash.say(`LISTENING ${name} · LIVE BANK`);
      }
    } catch (error) {
      listenFlash.say(`${name}: ${error instanceof Error ? error.message : "failed"}`.toUpperCase());
    } finally {
      busy = false;
    }
  }
</script>

<div class="lo-wall">
  <div class="lo-cell lo-cell--spectrum" bind:clientWidth={spectrumW} bind:clientHeight={spectrumH} {...hover} role="presentation">
    {#if spectrumW > 0 && spectrumH > 0}
      <SpectrumTrace width={spectrumW} height={spectrumH} {floor} {heard} {carriers} live={delivering && !blank} sweeping={listening} {frozenAge} {blank} />
    {/if}
  </div>
  <div class="lo-cell lo-cell--ruler" bind:clientWidth={rulerW} bind:clientHeight={rulerH} {...hover} role="presentation">
    {#if rulerW > 0}
      <FrequencyRuler width={rulerW} height={rulerH} hears={blank ? [] : heard} bank={blank ? [] : bankChannels} dimmed={!delivering} />
    {/if}
  </div>
  <div class="lo-cell lo-cell--fall" bind:clientWidth={fallW} bind:clientHeight={fallH} {...hover} role="presentation">
    {#if fallW > 0 && fallH > 0}
      <Waterfall width={fallW} height={fallH} feedId={feed.id} {floor} {carriers} live={delivering} {dropAge}>
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

  {#if hoverX !== null && !blank}
    <FrequencyCursor listenable={session.isAdmin} x={hoverX} spectrum={spectrumBox} ruler={rulerBox} waterfall={waterfallBox} channels={snapshot.channels} flash={listenFlash.text} />
  {:else if listenFlash.text}
    <!-- the confirmation outlives the pointer: a tap or a mouse that moved away still sees what happened -->
    <div class="lo-box lo-flash" style="left:{FLASH_X}px;top:{spectrumH + rulerH + 4}px" role="status">{listenFlash.text}</div>
  {/if}
</div>

<style>
  .lo-flash { font: 500 var(--fs-11)/20px var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-2); background: var(--bg-void); padding: 0 6px; white-space: nowrap; pointer-events: none; z-index: 2; }
</style>

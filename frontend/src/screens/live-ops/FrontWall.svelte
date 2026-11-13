<script lang="ts">
  /**
   * The front wall (spec 4.3, brief 9.1.2): spectrum trace, M2 ruler and waterfall of the
   * displayed feed, wired to the spectrum store. A faulted or stale feed freezes it
   * (FrontWallMessage); a dropped link voids the rows it never delivered.
   */
  import { onDestroy } from "svelte";
  import { live } from "$lib/stores/live.svelte";
  import { spectrum } from "$lib/stores/spectrum.svelte";
  import * as fmt from "$lib/hud/fmt";
  import type { Channel, Feed, LiveState } from "$lib/types/live";
  import { boxStyle, type Geometry } from "./geometry";
  import FrequencyCursor from "./FrequencyCursor.svelte";
  import FrequencyRuler from "./FrequencyRuler.svelte";
  import FrontWallMessage from "./FrontWallMessage.svelte";
  import SpectrumTrace from "./SpectrumTrace.svelte";
  import Waterfall from "./Waterfall.svelte";
  import { carriersOn, channelNumber, heardChannels, noiseFloor } from "./wall";

  interface Props {
    state: LiveState;
    /** channel numbers of the displayed bank */
    bankChannels: number[];
    geometry: Geometry;
    /** seconds since the link dropped, null while it is up */
    dropAge: number | null;
    /** no data yet (loading, connecting): empty boxes */
    blank?: boolean;
    /** the displayed feed, when the bank has none of its own */
    feed: Feed;
  }
  let { state: snapshot, bankChannels, geometry, dropAge, blank = false, feed }: Props = $props();


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

  const [, , spectrumW, spectrumH] = $derived(geometry.spectrum);
  const [, , fallW, fallH] = $derived(geometry.waterfall);
  const [, , rulerW, rulerH] = $derived(geometry.ruler);

  /** pointer x over the spectrum, ruler or waterfall (they share x), for the hover readout */
  let hoverX = $state<number | null>(null);
  const hover = {
    onpointermove: (event: PointerEvent) => {
      // the stage is scaled to fit the window: convert screen pixels back to layout pixels
      const box = event.currentTarget as HTMLElement;
      const rect = box.getBoundingClientRect();
      hoverX = ((event.clientX - rect.left) * box.offsetWidth) / rect.width;
    },
    onpointerleave: () => (hoverX = null),
  };
</script>

<div class="lo-box" style={boxStyle(geometry.spectrum)} {...hover} role="presentation">
  <SpectrumTrace
    width={spectrumW}
    height={spectrumH}
    {floor}
    {heard}
    {carriers}
    live={delivering && !blank}
    sweeping={listening}
    {frozenAge}
    {blank}
  />
</div>
<div class="lo-box lo-plot" style={boxStyle(geometry.ruler)} {...hover} role="presentation">
  <FrequencyRuler width={rulerW} height={rulerH} hears={blank ? [] : heard} bank={blank ? [] : bankChannels} dimmed={!delivering} />
</div>

{#if blank}
  <div class="lo-box lo-plot lo-fall" style={boxStyle(geometry.waterfall)}><span class="lo-bezel"></span></div>
{:else}
  <div class="lo-box" style={boxStyle(geometry.waterfall)} {...hover} role="presentation">
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
  </div>
{/if}

{#if hoverX !== null && !blank}
  <FrequencyCursor x={hoverX} spectrum={geometry.spectrum} ruler={geometry.ruler} waterfall={geometry.waterfall} channels={snapshot.channels} />
{/if}

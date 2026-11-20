<script lang="ts">
  /**
   * The front wall (spec 4.3, brief 9.1.2): spectrum trace, M2 ruler and waterfall of the
   * displayed feed, wired to the spectrum store. A faulted or stale feed freezes it
   * (FrontWallMessage); a dropped link voids the rows it never delivered.
   */
  import { onDestroy, onMount } from "svelte";
  import { router } from "$lib/router.svelte";
  import { audio } from "$lib/stores/audio.svelte";
  import { session } from "$lib/stores/session.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { spectrum } from "$lib/stores/spectrum.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { api } from "$lib/api/client";
  import { BAND, mhzToCh, chToMhz } from "$lib/hud/band";
  import type { Channel, Feed, LiveState } from "$lib/types/live";
  import FrequencyCursor from "./FrequencyCursor.svelte";
  import HoldMarker from "./HoldMarker.svelte";
  import FrequencyRuler from "./FrequencyRuler.svelte";
  import FrontWallMessage from "./FrontWallMessage.svelte";
  import SpectrumTrace from "./SpectrumTrace.svelte";
  import Waterfall from "./Waterfall.svelte";
  import { listenFlash } from "./listenFlash.svelte";
  import { listenHold } from "./listenHold.svelte";
  import {
    Press, addedMessage, addingMessage, alreadyOn, heldTimer, holdPlate, needsAdmin, nodeDown, notAdded, rightClickAction, unlistedClick,
  } from "./gesture";
  import { carriersOn, channelNumber, frameDbAt, heardChannels, noiseFloor, type Box } from "./wall";
  import { METRICS, phoneClass, type AxisClass } from "./freqRuler";
  import ScaleStrip from "./ScaleStrip.svelte";
  import SpectrumScale from "./SpectrumScale.svelte";

  interface Props {
    state: LiveState;
    /** channel numbers of the listened node's list */
    listedChannels: number[];
    /** seconds since the link dropped, null while it is up */
    dropAge: number | null;
    /** no data yet (loading, connecting): empty boxes */
    blank?: boolean;
    /** the listened node's feed */
    feed: Feed;
    /** the wall is being resized: the waterfall stays as drawn (stretched) until the release */
    resizing?: boolean;
    /** the phone's spectrum view: no select, no add; a touch reads the cursor, a touch held listens */
    viewOnly?: boolean;
    /** the selected frequency's channel number, marked on the ruler */
    selectedChannel?: number | null;
  }
  let { state: snapshot, listedChannels, dropAge, blank = false, feed, resizing = false, viewOnly = false, selectedChannel = null }: Props = $props();

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

  /** what the ruler labels: the node's listed channels this feed hears; unlisted keyed channels and the selection ride along as extras */
  const labelled = $derived(blank ? [] : listedChannels.filter((ch) => heard.includes(ch)));
  const keyedChannels = $derived(snapshot.active_transmissions.map((row) => channelNumber(row.aar)));
  const inBand = (ch: number): boolean => ch >= BAND.first && ch <= BAND.last;
  const extras = $derived(blank ? [] : [...keyedChannels, ...(selectedChannel === null ? [] : [selectedChannel]), ...(listenHold.held ? [listenHold.held.channel] : [])].filter((ch) => inBand(ch) && !labelled.includes(ch)));

  /** pointer x over the spectrum, ruler or waterfall (they share x), for the hover readout */
  let hoverX = $state<number | null>(null);
  const layoutX = (event: MouseEvent): number => event.clientX - (event.currentTarget as HTMLElement).getBoundingClientRect().left;
  /** a pointer in the right margin is off the plot */
  const onPlot = (x: number): boolean => x >= 0 && x <= plotW;
  const hover = {
    onpointerdown: (event: PointerEvent) => {
      if (viewOnly) hoverX = onPlot(layoutX(event)) ? layoutX(event) : null;
      press(event);
    },
    onpointermove: (event: PointerEvent) => {
      hoverX = onPlot(layoutX(event)) ? layoutX(event) : null;
      current?.move(event.clientX, event.clientY);
    },
    onpointerup: () => current?.up(),
    onpointerleave: () => (hoverX = null),
    onpointercancel: () => ((hoverX = null), current?.cancel()),
    oncontextmenu: rightClick,
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

  const isListed = (ch: number): boolean => snapshot.channels.some((c: Channel) => channelNumber(c.aar) === ch);
  const node = $derived(feed.short);
  const listenFeed = $derived(snapshot.listen_feed ?? feed.id);

  /* ---- one left press at a time: a short click selects, a held press listens until it is let go */
  let current: Press | undefined;
  function press(event: PointerEvent): void {
    if (blank || event.button !== 0 || current) return;
    const channel = channelAt(layoutX(event));
    if (channel === null) return;
    // capture keeps the hold alive when the pointer leaves the wall; Esc, blur and cancel still end it
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const touch = event.pointerType === "touch";
    current = new Press(channel, event.clientX, event.clientY, touch, {
      onClick: touch || viewOnly ? undefined : click,
      onHold: startHold,
      onRenew: () => listenHold.renew(),
      onRelease: stopHold,
    });
  }

  /** a short press: a listed channel is selected like its tile; an unlisted one says so */
  function click(channel: number): void {
    const tile = snapshot.channels.find((c: Channel) => channelNumber(c.aar) === channel);
    if (!tile) return listenFlash.say(unlistedClick(channel, session.isAdmin));
    router.setQuery({ select: tile.id, inspect: null });
  }

  function startHold(channel: number): void {
    if (feed.state !== "ok") {
      current?.cancel(); // no request to a node that cannot answer
      return listenFlash.say(nodeDown(node, feed.state));
    }
    listenFlash.clear();
    listenHold.begin(listenFeed, channel);
  }

  function stopHold(): void {
    const last = plate;
    listenHold.end();
    if (last) listenFlash.say({ ...last, ms: 400 }); // the plate stays a moment after the release
  }

  function endPress(): void {
    current?.cancel();
    current = undefined;
  }
  onMount(() => {
    const escape = (event: KeyboardEvent) => event.key === "Escape" && current?.cancel();
    const free = () => (current = undefined); // a finished press (up or cancel) makes room for the next
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", endPress);
    window.addEventListener("pointerup", free);
    window.addEventListener("pointercancel", free);
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", endPress);
      window.removeEventListener("pointerup", free);
      window.removeEventListener("pointercancel", free);
    };
  });
  onDestroy(endPress);

  /* ---- right-click: add the channel to the listened node (admin) */
  let adding = false; // one request at a time
  async function rightClick(event: MouseEvent): Promise<void> {
    event.preventDefault(); // the browser menu is replaced on the three plots only
    if (viewOnly || blank || adding) return;
    const channel = channelAt(layoutX(event));
    const action = rightClickAction(channel, session.isAdmin, channel !== null && isListed(channel));
    if (channel === null || action === "none") return;
    if (action === "needs-admin") return listenFlash.say(needsAdmin());
    if (action === "already") return listenFlash.say(alreadyOn(channel, node));
    adding = true;
    listenFlash.say(addingMessage(channel));
    try {
      const { frequency, created } = await api.frequencies.fromChannel(channel, listenFeed);
      listenFlash.say(addedMessage(channel, node, created, frequency.label));
    } catch (error) {
      listenFlash.say(notAdded(channel, error instanceof Error ? error.message : "failed"));
    } finally {
      adding = false;
    }
  }

  /* ---- the plate: the hold's own state wins over a message */
  const held = $derived(listenHold.held);
  const holdText = $derived(
    held
      ? holdPlate({
          channel: held.channel,
          node,
          state: listenHold.state,
          inStateMs: listenHold.now - listenHold.since,
          enabled: isListed(held.channel),
          mhz: chToMhz(held.channel),
          audioMuted: audio.silent(held.channel),
        })
      : null,
  );
  const plate = $derived(holdText ?? (listenFlash.text ? { text: listenFlash.text, tone: listenFlash.tone } : null));
  const timer = $derived(held && listenHold.state === "listening" ? heldTimer(listenHold.now - listenHold.since) : null);
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
    <FrequencyCursor isAdmin={session.isAdmin} hints={!viewOnly && !held} readout={touchReadout} x={hoverX} spectrum={spectrumBox} ruler={rulerBox} waterfall={waterfallBox} channels={snapshot.channels} />
  {/if}
  {#if held && listenHold.state && !blank}
    <HoldMarker channel={held.channel} tuning={listenHold.state === "tuning"} spectrum={spectrumBox} ruler={rulerBox} waterfall={waterfallBox} />
  {/if}
  <!-- one plate for every gesture message; it outlives the pointer, so a tap or a mouse that moved away still sees it -->
  <div class="lo-box lo-flash" class:is-open={plate} data-tone={plate?.tone} style="left:{FLASH_X}px;top:{spectrumH + rulerH + 4}px" role="status">
    {#if plate}<span>{plate.text}</span>{#if timer}<b class="lo-flash__timer">{timer}</b>{/if}{/if}
  </div>
</div>

<style>
  /* the gesture surface: no iOS callout, no text selection, no browser pan on the phone's cells */
  .lo-cell { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
  .lo-wall.is-view .lo-cell { touch-action: none; }

  .lo-flash { display: none; align-items: center; gap: 14px; font: 500 var(--fs-11)/20px var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink); background: color-mix(in srgb, var(--bg-void) 85%, transparent); padding: 0 8px; white-space: nowrap; pointer-events: none; z-index: 2; }
  .lo-flash.is-open { display: flex; }
  .lo-flash[data-tone="ink-2"] { color: var(--ink-2); }
  .lo-flash[data-tone="fault"] { color: var(--state-fault); }
  .lo-flash::before, .lo-flash::after { content: ""; position: absolute; width: var(--arm-len); height: 6px; border: 0 solid var(--line-faint); }
  .lo-flash::before { left: 0; top: 0; border-width: 1px 0 0 1px; }
  .lo-flash::after { right: 0; bottom: 0; border-width: 0 1px 1px 0; }
  .lo-flash__timer { font: 400 var(--fs-11)/20px var(--font-data); color: var(--ink-2); }
</style>

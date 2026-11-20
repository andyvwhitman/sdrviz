<script lang="ts">
  /**
   * The frequency pane (direction 5): the frequency page folded into a column. A fixed bar, then one scroll box that
   * holds the identity (its line pinned), the audio row, the day-strip lid, the log head (pinned) and the log.
   * It is built from the page's own parts (Identity, MiniStrip, LogHead, Log, player, the stores) and does not know
   * whether it sits in a column or fills a phone: every width switch reads the pane's own width (container queries).
   */
  import { untrack } from "svelte";
  import { api, ApiError } from "$lib/api/client";
  import { followLink } from "$lib/router.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { live } from "$lib/stores/live.svelte";
  import { session } from "$lib/stores/session.svelte";
  import { simClock } from "$lib/stores/simClock.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { cyclicAge } from "$lib/time";
  import type { FrequencyInfo, Recording } from "$lib/types/recordings";
  import { ActivityStore } from "../frequency/activityStore.svelte";
  import { DEFAULT_TZ, dayKey, nextNewer } from "../frequency/frequency";
  import Identity from "../frequency/Identity.svelte";
  import Log from "../frequency/Log.svelte";
  import LogHead from "../frequency/LogHead.svelte";
  import { LogStore } from "../frequency/logStore.svelte";
  import { logKey } from "../frequency/logKeys";
  import MiniStrip from "../frequency/MiniStrip.svelte";
  import { player } from "../frequency/player.svelte";
  import { keepLogFresh, useDayClock } from "../frequency/refresh.svelte";
  import { totalsOf } from "../frequency/dayStrip";
  import AudioMixer from "./AudioMixer.svelte";
  import { noiseFloor } from "./wall";

  interface Props {
    frequencyId: string;
    /** the column on a desktop, or the layer that fills a phone */
    variant?: "column" | "layer";
    /** column: previous (-1) and next (1) frequency in bank order */
    onstep?: (direction: -1 | 1) => void;
    /** column: clear the selection */
    onclose?: () => void;
    /** layer: the bank's name for the back button, and what it does */
    backLabel?: string;
    onback?: () => void;
  }
  let { frequencyId, variant = "column", onstep, onclose, backLabel = "", onback }: Props = $props();

  const CONTINUOUS_KEY = "sdrviz.frequency.continuous";
  const GAP_MS = 400;

  const snapshot = $derived(live.state);
  const channel = $derived(snapshot?.channels.find((c) => c.id === frequencyId));
  const activeBank = $derived(snapshot?.banks.find((b) => b.id === snapshot.active_bank));
  const inActiveBank = $derived(!!activeBank?.frequency_ids.includes(frequencyId));
  const inAnyBank = $derived(inActiveBank || !!snapshot?.banks.some((b) => b.frequency_ids.includes(frequencyId)));
  /** in a bank, but not the one on the wall */
  const offBank = $derived(inAnyBank && !inActiveBank);
  const tz = $derived(ui.utc ? "UTC" : (snapshot?.tz.iana ?? DEFAULT_TZ));

  // ---- the frequency itself: the catalogue entry, or what the live snapshot already knows while it loads
  let fetched = $state<FrequencyInfo | null>(null);
  let unknown = $state(false);
  const info = $derived<FrequencyInfo | null>(
    fetched ??
      (channel
        ? { id: channel.id, label: channel.label, freq_mhz: channel.freq_mhz, aar_channel: Number(channel.aar.replace(/\D/g, "")) || null, railroad: channel.railroad, use: channel.use }
        : null),
  );

  // ---- the log and the day activity, made per frequency and dropped with it
  let store = $state.raw<LogStore | null>(null);
  let activity = $state.raw<ActivityStore | null>(null);
  let selectedId = $state<number | null>(null);
  let attop = $state(true);
  let jumped = $state<{ label: string; from: number; to: number } | null>(null);
  let scroller = $state<HTMLElement | null>(null);
  let log = $state<ReturnType<typeof Log>>();
  let width = $state(0);
  let continuous = $state(readContinuous());

  function readContinuous(): boolean {
    try {
      return localStorage.getItem(CONTINUOUS_KEY) === "1";
    } catch {
      return false;
    }
  }
  function setContinuous(on: boolean): void {
    continuous = on;
    try {
      localStorage.setItem(CONTINUOUS_KEY, on ? "1" : "0");
    } catch {
      // not remembered
    }
  }

  const clock = useDayClock(
    () => todayKey,
    () => {
      void activity?.loadDay(undefined);
      void activity?.loadWeek();
      void store?.load();
    },
  );
  const nowMs = $derived(clock.nowMs);
  const todayKey = $derived(dayKey(nowMs, tz));

  $effect(() => {
    const id = frequencyId;
    fetched = null;
    unknown = false;
    selectedId = null;
    jumped = null;
    const controller = new AbortController();
    api.frequencies.info(id, controller.signal).then(
      (found) => (fetched = found),
      (error: unknown) => {
        if (error instanceof ApiError && error.status === 404) unknown = true;
      },
    );
    const nextLog = new LogStore(id);
    const nextActivity = new ActivityStore(id);
    store = nextLog;
    activity = nextActivity;
    void nextLog.load();
    void nextActivity.loadDay(undefined);
    void nextActivity.loadWeek();
    const stopFresh = nextActivity.keepFresh(() => undefined);
    untrack(() => scroller)?.scrollTo({ top: 0 });
    return () => {
      controller.abort();
      stopFresh();
      nextActivity.destroy();
      nextLog.destroy();
      player.stop(); // a new selection stops playback (direction 5.9)
    };
  });

  /** Back to the newest row. */
  async function toNewest(): Promise<void> {
    if (!store) return;
    selectedId = null;
    jumped = null;
    await store.load();
    scroller?.scrollTo({ top: 0 });
  }

  // ---- what is on the air now
  const activeTx = $derived(snapshot?.active_transmissions.find((row) => row.frequency_id === frequencyId && row.live));
  /** seconds keyed so far, or null; whole seconds, so the strip's current bucket grows once a second */
  const keyedElapsed = $derived.by(() => {
    if (!activeTx && !channel?.tx) return null;
    return activeTx ? Math.max(0, cyclicAge(simClock.now, activeTx.t_offset_s)) : (channel?.tx?.elapsed_s ?? 0);
  });
  const keyed = $derived(keyedElapsed !== null);
  const onAir = $derived(keyedElapsed !== null && store?.fromHead && !jumped ? { startedAt: nowMs - keyedElapsed * 1000, elapsed: keyedElapsed } : null);
  keepLogFresh({ store: () => store, activity: () => activity, keyed: () => keyed, attop: () => attop, isToday: () => true });

  const day = $derived(activity?.day ?? null);
  const countToday = $derived(day && day.date === todayKey ? totalsOf(day.buckets).count : null);
  const lastHeardMs = $derived(store?.rows[0] ? Date.parse(store.rows[0].started_at) : null);
  const floor = $derived.by(() => {
    const feed = snapshot?.feeds.find((f) => f.id === (channel?.tx?.primary_feed ?? channel?.heard_by[0]));
    return feed ? noiseFloor(feed) : null;
  });

  // ---- playback
  function play(rec: Recording): void {
    selectedId = null;
    player.toggle(rec, `${info?.label ?? frequencyId} · ${rec.started_at.slice(11, 19)} UTC`);
  }
  /** Continuous play: when a clip ends, the next newer one starts after a beat. */
  function playNext(finished: number): void {
    if (!continuous || !store) return;
    const next = nextNewer(store.rows, finished);
    if (!next) return;
    setTimeout(() => {
      if (player.playingId === null && continuous) {
        player.start(next);
        log?.focusRow(next.id);
      }
    }, GAP_MS);
  }
  $effect(() => {
    player.onended = playNext;
    return () => {
      player.onended = null;
      player.stop();
    };
  });

  // ---- keyboard: the log's keys, while focus is inside the pane
  const keys = (event: KeyboardEvent): void => {
    if (event.key === "Escape") return; // one layer per press: Live Ops asks the pane through `escape`
    logKey(event, {
      step: (direction) => log?.step(direction),
      focused: () => log?.focused(),
      play,
      toggleContinuous: () => setContinuous(!continuous),
      showToday: () => void toNewest(),
      jumped: () => !!jumped,
      clearJump: () => void toNewest(),
    });
  };

  /** Esc steps back one layer: stop playback, then clear a bucket jump. False when there was neither. */
  export function escape(): boolean {
    if (player.playingId !== null) return (player.stop(), true);
    if (jumped) return (void toNewest(), true);
    return false;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="pane" class:pane--layer={variant === "layer"} bind:clientWidth={width} role="region" aria-label="Frequency" onkeydown={keys}>
  <div class="pane__bar">
    {#if variant === "layer"}
      <button class="pane__back" type="button" onclick={onback}>‹ {backLabel}</button>
    {:else}
      <span class="pane__steps">
        <button type="button" aria-label="Previous frequency" onclick={() => onstep?.(-1)}>◂</button>
        <button type="button" aria-label="Next frequency" onclick={() => onstep?.(1)}>▸</button>
      </span>
    {/if}
    <span class="pane__grow"></span>
    <a class="chip pane__open" data-chip="active" href="/frequency/{encodeURIComponent(frequencyId)}" onclick={followLink}>OPEN FULL PAGE ›</a>
    {#if variant === "column"}<button class="pane__x" type="button" aria-label="Clear selection" onclick={onclose}>×</button>{/if}
  </div>

  <div class="pane__scroll" bind:this={scroller}>
    {#if unknown}
      <section class="pane__plate">
        <p class="pane__plate-k">UNKNOWN FREQUENCY · {frequencyId}</p>
        <button class="chip" data-chip="nominal" type="button" onclick={onclose}>CLEAR</button>
      </section>
    {:else if info}
      <Identity variant="pane" {info} {channel} {keyedElapsed} {offBank} />

      {#if inAnyBank}
        <AudioMixer channelId={frequencyId} {floor} keyed={keyed} {offBank} />
      {:else}
        <div class="pane__nodecode">
          <p>NOT DECODED · ONLY BANK CHANNELS ARE DECODED</p>
          {#if session.isAdmin}<a href="/feeds" onclick={followLink}>ADD IT IN FEEDS &amp; BANKS ›</a>{/if}
        </div>
      {/if}

      <div class="pane__lid">
        {#if !inAnyBank}
          <span class="pane__lid-k">▸ TODAY · NOT RECORDED · NOT IN ANY BANK</span>
        {:else if day && day.recording_since === null}
          <span class="pane__lid-k">▸ TODAY · NO RECORDINGS YET</span>
        {:else if day}
          <span class="pane__lid-k">▸ TODAY</span>
          <MiniStrip buckets={day.buckets} recordingSince={day.recording_since} {nowMs} {keyed} lastS={lastHeardMs === null || width < 440 ? null : (nowMs - lastHeardMs) / 1000} label={info.label} />
        {/if}
      </div>

      <LogHead variant="pane" {countToday} bucket={jumped} {continuous} onclearbucket={() => void toNewest()} ontogglecontinuous={() => setContinuous(!continuous)} />
      {#if store}
        <Log
          bind:this={log}
          bind:attop
          pane
          {scroller}
          {store}
          {tz}
          {todayKey}
          mhz={fmt.freq(info.freq_mhz)}
          inBank={inAnyBank}
          {selectedId}
          bucket={jumped}
          {onAir}
          onplay={play}
        />
      {/if}
    {:else}
      <p class="pane__loading">{fmt.BLANK}</p>
    {/if}
  </div>
</div>

<style>
  .pane { container: pane / inline-size; position: absolute; inset: 0; display: flex; flex-direction: column; --pane-row-h: 32px; }
  .pane--layer { --pane-row-h: 44px; --fq-line-h: 44px; --lever: 44px; }
  .pane__bar { flex: none; height: 32px; display: flex; align-items: center; gap: 8px; padding: 0 8px 0 12px; border-bottom: 1px solid var(--grid); }
  .pane--layer .pane__bar { height: 44px; }
  .pane__grow { flex: 1; }
  .pane__steps { display: inline-flex; }
  .pane__steps button, .pane__x { width: 32px; height: 32px; font: 400 var(--fs-15)/1 var(--font-label); color: var(--ink-2); }
  .pane__steps button:hover, .pane__x:hover { color: var(--ink); }
  .pane__back { height: 44px; min-width: 44px; padding: 0 8px 0 0; font: 500 var(--fs-13)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pane__back:hover { color: var(--ink); }
  .pane--layer .pane__open { height: 44px; display: inline-flex; align-items: center; }
  .pane--layer :global(.lr__play) { height: 44px; }
  .pane__open { height: 24px; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); border: 0; }
  .pane__scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: var(--line-faint) transparent; }

  .pane__nodecode { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; min-height: var(--pane-row-h); padding: 0 16px; background: var(--bg-void); }
  .pane__nodecode p { margin: 0; font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
  .pane__nodecode a { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); border: 0; }

  .pane__lid { display: flex; align-items: center; gap: 12px; min-height: 32px; padding: 0 16px; background: var(--bg-void); border-top: 1px solid var(--grid); }
  .pane__lid-k { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); white-space: nowrap; }

  .pane__plate { display: grid; gap: 12px; justify-items: start; margin: 24px 16px; padding: 16px 20px; box-shadow: inset 0 0 0 1px var(--line-faint); width: fit-content; max-width: calc(100% - 32px); }
  .pane__plate-k { margin: 0; font: 600 var(--fs-15)/1.2 var(--font-label); letter-spacing: var(--track-title); color: var(--ink); overflow-wrap: anywhere; }
  .pane__loading { margin: 24px 16px; font: 400 var(--fs-13)/1 var(--font-data); color: var(--ink-3); }
</style>

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
  import { keyAge } from "$lib/time";
  import type { FrequencyInfo, Recording } from "$lib/types/recordings";
  import { ActivityStore } from "../frequency/activityStore.svelte";
  import { clockOf, DEFAULT_TZ, dayHeading, dayKey, dayName, nextNewer } from "../frequency/frequency";
  import Identity from "../frequency/Identity.svelte";
  import Log from "../frequency/Log.svelte";
  import LogHead from "../frequency/LogHead.svelte";
  import { LogStore } from "../frequency/logStore.svelte";
  import { logKey } from "../frequency/logKeys";
  import MiniStrip from "../frequency/MiniStrip.svelte";
  import { player } from "../frequency/player.svelte";
  import { keepLogFresh, useDayClock } from "../frequency/refresh.svelte";
  import { endsOf, spanLabel, totalsOf } from "../frequency/dayStrip";
  import DayStrip from "../frequency/DayStrip.svelte";
  import WeekGrid from "../frequency/WeekGrid.svelte";
  import AudioMixer from "./AudioMixer.svelte";
  import { liveOpsPrefs } from "./liveOpsPrefs.svelte";
  import { noiseFloor } from "./wall";

  interface Props {
    frequencyId: string;
    /** the column on a desktop, or the layer that fills a phone */
    variant?: "column" | "layer";
    /** column: previous (-1) and next (1) frequency in tile order */
    onstep?: (direction: -1 | 1) => void;
    /** column: clear the selection */
    onclose?: () => void;
    /** layer: the node's name for the back button, and what it does */
    backLabel?: string;
    onback?: () => void;
  }
  let { frequencyId, variant = "column", onstep, onclose, backLabel = "", onback }: Props = $props();

  const CONTINUOUS_KEY = "sdrviz.frequency.continuous";
  const GAP_MS = 400;

  const snapshot = $derived(live.state);
  const channel = $derived(snapshot?.channels.find((c) => c.id === frequencyId));
  /** the listened node's short name, for "NOT ON SDR-02" */
  const nodeShort = $derived(snapshot?.feeds_listenable.find((f) => f.feed_id === snapshot.listen_feed)?.short ?? "");
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

  /** enabled on some node (it is decoded and recorded), though perhaps not on the listened one */
  const enabledAnywhere = $derived(!!channel || !!info?.assignments?.some((a) => a.enabled));
  /** enabled elsewhere only: its tile is not in the list */
  const notOnNode = $derived(enabledAnywhere && !channel);

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
  /** the day shown in the open lid: undefined is today, else a date key (kept here, not in the URL) */
  let viewDate = $state<string | undefined>(undefined);
  /** the open lid shows the day strip or the week grid in one slot */
  let range = $state<"day" | "week">("day");
  const isToday = $derived(viewDate === undefined);
  const lidOpen = $derived(liveOpsPrefs.strip);
  /** a pane under 480 px wide takes the phone's forms (56 px plot, no gutter, 12 and 13 px week cells) */
  const narrow = $derived(width < 480);

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
      if (!isToday) return;
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
    viewDate = undefined;
    range = "day";
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
    const stopFresh = nextActivity.keepFresh(() => untrack(() => viewDate));
    untrack(() => scroller)?.scrollTo({ top: 0 });
    return () => {
      controller.abort();
      stopFresh();
      nextActivity.destroy();
      nextLog.destroy();
      player.stop(); // a new selection stops playback (direction 5.9)
    };
  });

  /** The end of the last bucket of a loaded day, in UTC ms. */
  const dayEnd = (a: ActivityStore): number | null => (a.day ? (endsOf(a.day.buckets).at(-1) ?? null) : null);

  /** Back to the newest row of the day shown. */
  async function toNewest(): Promise<void> {
    if (!store || !activity) return;
    selectedId = null;
    jumped = null;
    const end = isToday ? null : dayEnd(activity);
    await store.load(end ? new Date(end).toISOString() : undefined);
    scroller?.scrollTo({ top: 0 });
  }

  /** Show another day (a date key, or undefined for today); the log starts at that day's end. */
  async function showDay(date: string | undefined): Promise<void> {
    if (!activity || !store) return;
    viewDate = date;
    selectedId = null;
    jumped = null;
    await activity.loadDay(date);
    await toNewest();
  }

  function step(direction: -1 | 1): void {
    const [y, m, d] = (viewDate ?? todayKey).split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + direction)).toISOString().slice(0, 10);
    void showDay(next >= todayKey ? undefined : next);
  }

  /** The earliest day worth stepping back to: the day recording began, or a week back when that is unknown. */
  const earliest = $derived.by(() => {
    const since = activity?.day?.recording_since;
    if (since) return dayKey(since, tz);
    const [y, m, d] = todayKey.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
  });

  /** Jump the log to the end of a span of time, and scroll the newest row inside it to the top. */
  async function jumpTo(from: number, to: number, label: string): Promise<void> {
    if (!store) return;
    jumped = { from, to, label };
    selectedId = null;
    await store.load(new Date(to).toISOString());
    const newest = store.rows.find((rec) => Date.parse(rec.started_at) >= from && Date.parse(rec.started_at) < to);
    if (newest) log?.scrollToRow(newest.id);
    else scroller?.scrollTo({ top: 0 });
  }

  /** A click on a bucket of the strip. */
  function jump(index: number): void {
    const shown = activity?.day;
    if (!shown) return;
    const bucket = shown.buckets[index];
    const to = endsOf(shown.buckets)[index];
    void jumpTo(Date.parse(bucket.start), to, spanLabel(bucket, to, tz));
  }

  /** A click on a week-grid cell: that day in the strip, and the log at the end of that hour. */
  async function pick(date: string, hour: number | null): Promise<void> {
    await showDay(date >= todayKey ? undefined : date);
    range = "day";
    const week = activity?.week?.days.find((d) => d.date === date);
    const cell = hour === null ? undefined : week?.hours[hour];
    if (!cell) return;
    const from = Date.parse(cell.start);
    const to = hour! + 1 < (week?.hours.length ?? 0) ? Date.parse(week!.hours[hour! + 1].start) : from + 3_600_000;
    await jumpTo(from, to, `${clockOf(from, tz).slice(0, 5)}–${clockOf(to, tz).slice(0, 5)}`);
  }

  /** Open or close the lid (remembered on this device). Closing returns the strip to today. */
  function toggleLid(): void {
    liveOpsPrefs.strip = !liveOpsPrefs.strip;
    liveOpsPrefs.save();
    if (!liveOpsPrefs.strip && !isToday) void showDay(undefined);
  }

  // ---- what is on the air now
  const activeTx = $derived(snapshot?.active_transmissions.find((row) => row.frequency_id === frequencyId && row.live));
  /** seconds keyed so far, or null; whole seconds, so the strip's current bucket grows once a second */
  const keyedElapsed = $derived.by(() => {
    if (!activeTx && !channel?.tx) return null;
    return activeTx ? keyAge(simClock.now, activeTx.t_offset_s) : (channel?.tx?.elapsed_s ?? 0);
  });
  const keyed = $derived(keyedElapsed !== null);
  const onAir = $derived(keyedElapsed !== null && store?.fromHead && !jumped ? { startedAt: nowMs - keyedElapsed * 1000, elapsed: keyedElapsed } : null);
  keepLogFresh({ store: () => store, activity: () => activity, keyed: () => keyed, attop: () => attop, isToday: () => isToday });

  const day = $derived(activity?.day ?? null);
  const countToday = $derived(day && day.date === todayKey ? totalsOf(day.buckets).count : null);
  const dayLabel = $derived(isToday ? "TODAY" : dayName(viewDate!));
  const heading = $derived(dayHeading(day?.date ?? viewDate ?? todayKey, todayKey));
  const lastHeardMs = $derived(store?.rows[0] ? Date.parse(store.rows[0].started_at) : null);
  /** the newest recording's end, for the hero when the live snapshot has no last_heard for this channel */
  const lastHeardFallback = $derived.by(() => {
    const newest = store?.rows[0];
    if (!newest) return null;
    const endMs = Date.parse(newest.started_at) + newest.duration_s * 1000;
    return { ageS: Math.max(0, (nowMs - endMs) / 1000), clock: clockOf(endMs, tz) };
  });
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
      showToday: () => void showDay(undefined),
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
      <Identity variant="pane" {info} {channel} {keyedElapsed} notOnNode={notOnNode ? nodeShort : null} {lastHeardFallback} />

      {#if enabledAnywhere}
        <AudioMixer channelId={frequencyId} {floor} keyed={keyed} {notOnNode} />
      {:else}
        <div class="pane__nodecode">
          <p>NOT DECODED · NOT ENABLED ON ANY NODE</p>
          {#if session.isAdmin}<a href="/frequencies" onclick={followLink}>ENABLE IT IN FREQUENCIES ›</a>{/if}
        </div>
      {/if}

      {#if !enabledAnywhere}
        <div class="pane__lid"><span class="pane__lid-k">▸ TODAY · NOT RECORDED · NOT ENABLED ON ANY NODE</span></div>
      {:else if day && day.recording_since === null}
        <div class="pane__lid"><span class="pane__lid-k">▸ TODAY · NO RECORDINGS YET</span></div>
      {:else}
        <button class="pane__lid pane__lid--btn" type="button" aria-expanded={lidOpen} onclick={toggleLid}>
          <span class="pane__lid-k">{lidOpen ? "▾" : "▸"} {dayLabel}</span>
          {#if !lidOpen && day}
            <MiniStrip buckets={day.buckets} recordingSince={day.recording_since} {nowMs} {keyed} lastS={lastHeardMs === null || width < 440 ? null : (nowMs - lastHeardMs) / 1000} label={info.label} />
          {/if}
        </button>
        <div class="pane__lidbody" class:is-open={lidOpen}>
          <div class="pane__lidinner">
            {#if lidOpen && range === "week"}
              <WeekGrid pane {narrow} week={activity?.week ?? null} {tz} {nowMs} shownDate={viewDate ?? todayKey} {range} {dayLabel} onrange={(next) => (range = next)} onpick={(date, hour) => void pick(date, hour)} />
            {:else if lidOpen}
              <DayStrip
                pane
                {narrow}
                {day}
                failed={activity?.failed ?? false}
                {tz}
                {heading}
                {isToday}
                {nowMs}
                {keyedElapsed}
                {jumped}
                {lastHeardMs}
                canBack={(viewDate ?? todayKey) > earliest}
                canForward={!isToday}
                onstep={step}
                onjump={jump}
                {range}
                {dayLabel}
                onrange={(next) => (range = next)}
              />
            {/if}
          </div>
        </div>
      {/if}

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
          enabled={enabledAnywhere}
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
  /* phone targets are 44 px: the log head's controls (the plate stays 32), the range switch and the day steppers */
  .pane--layer :global(.lg__cont), .pane--layer :global(.lg__chip) { min-height: 44px; margin: -2px 0; }
  .pane--layer :global(.rs) { height: 44px; --tabs-h: 44px; }
  .pane--layer :global(.rs .tab) { height: 44px; }
  .pane--layer :global(.ds__steps button) { width: 44px; height: 44px; }
  /* the closed lid is one line: FS, the count and the last heard; the last heard goes first when it is narrow, then FS */
  .pane__lid :global(.ms) { min-width: 0; }
  .pane__lid :global(.ms__text) { display: flex; gap: 0 6px; white-space: nowrap; }
  .pane__lid :global(.ms__fs)::after { content: " ·"; }
  @container pane (max-width: 399px) { .pane__lid :global(.ms__fs) { display: none; } }
  .pane__open { height: 24px; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); border: 0; }
  .pane__scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: var(--line-faint) transparent; }

  .pane__nodecode { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; min-height: var(--pane-row-h); padding: 0 16px; background: var(--bg-void); }
  .pane__nodecode p { margin: 0; font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
  .pane__nodecode a { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); border: 0; }

  .pane__lid { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 32px; padding: 0 16px; background: var(--bg-void); border-top: 1px solid var(--grid); text-align: left; }
  .pane__lid--btn { min-height: var(--pane-row-h); cursor: pointer; }
  .pane__lid--btn:hover .pane__lid-k { color: var(--ink); }
  /* the lid opens in one 160 ms height change (rows 0fr to 1fr); the strip writes itself in on its own */
  .pane__lidbody { display: grid; grid-template-rows: 0fr; background: var(--bg-void); transition: grid-template-rows 160ms var(--ease-in-out); }
  .pane__lidbody.is-open { grid-template-rows: 1fr; }
  .pane__lidinner { min-height: 0; overflow: hidden; }
  @media (prefers-reduced-motion: reduce) { .pane__lidbody { transition: none; } }
  .pane__lid-k { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); white-space: nowrap; }

  .pane__plate { display: grid; gap: 12px; justify-items: start; margin: 24px 16px; padding: 16px 20px; box-shadow: inset 0 0 0 1px var(--line-faint); width: fit-content; max-width: calc(100% - 32px); }
  .pane__plate-k { margin: 0; font: 600 var(--fs-15)/1.2 var(--font-label); letter-spacing: var(--track-title); color: var(--ink); overflow-wrap: anywhere; }
  .pane__loading { margin: 24px 16px; font: 400 var(--fs-13)/1 var(--font-data); color: var(--ink-3); }
</style>

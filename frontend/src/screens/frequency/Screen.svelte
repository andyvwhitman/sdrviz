<script lang="ts">
  /**
   * FREQUENCY: a logbook for one radio channel. Identity and the live datum on top, the log of every saved
   * transmission below, each with a transcript and a play control. A responsive page (layout: "page").
   * `/frequency/:id`; `?at=<UTC start>` selects a transmission, `?date=` shows another day.
   */
  import { onMount, untrack } from "svelte";
  import { api, ApiError } from "$lib/api/client";
  import { followLink, router } from "$lib/router.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { simClock } from "$lib/stores/simClock.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import type { FrequencyInfo, Recording } from "$lib/types/recordings";
  import * as fmt from "$lib/hud/fmt";
  import { cyclicAge } from "$lib/time";
  import { endsOf, spanLabel, totalsOf } from "./dayStrip";
  import DayStrip from "./DayStrip.svelte";
  import { ActivityStore } from "./activityStore.svelte";
  import { beforeAt, DEFAULT_TZ, dayHeading, dayKey, findByStart, hasAudio, nextNewer } from "./frequency";
  import Identity from "./Identity.svelte";
  import Log from "./Log.svelte";
  import { LogStore } from "./logStore.svelte";
  import { player } from "./player.svelte";

  const CONTINUOUS_KEY = "sdrviz.frequency.continuous";
  const REFRESH_AFTER_KEY_UP_MS = 2000;
  const PENDING_POLL_MS = 10_000;
  const GAP_MS = 400;

  const frequencyId = $derived(decodeURIComponent(router.path.split("/")[2] ?? ""));
  const snapshot = $derived(live.state);
  const channel = $derived(snapshot?.channels.find((c) => c.id === frequencyId));
  const tz = $derived(ui.utc ? "UTC" : (snapshot?.tz.iana ?? DEFAULT_TZ));

  /** "www.broadcastify.com/..." -> "broadcastify.com" */
  function host(source: string): string {
    try {
      return new URL(source).hostname.replace(/^www\./, "");
    } catch {
      return source;
    }
  }

  // ---- the frequency itself
  let info = $state<FrequencyInfo | null>(null);
  let unknown = $state(false);
  let lidOpen = $state(false);
  $effect(() => {
    const id = frequencyId;
    info = null;
    unknown = false;
    if (!id) return;
    const controller = new AbortController();
    api.frequencies.info(id, controller.signal).then(
      (found) => (info = found),
      (error: unknown) => {
        if (error instanceof ApiError && error.status === 404) unknown = true;
      },
    );
    return () => controller.abort();
  });

  // ---- the log
  let store = $state.raw<LogStore | null>(null);
  let selectedId = $state<number | null>(null);
  let attop = $state(true);
  /** height of the pinned block, so the right rail can stick just beneath it */
  let topHeight = $state(0);
  let log = $state<ReturnType<typeof Log>>();
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

  // ---- the day shown: today unless `?date=` names an earlier day
  let nowMs = $state(Date.now());
  const todayKey = $derived(dayKey(nowMs, tz));
  const dateParam = $derived(router.query("date"));
  const viewDate = $derived(dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam < todayKey ? dateParam : undefined);
  const isToday = $derived(viewDate === undefined);
  let activity = $state.raw<ActivityStore | null>(null);
  /** the bucket the log was jumped to */
  let jumped = $state<{ start: string; label: string; from: number; to: number } | null>(null);

  $effect(() => {
    const id = frequencyId;
    if (!id) return;
    const nextLog = new LogStore(id);
    const nextActivity = new ActivityStore(id);
    store = nextLog;
    activity = nextActivity;
    selectedId = null;
    jumped = null;
    void start(nextLog, nextActivity, router.query("at"));
    const stopFresh = nextActivity.keepFresh(() => untrack(() => viewDate));
    return () => {
      stopFresh();
      nextActivity.destroy();
      nextLog.destroy();
      player.stop();
    };
  });

  /** The end of the last bucket of a loaded day, in UTC ms. */
  const dayEnd = (a: ActivityStore): number | null => (a.day ? (endsOf(a.day.buckets).at(-1) ?? null) : null);

  async function start(target: LogStore, days: ActivityStore, at: string | null): Promise<void> {
    const date = untrack(() => viewDate);
    void days.loadWeek();
    const loaded = days.loadDay(date);
    if (at) {
      void loaded;
      await openLog(target, at);
    } else if (date) {
      await loaded;
      const end = dayEnd(days);
      await target.load(end ? new Date(end).toISOString() : undefined);
    } else {
      void loaded;
      await target.load();
    }
  }

  /** Load the page that starts at a linked transmission and select it. */
  async function openLog(target: LogStore, at: string): Promise<void> {
    await target.load(beforeAt(at));
    const linked = findByStart(target.rows, at);
    selectedId = linked?.id ?? null;
    if (linked) log?.scrollToRow(linked.id);
  }

  /** Back to the newest row of the day being shown. */
  async function toNewest(): Promise<void> {
    if (!store || !activity) return;
    selectedId = null;
    jumped = null;
    router.setQuery({ at: null });
    const end = isToday ? null : dayEnd(activity);
    await store.load(end ? new Date(end).toISOString() : undefined);
    window.scrollTo({ top: 0 });
  }

  /** Show another day (a date key, or undefined for today); the log starts at that day's end. */
  async function showDay(date: string | undefined): Promise<void> {
    if (!activity || !store) return;
    router.setQuery({ date: date ?? null, at: null });
    selectedId = null;
    jumped = null;
    await activity.loadDay(date);
    await toNewest();
  }

  function step(direction: -1 | 1): void {
    const shown = viewDate ?? todayKey;
    const [y, m, d] = shown.split("-").map(Number);
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

  /** A click on a bucket of the strip: the log jumps to the end of it and scrolls its newest row to the top. */
  async function jump(index: number): Promise<void> {
    const day = activity?.day;
    if (!day || !store) return;
    const bucket = day.buckets[index];
    const to = endsOf(day.buckets)[index];
    const from = Date.parse(bucket.start);
    jumped = { start: bucket.start, label: spanLabel(bucket, to, tz), from, to };
    selectedId = null;
    await store.load(new Date(to).toISOString());
    const newest = store.rows.find((rec) => Date.parse(rec.started_at) >= from && Date.parse(rec.started_at) < to);
    if (newest) log?.scrollToRow(newest.id);
    else window.scrollTo({ top: 0 });
  }

  // ---- what is on the air now, and the refresh rules (no websocket work: the live store tells us)
  const activeTx = $derived(snapshot?.active_transmissions.find((row) => row.frequency_id === frequencyId && row.live));
  /** seconds keyed so far, or null; whole seconds, so the strip's current bucket grows once a second */
  const keyedElapsed = $derived.by(() => {
    if (!activeTx && !channel?.tx) return null;
    return activeTx ? Math.max(0, cyclicAge(simClock.now, activeTx.t_offset_s)) : (channel?.tx?.elapsed_s ?? 0);
  });
  const keyed = $derived(keyedElapsed !== null);
  const onAir = $derived(keyedElapsed !== null && store?.fromHead && !jumped ? { startedAt: nowMs - keyedElapsed * 1000, elapsed: keyedElapsed } : null);

  let wasKeyed = false;
  $effect(() => {
    const now = keyed;
    if (wasKeyed && !now && store) {
      const target = store;
      const timer = setTimeout(() => {
        void target.refreshHead(!attop);
        if (isToday) void activity?.loadDay(undefined);
      }, REFRESH_AFTER_KEY_UP_MS);
      wasKeyed = now;
      return () => clearTimeout(timer);
    }
    wasKeyed = now;
  });

  $effect(() => {
    const target = store;
    if (!target) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      if (target.rows.slice(0, 50).some((rec) => rec.transcript_state === "pending")) void target.refreshHead(!attop);
    }, PENDING_POLL_MS);
    return () => clearInterval(timer);
  });

  // ---- playback
  function play(rec: Recording): void {
    selectedId = null;
    player.toggle(rec, `${info?.label ?? frequencyId} · ${rec.started_at.slice(11, 19)} UTC`);
  }

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

  onMount(() => {
    const stopClock = simClock.start();
    const second = setInterval(() => {
      const before = untrack(() => todayKey);
      nowMs = Date.now();
      // local midnight: today becomes yesterday with no ceremony; the strip and the log start over on the new day
      if (untrack(() => todayKey) !== before && untrack(() => isToday) && !router.query("date")) {
        void activity?.loadDay(undefined);
        void activity?.loadWeek();
        void store?.load();
      }
    }, 1000);
    player.onended = playNext;
    return () => {
      stopClock();
      clearInterval(second);
      player.onended = null;
      player.stop();
      shell.statusFallback = undefined;
    };
  });
  $effect(() => {
    if (snapshot) simClock.sync(snapshot.t_offset_s);
  });

  // ---- keyboard: J/K move through rows, Space plays, arrows seek, Esc stops, C continuous, T newest.
  // Captured before the header's tab keys (T is the SPOT tab's letter) and only while this page is open.
  function keys(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
    const key = event.key;
    const handled = (): void => (event.preventDefault(), event.stopPropagation());
    const row = log?.focused();
    if (key === "Escape" && player.playingId === null && jumped) (handled(), void toNewest());
    else if (key === "j" || key === "J") (handled(), log?.step(1));
    else if (key === "k" || key === "K") (handled(), log?.step(-1));
    else if ((key === " " || key === "Enter") && row && (event.target as HTMLElement).closest("[data-rec]")) (handled(), hasAudio(row) && play(row));
    else if ((key === "ArrowLeft" || key === "ArrowRight") && player.playingId !== null) (handled(), player.seekBy(key === "ArrowLeft" ? -1 : 1));
    else if (key === "Escape") {
      if (player.playingId !== null) (handled(), player.stop());
    } else if (key === "c" || key === "C") (handled(), setContinuous(!continuous));
    else if (key === "t" || key === "T") (handled(), void showDay(undefined));
  }
  onMount(() => {
    window.addEventListener("keydown", keys, true);
    return () => window.removeEventListener("keydown", keys, true);
  });

  // ---- shell: tab title and status line
  const day = $derived(activity?.day ?? null);
  const countToday = $derived(day && day.date === todayKey ? totalsOf(day.buckets).count : null);
  const heading = $derived(dayHeading(day?.date ?? viewDate ?? todayKey, todayKey));
  const lastHeardMs = $derived(store?.rows[0] ? Date.parse(store.rows[0].started_at) : null);
  $effect(() => {
    if (!info) return;
    document.title = `${info.label} · CH${String(info.aar_channel ?? "").padStart(2, "0")} · SDRVIZ`;
    shell.statusFallback = `FREQUENCY · ${info.aar_channel != null ? fmt.ch(info.aar_channel) : info.id}${countToday != null ? ` · ${countToday} TX TODAY` : ""}`;
  });
</script>

<div class="fq" style="--fq-top: {topHeight}px">
  {#if unknown}
    <section class="fq__plate">
      <p class="fq__plate-k">UNKNOWN FREQUENCY · {frequencyId}</p>
      <a href="/frequency" onclick={followLink}>ALL FREQUENCIES →</a>
    </section>
  {:else if info}
    <div class="fq__top" bind:clientHeight={topHeight}>
      <Identity {info} {channel} {keyedElapsed} {lidOpen} ontogglelid={() => (lidOpen = !lidOpen)} />
      <DayStrip
        {day}
        failed={activity?.failed ?? false}
        {tz}
        {heading}
        {isToday}
        {nowMs}
        {keyedElapsed}
        jumpedStart={jumped?.start ?? null}
        {lastHeardMs}
        canBack={(viewDate ?? todayKey) > earliest}
        canForward={!isToday}
        onstep={step}
        onjump={jump}
      />
    </div>
    <div class="fq__body">
      <div class="fq__log">
        {#if store}
          <Log
            bind:this={log}
            bind:attop
            {store}
            {tz}
            {todayKey}
            mhz={fmt.freq(info.freq_mhz)}
            inBank={!!channel || (snapshot?.banks ?? []).some((bank) => bank.frequency_ids.includes(info!.id))}
            {countToday}
            {selectedId}
            bucket={jumped}
            {continuous}
            {onAir}
            onplay={play}
            onclearbucket={() => void toNewest()}
            ontogglecontinuous={() => setContinuous(!continuous)}
          />
        {/if}
      </div>
      <aside class="fq__rail">
        {#if info.notes || info.sources?.length}
          <section class="fq__about">
            <h2>ABOUT</h2>
            <p class="fq__meta">{[info.railroad, info.use, info.confidence ? `CONF ${info.confidence}` : ""].filter(Boolean).join(" · ")}</p>
            {#if info.notes}<p class="fq__notes">{info.notes}</p>{/if}
            {#each info.sources ?? [] as source (source)}
              <a class="fq__src" href={source} target="_blank" rel="noreferrer noopener">{host(source)} ↗</a>
            {/each}
          </section>
        {/if}
      </aside>
    </div>
  {/if}
</div>

<style>
  .fq { min-width: 0; }
  .fq__top { background: var(--bg-void); border-bottom: 1px solid var(--grid); }
  .fq__rail { display: none; }
  .fq__plate { display: grid; gap: 12px; justify-items: start; margin: 40px 16px; padding: 20px 24px; box-shadow: inset 0 0 0 1px var(--line-faint); width: fit-content; max-width: calc(100% - 32px); }
  .fq__plate-k { margin: 0; font: 600 var(--fs-18)/1.2 var(--font-label); letter-spacing: var(--track-title); color: var(--ink); overflow-wrap: anywhere; }
  .fq__plate a { font: 500 var(--fs-13)/1 var(--font-label); letter-spacing: var(--track-label); }

  /* pinned: the identity stays in view while the log scrolls, when the window is tall enough */
  @media (min-height: 800px) {
    .fq__top { position: sticky; top: var(--header-h); z-index: 10; }
  }

  @media (min-width: 1100px) {
    .fq__body { display: grid; grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr); }
    .fq__rail { display: block; border-left: 1px solid var(--grid); padding: 16px var(--margin-x) 24px 24px; align-self: start; position: sticky; top: calc(var(--header-h) + var(--fq-top)); }
  }
  .fq__about h2 { margin: 0 0 8px; font: 500 var(--fs-13)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink); }
  .fq__meta { margin: 0 0 8px; font: 500 var(--fs-11)/1.3 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-2); }
  .fq__notes { margin: 0 0 12px; font: 400 var(--fs-13)/1.45 var(--font-read); color: var(--ink-2); }
  .fq__src { display: block; font: 400 var(--fs-12)/1.6 var(--font-data); }
</style>

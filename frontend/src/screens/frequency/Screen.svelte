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
  import { viewport } from "$lib/stores/viewport.svelte";
  import type { FrequencyInfo, Recording } from "$lib/types/recordings";
  import * as fmt from "$lib/hud/fmt";
  import { cyclicAge } from "$lib/time";
  import { endsOf, spanLabel, totalsOf } from "./dayStrip";
  import DayStrip from "./DayStrip.svelte";
  import WeekGrid from "./WeekGrid.svelte";
  import { ActivityStore } from "./activityStore.svelte";
  import { beforeAt, clockOf, DEFAULT_TZ, dayHeading, dayKey, dayName, findByStart, hasAudio, nextNewer } from "./frequency";
  import Identity from "./Identity.svelte";
  import Log from "./Log.svelte";
  import LogHead from "./LogHead.svelte";
  import { LogStore } from "./logStore.svelte";
  import { player } from "./player.svelte";
  import { logKey } from "./logKeys";
  import { keepLogFresh, useDayClock } from "./refresh.svelte";

  const CONTINUOUS_KEY = "sdrviz.frequency.continuous";
  const GAP_MS = 400;
  const RAIL_MIN_PX = 1100;
  /** under this width the page pins two lines (identity, log head) instead of one tall block (direction 5.8) */
  const PAGE_MIN_PX = 900;

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

  // `/frequency` alone has nothing to show: on to Live Ops
  $effect(() => {
    if (!frequencyId) router.go("/live", { replace: true });
  });

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

  /** after a save in the editor: fetch the identity again, keeping the page as it is */
  async function refreshInfo(): Promise<void> {
    try {
      info = await api.frequencies.info(frequencyId);
    } catch {
      // the old identity stays
    }
  }

  // ---- the log
  let store = $state.raw<LogStore | null>(null);
  let selectedId = $state<number | null>(null);
  let attop = $state(true);
  /**
   * Height of the pinned block (0 where it is not pinned), so the right rail and the NEW button can stick just
   * beneath it. The block holds the log's header bar, so that bar needs no offset at all. Svelte observes the
   * size with a ResizeObserver, so the value follows every change of height.
   */
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
  const clock = useDayClock(
    () => todayKey,
    // local midnight: today becomes yesterday with no ceremony; the strip and the log start over on the new day
    () => {
      if (isToday && !router.query("date")) {
        void activity?.loadDay(undefined);
        void activity?.loadWeek();
        void store?.load();
      }
    },
  );
  const nowMs = $derived(clock.nowMs);
  const todayKey = $derived(dayKey(nowMs, tz));
  const dateParam = $derived(router.query("date"));
  const viewDate = $derived(dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam < todayKey ? dateParam : undefined);
  const isToday = $derived(viewDate === undefined);
  let activity = $state.raw<ActivityStore | null>(null);
  /** the bucket the log was jumped to */
  let jumped = $state<{ label: string; from: number; to: number } | null>(null);
  /** the phone shows the day strip or the week grid in one slot */
  let range = $state<"day" | "week">("day");
  /** below the width where the right rail fits, the week grid shares the strip's slot */
  const compact = $derived(viewport.width < RAIL_MIN_PX);

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

  /** Jump the log to the end of a span of time, and scroll the newest row inside it to the top. */
  async function jumpTo(from: number, to: number, label: string): Promise<void> {
    if (!store) return;
    jumped = { from, to, label };
    selectedId = null;
    await store.load(new Date(to).toISOString());
    const newest = store.rows.find((rec) => Date.parse(rec.started_at) >= from && Date.parse(rec.started_at) < to);
    if (newest) log?.scrollToRow(newest.id);
    else window.scrollTo({ top: 0 });
  }

  /** A click on a bucket of the strip. */
  function jump(index: number): void {
    const day = activity?.day;
    if (!day) return;
    const bucket = day.buckets[index];
    const to = endsOf(day.buckets)[index];
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

  // ---- what is on the air now, and the refresh rules (no websocket work: the live store tells us)
  const activeTx = $derived(snapshot?.active_transmissions.find((row) => row.frequency_id === frequencyId && row.live));
  /** seconds keyed so far, or null; whole seconds, so the strip's current bucket grows once a second */
  const keyedElapsed = $derived.by(() => {
    if (!activeTx && !channel?.tx) return null;
    return activeTx ? Math.max(0, cyclicAge(simClock.now, activeTx.t_offset_s)) : (channel?.tx?.elapsed_s ?? 0);
  });
  const keyed = $derived(keyedElapsed !== null);
  const onAir = $derived(keyedElapsed !== null && store?.fromHead && !jumped ? { startedAt: nowMs - keyedElapsed * 1000, elapsed: keyedElapsed } : null);

  keepLogFresh({ store: () => store, activity: () => activity, keyed: () => keyed, attop: () => attop, isToday: () => isToday });

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
    player.onended = playNext;
    return () => {
      stopClock();
      player.onended = null;
      player.stop();
      shell.statusFallback = undefined;
    };
  });
  $effect(() => {
    if (snapshot) simClock.sync(snapshot.t_offset_s);
  });

  // ---- keyboard (logKeys). Captured before the header's tab keys (T is the SPOT tab's letter), only while this page is open.
  const keys = (event: KeyboardEvent): void => {
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
  onMount(() => {
    window.addEventListener("keydown", keys, true);
    return () => window.removeEventListener("keydown", keys, true);
  });

  // ---- shell: tab title and status line
  const day = $derived(activity?.day ?? null);
  const dayLabel = $derived(isToday ? "TODAY" : dayName(viewDate!));
  const countToday = $derived(day && day.date === todayKey ? totalsOf(day.buckets).count : null);
  const heading = $derived(dayHeading(day?.date ?? viewDate ?? todayKey, todayKey));
  /** the newest recording's end, for the hero when the live snapshot has no last_heard for this channel */
  const lastHeardFallback = $derived.by(() => {
    const newest = store?.rows[0];
    if (!newest) return null;
    const endMs = Date.parse(newest.started_at) + newest.duration_s * 1000;
    return { ageS: Math.max(0, (nowMs - endMs) / 1000), clock: clockOf(endMs, tz) };
  });
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
      <a href="/live" onclick={followLink}>LIVE OPS →</a>
    </section>
  {:else if info}
    <div class="fq__top" bind:clientHeight={topHeight}>
      <Identity variant={viewport.width < PAGE_MIN_PX ? "phone" : "page"} {info} {channel} {keyedElapsed} {lastHeardFallback} onsaved={refreshInfo} {lidOpen} ontogglelid={() => (lidOpen = !lidOpen)} />
      {#if compact && range === "week"}
        <WeekGrid week={activity?.week ?? null} {tz} {nowMs} shownDate={viewDate ?? todayKey} {range} {dayLabel} onrange={(next) => (range = next)} onpick={(date, hour) => void pick(date, hour)} />
      {:else}
      <DayStrip
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
        range={compact ? range : undefined}
        {dayLabel}
        onrange={(next) => (range = next)}
      />
      {/if}
      <LogHead {countToday} bucket={jumped} {continuous} onclearbucket={() => void toNewest()} ontogglecontinuous={() => setContinuous(!continuous)} />
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
            {selectedId}
            bucket={jumped}
            {onAir}
            onplay={play}
          />
        {/if}
      </div>
      <aside class="fq__rail">
        {#if !compact}
          <WeekGrid week={activity?.week ?? null} {tz} {nowMs} shownDate={viewDate ?? todayKey} onpick={(date, hour) => void pick(date, hour)} />
        {/if}
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
  .fq { min-width: 0; container: pane / inline-size; }
  .fq__top { background: var(--bg-void); }
  .fq__rail { display: none; }
  .fq__plate { display: grid; gap: 12px; justify-items: start; margin: 40px 16px; padding: 20px 24px; box-shadow: inset 0 0 0 1px var(--line-faint); width: fit-content; max-width: calc(100% - 32px); }
  .fq__plate-k { margin: 0; font: 600 var(--fs-18)/1.2 var(--font-label); letter-spacing: var(--track-title); color: var(--ink); overflow-wrap: anywhere; }
  .fq__plate a { font: 500 var(--fs-13)/1 var(--font-label); letter-spacing: var(--track-label); }

  /* Pinned: the identity and the log's header bar stay in view while the log scrolls, when the window is tall
     enough. Otherwise the block does not exist as a box (it measures 0) and only the header bar pins itself. */
  .fq__top { display: contents; }
  @media (min-height: 800px) and (min-width: 900px) {
    .fq__top { display: block; position: sticky; top: var(--header-h); z-index: 10; }
    .fq__top :global(.lg__head) { position: static; }
  }

  @media (min-width: 1100px) { /* RAIL_MIN_PX */
    .fq__body { display: grid; grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr); }
    .fq__rail { display: block; border-left: 1px solid var(--grid); padding: 16px var(--margin-x) 24px 24px; align-self: start; position: sticky; top: calc(var(--header-h) + var(--fq-top)); }
  }
  .fq__rail :global(.wk) { padding: 0 0 20px; }
  .fq__about h2 { margin: 0 0 8px; font: 500 var(--fs-13)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink); }
  .fq__meta { margin: 0 0 8px; font: 500 var(--fs-11)/1.3 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-2); }
  .fq__notes { margin: 0 0 12px; font: 400 var(--fs-13)/1.45 var(--font-read); color: var(--ink-2); }
  .fq__src { display: block; font: 400 var(--fs-12)/1.6 var(--font-data); }
</style>

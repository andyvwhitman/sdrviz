<script lang="ts">
  /**
   * History (spec 4.4, brief 9.2): hero strip, route tabs, stringline, 24 h scrubber with the recording rail and
   * FEEDS lane, the transcript table and the clip player. URL: ?tx= ?train= ?range=HH:MM-HH:MM ?route= ?span=
   * (and ?pos=0..1, the clip position a frame opens at). Selection is written back with replaceState.
   */
  import { onMount } from "svelte";
  import * as fmt from "$lib/hud/fmt";
  import { params } from "$lib/params";
  import { live } from "$lib/stores/live.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import ClipPlayer from "./ClipPlayer.svelte";
  import Hero from "./Hero.svelte";
  import RouteTabs from "./RouteTabs.svelte";
  import Stringline from "./Stringline.svelte";
  import TimeScrubber from "./TimeScrubber.svelte";
  import TranscriptTable from "./TranscriptTable.svelte";
  import { simDate } from "./adapt";
  import { HistoryStore } from "./store.svelte";
  import { router } from "$lib/router.svelte";
  import "./history.css";

  const store = new HistoryStore();
  const small = params.size === 1440;
  // box sizes at the two stage sizes (spec 4.1 content box: 1856 x 984 and 1376 x 804)
  const size = small ? { width: 1376, string: 280, table: 268 } : { width: 1856, string: 392, table: 336 };

  let progress = $state(Math.min(1, Math.max(0, Number(router.query("pos")) || 0)));
  let playing = $state(false);

  onMount(() => {
    void store.start();
    const unsubscribe = live.on("feed", () => void store.refreshSpans());
    return unsubscribe;
  });

  const ls = $derived(live.state);
  const route = $derived(store.route);
  const pick = $derived(store.pick);
  const pickPoint = $derived(route && pick ? store.pointOn(route.id, pick.place_id) : null);
  const ready = $derived(!!route && !!store.range && !!store.summary && !!ls);

  $effect(() => {
    shell.scope = route ? ["ROUTE", route.name] : null;
  });
  $effect(() => {
    const system = ls?.system;
    if (system) {
      shell.statusFallback = `RECORDING · DISK ${Math.round(system.disk.pct)}% · DECODER QUEUE ${system.decoder.queue} · MEDIAN ${(system.decoder.median_latency_s ?? 0).toFixed(1)} S`;
    }
  });

  // a live range follows the clock: reload every 30 sim seconds
  $effect(() => {
    const { now, loadedNow, range, loading } = store;
    if (range?.live && now != null && loadedNow != null && !loading && Math.abs(now - loadedNow) >= 30) void store.load();
  });

  /** Step the selection through the table order (j next, k previous). */
  function step(delta: number): void {
    const rows = store.rows;
    const at = rows.findIndex((r) => r.id === pick?.id);
    const next = rows[Math.min(rows.length - 1, Math.max(0, at + delta))];
    if (next) store.select(next.id);
  }

  const prevDate = $derived.by(() => {
    const day = new Date(`${ls ? simDate(ls) : "1970-01-01"}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() - 1);
    return day.toISOString().slice(5, 10);
  });
  const when = $derived((store.range?.start_t ?? 0) < 0 ? `YESTERDAY · ${prevDate}` : "EARLIER TODAY");
  const channelCount = $derived(new Set(store.rawRows.map((r) => r.aar)).size);
  const keyed = $derived((ls?.active_transmissions.length ?? 0) > 0);
  const diskFault = $derived(ls?.system.disk.state === "fault");
  const clock = $derived(ls ? fmt.clock(ls.clock, "").trim() : fmt.BLANK);
</script>

{#if ready && route && ls}
  {@const range = store.range!}
  <section class="hi-box hi-hero hero" aria-label="Range">
    <Hero
      summary={store.summary!}
      {range}
      span={store.span}
      channels={channelCount}
      tz={ls.tz.name}
      {clock}
      {when}
      onstep={(delta) => store.step(delta)}
      onspan={(label) => store.setSpan(label)}
      onnow={() => store.toNow()}
    />
  </section>
  <section class="hi-box hi-routes">
    <RouteTabs routes={store.routes} {route} counts={store.routeCounts} rows={store.rows} {small} onselect={(id) => store.selectRoute(id)} />
  </section>
  <section class="hi-box hi-string" aria-label="Stringline">
    <Stringline
      {route}
      rows={store.rows}
      trains={store.trains}
      {range}
      now={range.live ? store.loadedNow : null}
      tz={ls.tz.name}
      selectedTrain={store.selectedTrain}
      {pick}
      {pickPoint}
      width={size.width}
      height={size.string}
      {progress}
      onselect={(id) => store.select(id)}
    />
  </section>
  <section class="hi-box hi-scrub" aria-label="Time scrubber">
    <TimeScrubber
      input={{
        width: size.width,
        small,
        summary: store.summary!,
        range,
        now: store.loadedNow ?? ls.t_offset_s,
        date: simDate(ls),
        pick,
        progress,
        spans: store.spans,
        diskFault,
      }}
    />
  </section>
  <section class="hi-box hi-table txlog" aria-label="Transcript table">
    <TranscriptTable
      rows={store.rows}
      total={store.total}
      {range}
      {pick}
      selectedTrain={store.selectedTrain}
      trains={store.trains}
      filters={store.filters}
      channels={store.channelLabels}
      height={size.table}
      {small}
      onselect={(id) => store.select(id)}
      onfilter={(key, value) => store.setFilter(key, value)}
    />
  </section>
  <section class="hi-box hi-player br" aria-label="Clip player">
    <ClipPlayer row={pick} point={pickPoint ?? store.anyPoint(pick?.place_id ?? null)} tz={ls.tz.name} {small} {keyed} bind:progress bind:playing onstep={step} />
  </section>
{:else if store.error}
  <section class="hi-box hi-hero"><div class="empty"><div class="t-panel">HISTORY UNAVAILABLE</div><div class="t-body">{store.error}</div></div></section>
{/if}

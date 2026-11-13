<script lang="ts">
  /**
   * /stats: the day's analytics (spec 4.4). Ridgeline hero and channel x hour heatmap on top; top talkers,
   * detector board and decoder quality + feed uptime below. All of it from GET /api/stats?range=, refetched on
   * a range change and every 60 s; only the now-line and the keyed ticks follow the live socket.
   */
  import { api } from "$lib/api/client";
  import { params } from "$lib/params";
  import { router } from "$lib/router.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import * as fmt from "$lib/hud/fmt";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import ChannelHourHeatmap from "./ChannelHourHeatmap.svelte";
  import DecoderQuality from "./DecoderQuality.svelte";
  import DetectorBoard from "./DetectorBoard.svelte";
  import FeedUptime from "./FeedUptime.svelte";
  import RangeTabs from "./RangeTabs.svelte";
  import Ridgeline from "./Ridgeline.svelte";
  import TopTalkers from "./TopTalkers.svelte";
  import { buildSeries, rhythm } from "./stats";
  import type { StatsRange, StatsView } from "./types";
  import "./stats.css";

  const REFRESH_MS = 60_000;
  const RANGE_LABELS: Record<StatsRange, string> = { today: "TODAY", yesterday: "YESTERDAY", rolling_24h: "LAST 24 H" };

  const compact = params.size === 1440;
  const range = $derived<StatsRange>(
    (["yesterday", "rolling_24h"] as const).find((r) => r === router.query("range")) ?? "today",
  );
  const snapshot = $derived(live.state);

  let stats = $state.raw<StatsView | null>(null);
  let failed = $state(false);

  // Fetch once the scenario jump has landed (first snapshot), on every range change, and every 60 s.
  const ready = $derived(snapshot != null);
  $effect(() => {
    if (!ready) return;
    const wanted = range;
    let current = true;
    const load = async () => {
      try {
        const result = (await api.stats(wanted)) as unknown as StatsView;
        if (current) [stats, failed] = [result, false];
      } catch {
        if (current) failed = true;
      }
    };
    load();
    const timer = wanted === "yesterday" ? undefined : setInterval(load, REFRESH_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  });

  // Title block scope and the nominal status readout.
  $effect(() => {
    shell.scope = ["RANGE", RANGE_LABELS[range].replace("LAST ", "")];
  });
  $effect(() => {
    const system = snapshot?.system;
    if (!system) return;
    const median = system.decoder.median_latency_s;
    shell.statusFallback = `RECORDING · DISK ${Math.round(system.disk.pct)}% · DECODER QUEUE ${system.decoder.queue} · MEDIAN ${median == null ? fmt.BLANK : median.toFixed(1)} S`;
  });

  const isLiveRange = $derived(range !== "yesterday");
  const nowT = $derived(isLiveRange && snapshot ? snapshot.t_offset_s : null);
  const liveFrequencies = $derived(new Set((snapshot?.active_transmissions ?? []).map((tx) => tx.frequency_id)));
  const zone = $derived(snapshot?.tz.name ?? "");
  const rangeLabel = $derived(RANGE_LABELS[range]);
  const rangeSpan = $derived(
    // refreshed with the 60 s fetch only; NOW and the live ticks move on the clock, the totals and this span do not
    stats ? `${range === "rolling_24h" ? fmt.hm(stats.start_t) : "00:00"}–${range === "yesterday" ? "24:00" : stats.end.slice(0, 5)} ${zone}` : "",
  );

  const set = $derived(stats ? buildSeries(stats) : null);

  // Panel boxes are measured, so the ridgeline and the heatmap share one vertical rhythm.
  const PANEL_PAD_X = 32;
  const PANEL_PAD_Y = 56;
  let ridgeBox = $state({ w: 0, h: 0 });
  let heatBox = $state({ w: 0, h: 0 });
  let decoderBox = $state({ w: 0, h: 0 });
  const layout = $derived(set ? rhythm(ridgeBox.h - PANEL_PAD_Y, set.series.length) : null);
</script>

{#if stats && set}
  <section class="st-box st-hero hero">
    <span class="hero__stack"><span class="a">AIRTIME {rangeLabel}</span><span class="b">{rangeSpan}</span></span>
    <span class="hero__big">{stats.totals.airtime_label}</span>
    <span class="hero__stack">
      <span class="a">{stats.busiest.aar} · {stats.busiest.label} · {stats.busiest.share_label}</span>
      <span class="b">BUSIEST CHANNEL · SHARE OF AIRTIME</span>
    </span>
    <span class="st-rule"></span>
    <span class="hero__big is-sm">{stats.totals.count}</span>
    <span class="hero__stack"><span class="a">TRANSMISSIONS</span><span class="b">{stats.totals.blips} BLIPS · KERCHUNKS, NOT COUNTED</span></span>
    {#if !compact}
      <span class="st-rule"></span>
      <span class="hero__big is-sm">{set.heard}</span>
      <span class="hero__stack"><span class="a">CHANNELS HEARD</span><span class="b">OF {set.monitored} MONITORED</span></span>
    {/if}
    <span class="hero__aside"><RangeTabs {range} onselect={(r) => router.setQuery({ range: r === "today" ? null : r })} /></span>
  </section>

  <section class="st-box st-ridge panel br" aria-label="Ridgeline" bind:clientWidth={ridgeBox.w} bind:clientHeight={ridgeBox.h}>
    {#if layout && ridgeBox.w}
      <Ridgeline
        {stats}
        {set}
        {layout}
        width={ridgeBox.w - PANEL_PAD_X}
        height={ridgeBox.h - PANEL_PAD_Y}
        {range}
        {nowT}
        nowLabel={snapshot?.clock.slice(0, 5) ?? ""}
        {zone}
        {liveFrequencies}
        {compact}
      />
    {/if}
  </section>

  <section class="st-box st-heat panel br" aria-label="Channel by hour heatmap" bind:clientWidth={heatBox.w}>
    {#if layout && heatBox.w}
      <ChannelHourHeatmap {stats} {set} {layout} width={heatBox.w - PANEL_PAD_X} height={ridgeBox.h - PANEL_PAD_Y} {range} {nowT} />
    {/if}
  </section>

  <section class="st-box st-talk panel br" aria-label="Top talkers"><TopTalkers {stats} {rangeLabel} /></section>
  <section class="st-box st-det panel br" aria-label="Detector board"><DetectorBoard {stats} {rangeLabel} {compact} /></section>

  <section class="st-box st-dec panel br" aria-label="Decoder quality and feed uptime" bind:clientWidth={decoderBox.w}>
    {#if decoderBox.w}
      <DecoderQuality {stats} width={decoderBox.w - PANEL_PAD_X} {compact} queue={range === "today" ? (snapshot?.system.decoder.queue ?? null) : null} />
      <FeedUptime {stats} width={decoderBox.w - PANEL_PAD_X} {range} {nowT} {rangeSpan} />
    {/if}
  </section>
{:else if failed}
  <EmptyState title="STATS UNAVAILABLE" detail="The backend did not answer. Retrying every minute." />
{/if}

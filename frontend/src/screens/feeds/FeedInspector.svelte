<script lang="ts">
  /** Feed inspector, a HUD within the HUD: spectrum, LOFAR waterfall, sample rate, coverage, telemetry. */
  import { onDestroy, onMount } from "svelte";
  import { followLink } from "$lib/router.svelte";
  import { session } from "$lib/stores/session.svelte";
  import Button from "$lib/components/Button.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import KeyValue from "$lib/components/KeyValue.svelte";
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import SimTag from "$lib/components/SimTag.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { spectrum } from "$lib/stores/spectrum.svelte";
  import type { Feed, LiveState } from "$lib/types/live";
  import { catalogue } from "./catalogue.svelte";
  import { silentAge } from "./liveFeed.svelte";
  import CoverageThumb from "./CoverageThumb.svelte";
  import { THUMB_W } from "./coverage";
  import Gauge from "./Gauge.svelte";
  import LofarPlot from "./LofarPlot.svelte";
  import { channelNumber, driverName, feedLook, fix, isMeasured, pct, siteName } from "./look";
  import SampleRateChart from "./SampleRateChart.svelte";
  import SpectrumPlot from "./SpectrumPlot.svelte";
  import { channelX, frameFloor, frameTrace, idleRipple, sampledRows, syntheticTrace, type Cells } from "./traces";
  import { offBankLabels } from "../system/ruler";

  interface Props {
    feed: Feed;
    snapshot: LiveState;
    onedit: () => void;
    onack: () => void;
  }
  let { feed, snapshot, onedit, onack }: Props = $props();

  /** the sections' width: the inspector fills its pane, which the screen caps at 880 */
  let innerW = $state(570);
  const GUTTER = 28;
  const PLOT_W = $derived(innerW - GUTTER);
  /** the coverage thumbnail and the telemetry meters are drawn at this width */
  const HALF_W = THUMB_W;
  /** the sample-rate chart takes what the coverage thumbnail leaves when they sit side by side */
  const RATE_W = $derived(innerW >= 2 * HALF_W + 24 ? innerW - HALF_W - 24 : innerW);

  const look = $derived(feedLook(feed));
  const unacked = $derived(feed.state === "fault" && !feed.acked);
  const measured = $derived(isMeasured(feed));
  const zone = $derived(snapshot.tz.name);
  /** a silent feed's age keeps counting between reports; a healthy feed's stays at its reported value */
  const silent = silentAge(() => feed.last_sample_age_s, () => snapshot.t_offset_s, () => feed.state !== "ok");
  const sampleAge = $derived(silent.value);
  const sinceClock = $derived(fmt.clock(snapshot.t_offset_s - Math.round(feed.last_sample_age_s ?? 0), zone));
  const noTelemetry = $derived(feed.driver === "rtl_tcp" || !feed.telemetry);

  // -- live channel context ----------------------------------------------------------------------
  const channelById = $derived(new Map(snapshot.channels.map((c) => [c.id, c])));
  const heard = $derived(feed.hears.flatMap((id) => channelById.get(id) ?? []).map(channelNumber));
  /** key-ups on air that this feed receives, strongest first */
  const receptions = $derived(
    snapshot.active_transmissions
      .flatMap((tx) => (tx.receptions ?? []).filter((r) => r.feed_id === feed.id).map((r) => ({ tx, r })))
      .sort((a, b) => (b.r.snr_db ?? 0) - (a.r.snr_db ?? 0)),
  );
  const rxChannels = $derived(receptions.map(({ tx, r }) => ({ channel: channelNumber(tx), rssiDbfs: r.rssi_dbfs ?? -60, elapsedS: tx.elapsed_s ?? 0 })));

  // -- feed health over REST ----------------------------------------------------------------------
  let health = $state<{ id: string; rates: (number | null)[]; states: string[] } | null>(null);
  $effect(() => {
    const id = feed.id;
    let alive = true;
    const load = async () => {
      try {
        const h = await catalogue.feedHealth(id, 62);
        if (alive) health = { id, rates: h.series_1m.sample_rate_msps ?? [], states: h.series_1m.state ?? [] };
      } catch {
        // health is decoration: the inspector still draws from the live state
      }
    };
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  });
  const rates = $derived(health?.id === feed.id ? health.rates.slice(-15) : feed.sample_rate_15m);
  const minuteStates = $derived(health?.id === feed.id ? health.states : undefined);

  onMount(() => void catalogue.loadRoutes());

  // -- spectrum -----------------------------------------------------------------------------------
  $effect(() => spectrum.watch(feed.id));
  onDestroy(() => spectrum.watch(null));

  const ripple = $derived(idleRipple(feed.id, PLOT_W));
  /** a frame that arrived for this feed is drawn whatever else the feed reports (a node sends spectrum, not a floor) */
  const liveFrame = $derived(spectrum.watched === feed.id ? spectrum.latest : null);
  const trace = $derived.by(() => {
    if (liveFrame) return frameTrace(liveFrame, PLOT_W);
    if (measured && feed.noise_floor_dbfs != null) return syntheticTrace(feed.noise_floor_dbfs, ripple, rxChannels);
    return null;
  });
  /** the reported floor, else the median of the live frame: a measurement, never an invented number */
  const floor = $derived(feed.noise_floor_dbfs ?? (liveFrame ? frameFloor(liveFrame) : null));
  const snr = $derived(feed.snr_db == null ? null : Math.round(feed.snr_db));
  const notReported = $derived(measured && feed.sample_rate_measured_msps == null);

  // -- LOFAR waterfall ----------------------------------------------------------------------------
  const lofar = $derived(snapshot.lofar_60m);
  const cells = $derived((lofar.cells[feed.id] ?? {}) as Cells);
  const cellRows = $derived(new Set(Object.values(cells).flatMap((list) => list.map(([row]) => row))));
  const sampled = $derived(sampledRows({ rows: lofar.rows, rowS: lofar.row_s, measured, lastSampleAgeS: feed.last_sample_age_s, cellRows, minuteStates, nowS: snapshot.t_offset_s }));
  const guides = $derived([...new Set([...heard, ...Object.keys(cells).map(Number)])].sort((a, b) => a - b));
  /** while faulted the live floor is null: fall back to the feed's configured floor */
  const floorDbfs = $derived(feed.noise_floor_dbfs ?? -45);

  /** extra numerals on the ruler: every live slot and waterfall column the feed does not list as heard */
  const extraLabels = $derived(
    offBankLabels(
      heard,
      [...new Set([...rxChannels.map((r) => r.channel), ...guides])].filter((ch) => !heard.includes(ch)).sort((a, b) => a - b),
      (ch) => channelX(ch, PLOT_W) + 0.5,
    ),
  );

  // -- telemetry ----------------------------------------------------------------------------------
  const deficit = $derived(measured && feed.sample_rate_measured_msps != null ? ((feed.sample_rate_msps - feed.sample_rate_measured_msps) / feed.sample_rate_msps) * 100 : null);
  const connection = $derived(feed.state === "fault" ? feed.label.replace("FAULT · ", "") : feed.state === "offline" ? "RECONNECTING" : "CONNECTED");
  const TELEMETRY = [
    { key: "device_temp_c", label: "DEVICE TEMP", unit: "°C", gauge: { min: 0, max: 100, major: 20, minor: 10 } },
    { key: "host_cpu_pct", label: "REMOTE HOST CPU", unit: "%", gauge: { min: 0, max: 100, major: 20, minor: 10 } },
    { key: "host_temp_c", label: "REMOTE HOST TEMP", unit: "°C", gauge: { min: 0, max: 100, major: 20, minor: 10 } },
    { key: "device_drops", label: "DEVICE DROPS", unit: "", gauge: null },
  ] as const;
  const telemetryText = (key: string, value: number): string => (key === "device_drops" ? String(value) : key === "host_cpu_pct" ? pct(value) : fix(value, 1));

  const kindParts = $derived([`FEED`, driverName(feed), feed.site.toUpperCase(), `R ${feed.coverage_radius_km} KM`]);
</script>

{#snippet blank()}<span class="fb-blank">{fmt.BLANK}</span>{/snippet}

  <section class="fb-insp br" aria-label="Feed inspector">
  <header class="fb-insp__head">
    <PositionGlyph state={look.glyph} />
    <span class="t-panel">{feed.short} · {siteName(feed)}</span>
    {#if feed.sim}<SimTag />{/if}
    <span class="grow"></span>
    {#if session.isAdmin}<Button sm onclick={onedit}>EDIT</Button>{/if}
    {#if unacked}
      <Button primary sm onclick={onack}>ACK</Button>
    {:else if feed.state === "fault" && feed.acked}
      <Chip kind="acked" glyph="fault" text="ACK'D {fmt.clock(feed.acked_at, zone).slice(0, 8)}" />
    {/if}
  </header>
  <div class="fb-insp__kind">
    {#if feed.state !== "ok"}<span class={look.tone}>{feed.label} · {feed.in_state_label}</span><span class="sep"></span>{/if}
    {#each kindParts as part, i}
      {#if i}<span class="sep"></span>{/if}
      {#if i === 1}<span class="mono">{part}</span>{:else}{part}{/if}
    {/each}
  </div>

  <div class="fb-insp__body" bind:clientWidth={innerW}>
  <div class="fb-sec">
    <h4>SPECTRUM · {feed.short}<span class="r">{measured || liveFrame ? `FLOOR ${fix(floor, 1)} dBFS · SNR ${snr ?? fmt.BLANK} dB` : fmt.BLANK}</span></h4>
    <div class="fb-plot">
      <SpectrumPlot width={innerW} gutter={GUTTER} {trace} floorDbfs={floor} receptions={rxChannels} noSamplesText={measured ? "AWAITING SPECTRUM" : `NO SAMPLES · LAST ${sinceClock}`} {heard} bank={heard} {extraLabels} />
    </div>
  </div>

  <div class="fb-sec">
    <h4>WATERFALL · LAST 60 MIN<span class="r">{lofar.row_s} S/ROW · <span class="label">NEWEST AT TOP</span></span></h4>
    <div class="fb-plot">
      <LofarPlot width={innerW} gutter={GUTTER} rows={lofar.rows} rowS={lofar.row_s} {cells} {sampled} {floorDbfs} {guides} receptions={rxChannels} nowS={snapshot.t_offset_s} {zone} {measured} {sinceClock} />
    </div>
  </div>

  <div class="fb-pair">
  <div class="fb-sec" style="width:{RATE_W}px">
    <h4>SAMPLE RATE · 15 MIN<span class="r">{measured && !notReported ? `${fix(feed.sample_rate_measured_msps, 4)} MS/s` : fmt.BLANK}</span></h4>
    <div class="fb-plot"><SampleRateChart width={RATE_W} values={rates} notReported={measured && rates.every((v) => v == null)} /></div>
  </div>
  <div class="fb-sec" style="width:{HALF_W}px">
    <h4>COVERAGE<span class="r">R {feed.coverage_radius_km} KM · <span class="label">RINGS 5 KM</span></span></h4>
    <div class="fb-plot">
      <CoverageThumb {feed} others={snapshot.feeds.filter((f) => f.id !== feed.id)} routes={catalogue.routes} fault={look.frame === "fault"} markTone={look.glyph === "fault" ? "fault" : look.frame === "stale" ? "stale" : "line"} />
    </div>
  </div>
  </div>

  <div class="fb-sec">
    <h4>TELEMETRY · ALL DRIVERS<span class="r"><span class="label">MEASURED BY SDRVIZ · OR AS SET</span></span></h4>
    <div class="fb-kv2">
      <div>
        <div class="colhead">MEASURED</div>
        <KeyValue label="CONNECTION">
          {#if feed.state === "fault"}<span class="is-fault">{connection}</span>{:else}{connection}{/if}
        </KeyValue>
        {#if measured}
          {#if notReported}
            <KeyValue label="RATE MEASURED"><span class="fb-nr is-solo">NOT REPORTED</span></KeyValue>
            <KeyValue label="RATE DEFICIT"><span class="fb-nr is-solo">NOT REPORTED</span></KeyValue>
          {:else}
            <KeyValue label="RATE MEASURED" value={fix(feed.sample_rate_measured_msps, 4)} unit="MS/s" />
            <KeyValue label="RATE DEFICIT" value={fix(deficit, 2)} unit="%" />
          {/if}
          <KeyValue label="NOISE FLOOR" value={fix(floor, 1)} unit="dBFS" />
          <KeyValue label="SNR" value={snr == null ? fmt.BLANK : String(snr)} unit="dB" />
          <KeyValue label="LAST SAMPLE" value={fmt.age(sampleAge)} />
        {:else}
          {#each ["RATE MEASURED", "RATE DEFICIT", "NOISE FLOOR", "SNR"] as label}<KeyValue {label} children={blank} />{/each}
          <KeyValue label="LAST SAMPLE AGE"><span class="is-stale">{fmt.age(sampleAge, "age")}</span></KeyValue>
        {/if}
      </div>
      <div>
        <div class="colhead">AS SET</div>
        <KeyValue label="DRIVER" value={driverName(feed)} sim={feed.sim && driverName(feed) === "sdrviz-agent"} />
        <KeyValue label="CENTRE" value={fmt.freq(feed.center_mhz)} unit="MHz" />
        <KeyValue label="RATE SET" value={fix(feed.sample_rate_msps, 3)} unit="MS/s" />
        <KeyValue label="GAIN" value={fix(feed.gain_db, 1)} unit="dB" />
        <KeyValue label="PPM" value={fix(feed.ppm, 0)} />
        <KeyValue label="ENABLED" unit="CH"><a href="/frequencies?node={feed.id}&state=enabled" onclick={followLink}>{feed.hears.length}</a></KeyValue>
      </div>
    </div>
  </div>

  <div class="fb-sec">
    <h4>DEVICE + REMOTE HOST<span class="r"><span class="label">{noTelemetry ? "RTL_TCP SENDS NO STATUS · 12-BYTE GREETING, THEN I/Q" : `${driverName(feed).toUpperCase()} · AGENT-ERA FIELDS`}</span></span></h4>
    <div class="fb-kv2">
      {#each TELEMETRY as t}
        {@const value = feed.telemetry?.[t.key]}
        {#if noTelemetry}
          <KeyValue label={t.label} na="RTL_TCP" meter={t.gauge ? { w: HALF_W } : undefined} />
        {:else}
          <div class="kv" class:is-blank={value == null}>
            <span class="k">{t.label}</span>
            <span class="v">
              {#if value == null}{fmt.BLANK}{#if value === undefined}<span class="fb-nr">NOT REPORTED</span>{:else if feed.sim} <span class="tag-sim">SIM</span>{/if}
              {:else}{telemetryText(t.key, value)}{#if t.unit}<span class="u">{t.unit}</span>{/if}{#if feed.sim} <span class="tag-sim">SIM</span>{/if}{/if}
            </span>
            {#if t.gauge}<Gauge w={HALF_W} v={value ?? null} {...t.gauge} stale={!measured} />{/if}
          </div>
        {/if}
      {/each}
    </div>
  </div>

  </div>

  <div class="fb-sec">
    <div class="fb-disc">
      <button class="disclosure" aria-expanded="false" disabled={!session.isAdmin} onclick={onedit}>RECEIVER PARAMETERS</button>
      <span class="t-micro">GAIN · SQUELCH DEFAULTS · FFT SIZE · PPM CORRECTION</span>
    </div>
  </div>
</section>

<script lang="ts">
  /** One receiver in the feed list: state line, five measured values, telemetry line, live receptions. */
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import SimTag from "$lib/components/SimTag.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import * as fmt from "$lib/hud/fmt";
  import type { Feed, TxRow } from "$lib/types/live";
  import { silentAge } from "./liveFeed.svelte";
  import { driverName, feedLook, fix, isMeasured, siteName } from "./look";

  interface Props {
    feed: Feed;
    /** key-ups on air now, for the RX line */
    keyed: TxRow[];
    zone: string;
    /** sim clock, for the age of a silent feed */
    nowS: number;
    selected: boolean;
    onselect: () => void;
    onenable: (enabled: boolean) => void;
  }
  let { feed, keyed, zone, nowS, selected, onselect, onenable }: Props = $props();

  const silent = silentAge(() => feed.last_sample_age_s, () => nowS, () => feed.state !== "ok");
  const look = $derived(feedLook(feed));
  const unacked = $derived(feed.state === "fault" && !feed.acked);
  const measured = $derived(isMeasured(feed));
  const noTelemetry = $derived(feed.driver === "rtl_tcp" || !feed.telemetry);
  const agentTelemetry = $derived(
    [
      ["device_temp_c", "DEV TEMP", " °C"],
      ["host_cpu_pct", "HOST CPU", " %"],
      ["device_drops", "DROPS", ""],
    ] as const,
  );
  /** receptions of this feed in the live key-ups, strongest first */
  const receptions = $derived(
    keyed.flatMap((tx) => (tx.receptions ?? []).filter((r) => r.feed_id === feed.id).map((r) => ({ tx, r }))).sort((a, b) => (b.r.snr_db ?? 0) - (a.r.snr_db ?? 0)),
  );

  const telemetryValue = (key: string, value: number): string => (key === "device_drops" ? String(value) : key === "host_cpu_pct" ? String(Math.round(value)) : fix(value, 1));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<article
  class="fb-card"
  class:has-wash={unacked}
  class:is-selected={selected}
  tabindex="0"
  aria-label="{feed.name}, {feed.state === 'ok' ? 'nominal' : feed.label.toLowerCase()}"
  onclick={onselect}
  onkeydown={(e) => e.key === "Enter" && e.target === e.currentTarget && onselect()}
>
  <span class="frame" data-frame={look.frame} data-onset={unacked ? "" : undefined}></span><span class="sel"></span>
  <header class="fb-card__head">
    <PositionGlyph state={look.glyph} />
    <span class="fb-card__id">{feed.short}</span><span class="fb-card__site">{siteName(feed)}</span>
    {#if feed.sim}<SimTag />{/if}
    <span class="fb-card__drv is-slot" title={driverName(feed)}>{driverName(feed)}</span>
    <Toggle label="ENABLED" checked={feed.enabled} onchange={onenable} />
  </header>

  <div class="fb-card__state">
    {#if feed.state === "ok"}
      <span class="k">HEARS</span>{feed.hears.length} CH<span class="sep"></span><span class="k">LAST SAMPLE</span>{fmt.age(silent.value)}
    {:else}
      <span class={look.tone}>{feed.label}</span><span class="sep"></span><span class={look.tone}>{feed.in_state_label}</span>
      {#if feed.state === "fault"}
        <span class="sep"></span><span class="k">SINCE</span>{fmt.clock(feed.since, zone)}{#if feed.acked}<span class="sep"></span>ACK'D{/if}
      {/if}
    {/if}
  </div>

  <div class="fb-mini is-row">
    <div><span class="k">RATE<span class="u">MS/s</span></span><span class="v" class:is-blank={!measured}>{measured ? fix(feed.sample_rate_measured_msps, 3) : fmt.BLANK}</span></div>
    <div><span class="k">CENTRE<span class="u">MHz</span></span><span class="v is-set">{fmt.freq(feed.center_mhz)}</span></div>
    <div><span class="k">GAIN<span class="u">dB</span></span><span class="v is-set">{fix(feed.gain_db, 1)}</span></div>
    <div><span class="k">PPM</span><span class="v is-set">{fix(feed.ppm, 0)}</span></div>
    <div><span class="k">SNR<span class="u">dB</span></span><span class="v" class:is-blank={feed.snr_db == null}>{feed.snr_db == null ? fmt.BLANK : Math.round(feed.snr_db)}</span></div>
    <div>
      <span class="k">{measured ? "LAST" : "AGE"}</span>
      <span class="v" class:is-stale={!measured}>{fmt.age(silent.value, measured ? "last" : "age")}</span>
    </div>
  </div>

  <div class="fb-tel">
    {#if noTelemetry}
      <span><span class="k">DEV TEMP</span><span class="v is-blank">{fmt.BLANK}</span></span>
      <span><span class="k">HOST CPU</span><span class="v is-blank">{fmt.BLANK}</span></span>
      <span class="na">N/A · RTL_TCP</span>
    {:else}
      {#each agentTelemetry as [key, label, unit]}
        {@const value = feed.telemetry?.[key]}
        <span><span class="k">{label}</span><span class="v" class:is-blank={value == null}>{value == null ? fmt.BLANK : telemetryValue(key, value) + unit}</span></span>
      {/each}
      <span class="tag-sim">SIM</span>
    {/if}
  </div>

  {#if keyed.length}
    <div class="fb-rx" class:is-none={!receptions.length}>
      <span class="k">RX</span>
      {#each receptions as { tx, r }}
        <span class="r"><PositionGlyph state="tx" />{tx.aar} <small>{Math.round(r.snr_db ?? 0)} dB</small>{#if tx.feed_id === feed.id}<b>PRIMARY</b>{/if}</span>
      {:else}
        <span class="t-micro">NO KEY-UP HEARD</span>
      {/each}
    </div>
  {/if}
</article>

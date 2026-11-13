<script lang="ts">
  /**
   * Feed inspector (brief 8.3): state and fault history, receiver parameters with the 15-minute
   * sample-rate chart, telemetry (N/A for an RTL_TCP source), the channels it hears, and the ACK.
   */
  import { api } from "$lib/api/client";
  import Button from "$lib/components/Button.svelte";
  import KeyValue from "$lib/components/KeyValue.svelte";
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import * as fmt from "$lib/hud/fmt";
  import type { GlyphState } from "$lib/hud/tile";
  import { router } from "$lib/router.svelte";
  import type { Channel, Feed, LiveState } from "$lib/types/live";
  import Inspector from "./Inspector.svelte";
  import InspectorSection from "./InspectorSection.svelte";

  interface Props {
    feed: Feed;
    state: LiveState;
    logCount: number;
    onclose: () => void;
  }
  let { feed, state: snapshot, logCount, onclose }: Props = $props();

  const fault = $derived(snapshot.faults.find((f) => f.object === feed.id));
  const glyph = $derived<GlyphState>(fault ? "fault" : feed.state === "stale" ? "stale" : feed.state === "offline" ? "offline" : "idle");
  const episodeStart = $derived((feed as Feed & { episode_start?: string | null }).episode_start);
  const hears = $derived(
    feed.hears.flatMap((id) => {
      const channel = snapshot.channels.find((c: Channel) => c.id === id);
      return channel ? [channel] : [];
    }),
  );
  const telemetryLabel = (key: string) => key.replace(/_c$/, "").replace(/_pct$/, "").replace(/_/g, " ").toUpperCase();

  /* sample-rate chart: 440 x 40, a step line, the 90 % line dashed, a one-minute ruler underneath */
  const CHART_W = 440;
  const CHART_H = 40;
  const snap = (v: number) => Math.round(v) + 0.5;
  const rate = $derived(feed.sample_rate_15m ?? []);
  const rateY = (v: number) => snap(2 + (1 - v / feed.sample_rate_msps) * (CHART_H - 4));
  const stepPath = $derived(
    rate
      .map((v, i) => {
        const x0 = Math.round((i * CHART_W) / rate.length);
        const x1 = Math.round(((i + 1) * CHART_W) / rate.length);
        return `${i ? "L" : "M"}${x0} ${rateY(v ?? 0)}H${x1}`;
      })
      .join(""),
  );
  const minutes = Array.from({ length: 16 }, (_, i) => i);

  let acking = $state(false);
  async function acknowledge(): Promise<void> {
    acking = true;
    try {
      await api.feeds.ack(feed.id);
    } catch (error) {
      console.warn("ACK failed", error);
    } finally {
      acking = false;
    }
  }
</script>

<Inspector title={feed.name.toUpperCase()} kind="FEED · {feed.site.toUpperCase()}" {glyph} sim={feed.sim} {logCount} {onclose}>
  {#snippet lead()}
    <div class="lo-lead">
      {#if fault || feed.state !== "ok"}
        <div class="row">
          <PositionGlyph state={glyph} />
          <span class="reason" class:c-stale={!fault}>{feed.label}</span>
        </div>
        <div class="sub">SINCE {feed.since} · {fmt.age(feed.in_state_s, "age")}{#if fault?.acked}{" · ACK'D "}{fault.acked_at}{/if}</div>
      {/if}
    </div>
  {/snippet}

  <InspectorSection title="STATE">
    <KeyValue label="STATE">{#if fault}<span class="c-fault">{feed.label}</span>{:else}{feed.state.toUpperCase()}{/if}</KeyValue>
    <KeyValue label="SINCE" value={feed.since ?? fmt.BLANK} />
    <KeyValue label="EPISODE START" value={episodeStart ?? fmt.BLANK} />
    <KeyValue label="LAST SAMPLE" value="AGE {fmt.age(feed.last_sample_age_s, 'age')}" />
    {#if fault}
      <KeyValue label="ACKNOWLEDGED">{#if fault.acked}{fault.acked_at}{:else}<span class="c-ink-3">NOT YET</span>{/if}</KeyValue>
    {/if}
  </InspectorSection>

  <InspectorSection title="RECEIVER · {feed.driver.toUpperCase()}">
    <KeyValue label="CENTRE" value={fmt.freq(feed.center_mhz)} unit="MHz" />
    <KeyValue label="SAMPLE RATE" value={feed.sample_rate_msps.toFixed(1)} unit="MS/s" />
    <KeyValue label="MEASURED" value={feed.sample_rate_measured_msps != null ? feed.sample_rate_measured_msps.toFixed(4) : fmt.BLANK} unit="MS/s" />
    <KeyValue label="GAIN" value={feed.gain_db != null ? feed.gain_db.toFixed(1) : fmt.BLANK} unit="dB" />
    <KeyValue label="PPM" value={feed.ppm != null ? String(feed.ppm) : fmt.BLANK} />
    <KeyValue label="NOISE FLOOR" value={feed.noise_floor_dbfs != null ? fmt.num(feed.noise_floor_dbfs) : fmt.BLANK} unit={feed.noise_floor_dbfs != null ? "dBFS" : ""} />
    <div class="lo-chart">
      <svg class="hud" width={CHART_W} height={CHART_H + 4}>
        <path class="s-hair k-faint d-threshold" d="M0 {rateY(feed.sample_rate_msps * 0.9)}H{CHART_W}" />
        <path class="s-hair k-line" d={stepPath} />
        <g class="ruler">
          <path class="s-hair k-faint" d="M0 {snap(CHART_H + 3)}H{CHART_W}" />
          {#each minutes as m}
            {@const x = snap((m * (CHART_W - 1)) / 15)}
            <path class="s-hair {m % 5 === 0 ? 'k-line' : 'k-faint'}" d="M{x} {CHART_H + 3}V{CHART_H + 3 - (m % 5 === 0 ? 8 : 4)}" />
          {/each}
        </g>
      </svg>
      <span class="t-micro">SAMPLE RATE · LAST <span class="mono">15</span> MIN · 90% LINE DASHED</span>
    </div>
  </InspectorSection>

  <InspectorSection title="TELEMETRY">
    {#each feed.telemetry_na ?? [] as key (key)}
      <KeyValue label={telemetryLabel(key)} na="RTL_TCP" />
    {/each}
  </InspectorSection>

  <InspectorSection title="HEARS · {hears.length} CHANNELS">
    <div class="lo-hears">
      {#each hears as channel (channel.id)}<span><b>{channel.aar}</b>{channel.label}</span>{/each}
    </div>
  </InspectorSection>

  <InspectorSection title="ACTIONS">
    <div class="insp-btns">
      <Button primary={!!fault && !fault.acked} disabled={!fault || fault.acked || acking} onclick={acknowledge}>{fault?.acked ? "ACK'D" : "ACK"}</Button>
      <Button onclick={() => router.go(`/feeds?inspect=${feed.id}`)}>OPEN IN FEEDS &amp; BANKS</Button>
    </div>
  </InspectorSection>
</Inspector>

<script lang="ts">
  /** Backend statistics: build, process, disk, websocket clients, radio receiver and transit timings. */
  import Chip from "$lib/components/Chip.svelte";
  import KeyValue from "$lib/components/KeyValue.svelte";
  import * as fmt from "$lib/hud/fmt";
  import type { ChipKind } from "$lib/hud/chips";
  import { bytes, uptime } from "./format";
  import type { SourceState, TransitSource } from "$lib/types/sources";
  import type { BackendStats, RadioStatus } from "./types";

  interface Props {
    stats: BackendStats | null;
    radio: RadioStatus | null;
    sources: TransitSource[];
    now: number;
    /** the stats request failed */
    failed: boolean;
  }
  let { stats, radio, sources, now, failed }: Props = $props();

  const CHIP: Record<SourceState, ChipKind> = { ok: "nominal", stale: "degraded", error: "fault", disabled: "offline", loading: "armed" };
  const RADIO_CHIP: Record<string, ChipKind> = { connected: "nominal", streaming: "nominal", starting: "armed", reconnecting: "degraded", disabled: "offline", off: "offline" };

  const ago = (iso: string | null): string => (iso ? fmt.age((now - Date.parse(iso)) / 1000, "age") : fmt.BLANK);
  const openChannels = $derived(Object.values(radio?.channels ?? {}).filter((c) => c.open).length);
  const channelCount = $derived(Object.keys(radio?.channels ?? {}).length);
  const diskUsed = $derived(stats ? 1 - stats.disk.free_bytes / stats.disk.total_bytes : 0);
</script>

<section class="st-backend br" aria-label="Backend">
  <header class="st-card__head"><span class="t-panel">BACKEND</span><span class="grow"></span>{#if stats}<span class="t-micro">PID <span class="mono">{stats.build.pid}</span></span>{/if}</header>
  {#if failed && !stats}<p class="st-card__error" role="alert">Backend statistics unavailable.</p>{/if}

  {#if stats}
    <h4 class="st-h">BUILD</h4>
    <div class="st-kv">
      <KeyValue label="VERSION" value={`${stats.build.version}${stats.build.commit ? ` · ${stats.build.commit}` : ""}`} />
      <KeyValue label="PYTHON" value={stats.build.python} />
      <KeyValue label="PLATFORM" value={stats.build.platform} />
      <KeyValue label="UPTIME" value={uptime(stats.uptime_s)} />
      <KeyValue label="SIMULATION" value={stats.sim.enabled ? `ON · ${stats.sim.speed}×` : "OFF"} />
    </div>

    <h4 class="st-h">PROCESS</h4>
    <div class="st-kv">
      <KeyValue label="CPU" value={`${stats.cpu.process_pct.toFixed(1)}%`} />
      <KeyValue label="LOAD 1/5/15" value={stats.cpu.load_avg.join(" · ")} />
      <KeyValue label="MEMORY" value={bytes(stats.memory.rss_bytes)} />
      <KeyValue label="PEAK MEMORY" value={bytes(stats.memory.peak_rss_bytes)} />
    </div>

    <h4 class="st-h">DISK <span class="t-micro">{bytes(stats.disk.free_bytes)} FREE OF {bytes(stats.disk.total_bytes)} · {Math.round(diskUsed * 100)}% USED</span></h4>
    <div class="st-kv">
      <KeyValue label="DATA DIRECTORY" value={bytes(stats.disk.data_bytes)} />
      <KeyValue label="AUDIO" value={bytes(stats.disk.audio_bytes)} />
      <KeyValue label="DATABASE" value={bytes(stats.disk.db_bytes)} />
    </div>

    <h4 class="st-h">WEBSOCKET</h4>
    <div class="st-kv">
      <KeyValue label="CLIENTS" value={String(stats.websocket.clients)} />
      <KeyValue label="AUDIO SUBSCRIPTIONS" value={String(stats.websocket.audio_subscriptions)} />
      <KeyValue label="SPECTRUM WATCHERS" value={String(stats.websocket.spectrum_watchers)} />
    </div>
  {/if}

  <h4 class="st-h">RADIO RECEIVER</h4>
  {#if radio}
    <div class="st-kv">
      <KeyValue label="STATE"><Chip text={(radio.state ?? "unknown").toUpperCase()} kind={RADIO_CHIP[radio.state ?? ""] ?? "degraded"} /></KeyValue>
      <KeyValue label="HOST" value={radio.host?.startsWith(":") ? fmt.BLANK : (radio.host ?? fmt.BLANK)} />
      <KeyValue label="THROUGHPUT" value={radio.throughput == null ? fmt.BLANK : `${Math.round(radio.throughput * 100)}%`} />
      <KeyValue label="CHANNELS OPEN" value={channelCount ? `${openChannels} / ${channelCount}` : fmt.BLANK} />
    </div>
    {#if radio.error}<p class="st-card__error">{radio.error}</p>{/if}
  {:else}
    <p class="t-micro">NO RADIO STATUS</p>
  {/if}

  <h4 class="st-h">TRANSIT TIMINGS</h4>
  {#if sources.length}
    <table class="st-table">
      <thead><tr><th>SOURCE</th><th>STATE</th><th>STATIC AGE</th><th>REALTIME AGE</th></tr></thead>
      <tbody>
        {#each sources as s (s.id)}
          <tr>
            <td>{s.name}</td>
            <td><Chip text={s.status.state.toUpperCase()} kind={CHIP[s.status.state]} /></td>
            <td class="mono">{ago(s.status.static_loaded_at)}</td>
            <td class="mono">{s.kind === "lines" ? "N/A" : ago(s.status.rt_updated_at)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="t-micro">NO TRANSIT SOURCES</p>
  {/if}
</section>

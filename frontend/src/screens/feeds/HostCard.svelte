<script lang="ts">
  /** HOST · BACKEND card: CPU, SoC temperature, disk and decoder queue (spec 5.30). */
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import * as fmt from "$lib/hud/fmt";
  import type { SystemInfo } from "$lib/types/live";
  import Gauge from "./Gauge.svelte";
  import { fix, pct } from "./look";

  let { system }: { system: SystemInfo } = $props();

  const host = $derived(system.host);
  const look = $derived(host.state === "fault" ? { frame: "fault", glyph: "fault" } : host.state === "degraded" ? { frame: "stale", glyph: "stale" } : { frame: "idle", glyph: "idle" });
</script>

<article class="fb-card" aria-label="Host, backend">
  <span class="frame" data-frame={look.frame}></span>
  <header class="fb-card__head">
    <PositionGlyph state={look.glyph as "fault" | "stale" | "idle"} />
    <span class="fb-card__site" style="color:var(--ink)">HOST</span><span class="fb-card__site">BACKEND</span>
    <span class="fb-card__drv"><span class="t-micro">UPTIME</span> {fmt.age(host.uptime_s)}</span>
  </header>
  <div class="fb-mini">
    <div><span class="k">CPU</span><span class="v">{pct(host.cpu_pct)}<span class="u">%</span></span><Gauge v={host.cpu_pct} min={0} max={100} major={20} minor={10} /></div>
    <div><span class="k">SOC TEMP</span><span class="v">{fix(host.soc_temp_c, 1)}<span class="u">°C</span></span><Gauge v={host.soc_temp_c} min={30} max={90} major={10} minor={5} thr={[80, 85]} /></div>
    <div><span class="k">DISK</span><span class="v">{pct(system.disk.pct)}<span class="u">%</span></span><Gauge v={system.disk.pct} min={0} max={100} major={20} minor={10} thr={[85, 97]} /></div>
    <div><span class="k">THROTTLED</span><span class="v is-set">{host.throttled ? "YES" : "NO"}</span></div>
    <div><span class="k">UNDER-VOLTAGE</span><span class="v is-set">{host.under_voltage ? "YES" : "NO"}</span></div>
    <div><span class="k">ASR QUEUE</span><span class="v">{system.decoder.queue}<span class="u">· {fix(system.decoder.median_latency_s, 1)} S</span></span></div>
  </div>
</article>

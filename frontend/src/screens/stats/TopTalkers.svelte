<script lang="ts">
  /** Two ranked bar lists: channels by airtime and speakers (trains) by transmissions. */
  import * as fmt from "$lib/hud/fmt";
  import { pad2 } from "./stats";
  import type { StatsView } from "./types";

  interface Props {
    stats: StatsView;
    rangeLabel: string;
  }
  let { stats, rangeLabel }: Props = $props();

  const channels = $derived(stats.top_channels.map((id) => stats.channels[id]).filter(Boolean).slice(0, 10));
  const talkers = $derived(stats.top_talkers.slice(0, 10));
  const channelMax = $derived(Math.max(1, ...channels.map((c) => c.airtime_s)));
  const talkerMax = $derived(Math.max(1, ...talkers.map((t) => t.count)));
  const barWidth = (value: number, max: number) => `${Math.max(2, Math.round((value / max) * 100))}%`;
</script>

<div class="panel__head">
  <span class="t-panel">TOP TALKERS</span>
  <span class="t-micro">{rangeLabel} · <b>SIM</b> IDENTITIES</span>
</div>
<div class="st-cols">
  <div>
    <div class="st-colh"><span class="t-micro">CHANNELS · AIRTIME</span><span class="t-micro">H:M:S · TX</span></div>
    {#each channels as c (c.frequency_id)}
      <div class="st-trow">
        <span class="n">CH{pad2(c.aar_channel)}<span class="l">{c.label}</span></span>
        <span class="v">{fmt.total(c.airtime_s)} · {c.count}</span>
        <span class="b"><i style="width:{barWidth(c.airtime_s, channelMax)}"></i></span>
      </div>
    {/each}
  </div>
  <div>
    <div class="st-colh"><span class="t-micro">SPEAKERS · TRAINS · BY TX</span><span class="t-micro">TX</span></div>
    {#each talkers as t (t.name)}
      <div class="st-trow">
        <span class="n">{fmt.trainId(t.name)}</span>
        <span class="v">{t.count}</span>
        <span class="b"><i style="width:{barWidth(t.count, talkerMax)}"></i></span>
      </div>
    {/each}
  </div>
</div>

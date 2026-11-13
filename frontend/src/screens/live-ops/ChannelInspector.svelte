<script lang="ts">
  /**
   * Channel inspector (brief 8.3, spec 5.26): who is talking, who hears it, which banks carry it,
   * the AUDIO mixer and the recent transmissions on the frequency.
   */
  import KeyValue from "$lib/components/KeyValue.svelte";
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import SimTag from "$lib/components/SimTag.svelte";
  import Waveform from "$lib/components/Waveform.svelte";
  import { feedName } from "$lib/hud/roles";
  import * as fmt from "$lib/hud/fmt";
  import { speaker } from "$lib/hud/speaker";
  import { levels } from "$lib/stores/levels.svelte";
  import type { Channel, LiveState } from "$lib/types/live";
  import AudioMixer from "./AudioMixer.svelte";
  import Inspector from "./Inspector.svelte";
  import InspectorSection from "./InspectorSection.svelte";
  import { WAVE_WIDTH, waveEnvelope } from "./wave";
  import { noiseFloor } from "./wall";

  interface Props {
    channel: Channel;
    state: LiveState;
    /** smooth sim time, for the elapsed readout */
    now: number;
    logCount: number;
    onclose: () => void;
  }
  let { channel, state: snapshot, now, logCount, onclose }: Props = $props();

  const tx = $derived(channel.tx);
  const active = $derived(tx ? snapshot.active_transmissions.find((row) => row.id === tx.tx_id) : undefined);
  const elapsed = $derived(active ? Math.max(0, now - active.t_offset_s) : (tx?.elapsed_s ?? 0));
  const floor = $derived.by(() => {
    const feed = snapshot.feeds.find((f) => f.id === (tx?.primary_feed ?? channel.heard_by[0]));
    return feed ? noiseFloor(feed) : null;
  });
  const envelope = $derived.by(() => {
    void levels.version;
    return waveEnvelope(levels.envelope(channel.id), floor ?? -45, elapsed, active?.words);
  });
  const recent = $derived(snapshot.transcript.rows.filter((row) => row.frequency_id === channel.id && !row.live).slice(0, 2));
</script>

<Inspector title="{channel.aar} · {channel.label}" kind="CHANNEL · {channel.heard_by.length} FEEDS HEAR IT" glyph={tx ? "tx" : "idle"} {logCount} {onclose}>
  {#snippet lead()}
    <div class="lo-lead">
      <div class="row">
        <span class="big" class:is-tx={!!tx}>{channel.aar4}</span>
        {#if tx}<span class="big is-tx" style="margin-left:auto">{fmt.dur(elapsed)}</span>{/if}
      </div>
      <div class="sub">{fmt.freq(channel.freq_mhz)} MHz · {channel.railroad.toUpperCase()} · {channel.use.toUpperCase()}</div>
      {#if tx}
        <div class="lo-wave" style="position:relative;height:16px;margin-top:4px"><Waveform env={envelope} width={WAVE_WIDTH} height={16} live /></div>
      {/if}
    </div>
  {/snippet}

  {#if tx && active}
    <InspectorSection title="TRANSMISSION · {active.id.toUpperCase()}">
      <KeyValue label="KEYED AT" value={active.clock_tenths} />
      <KeyValue label="ELAPSED" value={fmt.dur(elapsed)} />
      <KeyValue label="TALKER">{active.train_id ?? active.speaker ?? fmt.BLANK}{#if active.train_id}{" "}<SimTag />{/if}</KeyValue>
      <KeyValue label="ROLE" value={active.role_tag} />
      <KeyValue label="TRANSCRIPT"><span class="c-ink-2">{active.state === "decoding" ? "DECODING" : active.state.toUpperCase()}</span></KeyValue>
    </InspectorSection>
    <InspectorSection title="RECEPTIONS · {tx.receptions.length} · PRIMARY {tx.via}">
      <div class="lo-rx is-head"><span></span><span>FEED</span><span>SNR dB</span><span>RSSI dBFS</span><span>DIST km</span></div>
      {#each tx.receptions as r (r.feed_id)}
        <div class="lo-rx">
          {#if r.feed_id === tx.primary_feed}<PositionGlyph state="tx" />{:else}<span></span>{/if}
          <span class="f">{feedName(r.feed_id)}</span>
          <span>{r.snr_db == null ? fmt.BLANK : r.snr_db.toFixed(1)}</span>
          <span>{fmt.num(r.rssi_dbfs)}</span>
          <span>{r.dist_km == null ? fmt.BLANK : r.dist_km.toFixed(1)}</span>
        </div>
      {/each}
    </InspectorSection>
  {/if}

  <InspectorSection title="COVERAGE">
    {#each channel.coverage.pips as pip (pip.feed_id)}
      <KeyValue label={pip.short} value={pip.state.toUpperCase()} />
    {/each}
  </InspectorSection>

  <InspectorSection title="BANKS">
    <div class="lo-banks">
      {#each snapshot.banks as bank (bank.id)}
        <span class="check" role="checkbox" aria-checked={channel.banks.includes(bank.id)} aria-readonly="true"><i></i>{bank.name}</span>
      {/each}
    </div>
  </InspectorSection>

  <InspectorSection title="AUDIO">
    <AudioMixer channelId={channel.id} {floor} keyed={!!tx} />
  </InspectorSection>

  {#if recent.length}
    <InspectorSection title="RECENT TRANSMISSIONS">
      {#each recent as row (row.id)}
        <div class="lo-recent">
          <span class="t">{row.clock.slice(0, 8)}</span>
          <span class="f">{row.feed_label}</span>
          <span class="w">{speaker({ speaker_role: row.role, train_id: row.train_id, speaker: row.speaker }).who}</span>
          <span class="x">{row.transcript || (row.detector ? row.detector.mp_label : "")}</span>
        </div>
      {/each}
    </InspectorSection>
  {/if}
</Inspector>

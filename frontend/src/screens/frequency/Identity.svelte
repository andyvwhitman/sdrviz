<script lang="ts">
  /**
   * The channel's identity and its one live datum: how long since it last spoke, or while it is keyed the orange
   * timer. The age and the timer come from the live store, the same source as the Live Ops tile.
   */
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { followLink } from "$lib/router.svelte";
  import { simClock } from "$lib/stores/simClock.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { viewport } from "$lib/stores/viewport.svelte";
  import { cyclicAge } from "$lib/time";
  import type { Channel } from "$lib/types/live";
  import type { FrequencyInfo } from "$lib/types/recordings";

  interface Props {
    info: FrequencyInfo;
    /** the live channel, when this frequency is in the active bank */
    channel: Channel | undefined;
    /** seconds the channel has been keyed, or null when it is not */
    keyedElapsed: number | null;
    /** phone: the lid below the name holds heard-by, banks, notes */
    lidOpen: boolean;
    ontogglelid: () => void;
  }
  let { info, channel, keyedElapsed, lidOpen, ontogglelid }: Props = $props();

  const snapshot = $derived(live.state);
  const keyed = $derived(keyedElapsed !== null);
  const lastHeard = $derived(channel?.last_heard ?? null);
  const ageS = $derived(lastHeard ? cyclicAge(simClock.now, lastHeard.end_t) : null);
  const via = $derived(channel?.tx?.via ?? "");

  const aar4 = $derived(info.aar_channel != null ? fmt.aar(info.aar_channel) : (channel?.aar4 ?? fmt.BLANK));
  const feeds = $derived((channel?.heard_by ?? []).map((id) => snapshot?.feeds.find((feed) => feed.id === id)?.short ?? id));
  const banks = $derived((channel?.banks ?? []).map((id) => snapshot?.banks.find((bank) => bank.id === id)?.name ?? id));
  const sub = $derived([info.railroad, info.use, ...(viewport.phone ? [] : [info.line])].filter(Boolean).join(" · "));
  const ember = $derived(channel?.state === "recent" || channel?.state === "recent-dim" ? channel.state : null);
</script>

<section class="id" aria-label="{info.label} frequency">
  <nav class="id__crumb" aria-label="Breadcrumb">
    <a href="/frequency" onclick={followLink}><span class="id__crumb-short">‹ </span>FREQUENCIES</a><span class="id__crumb-tail">{" / "}{info.label}</span>
  </nav>

  <div class="id__row">
    <div class="id__who">
      <div class="id__title">
        <span class="id__aar">{aar4}</span>
        <h1 class="id__name" data-ember={ember}>{info.label}</h1>
      </div>
      <div class="id__mhz"><span>{fmt.freq(info.freq_mhz)}</span> <span class="id__unit">MHz</span><span class="id__sub"> · {sub}</span></div>
      <div class="id__more">
        {#if feeds.length}<span>HEARD BY <b>{feeds.join(" · ")}</b></span>{/if}
        {#if banks.length}<span>BANKS <b>{banks.join(" · ")}</b></span>{/if}
      </div>
    </div>

    <div class="id__hero" class:is-keyed={keyed} aria-live="off">
      {#if keyed}
        <span class="id__k"><PositionGlyph state="tx" /> KEYED</span>
        <span class="id__big is-tx">{fmt.dur(keyedElapsed ?? 0)}</span>
        {#if via}<span class="id__via">VIA {via}</span>{/if}
      {:else if lastHeard && ageS != null}
        <span class="id__k">LAST HEARD</span>
        <span class="id__big">{fmt.age(ageS)}</span>
        <span class="id__via"><PositionGlyph state="idle" dim /> <span class="mono">{lastHeard.clock}</span></span>
      {:else}
        <span class="id__k">NOT HEARD YET</span>
      {/if}
    </div>
  </div>

  <button class="id__lid" type="button" aria-expanded={lidOpen} onclick={ontogglelid}>{lidOpen ? "▾" : "▸"} ABOUT THIS FREQUENCY</button>
  {#if lidOpen}
    <div class="id__lidbody">
      {#if feeds.length}<p>HEARD BY <b>{feeds.join(" · ")}</b></p>{/if}
      {#if banks.length}<p>BANKS <b>{banks.join(" · ")}</b></p>{/if}
      {#if info.notes}<p class="id__notes">{info.notes}</p>{/if}
    </div>
  {/if}
</section>

<style>
  .id { padding: 0 16px; background: var(--bg-void); }
  .id__crumb { min-height: 36px; display: flex; align-items: center; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); text-transform: uppercase; white-space: pre; }
  .id__crumb a { color: var(--ink-2); border: 0; display: inline-flex; align-items: center; min-height: 36px; }
  .id__crumb a:hover { color: var(--ink); }
  .id__crumb-tail { display: none; }
  .id__row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding-bottom: 6px; }
  .id__who { min-width: 0; display: grid; gap: 4px; }
  .id__title { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .id__aar { font: 500 var(--fs-24)/1 var(--font-data); color: var(--ink); }
  .id__name { margin: 0; position: relative; font: 600 var(--fs-24)/1.1 var(--font-display); letter-spacing: var(--track-display); text-transform: uppercase; color: var(--ink); }
  .id__name[data-ember]::after { content: ""; position: absolute; left: 0; right: 0; bottom: -4px; height: 2px; background: var(--state-recent); }
  .id__name[data-ember="recent-dim"]::after { background: var(--state-recent-dim); }
  .id__mhz { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font: 400 var(--fs-12)/1.3 var(--font-data); color: var(--ink); }
  .id__unit { color: var(--ink-2); }
  .id__sub { font: 500 var(--fs-13)/1.3 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-2); }
  .id__more { display: none; gap: 24px; font: 500 var(--fs-13)/1.3 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-2); }
  .id__more b, .id__lidbody b { font-weight: 500; color: var(--ink); }

  .id__hero { display: grid; justify-items: end; gap: 2px; flex: none; text-align: right; }
  .id__k { display: inline-flex; align-items: center; gap: 6px; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
  .id__big { font: 500 var(--fs-32)/1.05 var(--font-data); font-variant-numeric: tabular-nums; color: var(--ink-2); white-space: nowrap; }
  .id__big.is-tx { color: var(--state-tx); }
  .id__via { display: inline-flex; align-items: center; gap: 6px; font: 400 var(--fs-12)/1 var(--font-data); color: var(--ink-3); }
  .id__hero.is-keyed .id__via { color: var(--ink-2); font-family: var(--font-label); letter-spacing: var(--track-label); }

  .id__lid { display: block; width: 100%; min-height: 36px; text-align: left; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); border-top: 1px solid var(--grid); }
  .id__lidbody { display: grid; gap: 6px; padding: 4px 0 12px; font: 500 var(--fs-13)/1.3 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-2); background: var(--bg-raised); padding-inline: 12px; }
  .id__lidbody p { margin: 0; }
  .id__lidbody .id__notes { font: 400 var(--fs-13)/1.4 var(--font-read); letter-spacing: 0; text-transform: none; color: var(--ink-2); }

  @media (min-width: 900px) {
    .id { padding: 0 var(--margin-x); }
    .id__crumb, .id__crumb a { min-height: 28px; }
    .id__crumb-short { display: none; }
    .id__crumb-tail { display: inline; }
    .id__row { padding-bottom: 12px; }
    .id__more { display: flex; margin-top: 4px; }
    .id__big { font-size: var(--fs-48); line-height: 1; }
    .id__lid, .id__lidbody { display: none; }
  }
</style>

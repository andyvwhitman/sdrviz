<script lang="ts">
  /**
   * The channel's identity and its one live datum: how long since it last spoke, or while it is keyed the orange
   * timer. The age and the timer come from the live store, the same source as the Live Ops tile.
   *
   * `variant="pane"` (the Live Ops pane and the phone page) renders the same facts as two siblings, with no crumb and
   * no lid: the identity line, one pinned row of fixed height, and the detail that scrolls away under it. The parent
   * is the scroll box, so the line sticks to its top (docs/sprint-4/liveops-direction.md 5.8). Widths come from
   * container queries on the nearest `pane` container.
   */
  import CoveragePips from "$lib/components/CoveragePips.svelte";
  import type { Outcome } from "$lib/components/frequency-editor/editorForm";
  import FrequencyLayer from "$lib/components/frequency-editor/FrequencyLayer.svelte";
  import FrequencyWindow from "$lib/components/frequency-editor/FrequencyWindow.svelte";
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { followLink, router } from "$lib/router.svelte";
  import { session } from "$lib/stores/session.svelte";
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
    lidOpen?: boolean;
    ontogglelid?: () => void;
    /** "page": the desktop page. "pane": the Live Ops pane. "phone": the pane's two parts with the crumb above and the ABOUT lid below */
    variant?: "page" | "pane" | "phone";
    /** pane: the frequency is in a bank, but not the active one */
    offBank?: boolean;
    /** when the channel last spoke, from its newest recording, for a channel the live snapshot has no last_heard for */
    lastHeardFallback?: { ageS: number; clock: string } | null;
    /** the frequency was saved in the editor: reload what the page shows */
    onsaved?: () => void;
  }
  let { info, channel, keyedElapsed, lidOpen = false, ontogglelid, variant = "page", offBank = false, lastHeardFallback = null, onsaved }: Props = $props();

  // ---- the `⋯` and the edit window (admin only). A phone gets the full-screen layer.
  let editOpen = $state(false);
  let editButton = $state<HTMLButtonElement>();
  function edited(outcome: Outcome): void {
    if (outcome === "saved") onsaved?.();
    if (outcome !== "deleted") return;
    editOpen = false;
    // the detail page has nothing left to show; in the pane the selection is dropped
    if (variant === "pane") router.setQuery({ select: null, inspect: null });
    else router.go("/frequencies");
  }

  const snapshot = $derived(live.state);
  const keyed = $derived(keyedElapsed !== null);
  const lastHeard = $derived(channel?.last_heard ?? null);
  /** the snapshot may know nothing of this channel (it is not in the active bank): the newest recording says when it spoke */
  const heard = $derived(lastHeard ? { ageS: cyclicAge(simClock.now, lastHeard.end_t), clock: lastHeard.clock } : (lastHeardFallback ?? null));
  const via = $derived(channel?.tx?.via ?? "");

  const aar4 = $derived(info.aar_channel != null ? fmt.aar(info.aar_channel) : (channel?.aar4 ?? fmt.BLANK));
  const feeds = $derived((channel?.heard_by ?? []).map((id) => snapshot?.feeds.find((feed) => feed.id === id)?.short ?? id));
  const banks = $derived((channel?.banks ?? []).map((id) => snapshot?.banks.find((bank) => bank.id === id)?.name ?? id));
  const sub = $derived([info.railroad, info.use, ...(viewport.phone ? [] : [info.line])].filter(Boolean).join(" · "));
  const partial = $derived(channel?.coverage.state === "partial");
  const pips = $derived((channel?.coverage.pips ?? []).map((pip) => pip.state === "ok"));
  const ember = $derived(channel?.state === "recent" || channel?.state === "recent-dim" ? channel.state : null);
</script>

{#snippet editDoor()}
  {#if session.isAdmin}
    <button bind:this={editButton} class="idp__more" type="button" aria-label="Edit {info.label}" aria-haspopup="dialog" aria-expanded={editOpen} onclick={() => (editOpen = !editOpen)}><i></i><i></i><i></i></button>
    {#if editOpen && viewport.handset}
      <FrequencyLayer frequencyId={info.id} openPage={variant === "pane"} onclose={() => (editOpen = false)} ondone={edited} />
    {:else if editOpen && editButton}
      <FrequencyWindow frequencyId={info.id} anchor={editButton} kind="button" openPage={variant === "pane"} onclose={() => (editOpen = false)} ondone={edited} />
    {/if}
  {/if}
{/snippet}

{#snippet hero()}
  <div class="idp__hero" class:is-keyed={keyed} aria-live="off">
    {#if keyed}
      <PositionGlyph state="tx" /><span class="idp__k">KEYED</span>
      <span class="idp__big is-tx">{fmt.dur(keyedElapsed ?? 0)}</span>
    {:else if heard}
      <span class="idp__k">LAST HEARD</span>
      <span class="idp__big">{fmt.age(heard.ageS)}</span>
    {:else}
      <span class="idp__k">NOT HEARD YET</span>
    {/if}
  </div>
{/snippet}

{#if variant !== "page"}
  {#if variant === "phone"}
    <nav class="id__crumb idp__crumb" aria-label="Breadcrumb">
      <a href="/live?select={encodeURIComponent(info.id)}" onclick={followLink}>‹ LIVE OPS</a>
    </nav>
  {/if}
  <div class="idp__line" class:idp__line--page={variant === "phone"} aria-label="{info.label} frequency">
    <span class="idp__aar">{aar4}</span>
    <h2 class="idp__name" data-ember={ember}>{info.label}</h2>
    {#if offBank}<span class="idp__tag">NOT IN THIS BANK</span>{/if}
    <span class="idp__grow"></span>
    {@render hero()}
    {@render editDoor()}
  </div>
  <div class="idp__detail">
    <div class="idp__l2">
      <span class="idp__mhz"><span>{fmt.freq(info.freq_mhz)}</span> <span class="idp__unit">MHz</span><span class="idp__sub">&nbsp;·&nbsp;{[info.railroad, info.use].filter(Boolean).join(" · ")}{#if info.line}<span class="idp__route">&nbsp;·&nbsp;{info.line}</span>{/if}</span></span>
      <span class="idp__r">
        {#if keyed}<span class="idp__k idp__k2">KEYED</span>{#if via}VIA {via}{/if}{:else if heard}<span class="idp__k idp__k2">LAST HEARD</span><PositionGlyph state="idle" dim /> <span class="mono">{heard.clock}</span>{/if}
      </span>
    </div>
    {#if feeds.length}
      <div class="idp__l3">HEARD BY <b>{feeds.join(" · ")}</b>{#if partial}<CoveragePips feeds={pips} />{/if}</div>
    {/if}
  </div>
  {#if variant === "phone"}
    <button class="id__lid idp__lid" type="button" aria-expanded={lidOpen} onclick={ontogglelid}>{lidOpen ? "▾" : "▸"} ABOUT THIS FREQUENCY</button>
    {#if lidOpen}
      <div class="id__lidbody idp__lidbody">
        {#if banks.length}<p>BANKS <b>{banks.join(" · ")}</b></p>{/if}
        {#if info.notes}<p class="id__notes">{info.notes}</p>{/if}
      </div>
    {/if}
  {/if}
{:else}
<section class="id" aria-label="{info.label} frequency">
  <nav class="id__crumb" aria-label="Breadcrumb">
    <a href="/live?select={encodeURIComponent(info.id)}" onclick={followLink}><span class="id__crumb-short">‹ </span>LIVE OPS</a><span class="id__crumb-tail">{" / "}{info.label}</span>
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
      {:else if heard}
        <span class="id__k">LAST HEARD</span>
        <span class="id__big">{fmt.age(heard.ageS)}</span>
        <span class="id__via"><PositionGlyph state="idle" dim /> <span class="mono">{heard.clock}</span></span>
      {:else}
        <span class="id__k">NOT HEARD YET</span>
      {/if}
    </div>
    {@render editDoor()}
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
{/if}

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

  /* the pane variant: one pinned line (fixed height, never wraps), the detail below it scrolls away */
  .idp__line {
    position: sticky; top: 0; z-index: 6; height: var(--fq-line-h); display: flex; align-items: center; gap: 12px; padding: 0 16px;
    background: var(--bg-void); border-bottom: 1px solid var(--grid); overflow: hidden;
  }
  .idp__aar { flex: none; font: 500 var(--fs-24)/1 var(--font-data); color: var(--ink); }
  .idp__name {
    margin: 0; position: relative; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font: 600 var(--fs-24)/1.1 var(--font-display); letter-spacing: var(--track-display); text-transform: uppercase; color: var(--ink);
  }
  .idp__name[data-ember]::after { content: ""; position: absolute; left: 0; right: 0; bottom: -4px; height: 2px; background: var(--state-recent); }
  .idp__name[data-ember="recent-dim"]::after { background: var(--state-recent-dim); }
  .idp__tag { flex: none; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); white-space: nowrap; }
  .idp__grow { flex: 1; }
  /* the `⋯`: three 2 px squares, no frame at rest; a frame and brighter squares on hover or focus */
  .idp__more { flex: none; align-self: center; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; gap: 3px; margin-left: 4px; padding: 0; background: none; border: 0; cursor: pointer; }
  .idp__more i { width: 2px; height: 2px; background: var(--ink-3); }
  .idp__more:hover, .idp__more:focus-visible, .idp__more[aria-expanded="true"] { box-shadow: inset 0 0 0 1px var(--line); }
  .idp__more:hover i, .idp__more:focus-visible i, .idp__more[aria-expanded="true"] i { background: var(--ink); }
  .id__row > .idp__more { margin-top: 4px; }
  @media (max-width: 767px) { .idp__more { width: 44px; height: 44px; } }
  .idp__hero { flex: none; display: flex; align-items: center; gap: 8px; }
  .idp__k { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); white-space: nowrap; }
  .idp__big { font: 500 var(--fs-32)/1 var(--font-data); font-variant-numeric: tabular-nums; color: var(--ink-2); white-space: nowrap; }
  .idp__big.is-tx { color: var(--state-tx); }
  .idp__detail { display: grid; gap: 4px; padding: 8px 16px 8px; background: var(--bg-void); }
  .idp__l2 { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; min-width: 0; }
  .idp__mhz { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 400 var(--fs-12)/1.3 var(--font-data); color: var(--ink); }
  .idp__unit { color: var(--ink-2); }
  .idp__sub { font: 500 var(--fs-13)/1.3 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-2); }
  .idp__route { display: none; }
  .idp__r { flex: none; display: inline-flex; align-items: center; gap: 6px; font: 400 var(--fs-12)/1 var(--font-data); color: var(--ink-3); white-space: nowrap; }
  .idp__l3 { font: 500 var(--fs-13)/1.3 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-2); }
  .idp__l3 b { font-weight: 500; color: var(--ink); }
  .idp__line--page { top: var(--header-h); }
  .idp__k2 { display: none; margin-right: 6px; }
  .idp__crumb { padding: 0 16px; background: var(--bg-void); }
  .idp__lid { padding: 0 16px; background: var(--bg-void); }
  .idp__lidbody { margin: 0; }
  @container pane (min-width: 560px) { .idp__route { display: inline; } }
  /* a narrow column (a phone, or the pane dragged thin): the hero is the age alone at 24 px; its label and the
     clock time move to line 2 */
  @container pane (max-width: 479px) {
    .idp__line { gap: 8px; padding: 0 12px; }
    .idp__aar { font-size: var(--fs-18); }
    .idp__name { font-size: var(--fs-18); }
    .idp__big { font-size: var(--fs-24); }
    .idp__hero > .idp__k { display: none; }
    .idp__k2 { display: inline; }
    .idp__detail { padding-inline: 12px; }
    .idp__l2 { flex-wrap: wrap; row-gap: 2px; }
  }

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

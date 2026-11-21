<script lang="ts">
  /** The selected transit feed: every readout, and the actions on it (edit, refresh, delete). */
  import Button from "$lib/components/Button.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { agoText, sourceCounts, sourceKindText, STATE_CHIP } from "./sourceView";
  import type { TransitSource } from "$lib/types/sources";

  interface Props {
    source: TransitSource;
    /** wall clock in ms, for the "N ago" readings */
    now: number;
    busy: boolean;
    onenable: (enabled: boolean) => void;
    onedit: () => void;
    onrefresh: () => void;
    ondelete: () => void;
  }
  let { source, now, busy, onenable, onedit, onrefresh, ondelete }: Props = $props();

  const status = $derived(source.status);
  const hasRealtime = $derived(source.kind !== "lines");
  let confirming = $state(false);
  // another feed was selected: the confirmation does not follow
  $effect(() => {
    void source.id;
    confirming = false;
  });
</script>

<section class="fb-insp br fb-source" aria-label="Transit feed {source.name}">
  <header class="fb-insp__head">
    <span class="t-panel">{source.name}</span>
    <span class="fb-source__kind">{sourceKindText(source)}</span>
    <span class="grow"></span>
    <Toggle label="ENABLED" checked={source.enabled} onchange={onenable} />
  </header>
  <div class="fb-insp__kind">{source.agency}</div>

  <div class="src-card__state">
    <Chip text={status.state.toUpperCase()} kind={STATE_CHIP[status.state]} />
    {#each sourceCounts(source) as [label, value]}
      <span class="src-count"><span class="k">{label}</span> <span class="mono">{value}</span></span>
    {/each}
  </div>
  {#if status.error}<p class="src-card__error" role="alert">{status.error}</p>{/if}

  <dl class="src-card__meta">
    <div><dt>STATIC LOADED</dt><dd class="mono">{agoText(status.static_loaded_at, now)}</dd></div>
    <div><dt>VERSION</dt><dd class="mono" title={status.static_version ?? ""}>{status.static_version ?? fmt.BLANK}</dd></div>
    {#if hasRealtime}
      <div><dt>REALTIME UPDATED</dt><dd class="mono">{agoText(status.rt_updated_at, now)}</dd></div>
    {/if}
    <div><dt>REFRESH</dt><dd class="mono">{source.static_refresh_h} H{hasRealtime ? ` · POLL ${source.rt_poll_s} S` : ""}</dd></div>
  </dl>

  {#if source.static_url}
    <div class="fb-source__url"><span class="k">STATIC URL</span><span class="mono" title={source.static_url}>{source.static_url}</span></div>
  {/if}

  <footer class="src-card__actions">
    {#if confirming}
      <span class="t-micro">DELETE {source.name}?</span>
      <Button sm disabled={busy} onclick={ondelete}>CONFIRM DELETE</Button>
      <Button sm onclick={() => (confirming = false)}>CANCEL</Button>
    {:else}
      <Button sm onclick={onedit}>EDIT</Button>
      <Button sm disabled={busy || !source.enabled} onclick={onrefresh}>{busy ? "REFRESHING…" : "REFRESH NOW"}</Button>
      <span class="grow"></span>
      <Button sm onclick={() => (confirming = true)}>DELETE</Button>
    {/if}
  </footer>
</section>

<script lang="ts">
  /** One transit source: name, state, counts, last loads, and the actions on it. */
  import Button from "$lib/components/Button.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import * as fmt from "$lib/hud/fmt";
  import type { ChipKind } from "$lib/hud/chips";
  import { KINDS } from "./sourceForm";
  import type { SourceState, TransitSource } from "./types";

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

  const CHIP: Record<SourceState, ChipKind> = { ok: "nominal", stale: "degraded", error: "fault", disabled: "offline", loading: "armed" };

  const status = $derived(source.status);
  const kind = $derived(KINDS.find((k) => k.value === source.kind)?.text ?? source.kind);
  const hasRealtime = $derived(source.kind !== "lines");
  let confirming = $state(false);

  const ago = (iso: string | null): string => (iso ? `${fmt.age((now - Date.parse(iso)) / 1000, "age")} AGO` : fmt.BLANK);
  const counts = $derived(
    source.kind === "lines"
      ? [["ROUTES", status.counts.routes], ["STOPS", status.counts.stops]]
      : [["ROUTES", status.counts.routes], ["STOPS", status.counts.stops], ["TRIPS", status.counts.trips], ["VEHICLES", status.counts.vehicles]],
  );
</script>

<article class="st-card br" class:is-off={!source.enabled} aria-label={source.name}>
  <header class="st-card__head">
    <span class="st-card__name">{source.name}</span>
    <span class="st-card__agency">{source.agency}</span>
    <span class="st-card__kind">{kind}</span>
    <span class="grow"></span>
    <Toggle label="ENABLED" checked={source.enabled} onchange={onenable} />
  </header>

  <div class="st-card__state">
    <Chip text={status.state.toUpperCase()} kind={CHIP[status.state]} />
    {#each counts as [label, value]}
      <span class="st-count"><span class="k">{label}</span> <span class="mono">{value}</span></span>
    {/each}
  </div>
  {#if status.error}<p class="st-card__error" role="alert">{status.error}</p>{/if}

  <dl class="st-card__meta">
    <div><dt>STATIC LOADED</dt><dd class="mono">{ago(status.static_loaded_at)}</dd></div>
    <div><dt>VERSION</dt><dd class="mono" title={status.static_version ?? ""}>{status.static_version ?? fmt.BLANK}</dd></div>
    {#if hasRealtime}
      <div><dt>REALTIME UPDATED</dt><dd class="mono">{ago(status.rt_updated_at)}</dd></div>
    {/if}
    <div><dt>REFRESH</dt><dd class="mono">{source.static_refresh_h} H{hasRealtime ? ` · POLL ${source.rt_poll_s} S` : ""}</dd></div>
  </dl>

  <footer class="st-card__actions">
    {#if confirming}
      <span class="t-micro">DELETE {source.name}?</span>
      <Button sm disabled={busy} onclick={ondelete}>CONFIRM DELETE</Button>
      <Button sm onclick={() => (confirming = false)}>CANCEL</Button>
    {:else}
      <Button sm onclick={onedit}>EDIT</Button>
      <Button sm disabled={busy || !source.enabled} onclick={onrefresh}>{busy ? "REFRESHING…" : "REFRESH STATIC"}</Button>
      <span class="grow"></span>
      <Button sm onclick={() => (confirming = true)}>DELETE</Button>
    {/if}
  </footer>
</article>

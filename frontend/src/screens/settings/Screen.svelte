<script lang="ts">
  /**
   * /settings: global settings. Left, the transit data sources (list, edit, add, delete, refresh), all applied
   * live by PUT/POST/DELETE /api/transit/sources. Right, the backend's own statistics.
   */
  import { onMount } from "svelte";
  import Button from "$lib/components/Button.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import { api, ApiError } from "$lib/api/client";
  import { shell } from "$lib/stores/shell.svelte";
  import BackendPanel from "./BackendPanel.svelte";
  import NodesSection from "./NodesSection.svelte";
  import SourceCard from "./SourceCard.svelte";
  import SourceForm from "./SourceForm.svelte";
  import { withEnabled } from "./sourceForm";
  import type { BackendStats, RadioStatus, SourceConfig, TransitSource } from "./types";
  import "./settings.css";

  const POLL_MS = 5000;

  let sources = $state.raw<TransitSource[] | null>(null);
  let sourcesFailed = $state(false);
  let stats = $state.raw<BackendStats | null>(null);
  let statsFailed = $state(false);
  let radio = $state.raw<RadioStatus | null>(null);
  let now = $state(Date.now());

  /** the source being edited, "new" for the add form, or null */
  let editing = $state<string | "new" | null>(null);
  /** ids with a request in flight */
  let busy = $state(new Set<string>());
  let notice = $state("");

  const editedSource = $derived(sources?.find((s) => s.id === editing) ?? null);

  const message = (error: unknown): string => (error instanceof ApiError ? error.message : "Backend unreachable");

  async function loadSources(): Promise<void> {
    try {
      sources = await api.transitSources.list();
      sourcesFailed = false;
    } catch {
      sourcesFailed = true;
    }
  }

  async function loadBackend(): Promise<void> {
    const [backend, receiver] = await Promise.allSettled([api.backend(), api.radio.status()]);
    statsFailed = backend.status === "rejected";
    if (backend.status === "fulfilled") stats = backend.value;
    if (receiver.status === "fulfilled") radio = receiver.value as RadioStatus;
  }

  const refreshAll = (): Promise<unknown> => Promise.all([loadSources(), loadBackend()]);

  /** Run one request on a source, show a failure as a notice, and reload the list. */
  async function act(id: string, request: () => Promise<unknown>): Promise<void> {
    busy = new Set(busy).add(id);
    notice = "";
    try {
      await request();
    } catch (error) {
      notice = message(error);
    } finally {
      busy.delete(id);
      busy = new Set(busy);
      await loadSources();
    }
  }

  async function save(config: SourceConfig, isNew: boolean): Promise<void> {
    await (isNew ? api.transitSources.create(config) : api.transitSources.update(config.id, config));
    editing = null;
    await loadSources();
  }

  onMount(() => {
    refreshAll();
    const poll = setInterval(refreshAll, POLL_MS);
    const clock = setInterval(() => (now = Date.now()), 1000);
    return () => [poll, clock].forEach(clearInterval);
  });

  $effect(() => {
    const enabled = sources?.filter((s) => s.enabled).length ?? 0;
    shell.statusFallback = `SETTINGS · TRANSIT SOURCES ${enabled} OF ${sources?.length ?? 0} ENABLED · CHANGES APPLY LIVE`;
  });
</script>

<div class="st">
  <section class="st-col st-col--sources" aria-label="Transit data feeds">
    <div class="st-list">
      <NodesSection />
      <header class="st-ph">
        <span class="t-panel">TRANSIT DATA FEEDS</span>
        <span class="mono">{sources?.length ?? 0}</span>
        <span class="t-micro">GTFS · GTFS-RT · AMTRAKER · LINES</span>
        <span class="grow"></span>
        <Button sm onclick={() => (editing = "new")}>+ ADD SOURCE</Button>
      </header>
      {#if notice}<p class="st-card__error" role="alert">{notice}</p>{/if}

      {#if editing === "new"}
        {#key "new"}<SourceForm source={null} existingIds={sources?.map((s) => s.id) ?? []} onsave={save} oncancel={() => (editing = null)} />{/key}
      {/if}
      {#if sources}
        {#each sources as source (source.id)}
          {#if editing === source.id && editedSource}
            <SourceForm source={editedSource} existingIds={[]} onsave={save} oncancel={() => (editing = null)} />
          {:else}
            <SourceCard
              {source}
              {now}
              busy={busy.has(source.id)}
              onenable={(enabled) => act(source.id, () => api.transitSources.update(source.id, withEnabled(source, enabled)))}
              onedit={() => (editing = source.id)}
              onrefresh={() => act(source.id, () => api.transitSources.refresh(source.id))}
              ondelete={() => act(source.id, () => api.transitSources.remove(source.id))}
            />
          {/if}
        {/each}
        {#if !sources.length && editing !== "new"}
          <EmptyState title="NO TRANSIT SOURCES" detail="Add a GTFS, Amtraker or lines source to put trains on the map." />
        {/if}
      {:else if sourcesFailed}
        <EmptyState title="SOURCES UNAVAILABLE" detail="The backend did not answer GET /api/transit/sources." />
      {/if}
    </div>
  </section>

  <section class="st-col st-col--backend">
    <BackendPanel {stats} {radio} sources={sources ?? []} {now} failed={statsFailed} />
  </section>
</div>

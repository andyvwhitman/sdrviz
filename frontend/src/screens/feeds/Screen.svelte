<script lang="ts">
  /**
   * Feeds: SDR feed list (cols 1-3), feed inspector (cols 4-7) and the transit data sources (cols 8-12).
   * Live state comes from the live store; configuration is edited over REST.
   */
  import { onMount, untrack } from "svelte";
  import { session } from "$lib/stores/session.svelte";
  import Button from "$lib/components/Button.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { router } from "$lib/router.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { stage } from "$lib/stores/stage.svelte";
  import { api } from "$lib/api/client";
  import type { SourceConfig, TransitSource } from "$lib/types/sources";
  import { feedsColumns } from "./breakpoints";
  import { catalogue } from "./catalogue.svelte";
  import FeedCard from "./FeedCard.svelte";
  import FeedForm from "./FeedForm.svelte";
  import FeedInspector from "./FeedInspector.svelte";
  import FeedsHero from "./FeedsHero.svelte";
  import HostCard from "./HostCard.svelte";
  import ReceiverForm from "./ReceiverForm.svelte";
  import { LIVE_FEED_ID } from "./receiverForm";
  import SourceCard from "./SourceCard.svelte";
  import SourceForm from "./SourceForm.svelte";
  import { withEnabled } from "./sourceForm";
  import type { FeedConfig } from "./types";
  import "./feeds.css";

  const snapshot = $derived(live.state);
  const stacked = $derived(feedsColumns(stage.width) === 2);

  // -- selection: the inspector opens on the feed the fixture names for the admin view (?feed=alx overrides) --
  let pickedFeed = $state<string | null>(null);
  const feedFromUrl = $derived(router.query("feed") ? `feed-${router.query("feed")}` : null);
  const selectedFeed = $derived.by(() => {
    if (!snapshot) return undefined;
    const wanted = pickedFeed ?? feedFromUrl ?? snapshot.displayed_feed_admin;
    return snapshot.feeds.find((f) => f.id === wanted) ?? snapshot.feeds[0];
  });
  $effect(() => {
    shell.scope = selectedFeed ? ["FEED", selectedFeed.short] : null;
  });

  shell.newestStatusOnly = true;

  // -- status line: with no open event the shell shows the latest feed event up to the sim clock --
  const feedStates = $derived(snapshot?.feeds.map((f) => `${f.id}:${f.state}:${f.acked}`).join() ?? "");
  $effect(() => {
    void feedStates; // a feed changed state: look for a new latest event
    const now = untrack(() => snapshot);
    if (!now) return;
    let alive = true;
    Promise.all(now.feeds.map((f) => catalogue.feedHealth(f.id, 1).then((h) => (h.events ?? []).map((e) => ({ ...e, short: f.short })))))
      .then((all) => {
        if (!alive) return;
        const last = all.flat().filter((e) => e.t <= now.t_offset_s).sort((a, b) => b.t - a.t)[0];
        const zone = now.tz.name;
        shell.statusFallback = last
          ? `${last.short} · ${last.state === "ok" ? "RECOVERED" : last.label} · ${fmt.clock(last.clock, zone)}`
          : `NO SYSTEM EVENTS SINCE 00:00 ${zone}`;
      })
      .catch(() => {}); // the readout is decoration
    return () => (alive = false);
  });

  function selectFeed(id: string): void {
    pickedFeed = id;
    router.setQuery({ feed: id.replace(/^feed-/, "") });
  }

  // -- feed editing: null shows the inspector, otherwise the form (config null adds a feed) --
  let feedForm = $state<{ config: FeedConfig | null } | null>(null);
  /** the live receiver has its own form (its settings are not a feed row) */
  let receiverForm = $state(false);

  async function editFeed(id: string): Promise<void> {
    feedForm = null;
    receiverForm = id === LIVE_FEED_ID;
    if (!receiverForm) feedForm = { config: await catalogue.feedConfig(id) };
  }

  function feedFormDone(savedId: string | null): void {
    feedForm = null;
    if (savedId) pickedFeed = savedId;
  }

  const enableFeed = (id: string, enabled: boolean): Promise<void> => catalogue.setFeedEnabled(id, enabled).catch(report);

  let notice = $state("");

  const message = (error: unknown): string => (error instanceof Error ? error.message : "Request failed");
  const report = (error: unknown): void => {
    notice = message(error);
  };

  // -- transit sources (admin only: the list is not served to viewers) --
  const POLL_MS = 5000;
  let sources = $state.raw<TransitSource[] | null>(null);
  let sourcesFailed = $state(false);
  let now = $state(Date.now());
  /** the source being edited, "new" for the add form, or null */
  let editing = $state<string | "new" | null>(null);
  /** ids with a request in flight */
  let busy = $state(new Set<string>());

  const editedSource = $derived(sources?.find((s) => s.id === editing) ?? null);

  async function loadSources(): Promise<void> {
    if (!session.isAdmin) return;
    try {
      sources = await api.transitSources.list();
      sourcesFailed = false;
    } catch {
      sourcesFailed = true;
    }
  }

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

  async function saveSource(config: SourceConfig, isNew: boolean): Promise<void> {
    await (isNew ? api.transitSources.create(config) : api.transitSources.update(config.id, config));
    editing = null;
    await loadSources();
  }

  onMount(() => {
    loadSources();
    const poll = setInterval(loadSources, POLL_MS);
    const clock = setInterval(() => (now = Date.now()), 1000);
    return () => [poll, clock].forEach(clearInterval);
  });
</script>

{#if snapshot}
  <FeedsHero {snapshot} {sources} {now} />

  <div class="fb-col fb-col--feeds">
    <div class="fb-ph"><span class="t-panel">SDR FEEDS</span><span class="mono">{snapshot.feeds.length}</span></div>
    <HostCard system={snapshot.system} />
    {#each snapshot.feeds as feed (feed.id)}
      <FeedCard {feed} keyed={snapshot.active_transmissions ?? []} zone={snapshot.tz.name} nowS={snapshot.t_offset_s} selected={feed.id === selectedFeed?.id} onselect={() => selectFeed(feed.id)} onenable={(enabled) => enableFeed(feed.id, enabled)} />
    {/each}
    {#if session.isAdmin}<div class="fb-card__add"><Button sm onclick={() => ((receiverForm = false), (feedForm = { config: null }))}>+ NEW FEED</Button></div>{/if}
  </div>

  <!-- on a narrow stage the inspector and the transit sources stack in one scrolling column; on a wide one the wrappers vanish -->
  <div class="fb-right" class:is-stacked={stacked}>
  <div class="fb-pane fb-pane--insp">
  {#if receiverForm}
    <ReceiverForm ondone={() => (receiverForm = false)} />
  {:else if feedForm}
    {#key feedForm}
      <FeedForm feed={feedForm.config} existingIds={snapshot.feeds.map((f) => f.id)} ondone={feedFormDone} />
    {/key}
  {:else if selectedFeed}
    <FeedInspector feed={selectedFeed} {snapshot} onedit={() => editFeed(selectedFeed.id)} onack={() => catalogue.ackFeed(selectedFeed.id).catch(report)} />
  {/if}
  </div>

  <div class="fb-pane fb-pane--transit">
  <section class="fb-col fb-col--transit" aria-label="Transit data sources">
    <header class="fb-ph">
      <span class="t-panel">TRANSIT SOURCES</span>
      {#if session.isAdmin}<span class="mono">{sources?.length ?? 0}</span>{/if}
      <span class="t-micro">{session.isAdmin ? "GTFS · GTFS-RT · AMTRAKER · LINES" : "ADMIN ONLY"}</span>
      {#if session.isAdmin}<Button sm onclick={() => (editing = "new")}>+ ADD SOURCE</Button>{/if}
    </header>
    {#if session.isAdmin}
      {#if notice}<p class="src-card__error" role="alert">{notice}</p>{/if}
      {#if editing === "new"}
        {#key "new"}<SourceForm source={null} existingIds={sources?.map((s) => s.id) ?? []} onsave={saveSource} oncancel={() => (editing = null)} />{/key}
      {/if}
      {#if sources}
        {#each sources as source (source.id)}
          {#if editing === source.id && editedSource}
            <SourceForm source={editedSource} existingIds={[]} onsave={saveSource} oncancel={() => (editing = null)} />
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
    {/if}
  </section>
  </div>
  </div>
{/if}

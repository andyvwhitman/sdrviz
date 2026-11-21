<script lang="ts">
  /**
   * Feeds (direction sprint 6, section E): two tabs, SDR FEEDS and TRANSIT FEEDS, laid out identically. A scrolling
   * list on the left, the selected feed's detail on the right, a draggable divider between them, and + NEW FEED at the
   * list's top left. Live state comes from the live store; configuration is edited over REST. The tab, the selection
   * and the new-feed form live in the URL (`?tab=`, `?feed=`, `?source=`, `?new=1`).
   */
  import { onMount, untrack } from "svelte";
  import { session } from "$lib/stores/session.svelte";
  import Button from "$lib/components/Button.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import Tabs from "$lib/components/Tabs.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { router } from "$lib/router.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { viewport } from "$lib/stores/viewport.svelte";
  import { api } from "$lib/api/client";
  import type { SourceConfig, TransitSource } from "$lib/types/sources";
  import { catalogue } from "./catalogue.svelte";
  import FeedCard from "./FeedCard.svelte";
  import FeedForm from "./FeedForm.svelte";
  import FeedInspector from "./FeedInspector.svelte";
  import FeedsHero from "./FeedsHero.svelte";
  import FeedsSplit from "./FeedsSplit.svelte";
  import ReceiverForm from "./ReceiverForm.svelte";
  import { LIVE_FEED_ID } from "./receiverForm";
  import SourceCard from "./SourceCard.svelte";
  import SourceDetail from "./SourceDetail.svelte";
  import SourceForm from "./SourceForm.svelte";
  import { withEnabled } from "./sourceForm";
  import { NARROW_PX } from "./split";
  import { tabAfterKey, tabFromQuery, tabQuery, type FeedsTab } from "./tabs";
  import type { FeedConfig } from "./types";
  import "./feeds.css";

  const snapshot = $derived(live.state);
  const admin = $derived(session.isAdmin);
  /** the phone's page layout scrolls as a document */
  const page = $derived(viewport.handset);
  const narrow = $derived(viewport.width < NARROW_PX);

  // -- the URL: the tab, the layer a narrow window shows the detail in, and the new-feed form --
  const tab = $derived(tabFromQuery(router.query("tab")));
  const layerOpen = $derived(narrow && router.query("open") === "1");
  const newOpen = $derived(admin && router.query("new") === "1");
  /** the layer was opened by a push, so Back can pop it */
  let pushedLayer = false;
  $effect(() => {
    if (!layerOpen) pushedLayer = false;
  });

  /** Change the URL's query. A narrow window opens the detail layer and pushes a history entry, so the system Back closes it. */
  function show(changes: Record<string, string | null>): void {
    if (!narrow) return router.setQuery(changes);
    const url = new URL(location.href);
    for (const [key, value] of Object.entries({ ...changes, open: "1" })) {
      if (value === null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    pushedLayer = true;
    router.go(url.pathname + url.search);
  }

  /** The layer's back button, Esc and the system Back: pop the entry the tap pushed, or (after a reload into a layer) clear `?open=`. */
  function back(): void {
    if (pushedLayer) history.back();
    else router.setQuery({ open: null, new: null });
  }
  // a closed layer takes any half-done edit with it
  $effect(() => {
    if (narrow && !layerOpen) untrack(() => ((feedForm = null), (receiverForm = false), (editing = null)));
  });

  function selectTab(next: FeedsTab): void {
    router.setQuery({ tab: tabQuery(next), open: null, new: null });
    feedForm = null;
    receiverForm = false;
    editing = null;
  }

  /** Left and Right move between the tabs and focus the new one. */
  function tabKeys(event: KeyboardEvent): void {
    const next = tabAfterKey(tab, event.key);
    if (!next || next === tab) return;
    event.preventDefault();
    selectTab(next);
    queueMicrotask(() => document.querySelector<HTMLElement>(".fe-tabs [role=tab][aria-selected=true]")?.focus());
  }

  // -- SDR feeds: the first feed is selected when the URL names none --
  const feedFromUrl = $derived(router.query("feed") ? `feed-${router.query("feed")}` : null);
  const selectedFeed = $derived(snapshot ? (snapshot.feeds.find((f) => f.id === feedFromUrl) ?? snapshot.feeds[0]) : undefined);
  const shortId = (id: string): string => id.replace(/^feed-/, "");

  $effect(() => {
    shell.scope = tab === "sdr" && selectedFeed ? ["FEED", selectedFeed.short] : null;
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
    feedForm = null;
    receiverForm = false;
    show({ feed: shortId(id), new: null });
  }

  // -- feed editing: null shows the inspector, otherwise the form (config null adds a feed) --
  let feedForm = $state<{ config: FeedConfig } | null>(null);
  /** the live receiver has its own form (its settings are not a feed row) */
  let receiverForm = $state(false);

  async function editFeed(id: string): Promise<void> {
    feedForm = null;
    receiverForm = id === LIVE_FEED_ID;
    if (!receiverForm) feedForm = { config: await catalogue.feedConfig(id) };
  }

  /** The new-feed form ended: saved selects the new feed; cancelled closes the form (and, narrow, the layer). */
  function newFeedDone(savedId: string | null): void {
    if (savedId) router.setQuery({ feed: shortId(savedId), new: null });
    else closeNew();
  }
  function feedFormDone(savedId: string | null): void {
    feedForm = null;
    if (savedId) router.setQuery({ feed: shortId(savedId) });
  }

  const closeNew = (): void => (narrow ? back() : router.setQuery({ new: null }));

  const enableFeed = (id: string, enabled: boolean): Promise<void> => catalogue.setFeedEnabled(id, enabled).catch(report);

  let notice = $state("");

  const message = (error: unknown): string => (error instanceof Error ? error.message : "Request failed");
  const report = (error: unknown): void => {
    notice = message(error);
  };

  // -- transit feeds (admin only: the list is not served to viewers) --
  const POLL_MS = 5000;
  let sources = $state.raw<TransitSource[] | null>(null);
  let sourcesFailed = $state(false);
  let now = $state(Date.now());
  /** the transit feed being edited, or null */
  let editing = $state<string | null>(null);
  /** ids with a request in flight */
  let busy = $state(new Set<string>());

  const sourceFromUrl = $derived(router.query("source"));
  const selectedSource = $derived(sources ? (sources.find((s) => s.id === sourceFromUrl) ?? sources[0]) : undefined);

  async function loadSources(): Promise<void> {
    if (!session.isAdmin) return;
    try {
      sources = await api.transitSources.list();
      sourcesFailed = false;
    } catch {
      sourcesFailed = true;
    }
  }

  function selectSource(id: string): void {
    editing = null;
    show({ source: id, new: null });
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
    if (isNew) router.setQuery({ source: config.id, new: null });
  }

  async function removeSource(id: string): Promise<void> {
    await act(id, () => api.transitSources.remove(id));
    if (narrow && !sources?.some((s) => s.id === id)) back();
  }

  onMount(() => {
    loadSources();
    const poll = setInterval(loadSources, POLL_MS);
    const clock = setInterval(() => (now = Date.now()), 1000);
    return () => [poll, clock].forEach(clearInterval);
  });

  const tabItems = $derived([
    { id: "sdr", name: "SDR FEEDS", n: snapshot?.feeds.length ?? fmt.BLANK },
    { id: "transit", name: "TRANSIT FEEDS", n: admin && sources ? sources.length : fmt.BLANK },
  ]);
</script>

{#snippet newItem()}
  <div class="fe-new is-selected" aria-label="New feed, not saved yet"><span class="dashed"></span><span class="sel"></span><span class="t-panel">NEW FEED</span></div>
{/snippet}

{#snippet notices()}
  {#if notice}<p class="src-card__error" role="alert">{notice}</p>{/if}
{/snippet}

{#if snapshot}
  <div class="fe" class:is-page={page}>
    <FeedsHero {snapshot} {sources} {now} onshowtransit={() => selectTab("transit")} />

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fe-tabs" onkeydown={tabKeys}>
      <Tabs items={tabItems} selected={tab} onselect={(id) => selectTab(id as FeedsTab)} />
    </div>

    {#if tab === "sdr"}
      <div class="fe-panel" role="tabpanel" aria-label="SDR feeds">
        <FeedsSplit title="SDR FEEDS" {layerOpen} onback={back}>
          {#snippet toolbar()}
            {#if admin}<Button sm onclick={() => ((feedForm = null), (receiverForm = false), show({ new: "1" }))}>+ NEW FEED</Button>{/if}
          {/snippet}
          {#snippet list()}
            {@render notices()}
            {#if newOpen}{@render newItem()}{/if}
            {#each snapshot.feeds as feed (feed.id)}
              <FeedCard {feed} keyed={snapshot.active_transmissions ?? []} zone={snapshot.tz.name} nowS={snapshot.t_offset_s} selected={!newOpen && feed.id === selectedFeed?.id} onselect={() => selectFeed(feed.id)} onenable={(enabled) => enableFeed(feed.id, enabled)} />
            {:else}
              <EmptyState title="NO SDR FEEDS" detail="Enrol a node in Settings, or add a receiver with + NEW FEED." />
            {/each}
          {/snippet}
          {#snippet detail()}
            {#if newOpen}
              {#key "new"}<FeedForm feed={null} existingIds={snapshot.feeds.map((f) => f.id)} ondone={newFeedDone} />{/key}
            {:else if receiverForm}
              <ReceiverForm ondone={() => (receiverForm = false)} />
            {:else if feedForm}
              {#key feedForm}
                <FeedForm feed={feedForm.config} existingIds={snapshot.feeds.map((f) => f.id)} ondone={feedFormDone} />
              {/key}
            {:else if selectedFeed}
              <FeedInspector feed={selectedFeed} {snapshot} onedit={() => editFeed(selectedFeed.id)} onack={() => catalogue.ackFeed(selectedFeed.id).catch(report)} />
            {/if}
          {/snippet}
        </FeedsSplit>
      </div>
    {:else}
      <div class="fe-panel" role="tabpanel" aria-label="Transit feeds">
        <FeedsSplit title="TRANSIT FEEDS" {layerOpen} onback={back}>
          {#snippet toolbar()}
            {#if admin}<Button sm onclick={() => ((editing = null), show({ new: "1" }))}>+ NEW FEED</Button>{/if}
          {/snippet}
          {#snippet list()}
            {#if !admin}
              <EmptyState title="ADMIN ONLY" detail="Transit feeds are set up by an admin." />
            {:else}
              {@render notices()}
              {#if newOpen}{@render newItem()}{/if}
              {#if sources}
                {#each sources as source (source.id)}
                  <SourceCard {source} {admin} selected={!newOpen && source.id === selectedSource?.id} onselect={() => selectSource(source.id)} onenable={(enabled) => act(source.id, () => api.transitSources.update(source.id, withEnabled(source, enabled)))} />
                {:else}
                  {#if !newOpen}<EmptyState title="NO TRANSIT FEEDS" detail="Add a GTFS, GTFS-RT, Amtraker or lines feed to put trains on the map." />{/if}
                {/each}
              {:else if sourcesFailed}
                <EmptyState title="TRANSIT FEEDS UNAVAILABLE" detail="The backend did not answer. Retrying every 5 s." />
              {/if}
            {/if}
          {/snippet}
          {#snippet detail()}
            {#if admin}
              {#if newOpen}
                {#key "new"}<SourceForm source={null} existingIds={sources?.map((s) => s.id) ?? []} onsave={saveSource} oncancel={closeNew} />{/key}
              {:else if selectedSource && editing === selectedSource.id}
                {#key selectedSource.id}<SourceForm source={selectedSource} existingIds={[]} onsave={saveSource} oncancel={() => (editing = null)} />{/key}
              {:else if selectedSource}
                <SourceDetail
                  source={selectedSource}
                  {now}
                  busy={busy.has(selectedSource.id)}
                  onenable={(enabled) => act(selectedSource.id, () => api.transitSources.update(selectedSource.id, withEnabled(selectedSource, enabled)))}
                  onedit={() => (editing = selectedSource.id)}
                  onrefresh={() => act(selectedSource.id, () => api.transitSources.refresh(selectedSource.id))}
                  ondelete={() => removeSource(selectedSource.id)}
                />
              {/if}
            {/if}
          {/snippet}
        </FeedsSplit>
      </div>
    {/if}
  </div>
{/if}

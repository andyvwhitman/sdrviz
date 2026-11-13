<script lang="ts">
  /**
   * Feeds & Banks (spec 4.4): feed list (cols 1-3), feed inspector (cols 4-7), banks and the
   * frequency catalogue (cols 8-12). Live state comes from the live store; configuration is edited over REST.
   */
  import { onMount, untrack } from "svelte";
  import Button from "$lib/components/Button.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { router } from "$lib/router.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { prefs } from "$lib/stores/prefs.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { api } from "$lib/api/client";
  import BankEditor from "./BankEditor.svelte";
  import BankLeverRows from "./BankLeverRows.svelte";
  import { catalogue } from "./catalogue.svelte";
  import FeedCard from "./FeedCard.svelte";
  import FeedForm from "./FeedForm.svelte";
  import FeedInspector from "./FeedInspector.svelte";
  import FeedsHero from "./FeedsHero.svelte";
  import FrequencyCatalogue from "./FrequencyCatalogue.svelte";
  import FrequencyEditor from "./FrequencyEditor.svelte";
  import HostCard from "./HostCard.svelte";
  import MembershipTable from "./MembershipTable.svelte";
  import type { FeedConfig } from "./types";
  import "./feeds.css";

  const snapshot = $derived(live.state);

  // -- selection: the inspector opens on the feed the fixture names for the admin view (?feed=alx overrides) --
  let pickedFeed = $state<string | null>(null);
  const feedFromUrl = $derived(router.query("feed") ? `feed-${router.query("feed")}` : null);
  const selectedFeed = $derived.by(() => {
    if (!snapshot) return undefined;
    const wanted = pickedFeed ?? feedFromUrl ?? (snapshot as unknown as { displayed_feed_admin?: string }).displayed_feed_admin ?? snapshot.displayed_feed;
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

  async function editFeed(id: string): Promise<void> {
    feedForm = { config: await catalogue.feedConfig(id) };
  }

  function feedFormDone(savedId: string | null): void {
    feedForm = null;
    if (savedId) pickedFeed = savedId;
  }

  const enableFeed = (id: string, enabled: boolean): Promise<void> => catalogue.setFeedEnabled(id, enabled).catch(report);

  // -- banks and catalogue --
  let view = $state<"membership" | "catalogue">("membership");
  /** the bank editor opens on Baltimore Harbor (or the last bank) like the approved design */
  let editingBank = $state<string | "new" | null>(null);
  let editingFrequency = $state<string | "new" | null>(null);
  let notice = $state("");

  const report = (error: unknown): void => {
    notice = error instanceof Error ? error.message : "Request failed";
  };

  const banks = $derived(catalogue.banks);
  const channels = $derived(new Map((snapshot?.channels ?? []).map((c) => [c.id, c])));
  const keyedIds = $derived(new Set((snapshot?.active_transmissions ?? []).map((t) => t.frequency_id)));
  const activeId = $derived(snapshot?.active_bank ?? "");
  const largest = $derived(Math.max(0, ...banks.map((b) => b.frequency_ids.length)));
  const bankBeingEdited = $derived(editingBank && editingBank !== "new" ? (banks.find((b) => b.id === editingBank) ?? null) : null);
  const frequencyBeingEdited = $derived(editingFrequency && editingFrequency !== "new" ? (catalogue.frequency(editingFrequency) ?? null) : null);
  /** the table header sits below the bank rows: 216 px for the four-bank design, 44 px per further bank */
  const sectionTop = $derived(216 + (Math.max(banks.length, 4) - 4) * 44);

  async function activate(id: string): Promise<void> {
    try {
      await api.banks.activate(id);
      await prefs.load();
    } catch (error) {
      report(error);
    }
  }

  function showView(next: typeof view): void {
    view = next;
    notice = "";
  }

  onMount(() => {
    catalogue
      .load()
      .then(() => {
        editingBank ??= (catalogue.banks.find((b) => b.id === "bank-harbor") ?? catalogue.banks.at(-1))?.id ?? null;
      })
      .catch(report);
  });
</script>

{#if snapshot}
  <FeedsHero {snapshot} />

  <div class="fb-col fb-col--feeds">
    <HostCard system={snapshot.system} />
    {#each snapshot.feeds as feed (feed.id)}
      <FeedCard {feed} keyed={snapshot.active_transmissions ?? []} zone={snapshot.tz.name} nowS={snapshot.t_offset_s} selected={feed.id === selectedFeed?.id} onselect={() => selectFeed(feed.id)} onenable={(enabled) => enableFeed(feed.id, enabled)} />
    {/each}
    <div class="fb-card__add"><Button sm onclick={() => (feedForm = { config: null })}>+ NEW FEED</Button></div>
  </div>

  {#if feedForm}
    {#key feedForm}
      <FeedForm feed={feedForm.config} existingIds={snapshot.feeds.map((f) => f.id)} ondone={feedFormDone} />
    {/key}
  {:else if selectedFeed}
    <FeedInspector feed={selectedFeed} {snapshot} onedit={() => editFeed(selectedFeed.id)} onack={() => catalogue.ackFeed(selectedFeed.id).catch(report)} />
  {/if}

  <div class="fb-col fb-col--banks">
    <div class="fb-banks">
      <div class="fb-ph">
        <span class="t-panel">BANKS</span><span class="mono">{banks.length}</span><span class="t-micro">ONE LEVER PER CHANNEL · M = MUTE, GLOBAL</span>
        <Button sm onclick={() => ((editingBank = "new"), (view = "membership"))}>+ NEW BANK</Button>
      </div>
      <div style="margin-top:8px">
        <BankLeverRows {banks} {channels} keyed={keyedIds} {activeId} selectedId={bankBeingEdited?.id ?? null} onselect={(id) => ((editingBank = id), (view = "membership"))} />
      </div>

      <div class="fb-ph" style="position:absolute;top:{sectionTop}px;left:0;right:0">
        <span class="t-panel">CHANNELS</span>
        <Chip button kind="filter" text="BANK MEMBERSHIP" pressed={view === "membership"} onclick={() => showView("membership")} />
        <Chip button kind="filter" text="CATALOGUE" pressed={view === "catalogue"} onclick={() => showView("catalogue")} />
        <span class="t-micro">{view === "membership" ? "CLICK TO TOGGLE · TILE ORDER IN THE BANK EDITOR" : "CLICK A ROW TO EDIT"}</span>
      </div>
      {#if notice}<p class="fb-form__fail fb-notice" role="alert" style="top:{sectionTop + 28}px">{notice}</p>{/if}
      <div class="fb-scroll" class:has-editor={view === "catalogue" && editingFrequency} style="top:{sectionTop + 32}px">
        {#if view === "membership"}
          <MembershipTable channels={[...channels.values()]} feeds={snapshot.feeds} {banks} keyed={keyedIds} onerror={report} />
        {:else}
          <FrequencyCatalogue selectedId={frequencyBeingEdited?.id ?? null} onselect={(id) => (editingFrequency = id)} onadd={() => (editingFrequency = "new")} />
        {/if}
      </div>

      {#if view === "membership"}
        {#if editingBank}
          <BankEditor bank={bankBeingEdited} feeds={snapshot.feeds} {activeId} {largest} ondone={(id) => (editingBank = id)} onactivate={activate} />
        {:else}
          <div class="fb-edit"><div class="fb-ph"><span class="t-panel">BANK EDITOR</span><span class="t-micro">PICK A BANK ABOVE, OR + NEW BANK</span></div>
            <div class="fb-cap">LIVE OPS CAPACITY<span class="sep"></span>STANDARD <span class="mono">20</span> AT <span class="mono">1920 × 1080</span><span class="sep"></span>COMPACT <span class="mono">15</span> AT <span class="mono">1440 × 900</span><span class="sep"></span>LARGEST BANK <span class="mono">{largest}</span></div>
          </div>
        {/if}
      {:else if editingFrequency}
        {#key editingFrequency}
          <FrequencyEditor frequency={frequencyBeingEdited} ondone={() => (editingFrequency = null)} />
        {/key}
      {/if}
    </div>
  </div>
{/if}

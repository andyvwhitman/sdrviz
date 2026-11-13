<script lang="ts">
  /** Hero strip (spec 9.4): feeds nominal n/m, the worst feeds, the keyed channels, the active bank. */
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { feedName } from "$lib/hud/roles";
  import type { Feed, LiveState } from "$lib/types/live";
  import { feedLook } from "./look";

  let { snapshot }: { snapshot: LiveState } = $props();

  const feeds = $derived(new Map(snapshot.feeds.map((f) => [f.id, f])));
  const enabled = $derived(snapshot.feeds.filter((f) => f.enabled));
  const nominal = $derived(enabled.filter((f) => f.state === "ok").length);
  const zone = $derived(snapshot.tz.name);
  const activeBank = $derived(snapshot.banks.find((b) => b.id === snapshot.active_bank));
  const view = $derived(snapshot.views[snapshot.active_bank]);

  /** the worst feeds in the fixture's own ranking (unacked fault > acked fault > offline > stale) */
  interface Ranked {
    feed_id: string;
    short: string;
    state: string;
    acked: boolean;
    label: string;
    since: string;
    in_state_label: string;
  }
  const ranked = $derived(((snapshot.header.feeds_hero_ranked ?? []) as Ranked[]).flatMap((r) => (feeds.has(r.feed_id) ? [{ r, feed: feeds.get(r.feed_id) as Feed }] : [])));

  const monitored = $derived(snapshot.channels.filter((c) => c.monitored));
  const unbanked = $derived(snapshot.channels.filter((c) => !c.banks.length));
  const unheard = $derived(snapshot.channels.filter((c) => !c.monitored));

  /** only active-bank key-ups are orange here, oldest first; off-bank traffic is a quiet count */
  const live = $derived(snapshot.active_transmissions ?? []);
  const inBank = $derived(live.filter((t) => activeBank?.frequency_ids.includes(t.frequency_id)).sort((a, b) => (b.elapsed_s ?? 0) - (a.elapsed_s ?? 0)));
  const receptionCount = $derived(live.reduce((n, t) => n + (t.receptions?.length ?? 0), 0));
  const receivingFeeds = $derived(new Set(live.flatMap((t) => (t.receptions ?? []).map((r) => r.feed_id))).size);
</script>

<div class="hero fb-hero">
  <span class="hero__text">FEEDS NOMINAL</span><span class="hero__big">{nominal}/{enabled.length}</span>
  {#each ranked as { r, feed }, i}
    {@const look = feedLook(feed)}
    {#if i === 0}<span class="fb-rule"></span>{/if}
    <span class="fb-worst">
      <PositionGlyph state={look.glyph} />
      <span class="hero__stack">
        <span class="a {look.tone}">{r.short} · {r.label}</span>
        <span class="b">SINCE {fmt.clock(r.since, zone)}{#if feed.state === "fault"}{feed.acked ? " · ACK'D" : " · UNACKNOWLEDGED"}{/if}</span>
      </span>
      <span class="fb-age" class:is-stale={feed.state === "stale"}>{r.in_state_label}</span>
    </span>
  {/each}
  <span class="hero__aside">
    {#if live.length}
      {#if inBank.length}
        <span class="fb-keyed-k">KEYED</span>
        <span class="fb-keyed-list">{#each inBank as t, i}{#if i}<span class="sep"></span>{/if}{t.aar4}{/each}</span>
      {/if}
      {#if view?.off_bank_label}<span class="fb-offbank">{view.off_bank_label}</span>{/if}
      <span class="hero__stack"><span class="a">{receptionCount} RECEPTIONS</span><span class="b">ON {receivingFeeds} FEEDS</span></span>
      <span class="fb-rule"></span>
    {/if}
    <span class="hero__stack"><span class="a">{activeBank?.name}</span><span class="b">ACTIVE BANK · HOME {feedName(activeBank?.home_feed)}</span></span>
    <span class="fb-rule"></span>
    <span class="hero__stack"><span class="a">{monitored.length} CH MONITORED</span><span class="b">{unheard.length} NOT HEARD · {unbanked.length} UNBANKED</span></span>
  </span>
</div>

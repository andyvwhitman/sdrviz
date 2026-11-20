<script lang="ts">
  /** Hero strip (spec 9.4): feeds nominal n/m, the worst feeds, the transit sources, and what the feeds hear. */
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import { followLink } from "$lib/router.svelte";
  import * as fmt from "$lib/hud/fmt";
  import type { Feed, LiveState } from "$lib/types/live";
  import type { TransitSource } from "$lib/types/sources";
  import { feedLook } from "./look";
  import { transitSummary } from "./transit";

  /** `sources` is null until the list loads, and for a viewer (the list is admin-only) */
  let { snapshot, sources, now }: { snapshot: LiveState; sources: TransitSource[] | null; now: number } = $props();

  const feeds = $derived(new Map(snapshot.feeds.map((f) => [f.id, f])));
  const enabled = $derived(snapshot.feeds.filter((f) => f.enabled));
  const nominal = $derived(enabled.filter((f) => f.state === "ok").length);
  const zone = $derived(snapshot.tz.name);

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

  /** channels the enabled feeds hear */
  const heardCount = $derived(new Set(enabled.flatMap((f) => f.hears)).size);
  const transit = $derived(sources ? transitSummary(sources, now) : null);

  /** key-ups on air, as a quiet count of receptions */
  const live = $derived(snapshot.active_transmissions ?? []);
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
      <span class="hero__stack"><span class="a">{receptionCount} RECEPTIONS</span><span class="b">ON {receivingFeeds} FEEDS</span></span>
      <span class="fb-rule"></span>
    {/if}
    <a class="hero__stack fb-link" href="/frequencies" onclick={followLink}>
      <span class="a">{heardCount} ENABLED ON {enabled.length} {enabled.length === 1 ? "NODE" : "NODES"} ›</span><span class="b">OPEN THE FREQUENCIES LIST</span>
    </a>
    {#if transit}
      <span class="fb-rule"></span>
      <span class="hero__stack">
        <span class="a">TRANSIT {transit.fresh}/{transit.enabled} FRESH</span>
        <span class="b {transit.worst?.tone ?? ''}">{transit.worst?.text ?? "ALL SOURCES CURRENT"}</span>
      </span>
    {/if}
  </span>
</div>

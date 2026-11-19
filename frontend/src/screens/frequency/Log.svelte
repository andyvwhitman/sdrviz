<script lang="ts">
  /** The log of one frequency: every transmission, newest first, with day dividers, paging and empty states. */
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { followLink } from "$lib/router.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { session } from "$lib/stores/session.svelte";
  import type { Recording } from "$lib/types/recordings";
  import { clockOf, logItems } from "./frequency";
  import LogRow from "./LogRow.svelte";
  import { MAX_ROWS, type LogStore } from "./logStore.svelte";
  import { player } from "./player.svelte";

  interface Props {
    store: LogStore;
    tz: string;
    todayKey: string;
    mhz: string;
    inBank: boolean;
    selectedId: number | null;
    /** a bucket the log was jumped to: its label and the instants it covers */
    bucket: { label: string; from: number; to: number } | null;
    /** this frequency is keyed now: the ON AIR row */
    onAir: { startedAt: number; elapsed: number } | null;
    onplay: (rec: Recording) => void;
    /** a viewer is at the top of the list, so new rows may join without moving anything */
    attop?: boolean;
  }
  let { store, tz, todayKey, mhz, inBank, selectedId, bucket, onAir, onplay, attop = $bindable(true) }: Props = $props();

  let expanded = $state<number | null>(null);
  let focusId = $state<number | null>(null);
  let root = $state<HTMLElement>();

  const items = $derived(logItems(store.rows, tz, todayKey));
  const tabId = $derived(focusId ?? store.rows[0]?.id ?? null);
  const snapshot = $derived(live.state);

  function feedOf(rec: Recording): { label: string; title: string } {
    const feed = snapshot?.feeds.find((f) => f.id === rec.feed_id);
    const label = (feed?.short ?? rec.feed_id).toUpperCase();
    const where = rec.feed_lat != null && rec.feed_lon != null ? ` · ${Math.abs(rec.feed_lat).toFixed(4)} ${rec.feed_lat >= 0 ? "N" : "S"} · ${Math.abs(rec.feed_lon).toFixed(4)} ${rec.feed_lon >= 0 ? "E" : "W"}` : "";
    return { label, title: `${feed?.name ?? rec.feed_id}${where}` };
  }

  const inBucket = (rec: Recording): boolean => !!bucket && Date.parse(rec.started_at) >= bucket.from && Date.parse(rec.started_at) < bucket.to;

  /** Move the focus to the next older (+1) or newer (-1) row. */
  export function step(direction: 1 | -1): void {
    const at = store.rows.findIndex((rec) => rec.id === tabId);
    const next = store.rows[Math.min(store.rows.length - 1, Math.max(0, at + direction))];
    if (next) focusRow(next.id);
  }
  export function focusRow(id: number): void {
    focusId = id;
    const row = root?.querySelector<HTMLElement>(`[data-rec="${id}"]`);
    row?.focus();
    row?.scrollIntoView({ block: "nearest" });
  }
  /** The row that has the keyboard focus, if any. */
  export function focused(): Recording | undefined {
    const id = Number((document.activeElement as HTMLElement | null)?.dataset.rec);
    return store.rows.find((rec) => rec.id === id);
  }
  export function scrollToRow(id: number): void {
    requestAnimationFrame(() => root?.querySelector(`[data-rec="${id}"]`)?.scrollIntoView({ block: "start" }));
  }

  // the sentinel at the foot loads the next page when it scrolls near
  function sentinel(node: HTMLElement): { destroy: () => void } {
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void store.more(), { rootMargin: "400px" });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
  function top(node: HTMLElement): { destroy: () => void } {
    const observer = new IntersectionObserver((entries) => (attop = entries.some((e) => e.isIntersecting)));
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
</script>

<section class="lg" bind:this={root} aria-label="Transmissions">
  {#if !player.supported}
    <p class="lg__note">THIS BROWSER CANNOT PLAY THE RECORDINGS · OGG OPUS</p>
  {/if}

  <span class="lg__top" use:top></span>

  {#if store.incoming.length && !attop}
    <button class="lg__new" type="button" onclick={() => (store.showIncoming(), root?.scrollIntoView({ block: "start" }))}>▲ {store.incoming.length} NEW</button>
  {/if}

  <ul class="lg__list">
    {#if onAir}
      <li class="lg__air">
        <span class="lg__air-g"><PositionGlyph state="tx" /></span>
        <span class="lg__air-t">{clockOf(onAir.startedAt, tz)}</span>
        <span class="lg__air-d">{fmt.dur(onAir.elapsed)}</span>
        <span class="lg__air-k">ON AIR</span>
      </li>
    {/if}
    {#each items as item, i (item.kind === "row" ? `r${item.rec.id}` : item.kind === "day" ? `d${item.key}` : "x")}
      {#if item.kind === "day"}
        <li class="lg__day" aria-hidden="true"><span>{item.label}</span></li>
      {:else if item.kind === "expired-note"}
        <li class="lg__day" aria-hidden="true"><span>AUDIO KEPT 90 DAYS · OLDER ROWS ARE TEXT ONLY</span></li>
      {:else}
        <LogRow
          rec={item.rec}
          {tz}
          feed={feedOf(item.rec)}
          selected={selectedId === item.rec.id}
          inBucket={inBucket(item.rec)}
          tabbable={tabId === item.rec.id}
          expanded={expanded === item.rec.id}
          ontoggle={() => (expanded = expanded === item.rec.id ? null : item.rec.id)}
          onplay={() => (focusId = item.rec.id, onplay(item.rec))}
        />
      {/if}
    {/each}
  </ul>

  {#if store.retryIn !== null}
    <p class="lg__msg">COULD NOT LOAD · RETRYING IN {store.retryIn}S</p>
  {:else if !store.loading && !store.rows.length}
    <div class="lg__empty">
      <p class="lg__msg">NOTHING RECORDED ON {mhz} YET</p>
      {#if inBank}
        <p class="lg__sentence">Every transmission on this channel is saved here as it happens, with a transcript a minute or so later.</p>
      {:else}
        <p class="lg__sentence">
          Only channels in a bank are recorded.{#if session.isAdmin} <a href="/feeds" onclick={followLink}>Add this one to a bank in Feeds &amp; Banks.</a>{:else} Add this one to a bank in Feeds &amp; Banks.{/if}
        </p>
      {/if}
    </div>
  {/if}

  {#if store.rows.length >= MAX_ROWS}
    <p class="lg__msg">JUMP FURTHER WITH THE WEEK GRID</p>
  {:else if store.hasMore && store.rows.length}
    <span class="lg__sentinel" use:sentinel></span>
    <button class="lg__older" type="button" onclick={() => void store.more()} disabled={store.loading}>{store.loading ? "LOADING" : "LOAD OLDER"}</button>
  {/if}
</section>

<style>
  .lg { min-width: 0; padding-bottom: 24px; }
  .lg__note { margin: 0; padding: 8px 16px; font: 500 var(--fs-11)/1.3 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
  .lg__top { display: block; height: 1px; }
  .lg__list { margin: 0; padding: 0 16px; list-style: none; }
  .lg__day { display: flex; align-items: center; gap: 12px; min-height: 32px; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); }
  .lg__day::before, .lg__day::after { content: ""; flex: 1; height: 1px; background: var(--grid); }
  .lg__air { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 0 0 0; background: var(--wash-tx-surface); border-bottom: 1px solid var(--grid); }
  .lg__air-g { width: 44px; display: grid; place-items: center; }
  .lg__air-t { font: 400 var(--fs-13)/1 var(--font-data); color: var(--state-tx); }
  .lg__air-d { font: 400 var(--fs-13)/1 var(--font-data); color: var(--state-tx); }
  .lg__air-k { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
  .lg__new { display: block; margin: 8px auto; min-height: 32px; padding: 0 16px; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); position: sticky; top: calc(var(--header-h) + max(var(--fq-top, 0px), 44px) + 8px); z-index: 5; background: var(--bg-void); }
  .lg__msg { margin: 0; padding: 16px 16px 4px; font: 500 var(--fs-13)/1.3 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
  .lg__sentence { margin: 0; padding: 0 16px 16px; max-width: 60ch; font: 400 var(--fs-15)/1.45 var(--font-read); color: var(--ink-3); }
  .lg__sentence a { color: var(--line); }
  .lg__sentinel { display: block; height: 1px; }
  .lg__older { display: block; margin: 12px 16px 0; min-height: 44px; padding: 0 16px; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); box-shadow: inset 0 0 0 1px var(--line-faint); }

  @media (min-width: 900px) {
    .lg__list { padding: 0 24px 0 var(--margin-x); }
    .lg__msg, .lg__sentence { padding-left: var(--margin-x); }
    .lg__note { padding-left: var(--margin-x); }
    .lg__older { margin-left: var(--margin-x); }
  }
</style>

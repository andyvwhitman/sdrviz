<script lang="ts">
  /**
   * The frequency index: one row per channel in a bank, most recently heard first (keyed ones on top), each with its
   * day strip. One batch call fetches every strip. Rows keep their order while the page is open.
   */
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { followLink } from "$lib/router.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { simClock } from "$lib/stores/simClock.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { cyclicAge } from "$lib/time";
  import type { Channel } from "$lib/types/live";
  import type { ActivityIndex } from "$lib/types/recordings";
  import MiniStrip from "./MiniStrip.svelte";

  let activity = $state<ActivityIndex | null>(null);
  let failed = $state(false);
  let bank = $state<string | null>(null);
  let nowMs = $state(Date.now());
  /** the order rows were first shown in: they do not re-sort while the page is open */
  let order = $state<string[]>([]);

  const snapshot = $derived(live.state);
  const channels = $derived(snapshot?.channels ?? []);
  const lastS = (c: Channel): number => (c.tx ? -1 : c.last_heard ? cyclicAge(simClock.now, c.last_heard.end_t) : Number.MAX_SAFE_INTEGER);

  $effect(() => {
    if (order.length || !channels.length) return;
    order = [...channels].sort((a, b) => lastS(a) - lastS(b)).map((c) => c.id);
  });
  const rows = $derived(
    order
      .map((id) => channels.find((c) => c.id === id))
      .filter((c): c is Channel => !!c && (!bank || c.banks.includes(bank))),
  );
  const byId = $derived(new Map((activity?.frequencies ?? []).map((f) => [f.frequency_id, f])));

  async function load(): Promise<void> {
    try {
      activity = await api.activity.all();
      failed = false;
    } catch {
      failed = true;
    }
  }

  onMount(() => {
    const stopClock = simClock.start();
    void load();
    const timer = setInterval(() => {
      nowMs = Date.now();
      if (!document.hidden && nowMs % 60_000 < 1000) void load();
    }, 1000);
    document.title = "FREQUENCIES · SDRVIZ";
    return () => {
      stopClock();
      clearInterval(timer);
      shell.statusFallback = undefined;
    };
  });
  $effect(() => {
    if (snapshot) simClock.sync(snapshot.t_offset_s);
  });
  $effect(() => {
    shell.statusFallback = `FREQUENCIES · ${channels.length} IN A BANK`;
  });
</script>

<div class="ix">
  <h1 class="ix__title">FREQUENCIES · {channels.length} RECORDED</h1>
  {#if snapshot && snapshot.banks.length > 1}
    <div class="tabs ix__banks" role="tablist" aria-label="Filter by bank">
      <button class="tab" role="tab" type="button" aria-selected={bank === null} onclick={() => (bank = null)}>ALL</button>
      {#each snapshot.banks as b (b.id)}
        <button class="tab" role="tab" type="button" aria-selected={bank === b.id} onclick={() => (bank = b.id)}>{b.name.toUpperCase()}</button>
      {/each}
    </div>
  {/if}
  {#if failed && !activity}<p class="ix__msg">COULD NOT LOAD THE DAY STRIPS</p>{/if}
  <ul class="ix__list">
    {#each rows as c (c.id)}
      {@const day = byId.get(c.id)}
      {@const age = lastS(c)}
      <li class="ix__row">
        <a class="ix__link" href="/frequency/{c.id}" onclick={followLink} aria-label="{c.label}, open the frequency page">
          <span class="ix__id"><span class="ix__aar">{c.aar4}</span><span class="ix__name">{c.label}</span></span>
          <span class="ix__hero" class:is-tx={!!c.tx}>
            {#if c.tx}<PositionGlyph state="tx" /> KEYED {fmt.dur(c.tx.elapsed_s)}
            {:else if age < Number.MAX_SAFE_INTEGER}{fmt.age(age)} <PositionGlyph state="idle" dim />
            {:else}NOT HEARD YET{/if}
          </span>
          <span class="ix__mhz">{fmt.freq(c.freq_mhz)}</span>
        </a>
        <div class="ix__strip">
          {#if day}
            <MiniStrip buckets={day.buckets} recordingSince={day.recording_since} {nowMs} keyed={!!c.tx} lastS={age < Number.MAX_SAFE_INTEGER ? age : null} href="/frequency/{c.id}" label={c.label} />
          {/if}
        </div>
      </li>
    {/each}
  </ul>
</div>

<style>
  .ix { padding: 0 16px 32px; max-width: 1400px; }
  .ix__title { margin: 0; min-height: 56px; display: flex; align-items: center; font: 500 var(--fs-13)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink); }
  .ix__banks { margin-bottom: 12px; overflow-x: auto; height: 32px; --tabs-h: 32px; }
  .ix__banks .tab { height: 32px; white-space: nowrap; }
  .ix__msg { margin: 0; padding: 8px 0; font: 500 var(--fs-13)/1.3 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
  .ix__list { margin: 0; padding: 0; list-style: none; display: grid; }
  .ix__row { display: grid; gap: 4px; padding: 10px 0; min-height: 64px; border-bottom: 1px solid var(--grid); }
  .ix__link { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "id hero" "mhz hero"; border: 0; color: var(--ink); }
  .ix__id { grid-area: id; display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  .ix__aar { font: 500 var(--fs-18)/1 var(--font-data); }
  .ix__name { font: 600 var(--fs-18)/1 var(--font-display); letter-spacing: var(--track-display); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ix__mhz { grid-area: mhz; font: 400 var(--fs-12)/1.3 var(--font-data); color: var(--ink-2); }
  .ix__hero { grid-area: hero; display: inline-flex; align-items: center; gap: 6px; font: 500 var(--fs-18)/1 var(--font-data); color: var(--ink-2); }
  .ix__hero.is-tx { color: var(--state-tx); }
  @media (min-width: 900px) {
    .ix { padding: 0 var(--margin-x) 32px; }
    .ix__list { grid-template-columns: repeat(auto-fill, minmax(640px, 1fr)); column-gap: 48px; }
    .ix__row { grid-template-columns: 330px auto; align-items: center; }
    .ix__hero { font-size: var(--fs-15); }
  }
</style>

<script lang="ts">
  /**
   * Live transcript log (spec 5.12, brief 9.1.4): newest first, whole rows only. Following the top
   * the log shows the rows that fit; scrolling down browses the full list, and rows that arrive
   * meanwhile raise the "▲ n NEW" pill. New decoded rows reveal their words (M24).
   */
  import { tick, untrack } from "svelte";
  import Chip from "$lib/components/Chip.svelte";
  import TranscriptRow from "$lib/components/TranscriptRow.svelte";
  import { cyclicAge } from "$lib/time";
  import { live } from "$lib/stores/live.svelte";
  import type { TxRow } from "$lib/types/live";
  import { revealWords } from "./keyup.svelte";

  interface Props {
    rows: readonly TxRow[];
    countToday: number;
    /** width of the decode-bar column, px */
    colWidth: number;
    /** frequency ids of the active bank, for the BANK ONLY filter */
    bankIds: ReadonlySet<string>;
    /** smooth sim time: a decoding row's bar grows with the key-up */
    now: number;
    selectedId?: string | null;
    onselect?: (row: TxRow) => void;
  }
  let { rows, countToday, colWidth, bankIds, now, selectedId = null, onselect }: Props = $props();

  /** A live row counts its own duration on the smooth sim clock. */
  const forLog = (row: TxRow): TxRow => (row.live ? { ...row, duration_s: cyclicAge(now, row.t_offset_s) } : row);

  let bankOnly = $state(false);
  const shown = $derived(bankOnly ? rows.filter((r) => bankIds.has(r.frequency_id)) : rows);

  let list = $state<HTMLElement>();
  /** the newest row id the viewer has seen; rows above it are "new" while browsing */
  let browsing = $state(false);
  let seenTop = $state<string | null>(null);
  const newCount = $derived.by(() => {
    if (!browsing || seenTop == null) return 0;
    const at = shown.findIndex((r) => r.id === seenTop);
    return at < 0 ? 0 : at;
  });

  $effect(() => {
    if (!browsing) seenTop = shown[0]?.id ?? null;
  });

  function onscroll(): void {
    if (!list) return;
    browsing = list.scrollTop > 0;
  }
  function onwheel(): void {
    browsing = true; // the fitted list cannot scroll; the first wheel turn opens the full list
  }
  function toTop(): void {
    browsing = false;
    list?.scrollTo({ top: 0 });
  }

  /** Following the top: hide the rows the bottom edge would cut. */
  function fit(): void {
    if (!list) return;
    const rowsEl = list.querySelectorAll<HTMLElement>(".txrow");
    rowsEl.forEach((el) => (el.style.display = ""));
    if (browsing) return;
    const limit = list.getBoundingClientRect().bottom;
    rowsEl.forEach((el) => {
      if (el.getBoundingClientRect().bottom > limit) el.style.display = "none";
    });
  }
  $effect(() => {
    void shown.length;
    void shown[0]?.id;
    void browsing;
    tick().then(fit);
    document.fonts?.ready.then(fit);
    if (!list) return;
    const observer = new ResizeObserver(fit);
    observer.observe(list);
    return () => observer.disconnect();
  });

  // M24: reveal a row's words the first time they arrive
  const revealed = new Set<string>();
  $effect(() =>
    live.on("words", (message) => {
      if (revealed.has(message.tx_id) || !message.words.length) return;
      revealed.add(message.tx_id);
      tick().then(() => {
        const row = untrack(() => list)?.querySelector(`[data-id="${CSS.escape(message.tx_id)}"]`);
        if (row) revealWords(row);
      });
    }),
  );
</script>

<div class="txlog lo-log" class:lo-browsing={browsing}>
  <div class="txlog__head">
    <span class="t-panel">TRANSCRIPT</span>
    <span class="t-micro">NEWEST FIRST</span>
    <span class="grow"></span>
    {#if newCount > 0}<Chip kind="active" button text="▲ {newCount} NEW" onclick={toTop} />{/if}
    <span class="mono">{countToday}</span>
    <span class="t-micro">TODAY</span>
    <Chip kind="filter" button pressed={bankOnly} text="BANK ONLY" onclick={() => (bankOnly = !bankOnly)} />
  </div>
  <div class="lo-rows" aria-live="polite" bind:this={list} {onscroll} {onwheel}>
    {#each shown as row (row.id)}
      <TranscriptRow row={forLog(row)} live={row.live} {colWidth} selected={row.id === selectedId} onclick={() => onselect?.(row)} />
    {/each}
  </div>
</div>

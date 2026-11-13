<script lang="ts">
  /** History transcript table: filters and keyword search, the selected string's rows first, then the range. */
  import Button from "$lib/components/Button.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import SimTag from "$lib/components/SimTag.svelte";
  import TranscriptRow from "$lib/components/TranscriptRow.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { live } from "$lib/stores/live.svelte";
  import FilterChip from "./FilterChip.svelte";
  import { hm } from "./geometry";
  import type { Filters } from "./store.svelte";
  import type { HistoryRow, Range, Train } from "./types";

  interface Props {
    rows: HistoryRow[];
    total: number;
    range: Range;
    pick: HistoryRow | null;
    selectedTrain: string | null;
    trains: Train[];
    filters: Filters;
    channels: Record<string, string>;
    height: number;
    small: boolean;
    onselect: (id: string) => void;
    onfilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  }
  let { rows, total, range, pick, selectedTrain, trains, filters, channels, height, small, onselect, onfilter }: Props = $props();

  const ROLES = ["crew", "dispatcher", "operator", "detector", "yardmaster", "MOW"];
  const STATES = ["final", "decoding", "carrier_only", "failed", "undecodable"];
  const option = (value: string, label = value.toUpperCase().replace(/_/g, " ")) => ({ value, label });

  const channelOptions = $derived(Object.entries(channels).map(([id, label]) => option(id, label)));
  const feedOptions = $derived((live.state?.feeds ?? []).map((f) => option(f.id, f.short)));
  const bankOptions = $derived((live.state?.banks ?? []).map((b) => option(b.id, b.name.toUpperCase())));

  // rows that fit the box under the head, with two group rules and the more line (33 px a row)
  const fit = $derived(Math.max(3, Math.floor((height - 62 - 2 * 22 - 20) / 33)));
  let extra = $state(0);
  const cap = $derived(fit + extra);
  $effect(() => {
    // a new query starts again at the first screenful
    rows;
    extra = 0;
  });

  const mine = $derived(selectedTrain ? rows.filter((r) => r.train_id === selectedTrain) : []);
  const rest = $derived(rows.filter((r) => !mine.includes(r)));
  const room = $derived(Math.max(1, cap - 2));
  const at = $derived(mine.findIndex((r) => r.id === pick?.id));
  const from = $derived(at >= room ? at - room + 1 : 0);
  const shown = $derived(mine.slice(from, from + room));
  const restRoom = $derived(Math.max(1, cap - shown.length));
  const train = $derived(trains.find((t) => t.train_id === selectedTrain));
  const rangeText = $derived(`${hm(range.start_t)}–${hm(range.end_t)}`);
</script>

<div class="hi-filters">
  <Chip kind="filter" button pressed={false}>ROUTE<span class="v">ALL ROUTES</span></Chip>
  {#if selectedTrain}
    <Chip kind="filter" button pressed onclick={() => onfilter("trainOnly", !filters.trainOnly)} title="Only this train's transmissions">
      TRAIN<span class="v">{fmt.trainId(selectedTrain)} ×</span>
    </Chip>
  {/if}
  <FilterChip name="BANK" options={bankOptions} value={filters.bank_id} onchange={(v) => onfilter("bank_id", v)} />
  <FilterChip name="CHANNEL" options={channelOptions} value={filters.frequency_id} onchange={(v) => onfilter("frequency_id", v)} />
  <FilterChip name="ROLE" options={ROLES.map((r) => option(r))} value={filters.role} onchange={(v) => onfilter("role", v)} />
  <FilterChip name="FEED" options={feedOptions} value={filters.feed_id} onchange={(v) => onfilter("feed_id", v)} />
  <FilterChip name="STATE" options={STATES.map((s) => option(s))} value={filters.state} onchange={(v) => onfilter("state", v)} />
  <Chip kind="filter" button pressed={filters.defect} onclick={() => onfilter("defect", !filters.defect)} text="DEFECT" />
  <label class="hi-search">
    <span class="k">SEARCH</span>
    <input type="search" placeholder="Transcript text" value={filters.q} onchange={(e) => onfilter("q", e.currentTarget.value)} />
  </label>
  <span class="t-micro hi-count"><span class="mono">{total}</span> ROWS{small ? "" : " · NEWEST FIRST"}</span>
</div>
<div class="hi-thead hi-grid">
  <span>TIME</span><span>AAR</span><span>CHANNEL</span><span>FEED</span><span>ROLE</span><span>SPEAKER / TRAIN</span><span class="r">DUR</span><span>TEXT</span>
</div>
<div class="hi-rows hi-grid" class:is-expanded={extra > 0}>
  {#if shown.length}
    <div class="hi-group">
      <span class="label">ON STRING</span>
      <span class="mono">
        {fmt.trainId(selectedTrain)}{train ? ` · ${train.line.toUpperCase()}` : ""} · {mine.length} TX{shown.length < mine.length ? ` · ROWS ${from + 1}–${from + shown.length} OF ${mine.length}` : ""}
      </span>
      <SimTag /><span class="grow"></span>
    </div>
    {#each shown as row (row.id)}
      <TranscriptRow {row} columns="history" selected={row.id === pick?.id} onclick={() => onselect(row.id)} />
    {/each}
  {/if}
  <div class="hi-group"><span class="label">ALL IN RANGE</span><span class="mono">{rangeText} · {rows.length} TX</span><span class="grow"></span></div>
  {#each rest.slice(0, restRoom) as row (row.id)}
    <TranscriptRow {row} columns="history" selected={row.id === pick?.id && !shown.length} onclick={() => onselect(row.id)} />
  {/each}
  {#if rest.length > restRoom}
    <button class="hi-more" onclick={() => (extra += 50)}>+ {rest.length - restRoom} MORE ROWS BELOW</button>
  {:else if !rows.length}
    <div class="txrow-empty">NO TRANSMISSIONS IN RANGE</div>
  {/if}
</div>

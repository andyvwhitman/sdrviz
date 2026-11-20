<script lang="ts">
  /** The desktop filter bar (direction 2.2): node, state, railroad, search, and how many rows are shown. */
  import Chip from "$lib/components/Chip.svelte";
  import type { NodeColumn } from "$lib/types/frequencies";
  import { STATE_FILTERS, type Counts, type Filters, type StateFilter } from "./table";

  interface Props {
    filters: Filters;
    columns: NodeColumn[];
    counts: Counts;
    stateCounts: Record<StateFilter, number>;
    railroads: string[];
    shown: number;
    /** a refused change, in the fault tone, for a few seconds */
    failure: string;
    onfilter: (changes: Partial<Filters>) => void;
  }
  let { filters, columns, counts, stateCounts, railroads, shown, failure, onfilter }: Props = $props();
</script>

<div class="fr-filters" role="search">
  {#if columns.length}
    <div class="fr-group" role="group" aria-label="Node">
      <span class="fr-k">NODE</span>
      <Chip button text="ALL" kind={filters.node === null ? "active" : "nominal"} pressed={filters.node === null} onclick={() => onfilter({ node: null })} />
      {#each columns as column (column.feedId)}
        <Chip button text="{column.short} {counts.perNode[column.feedId] ?? 0}" kind={filters.node === column.feedId ? "active" : "nominal"} pressed={filters.node === column.feedId} onclick={() => onfilter({ node: column.feedId })} />
      {/each}
    </div>
  {/if}
  <div class="fr-group" role="group" aria-label="State">
    {#each STATE_FILTERS as state (state)}
      <Chip button text="{state.toUpperCase()} {stateCounts[state]}" kind={filters.state === state ? "active" : "nominal"} pressed={filters.state === state} onclick={() => onfilter({ state })} />
    {/each}
  </div>
  <label class="fr-select-wrap">
    <span class="fr-k">RAILROAD</span>
    <select class="fr-select" value={filters.railroad ?? ""} onchange={(event) => onfilter({ railroad: event.currentTarget.value || null })}>
      <option value="">ALL</option>
      {#each railroads as name (name)}<option value={name}>{name.toUpperCase()}</option>{/each}
    </select>
  </label>
  <label class="fr-search">
    <span class="fr-k" aria-hidden="true">⌕</span>
    <input type="search" placeholder="SEARCH" aria-label="Search frequencies" value={filters.search} oninput={(event) => onfilter({ search: event.currentTarget.value })} />
  </label>
  <span class="fr-grow"></span>
  {#if failure}<span class="fr-fail" role="alert">{failure}</span>{/if}
  <span class="fr-shown">{shown} SHOWN</span>
</div>

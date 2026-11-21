<script lang="ts">
  /** The desktop filter bar (direction 2.2): node, state, railroad, search, and how many rows are shown. */
  import Chip from "$lib/components/Chip.svelte";
  import Glyph from "$lib/components/Glyph.svelte";
  import type { NodeColumn } from "$lib/types/frequencies";
  import { STATE_FILTERS, isFiltered, type Counts, type Filters, type StateFilter } from "./table";

  /** More nodes than this and the chips give way to one select. */
  const MAX_NODE_CHIPS = 3;
  const SEARCH_DEBOUNCE_MS = 120;

  interface Props {
    filters: Filters;
    columns: NodeColumn[];
    counts: Counts;
    stateCounts: Record<StateFilter, number>;
    railroads: string[];
    shown: number;
    /** a refused change, in the fault tone, for a few seconds */
    onfilter: (changes: Partial<Filters>) => void;
  }
  let { filters, columns, counts, stateCounts, railroads, shown, onfilter }: Props = $props();

  // The field writes to the URL after a short pause; the field itself follows the URL when it changes elsewhere.
  let query = $state("");
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchInput = $state<HTMLInputElement>();

  $effect(() => {
    query = filters.search;
  });
  $effect(() => () => clearTimeout(searchTimer));

  function typed(value: string): void {
    query = value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => onfilter({ search: value }), SEARCH_DEBOUNCE_MS);
  }

  function searchKeys(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !query) return;
    event.preventDefault();
    clearTimeout(searchTimer);
    query = "";
    onfilter({ search: "" });
  }

  /** `/` jumps to the search field, unless the key is going into some other field. */
  function windowKeys(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    searchInput?.focus();
  }

  const nodeGlyph = (column: NodeColumn) => (column.state === "ok" ? undefined : column.state === "stale" ? "stale" : "offline");
</script>

<svelte:window onkeydown={windowKeys} />

<div class="fr-filters" role="search">
  {#if columns.length > MAX_NODE_CHIPS}
    <label class="fr-select-wrap">
      <span class="fr-k">NODE</span>
      <select class="fr-select" value={filters.node ?? ""} onchange={(event) => onfilter({ node: event.currentTarget.value || null })}>
        <option value="">ALL</option>
        {#each columns as column (column.feedId)}<option value={column.feedId}>{column.short} {counts.perNode[column.feedId] ?? 0}</option>{/each}
      </select>
    </label>
  {:else if columns.length}
    <div class="fr-group" role="group" aria-label="Node">
      <span class="fr-k">NODE</span>
      <Chip button text="ALL" kind={filters.node === null ? "active" : "nominal"} pressed={filters.node === null} onclick={() => onfilter({ node: null })} />
      {#each columns as column (column.feedId)}
        <Chip button glyph={nodeGlyph(column)} text="{column.short} {counts.perNode[column.feedId] ?? 0}" kind={filters.node === column.feedId ? "active" : "nominal"} pressed={filters.node === column.feedId} onclick={() => onfilter({ node: column.feedId })} />
      {/each}
    </div>
  {/if}
  <div class="fr-group fr-ruled" role="group" aria-label="State">
    {#each STATE_FILTERS as state (state)}
      <Chip button text="{state.toUpperCase()} {stateCounts[state]}" kind={filters.state === state ? "active" : "nominal"} pressed={filters.state === state} onclick={() => onfilter({ state })} />
    {/each}
  </div>
  <label class="fr-select-wrap fr-ruled">
    <span class="fr-k">RAILROAD</span>
    <select class="fr-select" value={filters.railroad ?? ""} onchange={(event) => onfilter({ railroad: event.currentTarget.value || null })}>
      <option value="">ALL</option>
      {#each railroads as name (name)}<option value={name}>{name.toUpperCase()}</option>{/each}
    </select>
  </label>
  <label class="fr-search fr-ruled">
    <span class="fr-k" aria-hidden="true"><Glyph name="search" size={14} /></span>
    <input bind:this={searchInput} type="search" placeholder="SEARCH" aria-label="Search frequencies" value={query} oninput={(event) => typed(event.currentTarget.value)} onkeydown={searchKeys} />
  </label>
  <span class="fr-shown">{shown} SHOWN</span>
  {#if isFiltered(filters)}<button type="button" class="fr-clear" onclick={() => onfilter({ node: null, state: "all", railroad: null, search: "" })}>CLEAR</button>{/if}
</div>

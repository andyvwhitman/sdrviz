<script lang="ts">
  /**
   * /frequencies: every frequency in one table with a read-only ON column (direction 2, Sprint 6 C.6). An admin edits a
   * row, its nodes included, in the drawer (`?edit=<id>`, `?edit=new`); a viewer reads. The filters and
   * the sort live in the URL. On a phone the table is a list and the editor a full-screen layer.
   */
  import { onMount, tick } from "svelte";
  import Button from "$lib/components/Button.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import Glyph from "$lib/components/Glyph.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import FrequencyLayer from "$lib/components/frequency-editor/FrequencyLayer.svelte";
  import type { Outcome } from "$lib/components/frequency-editor/editorForm";
  import { nodeColumns } from "$lib/components/frequency-editor/nodes";
  import { router } from "$lib/router.svelte";
  import { frequencies } from "$lib/stores/frequencies.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { session } from "$lib/stores/session.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { viewport } from "$lib/stores/viewport.svelte";
  import type { Frequency } from "$lib/types/frequencies";
  import FilterBar from "./FilterBar.svelte";
  import FrequencyDrawer from "./FrequencyDrawer.svelte";
  import FrequencyList from "./FrequencyList.svelte";
  import FrequencyTable from "./FrequencyTable.svelte";
  import Hero from "./Hero.svelte";
  import {
    DEFAULT_SORT,
    NO_FILTERS,
    STATE_FILTERS,
    countsOf,
    filtered,
    isFiltered,
    nextSort,
    railroadsOf,
    sharedIds,
    sorted,
    stateCounts as stateCountsOf,
    statusLine,
    viewFromQuery,
    viewToQuery,
    type Filters,
    type Sort,
    type SortKey,
  } from "./table";
  import "./frequencies.css";

  const admin = $derived(session.isAdmin);
  const phone = $derived(viewport.handset);

  // ---- the data
  const all = $derived(frequencies.rows);
  const columns = $derived(nodeColumns(live.state?.feeds ?? []));
  const keyed = $derived(new Set(live.state?.active_transmissions.filter((row) => row.live).map((row) => row.frequency_id)));
  const shared = $derived(sharedIds(all));
  const counts = $derived(frequencies.loaded ? countsOf(all, columns) : null);

  // ---- the view, in the URL
  const view = $derived(viewFromQuery((name) => router.query(name)));
  const rows = $derived(sorted(filtered(all, view.filters), view.sort, view.filters.node));
  const stateCounts = $derived(stateCountsOf(all, view.filters));
  const railroads = $derived(railroadsOf(all));

  const setView = (filters: Filters, sort: Sort): void => router.setQuery(viewToQuery({ filters, sort }));
  const filter = (changes: Partial<Filters>): void => setView({ ...view.filters, ...changes }, view.sort);
  const sortBy = (key: SortKey): void => setView(view.filters, nextSort(view.sort, key));
  const clearFilters = (): void => setView(NO_FILTERS, view.sort);

  // ---- the editor, in the URL
  const editParam = $derived(router.query("edit"));
  const editId = $derived(editParam && editParam !== "new" ? editParam : null);
  const editing = $derived(admin && !!editParam);
  let drawer = $state<ReturnType<typeof FrequencyDrawer>>();

  const openEditor = (id: string | "new" | null): void => router.setQuery({ edit: id });

  /** A row was chosen: an admin edits it (after any unsaved details are dealt with), a viewer goes to its page. */
  function pick(f: Frequency): void {
    if (!admin) {
      router.go(`/frequency/${encodeURIComponent(f.id)}`);
      return;
    }
    if (editParam === f.id) return;
    if (drawer) drawer.requestClose(() => openEditor(f.id));
    else openEditor(f.id);
  }

  async function done(outcome: Outcome, id: string): Promise<void> {
    if (outcome === "deleted") return openEditor(null);
    if (outcome === "saved") return;
    if (!filtered(frequencies.rows, view.filters).some((f) => f.id === id)) clearFilters();
    openEditor(id);
    await tick();
    document.getElementById(`fr-row-${id}`)?.scrollIntoView({ block: "nearest" });
  }

  // the row being edited stays in view at the table's left
  $effect(() => {
    if (editId && frequencies.loaded) void tick().then(() => document.getElementById(`fr-row-${editId}`)?.scrollIntoView({ block: "nearest" }));
  });
  // an `?edit=` that names nothing (a deleted frequency, an old link) is dropped once the table is known
  $effect(() => {
    if (editId && frequencies.loaded && !frequencies.byId(editId)) openEditor(null);
  });
  // a viewer has no editor
  $effect(() => {
    if (editParam && !admin) openEditor(null);
  });

  // ---- shell
  $effect(() => {
    shell.statusFallback = counts ? statusLine(counts, columns.length) : undefined;
  });

  onMount(() => {
    void frequencies.load();
    return () => {
      shell.statusFallback = undefined;
    };
  });

  // ---- the phone's sort select
  const SORTS: { value: string; text: string; sort: Sort }[] = [
    { value: "mhz:asc", text: "MHz LOW TO HIGH", sort: { key: "mhz", dir: "asc" } },
    { value: "mhz:desc", text: "MHz HIGH TO LOW", sort: { key: "mhz", dir: "desc" } },
    { value: "aar:asc", text: "AAR", sort: { key: "aar", dir: "asc" } },
    { value: "label:asc", text: "LABEL", sort: { key: "label", dir: "asc" } },
    { value: "railroad:asc", text: "RAILROAD", sort: { key: "railroad", dir: "asc" } },
  ];
  const sortValue = $derived(`${view.sort.key}:${view.sort.dir}`);
</script>

{#snippet empty()}
  {#if frequencies.loaded && all.length === 0}
    <EmptyState title="NO FREQUENCIES" detail="Add one by channel or MHz, or right-click a channel on the Live Ops waterfall." />
  {:else if frequencies.loaded}
    <EmptyState title="NO MATCHES"><Button onclick={clearFilters}>CLEAR FILTERS</Button></EmptyState>
  {:else if frequencies.failed}
    <EmptyState title="COULD NOT LOAD" detail="The backend did not answer." />
  {/if}
{/snippet}

{#if phone}
  <div class="frp" data-route-screen="frequencies">
    <div class="frp__top">
      <div class="frp__hero">
        <span class="frp__enabled">ENABLED <b>{counts && columns.length ? `${counts.enabled}/${counts.total}` : "— — —"}</b> · REC + ASR</span>
        {#if admin}<Button sm onclick={() => openEditor("new")}>+ ADD</Button>{/if}
      </div>
      <div class="frp__find">
        <label class="fr-search">
          <span class="fr-k" aria-hidden="true"><Glyph name="search" size={14} /></span>
          <input type="search" placeholder="SEARCH" aria-label="Search frequencies" value={view.filters.search} oninput={(event) => filter({ search: event.currentTarget.value })} />
        </label>
        <label class="frp__sort">
          <span class="visually-hidden">Sort</span>
          <select class="fr-select" value={sortValue} onchange={(event) => setView(view.filters, SORTS.find((s) => s.value === event.currentTarget.value)?.sort ?? DEFAULT_SORT)}>
            {#each SORTS as option (option.value)}<option value={option.value}>{option.text}</option>{/each}
          </select>
        </label>
      </div>
      <div class="frp__chips" role="group" aria-label="Filters">
        {#if columns.length > 1}
          {#each columns as column (column.feedId)}
            <Chip button text="{column.short} {counts?.perNode[column.feedId] ?? ''}" kind={view.filters.node === column.feedId ? "active" : "nominal"} pressed={view.filters.node === column.feedId} onclick={() => filter({ node: view.filters.node === column.feedId ? null : column.feedId })} />
          {/each}
        {/if}
        {#each STATE_FILTERS.filter((s) => s !== "all") as state (state)}
          <Chip button text="{state.toUpperCase()} {stateCounts[state]}" kind={view.filters.state === state ? "active" : "nominal"} pressed={view.filters.state === state} onclick={() => filter({ state: view.filters.state === state ? "all" : state })} />
        {/each}
        {#each railroads as name (name)}
          <Chip button text={name.toUpperCase()} kind={view.filters.railroad === name ? "active" : "nominal"} pressed={view.filters.railroad === name} onclick={() => filter({ railroad: view.filters.railroad === name ? null : name })} />
        {/each}
      </div>
    </div>
    <div class="frp__list" inert={editing}>
      {#if rows.length}
        <FrequencyList {rows} {columns} node={view.filters.node} {keyed} onrow={pick} />
      {:else}
        <div class="frp__empty">{@render empty()}</div>
      {/if}
    </div>
    {#if editing}
      <FrequencyLayer frequencyId={editId} onclose={() => openEditor(null)} ondone={done} onopen={(id) => openEditor(id)} />
    {/if}
  </div>
{:else}
  <div class="fr" class:has-drawer={editing}>
    <Hero {counts} {columns} {admin} onadd={() => (drawer ? drawer.requestClose(() => openEditor("new")) : openEditor("new"))} />
    <FilterBar filters={view.filters} {columns} counts={counts ?? { enabled: 0, total: 0, perNode: {} }} {stateCounts} {railroads} shown={rows.length} onfilter={filter} />
    <div class="fr-box">
      <FrequencyTable {rows} {columns} node={view.filters.node} sort={view.sort} {keyed} {shared} pickedId={editId} onsort={sortBy} onrow={pick} />
      {#if rows.length === 0}<div class="fr-empty">{@render empty()}</div>{/if}
    </div>
    {#if editing}
      <FrequencyDrawer bind:this={drawer} frequencyId={editId} onclose={() => openEditor(null)} ondone={done} onopen={(id) => openEditor(id)} />
    {/if}
  </div>
{/if}

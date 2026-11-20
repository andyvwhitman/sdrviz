<script lang="ts">
  /** The desktop table (direction 2.3): a head of sort buttons, then one grid row per frequency. Only the body scrolls. */
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import { aar as aarPair, freq as mhzText } from "$lib/hud/fmt";
  import { followLink } from "$lib/router.svelte";
  import { slotOf } from "$lib/slots";
  import type { Frequency, NodeColumn } from "$lib/types/frequencies";
  import AssignSlot from "./AssignSlot.svelte";
  import { glyphOf, type Counts, type Sort, type SortKey } from "./table";

  interface Props {
    rows: Frequency[];
    columns: NodeColumn[];
    counts: Counts;
    sort: Sort;
    keyed: Set<string>;
    shared: Set<string>;
    pickedId: string | null;
    admin: boolean;
    /** `${frequency id}|${feed id}` of the requests in flight */
    busy: Set<string>;
    onsort: (key: SortKey) => void;
    onrow: (f: Frequency) => void;
    onflip: (f: Frequency, column: NodeColumn) => void;
  }
  let { rows, columns, counts, sort, keyed, shared, pickedId, admin, busy, onsort, onrow, onflip }: Props = $props();

  const HEADS: { key: SortKey; text: string; cls: string }[] = [
    { key: "mhz", text: "MHz", cls: "" },
    { key: "aar", text: "AAR", cls: "" },
    { key: "label", text: "LABEL", cls: "" },
    { key: "railroad", text: "RAILROAD", cls: "" },
    { key: "use", text: "USE", cls: "fr-c-use" },
    { key: "line", text: "LINE", cls: "fr-c-line" },
  ];

  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" => (sort.key !== key ? "none" : sort.dir === "asc" ? "ascending" : "descending");
  const arrow = (key: SortKey): string => (sort.key !== key ? "" : sort.dir === "asc" ? " ▲" : " ▼");

  /** Arrow keys move focus between rows. */
  function rowKeys(event: KeyboardEvent, f: Frequency): void {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onrow(f);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const row = event.currentTarget as HTMLElement;
      const sibling = event.key === "ArrowDown" ? row.nextElementSibling : row.previousElementSibling;
      (sibling as HTMLElement | null)?.focus();
    }
  }
</script>

<div class="fr-table" role="table" aria-label="Frequencies" aria-rowcount={rows.length + 1} style:--nodes={columns.length}>
  <div class="fr-row fr-head" role="row">
    <span role="presentation"></span>
    {#each HEADS as head (head.key)}
      <div role="columnheader" class={head.cls} aria-sort={ariaSort(head.key)}>
        <button type="button" class="fr-sort" class:is-active={sort.key === head.key} onclick={() => onsort(head.key)}>{head.text}{arrow(head.key)}</button>
      </div>
    {/each}
    {#each columns as column (column.feedId)}
      <div role="columnheader" class="fr-node-h" aria-sort={ariaSort(`node:${column.feedId}`)}>
        <button type="button" class="fr-sort" class:is-active={sort.key === `node:${column.feedId}`} onclick={() => onsort(`node:${column.feedId}`)} title="{column.short}: {counts.perNode[column.feedId] ?? 0} enabled">
          {#if column.state !== "ok"}<PositionGlyph state={column.state === "stale" ? "stale" : "offline"} />{/if}{column.short}{arrow(`node:${column.feedId}`)} <span class="fr-n">{counts.perNode[column.feedId] ?? 0}</span>
        </button>
      </div>
    {/each}
    <span role="presentation"></span>
  </div>

  <div class="fr-body">
    {#each rows as f (f.id)}
      {@const isKeyed = keyed.has(f.id)}
      <div
        class="fr-row fr-data"
        class:is-tx={isKeyed}
        class:is-picked={pickedId === f.id}
        id="fr-row-{f.id}"
        role="row"
        tabindex="0"
        onclick={() => onrow(f)}
        onkeydown={(event) => rowKeys(event, f)}
      >
        <span role="presentation" class="fr-glyph"><PositionGlyph state={glyphOf(f, columns, isKeyed)} /></span>
        <span role="cell" class="fr-mhz">{mhzText(f.freq_mhz)}</span>
        <span role="cell" class="fr-aar">{aarPair(f.aar_channel)}</span>
        <span role="cell" class="fr-label">{f.label}{#if shared.has(f.id)}<span class="fr-same">SAME FREQ</span>{/if}</span>
        <span role="cell" class="fr-rr">{f.railroad}</span>
        <span role="cell" class="fr-use fr-c-use">{f.use}</span>
        <span role="cell" class="fr-line fr-c-line">{f.line}</span>
        {#each columns as column (column.feedId)}
          <span role="cell" class="fr-slot">
            <AssignSlot
              slot={slotOf(f, column.feedId)}
              name="{column.short}, {aarPair(f.aar_channel)} {f.label}"
              nodeState={column.state}
              readonly={!admin}
              busy={busy.has(`${f.id}|${column.feedId}`)}
              onflip={() => onflip(f, column)}
            />
          </span>
        {/each}
        <a class="fr-open" href="/frequency/{encodeURIComponent(f.id)}" onclick={(event) => (event.stopPropagation(), followLink(event))} aria-label="Open the {f.label} frequency page" title="Open the {f.label} frequency page">›</a>
      </div>
    {/each}
  </div>
</div>

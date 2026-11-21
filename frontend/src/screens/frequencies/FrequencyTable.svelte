<script lang="ts">
  /**
   * The desktop table (direction 2.3): a head of sort buttons, then one grid row per frequency. Only the body scrolls.
   * One read-only ON column says on how many nodes a frequency is enabled (or on the chosen node).
   */
  import Glyph from "$lib/components/Glyph.svelte";
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import { aar as aarPair, freq as mhzText } from "$lib/hud/fmt";
  import { followLink } from "$lib/router.svelte";
  import type { Frequency, NodeColumn } from "$lib/types/frequencies";
  import OnCell from "./OnCell.svelte";
  import { glyphOf, type Sort, type SortKey } from "./table";

  interface Props {
    rows: Frequency[];
    columns: NodeColumn[];
    /** the node filter's feed id, or null for all nodes */
    node: string | null;
    sort: Sort;
    keyed: Set<string>;
    shared: Set<string>;
    pickedId: string | null;
    onsort: (key: SortKey) => void;
    onrow: (f: Frequency) => void;
  }
  let { rows, columns, node, sort, keyed, shared, pickedId, onsort, onrow }: Props = $props();

  const HEADS: { key: SortKey; text: string; cls: string }[] = [
    { key: "mhz", text: "MHz", cls: "" },
    { key: "aar", text: "AAR", cls: "" },
    { key: "label", text: "LABEL", cls: "" },
    { key: "railroad", text: "RAILROAD", cls: "" },
    { key: "use", text: "USE", cls: "fr-c-use" },
    { key: "line", text: "LINE", cls: "fr-c-line" },
  ];

  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" => (sort.key !== key ? "none" : sort.dir === "asc" ? "ascending" : "descending");
  /** the ON column's head: ON, or the short name of the chosen node */
  const onHead = $derived(columns.find((c) => c.feedId === node)?.short ?? "ON");

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

{#snippet sortButton(key: SortKey, text: string)}
  <button type="button" class="fr-sort" class:is-active={sort.key === key} onclick={() => onsort(key)}>
    {text}{#if sort.key === key}<Glyph name={sort.dir === "asc" ? "caret-up" : "caret-down"} size={10} />{/if}
  </button>
{/snippet}

<div class="fr-table" role="table" aria-label="Frequencies" aria-rowcount={rows.length + 1} >
  <div class="fr-row fr-head" role="row">
    <span role="presentation"></span>
    {#each HEADS as head (head.key)}
      <div role="columnheader" class={head.cls} aria-sort={ariaSort(head.key)}>
        {@render sortButton(head.key, head.text)}
      </div>
    {/each}
    <div role="columnheader" aria-sort={ariaSort("on")}>
      {@render sortButton("on", onHead)}
    </div>
    <span role="presentation"></span>
  </div>

  <div class="fr-body">
    {#each rows as f (f.id)}
      {@const isKeyed = keyed.has(f.id)}
      {@const glyph = glyphOf(f, columns, isKeyed)}
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
        <span role="presentation" class="fr-glyph">{#if glyph}<PositionGlyph state={glyph} />{/if}</span>
        <span role="cell" class="fr-mhz">{mhzText(f.freq_mhz)}</span>
        <span role="cell" class="fr-aar">{aarPair(f.aar_channel)}</span>
        <span role="cell" class="fr-label">{f.label}{#if shared.has(f.id)}<span class="fr-same">SAME FREQ</span>{/if}</span>
        <span role="cell" class="fr-rr">{f.railroad}</span>
        <span role="cell" class="fr-use fr-c-use">{f.use}</span>
        <span role="cell" class="fr-line fr-c-line">{f.line}</span>
        <span role="cell" class="fr-on"><OnCell {f} {node} /></span>
        <a class="fr-open" href="/frequency/{encodeURIComponent(f.id)}" onclick={(event) => (event.stopPropagation(), followLink(event))} aria-label="Open the {f.label} frequency page" title="Open the {f.label} frequency page"><Glyph name="chevron-right" size={12} /></a>
      </div>
    {/each}
  </div>
</div>

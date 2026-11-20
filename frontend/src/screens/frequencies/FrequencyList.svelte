<script lang="ts">
  /** The phone list (direction 2.6): 64 px two-line rows, the nodes read-only on the right. */
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import { aar as aarPair, freq as mhzText } from "$lib/hud/fmt";
  import { slotOf } from "$lib/slots";
  import type { Frequency, NodeColumn } from "$lib/types/frequencies";
  import { glyphOf } from "./table";

  interface Props {
    rows: Frequency[];
    columns: NodeColumn[];
    keyed: Set<string>;
    onrow: (f: Frequency) => void;
  }
  let { rows, columns, keyed, onrow }: Props = $props();

  /** the assigned nodes of a row; past two, the rest fold into `+3` */
  const assigned = (f: Frequency) => columns.filter((c) => slotOf(f, c.feedId) !== "none");
</script>

<ul class="frl" aria-label="Frequencies">
  {#each rows as f (f.id)}
    {@const nodes = assigned(f)}
    <li>
      <button class="frl__row" class:is-tx={keyed.has(f.id)} type="button" onclick={() => onrow(f)} id="fr-row-{f.id}">
        <span class="frl__l1">
          <PositionGlyph state={glyphOf(f, columns, keyed.has(f.id))} />
          <span class="frl__mhz">{mhzText(f.freq_mhz)}</span>
          <span class="frl__aar">{aarPair(f.aar_channel)}</span>
          <span class="frl__grow"></span>
          {#each nodes.slice(0, 2) as column (column.feedId)}
            <span class="frl__slot" class:is-on={slotOf(f, column.feedId) === "on"}><i></i>{column.short}</span>
          {/each}
          {#if nodes.length > 2}<span class="frl__slot">+{nodes.length - 2}</span>{/if}
        </span>
        <span class="frl__l2"><span class="frl__label">{f.label}</span><span class="frl__sub">{[f.railroad, f.use].filter(Boolean).join(" · ")}</span></span>
      </button>
    </li>
  {/each}
</ul>

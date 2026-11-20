<script lang="ts">
  /** The hero (direction 2.2): the cost of listening, `ENABLED 8 / 31`, and the one door to a new frequency. */
  import Button from "$lib/components/Button.svelte";
  import { BLANK } from "$lib/hud/fmt";
  import { followLink } from "$lib/router.svelte";
  import type { NodeColumn } from "$lib/types/frequencies";
  import type { Counts } from "./table";

  interface Props {
    counts: Counts | null;
    columns: NodeColumn[];
    admin: boolean;
    onadd: () => void;
  }
  let { counts, columns, admin, onadd }: Props = $props();

  const nodeLine = $derived(
    columns.length === 0
      ? "NO NODES"
      : `ON ${columns.length} NODE${columns.length === 1 ? "" : "S"} · ${columns.map((c) => `${c.short} ${counts?.perNode[c.feedId] ?? BLANK}`).join(" · ")}`,
  );
</script>

<div class="fr-hero">
  <div class="fr-big" aria-label="Enabled {counts && columns.length ? `${counts.enabled} of ${counts.total}` : 'unknown'}">
    <span class="fr-k">ENABLED</span>
    <span class="fr-num">{#if counts}{columns.length ? counts.enabled : "—"}<span class="fr-of">&nbsp;/&nbsp;{counts.total}</span>{:else}{BLANK}{/if}</span>
  </div>
  <div class="fr-stack">
    <span class="fr-line1">RECORDED + TRANSCRIBED</span>
    <span class="fr-line2">{nodeLine}{#if columns.length === 0} · <a href="/settings" onclick={followLink}>Add a node in Settings.</a>{/if}</span>
  </div>
  <span class="fr-grow"></span>
  {#if admin}<Button onclick={onadd}>+ ADD FREQUENCY</Button>{/if}
</div>

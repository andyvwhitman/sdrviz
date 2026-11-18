<script lang="ts">
  /**
   * The freshness square (decision 27), neutral ink only: filled when the position is fresh, hollow when stale,
   * hollow and crossed when old. Only trains with a measured position get one.
   */
  import { OLD_S } from "../map/lib/transitView";
  import type { Row } from "./spot";

  interface Props {
    row: Pick<Row, "basis" | "train">;
  }
  let { row }: Props = $props();

  const kind = $derived.by(() => {
    const vehicle = row.train.vehicle;
    if (!vehicle || (row.basis !== "tracked" && row.basis !== "stale")) return null;
    if ((vehicle.age_s ?? 0) > OLD_S) return "old";
    return vehicle.stale ? "stale" : "fresh";
  });
</script>

{#if kind}<i class="fm is-{kind}" title="position {kind}"></i>{:else}<i class="fm is-none"></i>{/if}

<style>
  .fm { display: inline-block; box-sizing: border-box; width: 9px; height: 9px; flex: none; border: 1px solid var(--ink-2); background: var(--ink-2); }
  .fm.is-none { visibility: hidden; }
  .fm.is-stale, .fm.is-old { background: none; border-color: var(--ink); }
  .fm.is-old {
    background:
      linear-gradient(to top right, transparent calc(50% - 0.6px), var(--ink) calc(50% - 0.6px), var(--ink) calc(50% + 0.6px), transparent calc(50% + 0.6px)),
      linear-gradient(to bottom right, transparent calc(50% - 0.6px), var(--ink) calc(50% - 0.6px), var(--ink) calc(50% + 0.6px), transparent calc(50% + 0.6px));
  }
</style>

<script lang="ts">
  /** The header bar of the log: title with today's count, the jumped-to bucket chip and the CONTINUOUS switch. */
  interface Props {
    /** transmissions today, once the day's activity is known */
    countToday: number | null;
    /** a bucket the log was jumped to */
    bucket: { label: string } | null;
    continuous: boolean;
    onclearbucket: () => void;
    ontogglecontinuous: () => void;
  }
  let { countToday, bucket, continuous, onclearbucket, ontogglecontinuous }: Props = $props();
</script>

<div class="lg__head">
  <h2 class="lg__title">TRANSMISSIONS{#if countToday != null}{" · "}<span class="lg__n">{countToday}</span> TODAY{/if}</h2>
  {#if bucket}<button class="lg__chip" type="button" onclick={onclearbucket} aria-label="Return the log to newest">{bucket.label} ×</button>{/if}
  <span class="lg__grow"></span>
  <button class="lg__cont" type="button" aria-pressed={continuous} onclick={ontogglecontinuous} title="Play the next newer transmission when one ends (C)">CONTINUOUS</button>
</div>

<style>
  /* Pinned under the app header. Where the page pins its top block, this bar is inside that block, so
     nothing is measured: the page turns the sticky off here (`.fq__top` is sticky, this is static). */
  .lg__head {
    position: sticky; top: var(--header-h); z-index: 5; background: var(--bg-void);
    display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 16px; border-bottom: 1px solid var(--grid);
  }
  .lg__title { margin: 0; font: 500 var(--fs-13)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink); white-space: nowrap; }
  .lg__n { font-family: var(--font-data); }
  .lg__grow { flex: 1; }
  .lg__chip, .lg__cont {
    min-height: 32px; padding: 0 12px; font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--line-faint); white-space: nowrap;
  }
  .lg__cont { color: var(--ink-2); }
  .lg__cont[aria-pressed="true"] { color: var(--ink); box-shadow: inset 0 0 0 1px var(--line), inset 0 0 0 2px var(--bg-void), inset 0 0 0 3px var(--line-faint); }
  @media (min-width: 900px) {
    .lg__head { padding: 0 var(--margin-x); }
  }
</style>

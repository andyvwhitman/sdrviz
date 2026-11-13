<script lang="ts">
  /** M25 coverage pips: one pip per feed that hears the channel; a bad pip is hollow. */
  interface Props {
    /** one boolean per feed: healthy or not */
    feeds: boolean[];
    class?: string;
    withCount?: boolean;
  }
  let { feeds, class: className = "", withCount = true }: Props = $props();
  const healthy = $derived(feeds.filter(Boolean).length);
</script>

<span class="pips {className}">{#each feeds as ok}<i class:is-bad={!ok}></i>{/each}</span>{#if withCount}<span class="pips-n"><span class="mono">{healthy}/{feeds.length}</span> <span class="label">FEEDS</span></span>{/if}

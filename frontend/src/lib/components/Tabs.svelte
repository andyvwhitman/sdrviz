<script lang="ts">
  /** Chamfered tabs (spec 5.24): bank and route selectors. */
  interface TabItem {
    id: string;
    name: string;
    /** count badge */
    n?: number | string;
  }
  interface Props {
    items: TabItem[];
    selected: string;
    onselect?: (id: string) => void;
  }
  let { items, selected, onselect }: Props = $props();
</script>

<div class="tabs" role="tablist">
  {#each items as item (item.id)}
    <button class="tab" role="tab" aria-selected={item.id === selected} onclick={() => onselect?.(item.id)}>
      {item.name}{#if item.n != null}<span class="n">{item.n}</span>{/if}
    </button>
  {/each}
</div>

<script lang="ts">
  /** One transit feed in the list: name, state and counts. Its details and actions are in the detail pane. */
  import Chip from "$lib/components/Chip.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { sourceCounts, sourceKindText, STATE_CHIP } from "./sourceView";
  import type { TransitSource } from "$lib/types/sources";

  interface Props {
    source: TransitSource;
    selected: boolean;
    admin: boolean;
    onselect: () => void;
    onenable: (enabled: boolean) => void;
  }
  let { source, selected, admin, onselect, onenable }: Props = $props();

  const status = $derived(source.status);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<article
  class="src-card br"
  class:is-off={!source.enabled}
  class:is-selected={selected}
  tabindex="0"
  aria-label={source.name}
  onclick={onselect}
  onkeydown={(e) => e.key === "Enter" && e.target === e.currentTarget && onselect()}
>
  <span class="sel"></span>
  <header class="src-card__head">
    <span class="src-card__name">{source.name}</span>
    <span class="grow"></span>
    {#if admin}<Toggle label="ENABLED" checked={source.enabled} onchange={onenable} />{/if}
  </header>
  <div class="src-card__sub"><span class="src-card__agency">{source.agency}</span><span class="src-card__kind">{sourceKindText(source)}</span></div>

  <div class="src-card__state">
    <Chip text={status.state.toUpperCase()} kind={STATE_CHIP[status.state]} />
    {#each sourceCounts(source) as [label, value]}
      <span class="src-count"><span class="k">{label}</span> <span class="mono">{value}</span></span>
    {/each}
  </div>
  {#if status.error}<p class="src-card__error">{status.error}</p>{/if}
</article>

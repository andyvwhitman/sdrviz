<script lang="ts">
  /** Bank tabs (spec 5.24) and, on the desktop, the density chip. A click activates the bank (POST /banks/{id}/activate). */
  import { api } from "$lib/api/client";
  import { session } from "$lib/stores/session.svelte";
  import Tabs from "$lib/components/Tabs.svelte";
  import type { Bank } from "$lib/types/live";

  interface Props {
    banks: readonly Bank[];
    active: string;
    /** the tile density chip at the right of the tabs (desktop); omit on the phone */
    density?: { shown: "std" | "cmp"; auto: boolean; ontoggle: () => void };
  }
  let { banks, active, density }: Props = $props();

  const items = $derived(banks.map((b) => ({ id: b.id, name: b.name, n: b.frequency_ids.length })));
  const activate = (id: string) => {
    if (id !== active) api.banks.activate(id).catch((error) => console.warn("bank not activated", error));
  };
</script>

<div class="lo-tabs">
  <Tabs {items} selected={active} onselect={session.isAdmin ? activate : undefined} />
  {#if density}
    <button class="chip lo-density" class:is-auto={density.auto} data-chip="nominal" type="button" title="Tile density: standard or compact" onclick={density.ontoggle}>
      DENSITY {density.shown.toUpperCase()}{density.auto ? " · AUTO" : ""}
    </button>
  {/if}
</div>

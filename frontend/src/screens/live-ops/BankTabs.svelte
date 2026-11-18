<script lang="ts">
  /** Bank tabs (spec 5.24) and the tile-count readout. A click activates the bank (POST /banks/{id}/activate). */
  import { api } from "$lib/api/client";
  import { session } from "$lib/stores/session.svelte";
  import Tabs from "$lib/components/Tabs.svelte";
  import type { Bank } from "$lib/types/live";

  interface Props {
    banks: readonly Bank[];
    active: string;
    tileCount: number;
    variant: string;
  }
  let { banks, active, tileCount, variant }: Props = $props();

  const items = $derived(banks.map((b) => ({ id: b.id, name: b.name, n: b.frequency_ids.length })));
  const activate = (id: string) => {
    if (id !== active) api.banks.activate(id).catch((error) => console.warn("bank not activated", error));
  };
</script>

<div class="lo-tabs">
  <Tabs {items} selected={active} onselect={session.isAdmin ? activate : undefined} />
  <span class="t-micro"><span class="mono">{tileCount}</span> TILES · {variant.toUpperCase()}</span>
</div>

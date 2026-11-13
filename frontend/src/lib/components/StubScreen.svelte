<script lang="ts">
  /** Placeholder for a route whose screen package has not landed yet. */
  import { routeFor } from "../../routes";
  import { router } from "$lib/router.svelte";
  import EmptyState from "./EmptyState.svelte";

  const route = $derived(routeFor(router.path));
</script>

<div class="stub">
  <EmptyState title={route?.name ?? "SCREEN"} detail="Screen not built yet. Drop screens/{route?.dir ?? '…'}/Screen.svelte to replace this stub." />
</div>

<style>
  .stub {
    grid-column: 1 / -1;
    display: grid;
    place-items: center;
    height: 100%;
  }
</style>

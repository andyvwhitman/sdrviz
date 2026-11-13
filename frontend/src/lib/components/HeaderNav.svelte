<script lang="ts">
  /** The five screen tabs, anchored at grid column 3 so LIVE OPS never moves (spec 4.1). */
  import { router, followLink } from "$lib/router.svelte";
  import { carryGlobals } from "$lib/params";
  import { NAV } from "../../routes";

  const globals = $derived(carryGlobals(router.search));
</script>

<div class="hud-nav" role="tablist" aria-label="Screens">
  {#each NAV as route (route.id)}
    <a
      class="tab tab--bare"
      role="tab"
      style="border:0"
      aria-selected={router.path === route.path}
      href={route.path + (globals ? `?${globals}` : "")}
      onclick={followLink}>{route.name}</a
    >
  {/each}
</div>

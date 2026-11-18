<script lang="ts">
  /** The screen tabs. The top letter row is a hotkey for each, in order: Q, W, E... */
  import { router, followLink } from "$lib/router.svelte";
  import { carryGlobals } from "$lib/params";
  import { session } from "$lib/stores/session.svelte";
  import { navFor, NAV_KEYS } from "../../routes";

  const NAV = $derived(navFor(session.isAdmin));
  const globals = $derived(carryGlobals(router.search));
  const hrefOf = (path: string): string => path + (globals ? `?${globals}` : "");

  /** Q, W, E... open the matching tab, except while typing or when a screen already used the key. */
  function keys(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
    const route = NAV[NAV_KEYS.indexOf(event.key.toLowerCase())];
    if (!route || event.key.length !== 1) return;
    event.preventDefault();
    router.go(hrefOf(route.path));
  }
</script>

<svelte:window onkeydown={keys} />

<div class="hud-nav" role="tablist" aria-label="Screens">
  {#each NAV as route, i (route.id)}
    <a
      class="tab tab--bare"
      role="tab"
      style="border:0"
      title="{route.name} ({NAV_KEYS[i].toUpperCase()})"
      aria-keyshortcuts={NAV_KEYS[i].toUpperCase()}
      aria-selected={router.path === route.path}
      href={hrefOf(route.path)}
      onclick={followLink}>{route.name}</a
    >
  {/each}
</div>

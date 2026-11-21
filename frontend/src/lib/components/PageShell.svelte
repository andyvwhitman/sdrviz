<script lang="ts">
  /**
   * The shell of a page-layout route: an ordinary scrolling document instead of a fixed stage. The same bar and
   * footer as every other route, sticking to the top and the bottom of the window.
   */
  import type { Snippet } from "svelte";
  import type { Route } from "../../routes";
  import ShellBar from "./ShellBar.svelte";
  import ShellFooter from "./ShellFooter.svelte";

  interface Props {
    route: Route;
    children: Snippet;
  }
  let { route, children }: Props = $props();
</script>

<div class="pg">
  <ShellBar {route} sticky />
  <main class="pg__main" data-route={route.id}>
    {@render children()}
  </main>
  <ShellFooter {route} sticky />
</div>

<style>
  .pg { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg-void); }
  .pg__main { flex: 1; min-width: 0; }
  /* the map fills the window between the bar and the footer */
  .pg__main[data-route="map"] { display: flex; flex-direction: column; }
</style>

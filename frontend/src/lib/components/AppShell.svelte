<script lang="ts">
  /**
   * App shell of a stage or fluid route: the one bar, the content box and the one footer, all at 1:1 CSS pixels.
   * A stage route (`staged`) scales only the content box, inside it.
   */
  import type { Snippet } from "svelte";
  import type { Route } from "../../routes";
  import ShellBar from "./ShellBar.svelte";
  import ShellFooter from "./ShellFooter.svelte";
  import Stage from "./Stage.svelte";

  interface Props {
    route: Route;
    /** scale the content box to fit (Map, Settings) */
    staged?: boolean;
    children: Snippet;
  }
  let { route, staged = false, children }: Props = $props();
</script>

<ShellBar {route} />

<main class="hud-content" class:hud-content--staged={staged} data-route={route.id}>
  {#if staged}
    <Stage fit="box">{@render children()}</Stage>
  {:else}
    {@render children()}
  {/if}
</main>

<ShellFooter {route} />

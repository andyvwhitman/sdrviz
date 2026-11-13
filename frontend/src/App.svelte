<script lang="ts">
  import { untrack, type Component } from "svelte";
  import AppShell from "$lib/components/AppShell.svelte";
  import Stage from "$lib/components/Stage.svelte";
  import { startLive, stopLive } from "$lib/boot";
  import { buildOn } from "$lib/motion/buildOn";
  import { router } from "$lib/router.svelte";
  import { session } from "$lib/stores/session.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { DEFAULT_PATH, loadScreen, routeFor } from "./routes";

  const route = $derived(routeFor(router.path));

  // Unknown paths and "/" go to Live Ops (query kept).
  $effect(() => {
    if (!route) router.go(DEFAULT_PATH, { replace: true, keepGlobals: false });
  });

  // The guard: no session means /login; a session on /login means in.
  $effect(() => {
    if (session.authenticated === false && route && route.id !== "login") router.go("/login", { replace: true });
    if (session.authenticated && route?.id === "login") router.go(DEFAULT_PATH, { replace: true });
  });

  // Live data runs exactly while a session exists.
  $effect(() => {
    if (!session.authenticated) return;
    untrack(() => startLive());
    return stopLive;
  });

  // /login never receives a snapshot, so it is ready as soon as the session is known.
  $effect(() => {
    if (session.authenticated === false) document.documentElement.dataset.ready = "1";
  });

  let Screen = $state.raw<Component | null>(null);
  $effect(() => {
    const wanted = route;
    shell.reset();
    Screen = null;
    if (!wanted) return;
    document.title = `SDRVIZ · ${wanted.name}`;
    loadScreen(wanted).then((component) => {
      if (route === wanted) {
        Screen = component;
        buildOn();
      }
    });
  });
</script>

{#if route && session.authenticated !== null}
  <Stage>
    {#if route.shell}
      <AppShell {route}>
        {#if Screen}<Screen />{/if}
      </AppShell>
    {:else if Screen}
      <Screen />
    {/if}
  </Stage>
{/if}

<script lang="ts">
  import { untrack, type Component } from "svelte";
  import Button from "$lib/components/Button.svelte";
  import AppShell from "$lib/components/AppShell.svelte";
  import PageShell from "$lib/components/PageShell.svelte";
  import Stage from "$lib/components/Stage.svelte";
  import { startLive, stopLive } from "$lib/boot";
  import { buildOn } from "$lib/motion/buildOn";
  import { router } from "$lib/router.svelte";
  import { session } from "$lib/stores/session.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { viewport } from "$lib/stores/viewport.svelte";
  import WiderScreen from "$lib/components/WiderScreen.svelte";
  import { homePath, isPhoneFor, layoutFor, loadScreen, routeFor } from "./routes";

  const route = $derived(routeFor(router.path));
  const layout = $derived(route ? layoutFor(route, isPhoneFor(route, viewport)) : "stage");

  // Unknown paths and "/" go to Live Ops (query kept).
  $effect(() => {
    if (!route) router.go(homePath(viewport.phone), { replace: true, keepGlobals: false });
  });

  // The guard: no session means /login; a session on /login means in.
  $effect(() => {
    if (session.authenticated === false && route && route.id !== "login") router.go("/login", { replace: true });
    if (session.authenticated && route?.adminOnly && !session.isAdmin) router.go(homePath(viewport.phone), { replace: true });
    if (session.authenticated && route?.id === "login") router.go(homePath(viewport.phone), { replace: true });
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

  // a page-layout route scrolls like a document; the stage routes stay fixed to the window
  $effect(() => {
    document.documentElement.dataset.layout = layout === "stage" || layout === "fluid" ? "stage" : "page";
  });

  let Screen = $state.raw<Component | null>(null);
  /** the screen's chunk would not load: usually a tab left open across a deploy */
  let screenFailed = $state(false);
  $effect(() => {
    const wanted = route;
    shell.reset();
    Screen = null;
    screenFailed = false;
    if (!wanted) return;
    document.title = `SDRVIZ · ${wanted.name}`;
    if (layoutFor(wanted, isPhoneFor(wanted, viewport)) === "plate") {
      document.documentElement.dataset.ready = "1";
      return;
    }
    loadScreen(wanted).then(
      (component) => {
        if (route === wanted) {
          Screen = component;
          buildOn();
        }
      },
      (error: unknown) => {
        console.warn("screen failed to load", error);
        if (route === wanted) screenFailed = true;
      },
    );
  });
</script>

{#if session.unreachable}
  <main class="notice" role="alert">
    <h1>BACKEND UNREACHABLE</h1>
    <p>RETRYING</p>
  </main>
{:else if screenFailed}
  <main class="notice" role="alert">
    <h1>NEW VERSION</h1>
    <p>THIS SCREEN COULD NOT LOAD. RELOAD TO GET THE LATEST.</p>
    <Button primary onclick={() => location.reload()}>RELOAD</Button>
  </main>
{:else if route && session.authenticated !== null}
  {#if layout === "plate"}
    <PageShell {route}><WiderScreen {route} /></PageShell>
  {:else if layout === "page" && !route.shell}
    {#if Screen}<Screen />{/if}
  {:else if layout === "page"}
    <PageShell {route}>
      {#if Screen}<Screen />{/if}
    </PageShell>
  {:else if layout === "fluid"}
    <!-- the shell at 1:1 CSS pixels: the window is the stage -->
    <div class="hud-stage hud-stage--fluid">
      <AppShell {route}>
        {#if Screen}<Screen />{/if}
      </AppShell>
    </div>
  {:else}
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
{/if}

<style>
  .notice { min-height: 100dvh; display: grid; place-content: center; justify-items: start; gap: 12px; padding: 24px 16px; background: var(--bg-void); }
  .notice h1 { margin: 0; font: var(--type-title-lg); letter-spacing: var(--track-title); color: var(--ink); }
  .notice p { margin: 0; font: 500 var(--fs-13)/1.3 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
</style>

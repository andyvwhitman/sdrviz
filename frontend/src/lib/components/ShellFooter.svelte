<script lang="ts">
  /**
   * The one footer (Sprint 6, B.4): key-up strip, status message, short title block, audio toggle. 32 px at 1:1 CSS
   * pixels on every route; under 900 px it is 44 px and pinned to the bottom, and while anything is keyed the strip
   * takes the room of the status message.
   */
  import * as fmt from "$lib/hud/fmt";
  import { statusFrom, type StatusSpec } from "$lib/hud/chips";
  import { params } from "$lib/params";
  import { link } from "$lib/stores/link.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { session } from "$lib/stores/session.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { viewport } from "$lib/stores/viewport.svelte";
  import { FIRST_DATA_WAIT_S, retryInfo } from "$lib/ws/link";
  import type { Route } from "../../routes";
  import AudioToggle from "./AudioToggle.svelte";
  import KeyupStrip from "./KeyupStrip.svelte";
  import StatusLine from "./StatusLine.svelte";
  import TitleBlock from "./TitleBlock.svelte";

  /** under this window width the title block keeps only the build and the map credit */
  const COMPACT_TITLE_PX = 1440;

  interface Props {
    route: Route;
    /** a page-layout route scrolls: the footer sticks to the bottom of the window */
    sticky?: boolean;
  }
  let { route, sticky = false }: Props = $props();

  const snapshot = $derived(live.state);
  const linkDown = $derived(link.shownStatus === "reconnecting" || link.shownStatus === "no-link");
  const blank = $derived(params.force === "loading" || params.force === "connecting");
  const zone = $derived(snapshot?.tz.name ?? "EST");
  const scope = $derived(blank && route.id === "live-ops" ? (["NODE", fmt.BLANK] as [string, string]) : shell.scope);
  let keyed = $state(false);

  /** Link trouble outranks everything the scenario says (brief 8.4-8.7). */
  const status = $derived.by((): StatusSpec => {
    const nothing = { segments: [], fault: false, acked: 0 };
    if (params.force === "loading") return { ...nothing, text: `WAITING FOR FIRST DATA · ${FIRST_DATA_WAIT_S}S` };
    if (link.shownStatus === "connecting") return { ...nothing, text: "CONNECTING · BACKEND" };
    if (linkDown) {
      const age = link.shownDropAgeS ?? 0;
      const retry = retryInfo(age);
      const since = snapshot ? fmt.clock(snapshot.clock, zone).slice(0, 8) : fmt.BLANK;
      const retryText = `RETRY ${retry.attempt} IN ${retry.inS}S`;
      return link.shownStatus === "no-link"
        ? { ...nothing, fault: true, text: `NO LINK · BACKEND UNREACHABLE · SINCE ${since} · ${retryText}` }
        : { ...nothing, text: `BACKEND LINK LOST · SINCE ${since} · RECONNECTING · ${retryText}` };
    }
    return snapshot ? statusFrom(snapshot, shell.statusFallback, { newestOnly: shell.newestStatusOnly }) : nothing;
  });
</script>

<footer class="hud-status" class:hud-status--sticky={sticky} class:has-strip={keyed}>
  <KeyupStrip bind:active={keyed} />
  <StatusLine {status} />
  <TitleBlock screen={route.name} {scope} sim={snapshot?.sim ?? session.sim} osm={route.id === "map"} compact={viewport.width <= COMPACT_TITLE_PX} />
  <AudioToggle />
</footer>

<style>
  footer :global(.atg) { margin: 0 6px 0 0; }
  @media (max-width: 899px) {
    footer :global(.atg) { width: 44px; height: 44px; margin: 0; }
    footer :global(.title-block) { display: none; }
    footer.has-strip :global(.hud-status__msg), footer.has-strip :global(.hud-status__ack) { display: none; }
  }
</style>

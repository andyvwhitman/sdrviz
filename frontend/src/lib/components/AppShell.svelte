<script lang="ts">
  /**
   * App shell (spec 5.1): header (mark, screen name, nav, chips, audio, clock, motion), content box
   * and status line with the title block. One chip set and one status rule on every screen.
   */
  import type { Snippet } from "svelte";
  import * as fmt from "$lib/hud/fmt";
  import { headerChips, statusFrom, type ChipSpec, type StatusSpec } from "$lib/hud/chips";
  import { params } from "$lib/params";
  import { parseUtcOffset } from "$lib/time";
  import { live } from "$lib/stores/live.svelte";
  import { link } from "$lib/stores/link.svelte";
  import { session } from "$lib/stores/session.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { FIRST_DATA_WAIT_S, retryInfo } from "$lib/ws/link";
  import type { Route } from "../../routes";
  import HeaderChips from "./HeaderChips.svelte";
  import HeaderNav from "./HeaderNav.svelte";
  import StatusLine from "./StatusLine.svelte";
  import TitleBlock from "./TitleBlock.svelte";

  interface Props {
    route: Route;
    children: Snippet;
  }
  let { route, children }: Props = $props();

  const state = $derived(live.state);
  const linkDown = $derived(link.shownStatus === "reconnecting" || link.shownStatus === "no-link");
  /** `?force=loading|connecting`: the shell shows dashes, as before the first data (spec 8.4) */
  const blank = $derived(params.force === "loading" || params.force === "connecting");

  // Keyed chip everywhere except Live Ops, where the tiles say it (spec 5.20)
  const chips = $derived.by((): ChipSpec[] => {
    if (blank) return [{ text: `FEEDS ${fmt.BLANK}`, kind: "nominal" }, { text: `ASR ${fmt.BLANK}`, kind: "nominal" }];
    return state ? headerChips(state, { txChip: route.id !== "live-ops" }) : [];
  });

  const zone = $derived(state?.tz.name ?? "EST");
  const utcShift = $derived(state ? -parseUtcOffset(state.tz.utc_offset) : 5 * 3600);
  const scope = $derived(blank && route.id === "live-ops" ? (["BANK", fmt.BLANK] as [string, string]) : shell.scope);
  const clock = $derived(state ? fmt.clock(state.clock, ui.utc ? "UTC" : zone, utcShift) : fmt.BLANK);

  /** Link trouble outranks everything the scenario says (brief 8.4-8.7). */
  const status = $derived.by((): StatusSpec => {
    const nothing = { segments: [], fault: false, acked: 0 };
    if (params.force === "loading") return { ...nothing, text: `WAITING FOR FIRST DATA · ${FIRST_DATA_WAIT_S}S` };
    if (link.shownStatus === "connecting") return { ...nothing, text: "CONNECTING · BACKEND" };
    if (linkDown) {
      const age = link.shownDropAgeS ?? 0;
      const retry = retryInfo(age);
      const since = state ? fmt.clock(state.clock, zone).slice(0, 8) : fmt.BLANK;
      const retryText = `RETRY ${retry.attempt} IN ${retry.inS}S`;
      return link.shownStatus === "no-link"
        ? { ...nothing, fault: true, text: `NO LINK · BACKEND UNREACHABLE · SINCE ${since} · ${retryText}` }
        : { ...nothing, text: `BACKEND LINK LOST · SINCE ${since} · RECONNECTING · ${retryText}` };
    }
    return state ? statusFrom(state, shell.statusFallback, { newestOnly: shell.newestStatusOnly }) : nothing;
  });
</script>

<header class="hud-header">
  <div class="hud-header__left">
    <span class="hud-mark">SDRVIZ</span>
    <span class="hud-screen-name">{route.name}</span>
  </div>
  <HeaderNav />
  <div class="hud-header__right">
    <HeaderChips {chips} {clock} reconnecting={linkDown} />
  </div>
</header>

<main class="hud-content" data-route={route.id}>
  {@render children()}
</main>

<footer class="hud-status">
  <StatusLine {status}>
    <TitleBlock screen={route.name} {scope} {clock} sim={state?.sim ?? session.sim} osm={route.id === "map"} />
  </StatusLine>
</footer>

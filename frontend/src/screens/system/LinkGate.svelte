<script lang="ts">
  /**
   * Wraps the Live Ops route and decides what it shows (spec 8.4 to 8.6): the blank wall while loading
   * or connecting (this package's own blank layout), the voided wall with RECONNECTING, the dimmed wall under the
   * NO LINK alarm, else the live wall. `?force=loading|connecting|reconnecting|no-link` shows a state for design
   * review. Live Ops draws every state itself; this decides which one.
   */
  import { params } from "$lib/params";
  import { link } from "$lib/stores/link.svelte";
  import { LiveOps } from "../live-ops";
  import { gateState } from "./gate";

  const gate = $derived(gateState({ forced: params.force, link: link.status }));
  const dropAge = $derived(Math.round(link.shownDropAgeS ?? 0));
</script>

{#if gate === "live"}
  <LiveOps />
{:else}
  <LiveOps link={{ state: gate, dropAge }} />
{/if}

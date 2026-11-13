<script lang="ts">
  /**
   * Wraps the Live Ops route and decides what it shows (spec 8.4 to 8.7): the blank wall while loading
   * or connecting (this package's own blank layout), the voided wall with RECONNECTING, the dimmed wall under the NO LINK alarm, the
   * empty-bank panel, else the live wall. `?force=loading|connecting|reconnecting|no-link|empty-bank`
   * shows a state for design review. Live Ops draws every state itself; this decides which one.
   */
  import { params } from "$lib/params";
  import { link } from "$lib/stores/link.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { LiveOps } from "../live-ops";
  import ConnectingOverlay from "./ConnectingOverlay.svelte";
  import { gateState } from "./gate";

  const snapshot = $derived(live.state);
  const activeBank = $derived(snapshot?.banks.find((b) => b.id === snapshot.active_bank));
  const gate = $derived(gateState({ forced: params.force, link: link.status, bankEmpty: activeBank ? activeBank.frequency_ids.length === 0 : null }));
  /** the empty bank the wall shows: the active one when it is empty, else a new bank (forced for design review) */
  const emptyBank = $derived(
    activeBank && activeBank.frequency_ids.length === 0
      ? activeBank
      : { id: "bank-new", name: "New Bank", home_feed: snapshot?.displayed_feed ?? "", frequency_ids: [], sim: true },
  );
  const dropAge = $derived(Math.round(link.shownDropAgeS ?? 0));
</script>

{#if gate === "loading" || gate === "connecting"}
  <ConnectingOverlay />
{:else if gate === "live"}
  <LiveOps />
{:else}
  <LiveOps link={{ state: gate, dropAge, bank: gate === "empty-bank" ? emptyBank : undefined }} />
{/if}

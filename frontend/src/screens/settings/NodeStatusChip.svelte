<script lang="ts">
  /** A node's state as a chip: ONLINE bright, OFFLINE and REVOKED dim, PENDING neutral with a clock. Never ember or red. */
  import Chip from "$lib/components/Chip.svelte";
  import { NODE_CHIP } from "$lib/hud/nodes";
  import type { NodeStatus } from "$lib/types/nodes";

  interface Props {
    status: NodeStatus;
  }
  let { status }: Props = $props();
</script>

<Chip kind={NODE_CHIP[status]}>
  {#if status === "PENDING"}
    <svg class="nd-clock" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="4.2" fill="none" stroke="currentColor" stroke-width="1" />
      <path d="M5 2.4V5l1.8 1.2" fill="none" stroke="currentColor" stroke-width="1" />
    </svg>
  {/if}{status}
</Chip>

<style>
  .nd-clock { margin-right: 5px; vertical-align: -1px; }
</style>

<script lang="ts">
  /** Status line (spec 5.1): per-item tones joined by the separator dot, acked-fault count, title block. */
  import type { Snippet } from "svelte";
  import type { StatusSpec } from "$lib/hud/chips";

  interface Props {
    status: StatusSpec;
    /** the message when nothing is open; falls back to NO OPEN EVENTS */
    children?: Snippet;
  }
  let { status, children }: Props = $props();
</script>

<span class="hud-status__msg" class:is-fault={status.fault}>
  {#if status.segments.length}
    {#each status.segments as segment, i}
      {#if i}<span class="sep"></span>{/if}<span class={segment.tone}>{segment.text}</span>
    {/each}
  {:else if status.text}
    {status.text}
  {:else}
    <span class="c-ink-3">NO OPEN EVENTS</span>
  {/if}
</span>
{#if status.acked}
  <span class="hud-status__ack">{status.acked} ACK'D FAULT{status.acked > 1 ? "S" : ""}</span>
{/if}
{@render children?.()}

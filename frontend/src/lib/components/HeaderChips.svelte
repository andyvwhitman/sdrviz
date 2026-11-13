<script lang="ts">
  /** System chips, audio chip, clock and motion chip: the right side of the header. */
  import { audio } from "$lib/stores/audio.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import type { ChipSpec } from "$lib/hud/chips";
  import Chip from "./Chip.svelte";

  interface Props {
    chips: ChipSpec[];
    clock: string;
    /** the link is down: add the RECONNECTING chip */
    reconnecting?: boolean;
  }
  let { chips, clock, reconnecting = false }: Props = $props();
</script>

{#each chips as chip}
  <Chip text={chip.text} kind={chip.kind} glyph={chip.glyph} onset={chip.onset} />
{/each}
{#if reconnecting}<Chip text="RECONNECTING" kind="offline" />{/if}
{#if audio.soloCount}<Chip text="SOLO {audio.soloCount}" kind="active" />{/if}
{#if audio.enabled}
  <Chip button text="AUDIO ON" kind="active" onclick={() => audio.toggle()} />
{:else}
  <Chip button text="AUDIO · ENABLE" kind="armed" onclick={() => audio.enable()} />
{/if}
<button class="hud-clock" title="Toggle UTC" onclick={() => ui.toggleUtc()}>{clock}</button>
<Chip button class="hud-motion" text="MOTION {ui.motion === 'reduced' ? 'REDUCED' : 'FULL'}" onclick={() => ui.toggleMotion()} />

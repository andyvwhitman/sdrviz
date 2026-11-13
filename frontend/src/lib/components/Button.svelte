<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    primary?: boolean;
    sm?: boolean;
    disabled?: boolean;
    type?: "button" | "submit";
    onclick?: (event: MouseEvent) => void;
    children: Snippet;
  }
  let { primary = false, sm = false, disabled = false, type = "button", onclick, children }: Props = $props();
</script>

<button class="btn" class:btn--primary={primary} class:btn--sm={sm} {disabled} {type} {onclick}>{@render children()}</button>

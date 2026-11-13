<script lang="ts">
  /** Empty state panel (spec 5.28): neutral, never red. */
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    detail?: string;
    children?: Snippet;
  }
  let { title, detail, children }: Props = $props();
</script>

<div class="empty br">
  <div class="t-panel">{title}</div>
  {#if detail}<div class="t-body">{detail}</div>{/if}
  {@render children?.()}
</div>

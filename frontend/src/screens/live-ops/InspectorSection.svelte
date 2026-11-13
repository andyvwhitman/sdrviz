<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    children: Snippet;
  }
  let { title, children }: Props = $props();
</script>

<section class="inspector__sec">
  <h4>{title}</h4>
  {@render children()}
</section>

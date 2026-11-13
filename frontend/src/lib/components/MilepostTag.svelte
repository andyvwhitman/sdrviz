<script lang="ts">
  /** M9 milepost tag, HTML form: "NEC 113.6" | "BAA33.7" | "4.2" (derived, shows the approx sign). */
  import * as fmt from "$lib/hud/fmt";

  interface Props {
    mp: string;
    /** one line of text instead of the stacked tag */
    inline?: boolean;
  }
  let { mp, inline = false }: Props = $props();

  const parts = $derived(fmt.mpParts(mp));
  const [whole, decimal] = $derived((parts?.num ?? "0.0").split("."));
</script>

{#if inline}
  <span class="mp-inline" class:is-derived={parts?.derived}>{fmt.mp(mp)}</span>
{:else if parts}
  <span class="mp-tag" class:is-derived={parts.derived} aria-label="milepost {fmt.mp(mp)}">
    <span class="p">{parts.derived ? "≈" : ""}{parts.prefix}</span><span class="i">{whole}</span><span class="d">.{decimal}</span>
  </span>
{/if}

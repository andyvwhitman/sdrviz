<script lang="ts">
  /** M8 data block, HTML form: line 1 "MARC 410", line 2 "NEC 113.6 · CH54". `lg` is the inspector size. */
  import SimTag from "./SimTag.svelte";

  interface Props {
    l1: string;
    l2: string;
    tx?: boolean;
    lg?: boolean;
    sim?: boolean;
  }
  let { l1, l2, tx = false, lg = false, sim = false }: Props = $props();
</script>

<span class="datablock" class:is-tx={tx} class:is-lg={lg}><span class="l1">{l1}{#if sim}{" "}<SimTag />{/if}</span><br /><span class="l2">{l2}</span></span>

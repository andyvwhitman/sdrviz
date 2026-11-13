<svelte:options namespace="svg" />
<script lang="ts">
  /** Selection bracket: four corner ticks round a point (`o` px out, `a` px long). */
  interface Props {
    x: number;
    y: number;
    o?: number;
    a?: number;
  }
  let { x, y, o = 12, a = 14 }: Props = $props();
  const d = $derived(
    `M${x - o} ${y - o + a / 2}v${-a / 2}h${a / 2}M${x + o - a / 2} ${y - o}h${a / 2}v${a / 2}` +
      `M${x + o} ${y + o - a / 2}v${a / 2}h${-a / 2}M${x - o + a / 2} ${y + o}h${-a / 2}v${-a / 2}`,
  );
</script>

<path class="s-emph k-select" {d} />

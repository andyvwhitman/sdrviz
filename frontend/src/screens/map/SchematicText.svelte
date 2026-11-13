<svelte:options namespace="svg" />
<script lang="ts">
  /** One static schematic label: SVG text, optionally rotated about its anchor point. */
  import type { SchText } from "./lib/schematicLayout";

  interface Props {
    label: SchText;
  }
  let { label }: Props = $props();
  const CLASS = { term: "mp-term", mp: "mp-mp", linelab: "mp-linelab", stn: "mp-stn", lab: "tx-lab" } as const;
  const f1 = (v: number): string => (Math.round(v * 10) / 10).toString();
</script>

{#if label.rotate !== undefined}
  <text class={CLASS[label.cls]} text-anchor={label.anchor} dy={label.dy} transform="translate({f1(label.x)} {f1(label.y)}) rotate({f1(label.rotate)})">{label.text}</text>
{:else}
  <text class={CLASS[label.cls]} text-anchor={label.anchor} x={f1(label.x)} y={f1(label.y)}>{label.text}</text>
{/if}

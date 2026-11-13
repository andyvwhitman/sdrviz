<svelte:options namespace="svg" />
<script lang="ts">
  /**
   * Schematic coverage strip: which spine points each feed reaches. The glyph and tone come from the same
   * feedLook as the geo feed sites, so one key-up reads the same in both modes. On each receiving feed's row the
   * tick nearest the talking train turns state-tx.
   */
  import PositionGlyphSvg from "$lib/components/PositionGlyphSvg.svelte";
  import type { GlyphState } from "$lib/hud/tile";
  import type { FeedLook } from "./lib/inputs";
  import type { SchematicLayout } from "./lib/schematicLayout";
  import SchematicText from "./SchematicText.svelte";

  interface Props {
    strip: SchematicLayout["strip"];
    looks: Record<string, FeedLook>;
    /** feed row -> schematic x of the talking train it is hearing, one per transmission */
    heard: Record<string, number[]>;
    /** the count (or fault label) at the right edge, by feed id */
    labels: Record<string, string>;
    /** x of the right edge */
    right: number;
    opacity: number;
  }
  let { strip, looks, heard, labels, right, opacity }: Props = $props();
  const f1 = (v: number): string => (Math.round(v * 10) / 10).toString();
  const nearest = (ticks: number[], x: number): number => ticks.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
</script>

<g style:opacity={opacity} style:display={opacity === 0 ? "none" : ""}>
  {#each strip.head as label (label.text)}<SchematicText {label} />{/each}
  {#each strip.rows as row (row.feed.id)}
    {@const look = looks[row.feed.id]}
    {@const tone = look.fault ? "k-faint" : look.stale ? "k-stale d-stale" : "k-line"}
    <text class="mp-feedlab" class:mp-fault={look.fault} class:mp-stale={look.stale} x={f1(strip.head[0].x)} y={row.y} text-anchor="end">{row.feed.short}</text>
    {#each row.ticks as x (x)}<path class="s-hair {tone}" d="M{f1(x)} {row.y - 8}V{row.y}" />{/each}
    {#each row.runs as [x0, x1] (x0)}<path class="s-hair {tone}" d="M{f1(x0)} {row.y - 4}H{f1(x1)}" />{/each}
    <text class="mp-coord" class:mp-l2-fault={look.fault} class:mp-l2-stale={look.stale} x={right} y={row.y} text-anchor="end">{labels[row.feed.id]}</text>
    <g class:mp-dim={look.glyph === "idle-dim"}>
      <PositionGlyphSvg cx={row.gx} cy={row.gy} state={(look.glyph === "idle-dim" ? "idle" : look.glyph) as GlyphState} />
    </g>
    {#each heard[row.feed.id] ?? [] as x, i (i)}
      {#if row.ticks.length}<path class="s-emph k-tx" d="M{f1(nearest(row.ticks, x))} {row.y - 10}V{row.y + 2}" />{/if}
    {/each}
  {/each}
</g>

<svelte:options namespace="svg" />
<script lang="ts">
  /**
   * Route lines from the transit API (GET /transit/lines), one group per kind so each can be styled, hidden or
   * replaced by a more detailed source on its own: intercity (Amtrak) as a clear HUD line, commuter rail fainter.
   * Lines are projected onto the base once; a pan or zoom only moves the points by the view.
   */
  import type { Line } from "$lib/types/transit";
  import type { Pt } from "./lib/geom";
  import type { BaseProjection, View } from "./lib/project";

  interface Props {
    lines: Line[];
    base: BaseProjection;
    view: View;
  }
  let { lines, base, view }: Props = $props();

  const onBase = $derived(lines.map((line) => ({ line, segs: line.coords.map((seg) => seg.map((p): Pt => base.project(p))) })));

  const path = (segs: Pt[][], v: View): string =>
    segs.map((seg) => `M${seg.map(([x, y]) => `${(x * v.k + v.tx).toFixed(1)} ${(y * v.k + v.ty).toFixed(1)}`).join("L")}`).join("");

  const commuter = $derived(onBase.filter((l) => l.line.kind === "commuter"));
  const intercity = $derived(onBase.filter((l) => l.line.kind === "intercity"));
</script>

<g class="mp-tx-lines">
  <g class="mp-tx-commuter">
    {#each commuter as l (l.line.id)}<path class="s-hair k-faint" data-source={l.line.source} d={path(l.segs, view)}><title>{l.line.agency} · {l.line.name}</title></path>{/each}
  </g>
  <g class="mp-tx-intercity">
    {#each intercity as l (l.line.id)}<path class="s-hair k-line" data-source={l.line.source} d={path(l.segs, view)}><title>{l.line.agency} · {l.line.name}</title></path>{/each}
  </g>
</g>

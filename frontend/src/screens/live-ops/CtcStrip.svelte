<script lang="ts">
  /**
   * CTC track strip (M18, spec 5.30): five 24 px rows of route, stations, detectors and the tracked
   * trains. Occupied blocks are `line`, a talking train is `state-tx` and never red; one `line-faint`
   * tie per junction. The label pass (`ctc/labelPass.ts`) decides which names fit, measured from the
   * rendered text so it holds at both sizes and after the fonts load.
   */
  import { tick } from "svelte";
  import { BLANK } from "$lib/hud/fmt";
  import { blocksFor, labelCandidates, layoutCtc, ROW_PX, TRACK_Y, BASELINE_Y, talkingDetectors, type CtcLive, type RoutesDoc } from "./ctc/layout";
  import { KNOCKOUT_PX, labelPass, type LabelFont } from "./ctc/labelPass";

  interface Props {
    routes: RoutesDoc | null;
    live: Record<string, CtcLive | undefined>;
    width: number;
    height: number;
    /** x of the first node, right of the route-name column */
    x0: number;
  }
  let { routes, live, width, height, x0 }: Props = $props();

  const layout = $derived(routes ? layoutCtc(routes, width, x0) : null);
  const blocks = $derived(layout ? blocksFor(layout, live) : []);
  const talking = $derived(talkingDetectors(live));
  const candidates = $derived(layout ? labelCandidates(layout, blocks) : []);

  /* measuring: one hidden <text> per font class; widths are cached until the fonts change */
  const FONT_CLASS: Record<LabelFont, string> = { route: "lo-rt", station: "lo-st", train: "lo-tr", equation: "lo-eq" };
  let probe = $state<SVGTextElement>();
  let fontsLoaded = $state(0);
  const widths = new Map<string, number>();
  let probeBox = { y: 0, height: 0 };

  $effect(() => {
    document.fonts?.ready.then(() => {
      widths.clear();
      fontsLoaded += 1;
    });
  });

  function measure(text: string, font: LabelFont): number {
    const key = `${font}|${text}`;
    const cached = widths.get(key);
    if (cached != null) return cached;
    if (!probe) return text.length * 7;
    probe.setAttribute("class", FONT_CLASS[font]);
    probe.textContent = text;
    const box = probe.getBBox();
    probeBox = { y: box.y, height: box.height };
    widths.set(key, box.width);
    return box.width;
  }

  let ready = $state(false);
  $effect(() => {
    if (probe) tick().then(() => (ready = true));
  });

  const pass = $derived.by(() => {
    void fontsLoaded;
    if (!ready || !layout) return { placed: [], audit: [] };
    return labelPass(candidates, { width, tieXs: layout.ties.map((t) => t.x), measure });
  });

  /** vertical extent of the knockout: the glyph band of 11 px text on its baseline */
  const knockout = $derived.by(() => {
    void pass;
    const top = probeBox.y - BASELINE_Y + 2;
    return { dy: top - KNOCKOUT_PX, height: probeBox.height - 2 + 2 * KNOCKOUT_PX };
  });

  const talkDotsY = [-4, 0, 4];
  const snap = (v: number) => Math.round(v) + 0.5;
  const trackOf = (row: number) => row * ROW_PX + TRACK_Y;
</script>

<div class="lo-plot lo-ctc">
  <svg class="hud" {width} {height} aria-label="CTC track strip">
    <text bind:this={probe} class="lo-st" x="0" y={BASELINE_Y} visibility="hidden"></text>
    {#if !layout}
      {#each [0, 1, 2, 3, 4] as row}
        <text class="lo-rt" x="0" y={row * ROW_PX + 11}>{BLANK}</text>
      {/each}
    {:else}
      {#each layout.ties as tie}
        <path class="s-hair k-faint" d="M{tie.x} {trackOf(tie.from)}V{trackOf(tie.to)}" />
      {/each}

      {#each layout.rows as row (row.id)}
        {@const ty = trackOf(row.index)}
        <path class="s-hair k-faint" d="M{Math.round(row.nodes[0].x)} {ty}H{Math.round(row.nodes[row.nodes.length - 1].x)}" />
        {#each blocks.filter((b) => b.row === row.index) as block}
          {#if block.talking}<path class="s-active k-tx glow-1" d="M{block.x0} {ty}H{block.x1}" />{/if}
          <path class="s-active {block.talking ? 'k-tx' : 'k-line'}" d="M{block.x0} {ty}H{block.x1}" />
        {/each}
        {#each row.nodes as node}
          {@const x = snap(node.x)}
          {#if node.kind === "detector"}
            <path class="s-hair {talking.has(node.place_id) ? 'k-tx' : 'k-line'}" d="M{x} {ty - 3.5}L{x + 3.5} {ty}L{x} {ty + 3.5}L{x - 3.5} {ty}Z" />
          {:else if node.kind === "signal" || node.kind === "tunnel" || node.kind === "bridge"}
            <path class="s-hair k-faint" d="M{x} {ty - 3}V{ty + 3}" />
          {:else}
            <rect class="s-hair k-line" x={Math.round(node.x) - 3.5} y={ty - 3.5} width="7" height="7" />
          {/if}
        {/each}
      {/each}

      <g class="lo-ko">
        {#each pass.placed as label}
          {@const row = label.candidate.row}
          {@const left = Math.min(label.extent[0] + KNOCKOUT_PX, label.textBox.left)}
          <rect class="f-void" x={(left - KNOCKOUT_PX).toFixed(1)} y={(row * ROW_PX + BASELINE_Y + knockout.dy).toFixed(1)} width={(label.extent[1] - left + KNOCKOUT_PX).toFixed(1)} height={knockout.height.toFixed(1)} />
        {/each}
      </g>
      <g class="lo-labs">
        {#each pass.placed as label}
          {@const c = label.candidate}
          {@const y = c.row * ROW_PX + BASELINE_Y}
          {#if c.font === "route"}
            <text class="lo-rt" x={label.x} y={c.row * ROW_PX + 11} text-anchor={label.anchor}>{label.text}</text>
          {:else if c.font === "train"}
            <text class="lo-tr" class:is-tx={c.talking} x={label.x} y={y} text-anchor={label.anchor}>{label.text}</text>
            {#if label.dotX != null}
              {#each talkDotsY as dy}<circle class="f-tx" cx={label.dotX} cy={y - 4 + dy} r="1.75" />{/each}
            {/if}
          {:else}
            <text class={FONT_CLASS[c.font]} x={label.x} y={y} text-anchor={label.anchor}>{label.text}</text>
          {/if}
        {/each}
      </g>
    {/if}
  </svg>
</div>

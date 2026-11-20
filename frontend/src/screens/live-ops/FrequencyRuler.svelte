<script lang="ts">
  /**
   * The ruler (E-2, docs/sprint-4/axis-labels.md): ticks rising from the axis line, and the channel labels on 45 degree
   * tails. Geometry is all `rulerLayout`; this draws it, and states change colour and stroke only (section 7): keyed is
   * the orange tail, number and square, selected the 1.5 px white tail, underline and taller member tick, stale the
   * dimmed tones. Nothing here is positioned from state, so the radio talking never moves a label.
   */
  import { rulerLayout, type AxisClass, type RulerItem, type TextLabel } from "./freqRuler";

  interface Props {
    /** plot width; the SVG runs on into the right margin for the labels that overrun it */
    width: number;
    cls: AxisClass;
    hears: readonly number[];
    labelled: readonly number[];
    extras: readonly number[];
    keyed?: readonly number[];
    selected?: number | null;
    /** the displayed feed is stale or offline */
    stale?: boolean;
  }
  let { width, cls, hears, labelled, extras, keyed = [], selected = null, stale = false }: Props = $props();

  const layout = $derived(rulerLayout({ width, cls, labelled, extras, hears }));
  const m = $derived(layout.m);
  const H = $derived(layout.height);
  const hot = $derived(new Set(stale ? [] : keyed));
  const R2 = Math.SQRT1_2;

  const tickPath = (list: { x: number; length: number }[]): string => list.map((t) => `M${t.x} ${H}V${H - t.length}`).join("");
  const faint = $derived(tickPath(layout.ticks.filter((t) => t.tone === "faint")));
  const strong = $derived(tickPath(layout.ticks.filter((t) => t.tone === "line")));

  /** the stroke colour of a part: keyed orange, else selected white, else idle; stale keeps only the selection */
  function tone(isKeyed: boolean, isSelected: boolean): string {
    if (stale) return isSelected ? "var(--state-select)" : "var(--line-faint)";
    if (isKeyed) return "var(--state-tx)";
    return isSelected ? "var(--state-select)" : "var(--line)";
  }
  const line = (a: { x: number; y: number }, len: number): string => `M${a.x} ${a.y}l${len * R2} ${-len * R2}`;
  const tickAt = (x: number, length: number): string => `M${x} ${H}V${H - length}`;

  /** the ticks of every printed channel, with the keyed and selected marks over them */
  interface Mark {
    x: number;
    length: number;
    keyed: boolean;
    selected: boolean;
    /** a selected bracket member other than the first stands 2 px taller */
    taller: boolean;
  }
  const marks = $derived.by((): Mark[] => {
    const out: Mark[] = [];
    const tickOf = (ch: number) => layout.ticks.find((t) => t.ch === ch)!;
    const add = (ch: number, taller: boolean) => {
      const t = tickOf(ch);
      const isKeyed = hot.has(ch);
      const isSelected = selected === ch;
      if (isKeyed || isSelected) out.push({ x: t.x, length: t.length, keyed: isKeyed, selected: isSelected, taller: isSelected && taller });
    };
    for (const it of [...layout.items, ...layout.extraSingles]) it.members.forEach((ch, i) => add(ch, it.kind === "bracket" && i > 0));
    for (const ch of [...layout.bare, ...layout.bareExtras]) add(ch, true);
    return out;
  });

  /** how a label's runs are styled: [channel/range number, frequency] */
  function runClass(item: RulerItem, text: TextLabel, run: number): string {
    const member = text.members[run];
    const isKeyed = member !== null && hot.has(member) && (item.kind === "single" || run !== 1);
    const isSelected = member !== null && selected === member;
    const role = text.runs[run].role;
    const parts = [`r-${role}`];
    if (isKeyed && role !== "freq") parts.push("is-keyed");
    if (role === "freq" && isSelectedFreq(item, text, isSelected)) parts.push("is-selected");
    return parts.join(" ");
  }
  /** the frequency reads ink while its channel is selected (a bracket's line B: the first member) */
  const isSelectedFreq = (item: RulerItem, text: TextLabel, isSelected: boolean): boolean => isSelected && (item.kind === "single" || text.members[0] === item.members[0]);

  const sel = (ch: number): boolean => selected === ch;
  const underlineOf = (it: RulerItem): { d: string; keyed: boolean } | null => {
    const first = it.members[0];
    const last = it.members[it.members.length - 1];
    const base = it.tail.b;
    if (it.kind === "single") return sel(first) ? { d: line(base, 10 * m.adv), keyed: hot.has(first) } : null;
    if (sel(first)) return { d: line({ x: base.x + m.lead * Math.SQRT2, y: base.y }, 7 * m.adv), keyed: hot.has(first) };
    if (sel(last)) return { d: line({ x: base.x + 3 * m.adv * R2, y: base.y - 3 * m.adv * R2 }, 2 * m.adv), keyed: hot.has(last) };
    return null;
  };
</script>

<svg class="hud lo-ruler" class:is-stale={stale} width={width + m.M} height={H} viewBox="0 0 {width + m.M} {H}" style:font-size="{m.f}px" aria-hidden="true">
  <path class="r-ticks" data-k="ticks" d={faint} stroke="var(--line-faint)" />
  <path class="r-ticks" data-k="ticks" d={strong} stroke={stale ? "var(--line-faint)" : "var(--line)"} />

  {#each [...layout.items, ...layout.extraSingles] as it (it.members[0])}
    {@const first = it.members[0]}
    {@const keyedFirst = hot.has(first)}
    {@const selectedFirst = sel(first)}
    {@const under = underlineOf(it)}
    {#if it.rule}<path data-k="rule" d="M{it.rule.a.x} {it.rule.a.y}H{it.rule.b.x}" stroke={stale ? "var(--line-faint)" : "var(--line)"} />{/if}
    <path data-k="tail" d="M{it.tail.a.x} {it.tail.a.y}L{it.tail.b.x} {it.tail.b.y}" stroke={tone(keyedFirst, selectedFirst)} stroke-width={selectedFirst ? 1.5 : 1} />
    {#if under}<path data-k="underline" class="state" d={under.d} stroke={tone(under.keyed, true)} />{/if}
    {#each it.texts as text, ti (ti)}
      <text data-k="text" x={text.origin.x} y={text.origin.y} transform="rotate(-45 {text.origin.x} {text.origin.y})" class:is-stale={stale}>
        {#each text.runs as run, ri (ri)}<tspan class={runClass(it, text, ri)}>{run.text}</tspan>{/each}
      </text>
    {/each}
  {/each}

  {#each marks as mark (mark.x)}
    <path class="state" d={tickAt(mark.x, mark.length)} stroke={tone(mark.keyed, mark.selected)} stroke-width={mark.selected ? 1.5 : 1} />
    {#if mark.taller}<path class="state" d="M{mark.x} {H - mark.length}v-2" stroke={tone(mark.keyed, true)} stroke-width="1.5" />{/if}
    {#if mark.keyed}<rect class="state" x={mark.x - 2} y={H - 4} width="4" height="4" fill="var(--state-tx)" />{/if}
  {/each}
</svg>

<style>
  svg { display: block; overflow: visible; shape-rendering: crispEdges; }
  path { fill: none; stroke-width: 1; }
  text { font-family: var(--font-data); text-anchor: start; shape-rendering: auto; }
  .r-channel, .r-range { fill: var(--ink); font-weight: 400; }
  .r-dash { fill: var(--ink-2); }
  .r-freq { fill: var(--ink-2); }
  .r-freq.is-selected { fill: var(--ink); }
  .r-channel.is-keyed, .r-range.is-keyed { fill: var(--state-tx); font-weight: 700; }
  /* a stale feed: the text goes to ink-3 whatever it was; keyed never shows */
  text.is-stale tspan { fill: var(--ink-3); font-weight: 400; }
</style>

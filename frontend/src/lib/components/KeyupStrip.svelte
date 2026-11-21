<script lang="ts">
  /**
   * The key-up strip at the left of the footer (Sprint 6, B.5): one orange frame per keyed frequency, oldest on the
   * left, "160.920  0:12". It is the only place the app lists what is on the air. A frame that goes quiet turns
   * recent-orange for a beat, then closes up to the left. A click opens the frequency in Live Ops.
   */
  import { onMount, tick, untrack } from "svelte";
  import * as fmt from "$lib/hud/fmt";
  import { frameLabel, keyedFor, keyFrames, reconcile, without, type KeyFrame, type StripEntry } from "$lib/hud/keyups";
  import { router } from "$lib/router.svelte";
  import { frequencies } from "$lib/stores/frequencies.svelte";
  import { live } from "$lib/stores/live.svelte";
  import { simClock } from "$lib/stores/simClock.svelte";
  import { keyAge } from "$lib/time";

  /** t-commit: a frame opens over this */
  const ENTER_MS = 250;
  /** a released frame holds its recent look for t-settle, then closes up over t-settle */
  const HOLD_MS = 400;
  const LEAVE_MS = 400;

  /** whether anything is in the strip (a frame in its hold counts), so the narrow footer can give it the width */
  let { active = $bindable(false) }: { active?: boolean } = $props();

  onMount(() => simClock.start());

  const reduced = (): boolean => document.documentElement.dataset.motion === "reduced" || (matchMedia("(prefers-reduced-motion: reduce)").matches && document.documentElement.dataset.motion !== "full");

  let entries = $state.raw<StripEntry[]>([]);
  /** frames closing up now */
  let leaving = $state.raw<ReadonlySet<string>>(new Set());
  let announcement = $state("");

  const rows = $derived(live.state?.active_transmissions ?? []);
  $effect(() => {
    const frames = keyFrames(rows, untrack(() => simClock.now));
    untrack(() => update(frames));
  });
  $effect(() => {
    active = entries.length > 0;
  });

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  function clearTimer(id: string): void {
    clearTimeout(timers.get(id));
    timers.delete(id);
  }

  function update(frames: KeyFrame[]): void {
    const before = new Set(entries.map((entry) => entry.frame.id));
    entries = reconcile(entries, frames, simClock.now);
    for (const entry of entries) {
      const id = entry.frame.id;
      if (entry.phase === "live") {
        clearTimer(id);
        if (leaving.has(id)) leaving = new Set([...leaving].filter((other) => other !== id));
      } else if (!timers.has(id)) {
        retire(id);
      }
    }
    const added = frames.filter((frame) => !before.has(frame.id));
    if (added.length) {
      announcement = `KEYED ${added.map(mhzOf).join(", ")}`;
      scrollToEnd();
    }
  }

  /** hold, close up, remove */
  function retire(id: string): void {
    const remove = (): void => {
      timers.delete(id);
      entries = without(entries, id);
      leaving = new Set([...leaving].filter((other) => other !== id));
    };
    if (reduced()) return remove();
    timers.set(
      id,
      setTimeout(() => {
        leaving = new Set([...leaving, id]);
        timers.set(id, setTimeout(remove, LEAVE_MS));
      }, HOLD_MS),
    );
  }
  onMount(() => () => timers.forEach((timer) => clearTimeout(timer)));

  const mhzOf = (frame: KeyFrame): string => fmt.freq(live.state?.channels.find((c) => c.id === frame.id)?.freq_mhz ?? frequencies.byId(frame.id)?.freq_mhz);
  const secondsOf = (entry: StripEntry): number => entry.frozenS ?? keyAge(simClock.now, entry.frame.since);

  // ---- scrolling: a wheel moves it sideways, a new frame brings the right end into view, an edge with more fades
  let scroller = $state<HTMLElement>();
  let row = $state<HTMLElement>();
  let hovered = $state(false);
  let focused = $state(false);
  let moreLeft = $state(false);
  let moreRight = $state(false);

  function measure(): void {
    if (!scroller) return;
    moreLeft = scroller.scrollLeft > 1;
    moreRight = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
  }
  async function scrollToEnd(): Promise<void> {
    await tick();
    if (hovered || focused || !scroller) return;
    const toEnd = (): void => scroller?.scrollTo({ left: scroller.scrollWidth });
    if (reduced()) toEnd();
    else setTimeout(toEnd, ENTER_MS + 10); // the new frame is full width by then
  }
  function wheel(event: WheelEvent): void {
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    scroller.scrollLeft += event.deltaY;
  }
  $effect(() => {
    if (!row) return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    if (scroller) observer.observe(scroller);
    return () => observer.disconnect();
  });

  const open = (frame: KeyFrame): void => router.go(`/live?select=${encodeURIComponent(frame.id)}`);
</script>

{#if entries.length}
  <div class="ks">
    <!-- a wheel over the strip scrolls it; the frames are the buttons -->
    <div
      class="ks__scroll"
      class:more-left={moreLeft}
      class:more-right={moreRight}
      bind:this={scroller}
      onscroll={measure}
      onwheel={wheel}
      onpointerenter={() => (hovered = true)}
      onpointerleave={() => (hovered = false)}
      onfocusin={() => (focused = true)}
      onfocusout={() => (focused = false)}
      role="presentation"
    >
      <ul class="ks__row" role="list" aria-label="Keyed now" bind:this={row}>
        {#each entries as entry (entry.frame.id)}
          {@const seconds = secondsOf(entry)}
          {@const mhz = mhzOf(entry.frame)}
          <li class="ks__cell" class:is-leaving={leaving.has(entry.frame.id)} role="listitem">
            <button
              class="ks__frame"
              class:is-dormant={entry.phase === "dormant"}
              type="button"
              aria-label={frameLabel(entry.frame, mhz, seconds)}
              title={frameLabel(entry.frame, mhz, seconds, { withVia: true })}
              onclick={() => open(entry.frame)}
            >
              <span class="ks__text"><span class="ks__mhz">{mhz}</span><span class="ks__time">{keyedFor(seconds)}</span></span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
    <span class="ks__rule" aria-hidden="true"></span>
  </div>
{/if}
<span class="ks__live" aria-live="polite">{announcement}</span>

<style>
  .ks { display: flex; align-items: center; flex: 0 1 auto; min-width: 0; max-width: 66.667%; --ks-w: 112px; --ks-h: 24px; --ks-gap: 4px; }
  .ks__scroll { min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .ks__scroll::-webkit-scrollbar { display: none; }
  /* 24 px fade, only on an edge that hides something */
  .ks__scroll.more-left { mask-image: linear-gradient(90deg, transparent, #000 24px); }
  .ks__scroll.more-right { mask-image: linear-gradient(90deg, #000 calc(100% - 24px), transparent); }
  .ks__scroll.more-left.more-right { mask-image: linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 24px), transparent); }
  .ks__row { display: flex; width: max-content; margin: 0; padding: 0; list-style: none; }

  .ks__cell { flex: none; width: calc(var(--ks-w) + var(--ks-gap)); padding-right: var(--ks-gap); overflow: hidden; animation: ks-open var(--t-commit) var(--ease-instrument); }
  .ks__cell.is-leaving { animation: ks-close var(--t-settle) var(--ease-in-out) forwards; }
  @keyframes ks-open { from { width: 0; } }
  @keyframes ks-close { to { width: 0; opacity: 0; } }

  .ks__frame {
    display: block; box-sizing: border-box; width: var(--ks-w); height: var(--ks-h); padding: 0 8px; border: 0; border-radius: 0; cursor: pointer; text-align: left;
    background: var(--wash-tx-surface); color: var(--state-tx); box-shadow: inset 0 0 0 1px var(--state-tx);
    font: 400 12px/var(--ks-h) var(--font-data); white-space: nowrap;
    /* the stroke arrives hot for t-flash, then settles to state-tx */
    animation: ks-flash var(--t-flash) linear;
  }
  @keyframes ks-flash { from { box-shadow: inset 0 0 0 1px var(--state-tx-hot); } }
  .ks__frame.is-dormant { color: var(--state-recent); box-shadow: inset 0 0 0 1px var(--state-recent); animation: none; }
  .ks__frame:focus-visible { outline: 1px solid var(--state-select); outline-offset: -3px; }
  /* the text fades in once the width has settled */
  .ks__text { display: inline-flex; gap: 8px; animation: ks-text var(--t-micro) linear var(--t-commit) backwards; }
  @keyframes ks-text { from { opacity: 0; } }
  .ks__mhz { font-weight: 500; }
  .ks__time { font-variant-numeric: tabular-nums; }

  .ks__rule { flex: none; width: 1px; height: 16px; margin: 0 12px; background: var(--line-faint); }
  .ks__live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

  @media (max-width: 899px) {
    .ks { flex: 1; max-width: none; --ks-w: 128px; --ks-h: 32px; }
    .ks__frame { font-size: 14px; line-height: var(--ks-h); }
    .ks__rule { display: none; }
  }
</style>

<script lang="ts">
  /**
   * A divider (direction 4): a hairline with a three-tick grip inside a gap that already exists, so the idle screen
   * looks the same without it. Drag it (pointer capture), or use the keyboard: arrows step 8 px, Shift 64 px, Home and
   * End go to the limits, Enter resets. Double-click resets. Esc during a drag puts it back. It measures nothing:
   * its parent hands it the size in pixels and the limits, and takes back the size the user asks for.
   */
  import { clamp, type Bounds } from "./layout";

  interface Props {
    /** "horizontal" is a row divider (it sets the wall's height); "vertical" is a column divider (the pane's width) */
    orientation: "horizontal" | "vertical";
    /** the size it sets, now, in px */
    size: number;
    limits: Bounds;
    /** +1 when moving the pointer down or right grows the size, -1 when it shrinks it (the pane, on the right) */
    grows: 1 | -1;
    label: string;
    /** the text of the readout plate while dragging or stepping */
    readout: string;
    /** the same, in words, for the ARIA value text */
    valuetext: string;
    /** the size the user asked for, already within the limits; called on every move of a drag */
    onsize: (px: number) => void;
    /** a drag ended or a key step was made: remember the size */
    oncommit: () => void;
    onreset: () => void;
    ondragging?: (dragging: boolean) => void;
    class?: string;
  }
  let { orientation, size, limits, grows, label, readout, valuetext, onsize, oncommit, onreset, ondragging, class: className = "" }: Props = $props();

  const vertical = $derived(orientation === "vertical");
  let dragging = $state(false);
  /** the pointer is pushing past a limit */
  let atLimit = $state(false);
  /** the plate shows while dragging, 120 ms after, and for a second after a key step */
  let plate = $state(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let start = { pointer: 0, size: 0 };

  const showPlate = (forMs?: number): void => {
    clearTimeout(hideTimer);
    plate = true;
    if (forMs !== undefined) hideTimer = setTimeout(() => (plate = false), forMs);
  };
  const axis = (event: PointerEvent): number => (vertical ? event.clientX : event.clientY);
  const bodyClass = $derived(vertical ? "lo-resizing-col" : "lo-resizing-row");

  function down(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    start = { pointer: axis(event), size };
    dragging = true;
    ondragging?.(true);
    document.body.classList.add(bodyClass);
    showPlate();
  }
  function move(event: PointerEvent): void {
    if (!dragging) return;
    const wanted = start.size + grows * (axis(event) - start.pointer);
    const allowed = clamp(wanted, limits);
    atLimit = wanted !== allowed;
    onsize(allowed);
  }
  function finish(): void {
    if (!dragging) return;
    dragging = false;
    atLimit = false;
    document.body.classList.remove(bodyClass);
    ondragging?.(false);
    oncommit();
    showPlate(120);
  }
  function cancel(): void {
    onsize(start.size);
    finish();
  }

  /** A key step: arrows move the divider the way they point; the size follows `grows`. */
  function keydown(event: KeyboardEvent): void {
    if (dragging) {
      if (event.key === "Escape") (event.preventDefault(), event.stopPropagation(), cancel());
      return;
    }
    const step = event.shiftKey ? 64 : 8;
    // the arrow that moves the divider toward the end of its track (down, or right) adds `grows` to the size
    const toward: Record<string, number> = vertical ? { ArrowRight: 1, ArrowLeft: -1 } : { ArrowDown: 1, ArrowUp: -1 };
    let next: number | undefined;
    if (event.key in toward) next = size + grows * toward[event.key] * step;
    else if (event.key === "Home") next = limits.min;
    else if (event.key === "End") next = limits.max;
    else if (event.key === "Enter") {
      event.preventDefault();
      onreset();
      showPlate(1000);
      return;
    }
    if (next === undefined) return;
    event.preventDefault();
    onsize(clamp(next, limits));
    oncommit();
    showPlate(1000);
  }
</script>

<svelte:window onkeydowncapture={(event) => dragging && event.key === "Escape" && keydown(event)} />

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="dv dv--{orientation} {className}"
  class:is-drag={dragging}
  class:is-limit={atLimit}
  role="separator"
  tabindex="0"
  aria-orientation={orientation}
  aria-label={label}
  aria-valuemin={limits.min}
  aria-valuemax={limits.max}
  aria-valuenow={size}
  aria-valuetext={valuetext}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={finish}
  onpointercancel={cancel}
  ondblclick={onreset}
  onkeydown={keydown}
  onfocus={(event) => event.currentTarget.matches(":focus-visible") && showPlate(1000)}
>
  <span class="dv__rule"></span>
  <span class="dv__grip"><i></i><i></i><i></i></span>
  {#if plate}<span class="dv__plate" role="status">{readout}</span>{/if}
</div>

<style>
  /* its parent places it (position, size); it only draws inside */
  .dv { z-index: 4; display: grid; place-items: center; touch-action: none; border-radius: 3px; }
  .dv--horizontal { cursor: row-resize; }
  .dv--vertical { cursor: col-resize; }
  .dv:focus-visible { outline: var(--stroke-emph) solid var(--state-select); outline-offset: 0; }

  /* a 1 px hairline, centred in the gap, running its whole length */
  .dv__rule { position: absolute; background: var(--grid); }
  .dv--horizontal .dv__rule { left: 0; right: 0; top: 50%; height: 1px; }
  .dv--vertical .dv__rule { top: 0; bottom: 0; left: 50%; width: 1px; }
  /* the grip: three 4 px ticks 4 px apart, across the hairline, centred (an M2 minor-tick group) */
  .dv__grip { position: relative; display: flex; gap: 3px; background: var(--bg-void); }
  .dv--horizontal .dv__grip { padding: 0 6px; }
  .dv--vertical .dv__grip { flex-direction: column; padding: 6px 0; }
  .dv__grip i { display: block; background: var(--line-faint); }
  .dv--horizontal .dv__grip i { width: 1px; height: 4px; }
  .dv--vertical .dv__grip i { width: 4px; height: 1px; }

  .dv:hover .dv__rule, .dv:focus-visible .dv__rule { background: var(--line-faint); }
  .dv:hover .dv__grip i, .dv:focus-visible .dv__grip i { background: var(--line); }
  .dv.is-drag .dv__rule { background: var(--line); }
  .dv.is-drag .dv__grip i { background: var(--line); }
  /* pushing past a limit: the hairline turns dash-threshold (2 on, 3 off) for as long as the pointer pushes */
  .dv.is-limit .dv__rule { background: none; }
  .dv--horizontal.is-limit .dv__rule { background: repeating-linear-gradient(90deg, var(--line) 0 2px, transparent 2px 5px); }
  .dv--vertical.is-limit .dv__rule { background: repeating-linear-gradient(180deg, var(--line) 0 2px, transparent 2px 5px); }

  /* the readout: what the gesture measures */
  .dv__plate {
    position: absolute; z-index: 5; padding: 4px 8px; background: var(--bg-void); box-shadow: inset 0 0 0 1px var(--line-faint);
    font: 400 var(--fs-11)/1 var(--font-data); color: var(--ink-2); white-space: nowrap; pointer-events: none;
  }
  .dv--horizontal .dv__plate { left: calc(50% + 40px); top: 50%; transform: translateY(-50%); }
  .dv--vertical .dv__plate { right: calc(50% + 16px); top: 24px; }
</style>

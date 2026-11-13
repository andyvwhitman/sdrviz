<script lang="ts">
  /** M4 registration mark: circle r 6, crosshair 4 px past it (spec 5.15). Inside an <svg class="hud">. */
  import { snap } from "./ruler";

  interface Props {
    x: number;
    y: number;
    tone?: "line" | "stale" | "fault";
  }
  let { x, y, tone = "line" }: Props = $props();

  const cx = $derived(snap(x));
  const cy = $derived(snap(y));
</script>

<g class="regmark">
  <circle class="s-hair k-{tone}" {cx} {cy} r="6" />
  <path class="s-hair k-{tone}" d="M{cx - 10} {cy}H{cx + 10}M{cx} {cy - 10}V{cy + 10}" />
</g>

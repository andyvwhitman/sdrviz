<script lang="ts">
  /** M4 registration mark: circle r 6, crosshair 4 px past it. Draw inside an <svg class="hud">. */
  interface Props {
    x?: number;
    y?: number;
    state?: "line" | "stale" | "fault";
  }
  let { x = 0, y = 0, state = "line" }: Props = $props();

  const X = $derived(Math.round(x) + 0.5);
  const Y = $derived(Math.round(y) + 0.5);
</script>

<g class="regmark">
  <circle class="s-hair k-{state}" cx={X} cy={Y} r="6" />
  <path class="s-hair k-{state}" d="M{X - 10} {Y}H{X + 10}M{X} {Y - 10}V{Y + 10}" />
</g>

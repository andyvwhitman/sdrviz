<script lang="ts">
  interface Props {
    label: string;
    checked: boolean;
    onchange?: (checked: boolean) => void;
  }
  let { label, checked = $bindable(), onchange }: Props = $props();

  function toggle() {
    checked = !checked;
    onchange?.(checked);
  }
</script>

<span
  class="toggle"
  role="switch"
  tabindex="0"
  aria-checked={checked}
  onclick={toggle}
  onkeydown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), toggle())}
><i></i>{label}</span>

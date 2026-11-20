<script lang="ts">
  /** The editor docked at the right of the page, over the table (direction 2.5.1): it never makes the table reflow. */
  import { onMount } from "svelte";
  import FrequencyEditor from "$lib/components/frequency-editor/FrequencyEditor.svelte";
  import type { Outcome } from "$lib/components/frequency-editor/editorForm";

  interface Props {
    /** null adds a frequency */
    frequencyId: string | null;
    onclose: () => void;
    ondone: (outcome: Outcome, id: string) => void;
    onopen: (id: string) => void;
  }
  let { frequencyId, onclose, ondone, onopen }: Props = $props();

  let editor = $state<ReturnType<typeof FrequencyEditor>>();

  onMount(() => {
    const keys = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      editor?.escape();
    };
    addEventListener("keydown", keys);
    return () => removeEventListener("keydown", keys);
  });

  /** Ask to close (unsaved details raise the discard prompt); for the page when another row is chosen. */
  export const requestClose = (proceed?: () => void): void => editor?.requestClose(proceed);
</script>

<aside class="fr-drawer br br--line" aria-label="Edit frequency">
  <FrequencyEditor bind:this={editor} {frequencyId} variant="drawer" {onclose} {ondone} {onopen} />
</aside>

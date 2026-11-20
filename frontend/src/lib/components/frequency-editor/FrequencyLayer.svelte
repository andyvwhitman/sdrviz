<script lang="ts">
  /**
   * The editor as a full-screen layer on a phone (the Live Ops pane-layer pattern): it pushes a history entry so the
   * system Back closes it, and the bar says `‹ BACK`. Unsaved details turn Back into the discard prompt.
   * The opener marks what lies beneath `inert` and keeps it mounted.
   */
  import { onMount } from "svelte";
  import FrequencyEditor from "./FrequencyEditor.svelte";
  import type { Outcome } from "./editorForm";

  interface Props {
    /** null adds a frequency */
    frequencyId: string | null;
    onclose: () => void;
    ondone: (outcome: Outcome, id: string) => void;
    onopen?: (id: string) => void;
    openPage?: boolean;
    listenedFeedId?: string;
  }
  let { frequencyId, onclose, ondone, onopen, openPage = true, listenedFeedId }: Props = $props();

  let editor = $state<ReturnType<typeof FrequencyEditor>>();
  /** the history entry this layer pushed is still on the stack */
  let pushed = false;

  /** Leave the layer: take the entry off the stack if it is still there, then tell the opener. */
  function leave(): void {
    removeEventListener("popstate", popped);
    if (pushed) {
      pushed = false;
      history.back();
    }
    onclose();
  }

  /** The system Back: leave, unless there are unsaved details, in which case the layer stays and asks. */
  function popped(): void {
    pushed = false;
    if (editor?.isDirtyNow()) {
      history.pushState({ frequencyEditor: true }, "");
      pushed = true;
    }
    editor?.requestClose(leave);
  }

  onMount(() => {
    history.pushState({ frequencyEditor: true }, "");
    pushed = true;
    addEventListener("popstate", popped);
    return () => {
      removeEventListener("popstate", popped);
      if (pushed) history.back(); // closed from outside (a delete): do not leave an entry behind
    };
  });
</script>

<div class="fl" role="dialog" aria-modal="true" aria-label="Edit frequency">
  <FrequencyEditor bind:this={editor} {frequencyId} variant="layer" onclose={leave} ondone={(outcome, id) => ondone(outcome, id)} {onopen} {openPage} {listenedFeedId} />
</div>

<style>
  .fl { position: fixed; top: var(--header-h); bottom: 0; left: 0; right: 0; z-index: 12; background: var(--bg-void); }
</style>

<script lang="ts">
  /**
   * The node key, shown once: one selectable line with Copy and Download, the enroll command, and a warning. Closing
   * without having copied or downloaded asks first. The key is only ever a prop of this dialog.
   */
  import Button from "$lib/components/Button.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import { copyText, downloadText } from "$lib/clipboard";
  import { enrollCommand, hoursLeft, KEY_DIR, keyFile } from "$lib/nodeKey";

  interface Props {
    nodeName: string;
    keyText: string;
    /** when the key stops working */
    expiresAt: string | null;
    /** true when this is a re-key of a node that was enrolled before */
    rekey?: boolean;
    onclose: () => void;
  }
  let { nodeName, keyText, expiresAt, rekey = false, onclose }: Props = $props();

  let line = $state<HTMLInputElement>();
  let used = $state(false);
  let confirming = $state(false);
  let notice = $state("");

  const hours = $derived(hoursLeft(expiresAt, Date.now()));

  function selectAndCopy(): boolean {
    line?.focus();
    line?.select();
    return document.execCommand("copy");
  }

  async function copy(): Promise<void> {
    const ok = await copyText(keyText, selectAndCopy);
    used ||= ok;
    notice = ok ? "COPIED" : "COULD NOT COPY: THE KEY IS SELECTED, COPY IT BY HAND";
    if (!ok) line?.select();
  }

  function download(): void {
    const { filename, content } = keyFile(nodeName, keyText);
    downloadText(filename, content);
    used = true;
    notice = `SAVED ${filename}`;
  }

  function requestClose(): void {
    if (used) onclose();
    else confirming = true;
  }
</script>

<Modal title="NODE KEY · {nodeName}" onclose={requestClose}>
  <p class="nk-warn" role="alert">THIS KEY IS SHOWN ONCE. IT CANNOT BE SHOWN AGAIN; LOSE IT AND YOU RE-KEY THE NODE.</p>

  <label class="nk-line">
    <span class="field__label">NODE KEY</span>
    <input class="nk-key mono" readonly value={keyText} bind:this={line} onfocus={(e) => e.currentTarget.select()} />
  </label>
  <div class="nk-actions">
    <Button primary onclick={copy}>COPY</Button>
    <Button onclick={download}>DOWNLOAD</Button>
    <span class="t-micro" aria-live="polite">{notice}</span>
  </div>

  <p class="t-micro">VALID {hours == null ? "24" : hours} HOURS, SINGLE USE{rekey ? " · THE OLD SECRET KEEPS WORKING UNTIL THE NEW KEY IS USED" : ""}</p>
  <div class="nk-how">
    <span class="field__label">ON THE PI</span>
    <code class="nk-cmd mono">{enrollCommand(keyText)}</code>
    <span class="t-micro">OR SAVE THE FILE IN {KEY_DIR}</span>
  </div>

  <div class="nk-actions">
    {#if confirming}
      <span class="t-micro">NEITHER COPIED NOR SAVED. CLOSE ANYWAY?</span>
      <Button sm onclick={onclose}>CLOSE, I DO NOT NEED IT</Button>
      <Button sm primary onclick={() => (confirming = false)}>BACK</Button>
    {:else}
      <span class="grow"></span>
      <Button onclick={requestClose}>DONE</Button>
    {/if}
  </div>
</Modal>

<style>
  .nk-warn { margin: 0; font: var(--type-name); letter-spacing: var(--track-name); color: var(--ink); }
  .nk-line { display: grid; gap: 6px; }
  .nk-key { width: 100%; box-sizing: border-box; padding: 8px 10px; font-size: var(--fs-12); color: var(--ink); background: var(--bg-panel); border: 1px solid var(--line-faint); user-select: all; }
  .nk-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
  .nk-actions .grow { flex: 1; }
  .nk-how { display: grid; gap: 6px; }
  .nk-cmd { display: block; padding: 8px 10px; font-size: var(--fs-12); color: var(--ink-2); background: var(--bg-panel); overflow-wrap: anywhere; user-select: all; }
</style>

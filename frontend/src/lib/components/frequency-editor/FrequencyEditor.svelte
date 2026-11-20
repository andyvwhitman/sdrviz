<script lang="ts">
  /**
   * The one frequency editor (direction 8.4), shared by the Frequencies page drawer, the floating window and the phone
   * layer. Bar, NODES (applied at once), DETAILS (applied by SAVE), footer. `frequencyId` null adds a frequency.
   *
   * The container owns position and the outside world; it asks the editor to close through `requestClose` (so unsaved
   * details raise the discard prompt first) and forwards Esc to `escape`.
   */
  import { onMount, untrack } from "svelte";
  import { api, ApiError } from "$lib/api/client";
  import Button from "$lib/components/Button.svelte";
  import Field from "$lib/components/Field.svelte";
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import SelectField from "$lib/components/SelectField.svelte";
  import { aar as aarPair } from "$lib/hud/fmt";
  import { followLink } from "$lib/router.svelte";
  import { slotOf } from "$lib/slots";
  import { frequencies } from "$lib/stores/frequencies.svelte";
  import { live } from "$lib/stores/live.svelte";
  import type { Slot } from "$lib/types/frequencies";
  import { type Outcome, bodyFrom, deleteCopy, deleteMatches, draftFrom, emptyDraft, identityOf, isDirty, newId, parseTarget, targetReadout, titleOf, validate, weekReadout, type Draft, type Errors } from "./editorForm";
  import { glyphFor, nodeColumns, stateWord } from "./nodes";
  import SlotSwitch from "./SlotSwitch.svelte";


  interface Props {
    /** null adds a new frequency (the drawer and the phone layer only) */
    frequencyId: string | null;
    variant: "drawer" | "window" | "layer";
    /** the bar's close (`×`, or `‹ BACK` on the layer) */
    onclose: () => void;
    ondone: (outcome: Outcome, id: string) => void;
    /** add mode: open the editor of the frequency already on this MHz */
    onopen?: (id: string) => void;
    /** `OPEN PAGE ›` in the bar; off on the detail page itself */
    openPage?: boolean;
    /** the node Live Ops is listening to: the bar says so when the frequency is not on it */
    listenedFeedId?: string;
  }
  let { frequencyId, variant, onclose, ondone, onopen, openPage = true, listenedFeedId }: Props = $props();

  const isAdd = $derived(frequencyId === null);
  const freq = $derived(frequencyId ? frequencies.byId(frequencyId) : undefined);
  const columns = $derived(nodeColumns(live.state?.feeds ?? []));
  const sameMhz = $derived.by(() => {
    const t = parseTarget(targetText);
    return t.ok ? frequencies.rows.filter((f) => f.freq_mhz === t.mhz) : [];
  });

  // ---- the details draft
  let saved = $state<Draft>(emptyDraft());
  let draft = $state<Draft>(emptyDraft());
  let errors = $state<Errors>({});
  let failure = $state("");
  let busy = $state(false);
  /** add mode */
  let targetText = $state("");
  let targetError = $state("");
  let pending = $state<Record<string, Slot>>({});
  let lastAutoLabel = "";
  let lid = $state(false);

  const target = $derived(parseTarget(targetText));
  const dirty = $derived((isAdd && targetText.trim() !== "") || isDirty(saved, draft));

  /** Start over from the frequency (or from nothing) when the editor is pointed at another one, or its row first arrives. */
  $effect(() => {
    const id = frequencyId;
    const row = id ? frequencies.byId(id) : undefined;
    untrack(() => {
      saved = row ? draftFrom(row) : emptyDraft();
      draft = { ...saved };
      errors = {};
      failure = "";
      targetText = "";
      targetError = "";
      pending = {};
      lastAutoLabel = "";
      confirmDiscard = false;
      deleting = false;
      typed = "";
    });
    void row?.id;
  });

  // the label of a new frequency follows the channel until it is typed over
  $effect(() => {
    if (!isAdd || !target.ok) return;
    const auto = aarPair(target.channel);
    untrack(() => {
      if (draft.label === "" || draft.label === lastAutoLabel) draft.label = auto;
      lastAutoLabel = auto;
    });
  });

  // ---- the node controls
  let inflight = $state(new Set<string>());
  let nodeFailure = $state("");

  const slotFor = (feedId: string): Slot => (freq ? slotOf(freq, feedId) : (pending[feedId] ?? "none"));

  async function pick(feedId: string, short: string, slot: Slot): Promise<void> {
    if (!freq) {
      pending = { ...pending, [feedId]: slot };
      return;
    }
    nodeFailure = "";
    inflight = new Set(inflight).add(feedId);
    try {
      await frequencies.setSlot(freq.id, feedId, slot);
    } catch (error) {
      nodeFailure = `${short} · ${aarPair(freq.aar_channel)} NOT ${slot === "on" ? "ENABLED" : slot === "off" ? "DISABLED" : "UNASSIGNED"}: ${reason(error)}`;
    } finally {
      inflight.delete(feedId);
      inflight = new Set(inflight);
    }
  }

  const reason = (error: unknown): string => (error instanceof ApiError ? error.message : "Backend unreachable").toUpperCase();

  // ---- the last seven days
  /** undefined: asking; null: nothing heard; text: the readout */
  let week = $state<string | null | undefined>(undefined);
  let weekFailed = $state(false);
  $effect(() => {
    const id = frequencyId;
    week = undefined;
    weekFailed = false;
    if (!id) return;
    const controller = new AbortController();
    api.activity.week(id, undefined, controller.signal).then(
      (found) => (week = weekReadout(found.days)),
      () => (weekFailed = !controller.signal.aborted),
    );
    return () => controller.abort();
  });

  // ---- save, add, delete
  async function save(): Promise<void> {
    errors = validate(draft);
    if (Object.keys(errors).length) return;
    busy = true;
    failure = "";
    try {
      if (freq) {
        const row = await frequencies.save(bodyFrom(freq.id, freq.freq_mhz, draft, freq.sources));
        saved = draftFrom(row);
        draft = { ...saved };
        ondone("saved", row.id);
      } else {
        await add();
      }
    } catch (error) {
      failure = reason(error);
    } finally {
      busy = false;
    }
  }

  async function add(): Promise<void> {
    if (!target.ok) {
      targetError = target.message || "Required";
      return;
    }
    const id = newId(target.channel, frequencies.rows.map((f) => f.id));
    await frequencies.add(bodyFrom(id, target.mhz, draft));
    for (const column of columns) {
      const slot = pending[column.feedId] ?? "none";
      if (slot !== "none") await frequencies.setSlot(id, column.feedId, slot).catch((error: unknown) => (failure = `${column.short} NOT ENABLED: ${reason(error)}`));
    }
    saved = { ...draft };
    targetText = "";
    ondone("added", id);
  }

  let deleting = $state(false);
  let typed = $state("");
  async function destroy(): Promise<void> {
    if (!freq || !deleteMatches(typed, freq.label)) return;
    busy = true;
    failure = "";
    try {
      const id = freq.id;
      await frequencies.remove(id);
      saved = { ...draft };
      ondone("deleted", id);
    } catch (error) {
      failure = reason(error);
    } finally {
      busy = false;
    }
  }

  // ---- closing
  let confirmDiscard = $state(false);
  let next: (() => void) | null = null;

  /** Run `proceed` (default: close) now, or after the user discards unsaved details. */
  export function requestClose(proceed: () => void = onclose): void {
    if (!dirty) {
      proceed();
      return;
    }
    next = proceed;
    confirmDiscard = true;
  }

  /** Esc: step back one layer (the discard prompt, the delete check), then close. */
  export function escape(): void {
    if (confirmDiscard) confirmDiscard = false;
    else if (deleting) deleting = false;
    else requestClose();
  }

  /** Whether closing now would ask first. */
  export const isDirtyNow = (): boolean => dirty;

  function discard(): void {
    draft = { ...saved };
    targetText = "";
    pending = {};
    confirmDiscard = false;
    const proceed = next ?? onclose;
    next = null;
    proceed();
  }

  onMount(() => {
    if (!frequencies.loaded) void frequencies.load();
  });

  const listenedShort = $derived(columns.find((c) => c.feedId === listenedFeedId)?.short);
  const notOnListened = $derived(!!freq && !!listenedFeedId && slotOf(freq, listenedFeedId) !== "on");
  const railroads = $derived([...new Set(frequencies.rows.map((f) => f.railroad).filter(Boolean))].sort());
  const uses = $derived([...new Set(frequencies.rows.map((f) => f.use).filter(Boolean))].sort());
  const confidence = ["high", "medium", "low"].map((value) => ({ value, text: value.toUpperCase() }));
  const uid = $props.id();
</script>

<div class="fe fe--{variant}" role="group" aria-label={freq ? titleOf(freq) : "New frequency"}>
  <header class="fe__bar">
    {#if variant === "layer"}
      <button class="fe__back" type="button" onclick={() => requestClose()}>‹ BACK</button>
    {/if}
    <span class="fe__title" id="fe-title-{uid}">
      {#if freq}<span class="fe__mono">{aarPair(freq.aar_channel)}</span> · <b>{freq.label}</b>{:else if isAdd}NEW FREQUENCY{:else}<span class="fe__mono">— — —</span>{/if}
      {#if notOnListened}<span class="fe__note">NOT ON {listenedShort}</span>{/if}
    </span>
    <span class="fe__grow"></span>
    {#if freq && openPage}<a class="fe__open" href="/frequency/{encodeURIComponent(freq.id)}" onclick={followLink}>OPEN PAGE ›</a>{/if}
    {#if variant !== "layer"}<button class="fe__x" type="button" aria-label="Close" onclick={() => requestClose()}>×</button>{/if}
  </header>

  <div class="fe__body">
    {#if isAdd}
      <section class="fe__sec">
        <Field label="CHANNEL OR MHz" bind:value={targetText} placeholder="54 · CH54 · 5454 · 160.920" error={targetError || (!target.ok && target.message ? target.message : "")} autofocus />
        {#if target.ok}
          <p class="fe__resolve">{targetReadout(target)}</p>
          {#each sameMhz as other (other.id)}
            <p class="fe__same">ON THIS MHz: {other.label}{#if onopen} <button type="button" class="fe__link" onclick={() => onopen?.(other.id)}>›</button>{/if}</p>
          {/each}
        {/if}
      </section>
    {:else if freq}
      <p class="fe__ident">{identityOf(freq)}</p>
    {:else}
      <p class="fe__ident">{frequencies.failed ? "COULD NOT LOAD" : "— — —"}</p>
    {/if}

    {#if isAdd || freq}
      <section class="fe__sec" aria-labelledby="fe-nodes-{uid}">
        <h3 class="fe__h"><span id="fe-nodes-{uid}">NODES</span><span class="t-micro">{isAdd ? "APPLIED WHEN ADDED" : "APPLY AT ONCE"}</span></h3>
        {#each columns as column (column.feedId)}
          <div class="fe__node">
            <PositionGlyph state={glyphFor(column.state)} />
            <span class="fe__short">{column.short}</span>
            <span class="fe__state">{stateWord(column.state)}</span>
            <span class="fe__grow"></span>
            <SlotSwitch value={slotFor(column.feedId)} label="{column.short} for {freq ? titleOf(freq) : 'the new frequency'}" disabled={inflight.has(column.feedId)} onpick={(slot) => pick(column.feedId, column.short, slot)} />
          </div>
        {:else}
          <p class="fe__muted">NO NODES · Add a node in Settings.</p>
        {/each}
        {#if nodeFailure}<p class="fe__fail" role="alert">{nodeFailure}</p>{/if}
        <p class="fe__cost">ON: THE NODE DECODES IT · THE SERVER RECORDS AND TRANSCRIBES EVERY KEY-UP</p>
        {#if freq && week !== null}
          <p class="fe__week"><span>LAST 7 DAYS</span> <span class="fe__mono">{weekFailed || week === undefined ? "— — —" : week}</span></p>
        {/if}
      </section>

      <section class="fe__sec" aria-labelledby="fe-details-{uid}">
        <h3 class="fe__h"><span id="fe-details-{uid}">DETAILS</span><span class="t-micro">SAVE TO APPLY</span></h3>
        <div class="fe__fields">
          <Field label="LABEL" text bind:value={draft.label} error={errors.label} />
          <Field label="RAILROAD" text bind:value={draft.railroad} list="fe-rr-{uid}" />
          <Field label="USE" text bind:value={draft.use} list="fe-use-{uid}" />
          <Field label="LINE" text bind:value={draft.line} />
          <label class="field">
            <span class="field__label">NOTES</span>
            <textarea class="field__input fe__notes" rows="4" bind:value={draft.notes}></textarea>
          </label>
        </div>
        <datalist id="fe-rr-{uid}">{#each railroads as name (name)}<option value={name}></option>{/each}</datalist>
        <datalist id="fe-use-{uid}">{#each uses as name (name)}<option value={name}></option>{/each}</datalist>
        <button class="disclosure fe__lid" type="button" aria-expanded={lid} onclick={() => (lid = !lid)}>SOURCE AND CONFIDENCE</button>
        {#if lid}
          <div class="fe__fields">
            <Field label="MODE" bind:value={draft.mode} />
            <SelectField label="CONFIDENCE" bind:value={draft.confidence} options={confidence} />
            <Field label="SOURCE URL" text bind:value={draft.source} error={errors.source} />
          </div>
        {/if}
      </section>
    {/if}
    {#if failure}<p class="fe__fail" role="alert">{failure}</p>{/if}
  </div>

  {#if isAdd || freq}
    <footer class="fe__foot">
      {#if confirmDiscard}
        <span class="fe__ask" role="alert">DISCARD CHANGES?</span>
        <Button sm onclick={discard}>DISCARD</Button>
        <Button sm primary onclick={() => (confirmDiscard = false)}>KEEP EDITING</Button>
      {:else if deleting && freq}
        <div class="fe__del">
          <Field label="TYPE THE LABEL TO DELETE" text bind:value={typed} placeholder={freq.label} autofocus />
          <div class="fe__delrow">
            <Button sm primary disabled={busy || !deleteMatches(typed, freq.label)} onclick={destroy}>DELETE</Button>
            <Button sm onclick={() => ((deleting = false), (typed = ""))}>CANCEL</Button>
          </div>
          <p class="fe__copy">{deleteCopy(freq, null)}</p>
        </div>
      {:else}
        <Button primary disabled={busy || !dirty || (isAdd && !target.ok)} onclick={save}>{isAdd ? "ADD" : "SAVE"}</Button>
        <Button onclick={() => requestClose()}>CANCEL</Button>
        <span class="fe__grow"></span>
        {#if freq}<button class="fe__delete" type="button" onclick={() => (deleting = true)}>DELETE</button>{/if}
      {/if}
    </footer>
  {/if}
</div>

<style>
  .fe { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--ink); --fe-pad: 16px; }
  .fe--layer { --fe-pad: 16px; }
  .fe__bar { flex: none; display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 var(--fe-pad); border-bottom: 1px solid var(--grid); }
  .fe__title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 500 var(--fs-13)/1 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-2); }
  .fe__title b { font-weight: 600; color: var(--ink); }
  .fe__mono { font-family: var(--font-data); color: var(--ink); }
  .fe__note { margin-left: 8px; color: var(--ink-3); }
  .fe__grow { flex: 1; }
  .fe__open, .fe__back, .fe__link { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); border: 0; background: none; padding: 0; cursor: pointer; white-space: nowrap; text-transform: uppercase; }
  .fe__open:hover, .fe__back:hover, .fe__link:hover { color: var(--ink); }
  .fe__x { width: 32px; height: 32px; margin-right: -8px; border: 0; background: none; color: var(--ink-2); font: 400 var(--fs-18)/1 var(--font-data); cursor: pointer; }
  .fe__x:hover { color: var(--ink); }
  .fe__back { font-size: var(--fs-13); min-height: 44px; padding-right: 8px; }

  .fe__body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 var(--fe-pad) 8px; scrollbar-width: thin; scrollbar-color: var(--line-faint) transparent; }
  .fe__ident { margin: 12px 0 4px; font: 400 var(--fs-13)/1 var(--font-data); color: var(--ink); }
  .fe__sec { padding-top: 8px; }
  .fe__h { margin: 12px 0 4px; display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--line-faint); font: 600 var(--fs-11)/1 var(--font-label); letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-2); }
  .fe__node { display: flex; align-items: center; gap: 10px; min-height: 48px; border-bottom: 1px solid var(--grid); }
  .fe--layer .fe__node { min-height: 56px; }
  .fe__short { font: 600 var(--fs-12)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink); }
  .fe__state { font: 500 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); }
  .fe__cost { margin: 8px 0 0; font: 500 var(--fs-11)/1.35 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
  .fe__week { margin: 6px 0 0; display: flex; gap: 12px; font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
  .fe__week .fe__mono { color: var(--ink); }
  .fe__muted { margin: 8px 0; font: 400 var(--fs-13)/1.3 var(--font-read); color: var(--ink-3); }
  .fe__resolve { margin: 6px 0 0; font: 400 var(--fs-13)/1.3 var(--font-data); color: var(--ink); }
  .fe__same { margin: 4px 0 0; font: 500 var(--fs-11)/1.3 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-2); }
  .fe__fail { margin: 8px 0 0; font: 500 var(--fs-12)/1.3 var(--font-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--state-fault); }

  .fe__fields { display: grid; gap: 12px; margin-top: 8px; }
  .fe--layer .fe__fields :global(.field__input) { height: 44px; }
  .fe__notes { height: auto; min-height: 5.5em; max-height: 12em; padding: 6px 0; resize: vertical; font: 400 var(--fs-13)/1.4 var(--font-read); }
  .fe__lid { margin-top: 12px; min-height: 32px; border: 0; background: none; padding: 0; cursor: pointer; }
  .fe--layer .fe__lid { min-height: 44px; }

  .fe__foot { flex: none; display: flex; align-items: center; gap: 12px; padding: 12px var(--fe-pad); border-top: 1px solid var(--grid); background: inherit; }
  .fe__ask { font: 600 var(--fs-12)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink); margin-right: auto; }
  .fe--layer .fe__foot :global(.btn) { height: 44px; }
  .fe__delete { border: 0; background: none; padding: 0 4px; min-height: 32px; font: 600 var(--fs-11)/1 var(--font-label); letter-spacing: var(--track-label); color: var(--ink-3); cursor: pointer; }
  .fe--layer .fe__delete { min-height: 44px; }
  .fe__delete:hover { color: var(--ink); }
  .fe__del { width: 100%; display: grid; gap: 8px; }
  .fe__delrow { display: flex; gap: 12px; }
  .fe__copy { margin: 0; font: 400 var(--fs-13)/1.4 var(--font-read); color: var(--ink-2); }
</style>

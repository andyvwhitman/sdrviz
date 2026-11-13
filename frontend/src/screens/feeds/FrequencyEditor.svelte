<script lang="ts">
  /** Add, edit or delete one catalogue frequency; deleting a channel that banks use asks first (409 force flow). */
  import { ApiError } from "$lib/api/client";
  import Button from "$lib/components/Button.svelte";
  import Field from "$lib/components/Field.svelte";
  import { catalogue } from "./catalogue.svelte";
  import { aarOf, emptyFrequencyDraft, frequencyBody, frequencyDraftFrom, validateFrequency, type FrequencyDraft, type FrequencyErrors } from "./frequencyForm";
  import SelectField from "./SelectField.svelte";
  import type { Frequency } from "./types";

  interface Props {
    /** the frequency to edit; null adds a new one */
    frequency: Frequency | null;
    ondone: (savedId: string | null) => void;
  }
  let { frequency, ondone }: Props = $props();

  let draft = $state<FrequencyDraft>(emptyFrequencyDraft());
  let errors = $state<FrequencyErrors>({});
  let failure = $state("");
  /** set when the backend refused a delete because banks use the channel */
  let blockedBy = $state("");

  $effect(() => {
    draft = frequency ? frequencyDraftFrom(frequency) : emptyFrequencyDraft();
    errors = {};
    failure = "";
    blockedBy = "";
  });

  const isNew = $derived(frequency == null);
  const aar = $derived(aarOf(draft.freq_mhz));
  const confidence = ["high", "medium", "low"].map((value) => ({ value, text: value.toUpperCase() }));

  async function attempt(action: () => Promise<void>): Promise<void> {
    failure = "";
    try {
      await action();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && frequency) blockedBy = error.message;
      else failure = error instanceof ApiError ? error.message : "Backend unreachable";
    }
  }

  async function save(): Promise<void> {
    errors = validateFrequency(draft, isNew, catalogue.frequencies.map((f) => f.id));
    if (Object.keys(errors).length) return;
    await attempt(async () => {
      await catalogue.saveFrequency(frequencyBody(draft), isNew);
      ondone(draft.id);
    });
  }

  async function destroy(force: boolean): Promise<void> {
    if (!frequency) return;
    await attempt(async () => {
      await catalogue.deleteFrequency(frequency.id, force);
      ondone(null);
    });
  }
</script>

<div class="fb-edit fb-edit--freq">
  <div class="fb-ph">
    <span class="t-panel">{frequency ? `FREQUENCY · ${frequency.label.toUpperCase()}` : "NEW FREQUENCY"}</span>
    <span class="t-micro">{aar == null ? "" : `AAR CH${String(aar).padStart(2, "0")}`}</span>
    <Button sm onclick={() => ondone(null)}>{frequency ? "CLOSE" : "CANCEL"}</Button>
  </div>
  <div class="fb-edit__row fb-edit__row--wrap">
    <Field label="ID" bind:value={draft.id} text readonly={!isNew} error={errors.id} width={140} />
    <Field label="LABEL" bind:value={draft.label} text error={errors.label} width={140} />
    <Field label="FREQUENCY" bind:value={draft.freq_mhz} unit="MHz" error={errors.freq_mhz} width={110} />
    <Field label="RAILROAD" bind:value={draft.railroad} text error={errors.railroad} width={80} />
    <Field label="USE" bind:value={draft.use} text error={errors.use} width={110} />
    <Field label="LINE" bind:value={draft.line} text width={110} />
    <Field label="MODE" bind:value={draft.mode} width={56} />
    <SelectField label="CONFIDENCE" bind:value={draft.confidence} options={confidence} width={96} />
    <Field label="SOURCE URL" bind:value={draft.source} text width={260} />
    <Button primary onclick={save}>SAVE</Button>
    {#if frequency}<Button onclick={() => destroy(false)}>DELETE</Button>{/if}
  </div>
  {#if blockedBy}
    <p class="fb-form__fail" role="alert">{blockedBy}. <Button sm onclick={() => destroy(true)}>REMOVE FROM BANKS AND DELETE</Button></p>
  {/if}
  {#if failure}<p class="fb-form__fail" role="alert">{failure}</p>{/if}
</div>

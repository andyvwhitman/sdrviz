<script lang="ts">
  import { untrack } from "svelte";
  /** Add or edit a feed; edit also offers the typed-confirmation delete (spec 5.22: destructive actions). */
  import Button from "$lib/components/Button.svelte";
  import Checkbox from "$lib/components/Checkbox.svelte";
  import Field from "$lib/components/Field.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { ApiError } from "$lib/api/client";
  import { catalogue } from "./catalogue.svelte";
  import { configFrom, draftFrom, DRIVERS, emptyDraft, validateFeed, type FeedDraft, type FeedErrors } from "./feedForm";
  import SelectField from "./SelectField.svelte";
  import type { FeedConfig } from "./types";

  interface Props {
    /** the feed to edit; null adds a new one */
    feed: FeedConfig | null;
    existingIds: string[];
    ondone: (savedId: string | null) => void;
  }
  let { feed, existingIds, ondone }: Props = $props();

  // The form is keyed by its feed in the screen, so its initial values are all it ever needs.
  const initial = untrack(() => feed);
  const isNew = initial == null;
  let draft = $state<FeedDraft>(initial ? draftFrom(initial) : emptyDraft());
  let errors = $state<FeedErrors>({});
  let failure = $state("");
  let busy = $state(false);
  let confirmText = $state("");

  const driverOptions = DRIVERS.map((d) => ({ value: d, text: d }));
  const networked = $derived(draft.driver !== "file");

  async function save(): Promise<void> {
    errors = validateFeed(draft, isNew, existingIds);
    if (Object.keys(errors).length) return;
    await attempt(async () => {
      await catalogue.saveFeed(configFrom(draft), isNew);
      ondone(draft.id);
    });
  }

  async function remove(): Promise<void> {
    await attempt(async () => {
      await catalogue.deleteFeed(draft.id);
      ondone(null);
    });
  }

  async function attempt(action: () => Promise<void>): Promise<void> {
    busy = true;
    failure = "";
    try {
      await action();
    } catch (error) {
      failure = error instanceof ApiError ? error.message : "Backend unreachable";
    } finally {
      busy = false;
    }
  }

  function toggleHears(id: string, on: boolean): void {
    draft.hears = on ? [...draft.hears, id] : draft.hears.filter((h) => h !== id);
  }
</script>

<div class="fb-col fb-col--insp">
  <section class="fb-insp br fb-form" aria-label={isNew ? "New feed" : "Edit feed"}>
    <header class="fb-insp__head">
      <span class="t-panel">{isNew ? "NEW FEED" : `EDIT FEED · ${initial?.short ?? draft.id}`}</span>
      <span class="grow"></span>
      <Button sm onclick={() => ondone(null)}>CANCEL</Button>
      <Button sm primary disabled={busy} onclick={save}>SAVE</Button>
    </header>
    {#if failure}<p class="fb-form__fail" role="alert">{failure}</p>{/if}

    <div class="fb-form__grid">
      <Field label="FEED ID" bind:value={draft.id} text readonly={!isNew} error={errors.id} hint={isNew ? "Permanent. e.g. feed-ann" : undefined} />
      <Field label="NAME" bind:value={draft.name} text error={errors.name} hint="Callsign first: ALX-01 Alexandria" />
      <Field label="SHORT" bind:value={draft.short} text hint="Derived from the name when empty" />
      <Field label="SITE" bind:value={draft.site} text />
      <Field label="LATITUDE" bind:value={draft.lat} unit="°" error={errors.lat} />
      <Field label="LONGITUDE" bind:value={draft.lon} unit="°" error={errors.lon} />
      <Field label="COVERAGE RADIUS" bind:value={draft.coverage_radius_km} unit="km" error={errors.coverage_radius_km} />
      <SelectField label="DRIVER" bind:value={draft.driver} options={driverOptions} />
      <Field label="HOST" bind:value={draft.host} disabled={!networked} error={errors.host} />
      <Field label="PORT" bind:value={draft.port} disabled={!networked} error={errors.port} />
      <Field label="CENTRE" bind:value={draft.center_mhz} unit="MHz" error={errors.center_mhz} />
      <Field label="SAMPLE RATE" bind:value={draft.sample_rate_msps} unit="MS/s" error={errors.sample_rate_msps} />
      <Field label="GAIN" bind:value={draft.gain_db} unit="dB" error={errors.gain_db} disabled={!isNew} hint={isNew ? undefined : "Locked: the backend returns the measured value"} />
      <Field label="PPM" bind:value={draft.ppm} error={errors.ppm} disabled={!isNew} />
      <Field label="NOISE FLOOR" bind:value={draft.noise_floor_dbfs} unit="dBFS" error={errors.noise_floor_dbfs} disabled={!isNew} />
      <div class="fb-form__flags">
        <Toggle label="ENABLED" bind:checked={draft.enabled} />
        <Checkbox label="SIMULATED" bind:checked={draft.sim} />
      </div>
    </div>

    <h4 class="fb-form__h">HEARS · {draft.hears.length} CH</h4>
    <div class="fb-form__hears">
      {#each catalogue.frequencies as f (f.id)}
        <Checkbox label={`CH${String(f.aar_channel).padStart(2, "0")}`} checked={draft.hears.includes(f.id)} onchange={(on) => toggleHears(f.id, on)} />
      {/each}
    </div>

    {#if !isNew}
      <div class="fb-form__danger">
        <Field label="TYPE THE FEED ID TO DELETE" bind:value={confirmText} text placeholder={draft.id} width={240} hint="Recorded transmissions keep their history." />
        <Button disabled={busy || confirmText !== draft.id} onclick={remove}>DELETE FEED</Button>
      </div>
    {/if}
  </section>
</div>

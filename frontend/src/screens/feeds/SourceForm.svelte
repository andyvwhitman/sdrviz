<script lang="ts">
  /** Add or edit a transit source: every field of the source, the API key write-only. */
  import { untrack } from "svelte";
  import Button from "$lib/components/Button.svelte";
  import Checkbox from "$lib/components/Checkbox.svelte";
  import Field from "$lib/components/Field.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import SelectField from "./SelectField.svelte";
  import { configFrom, draftFrom, emptyDraft, KINDS, validateSource, withKind, type SourceDraft, type SourceErrors } from "./sourceForm";
  import type { SourceConfig, SourceKind, TransitSource } from "$lib/types/sources";

  interface Props {
    /** the source to edit; null adds a new one */
    source: TransitSource | null;
    existingIds: string[];
    onsave: (config: SourceConfig, isNew: boolean) => Promise<void>;
    oncancel: () => void;
  }
  let { source, existingIds, onsave, oncancel }: Props = $props();

  // The form is keyed by its source in the screen, so its initial values are all it ever needs.
  const isNew = untrack(() => source) == null;
  let draft = $state<SourceDraft>(untrack(() => (source ? draftFrom(source) : emptyDraft())));
  let errors = $state<SourceErrors>({});
  let failure = $state("");
  let busy = $state(false);

  const realtime = $derived(draft.kind === "gtfs");

  function pickKind(kind: SourceKind): void {
    if (isNew) draft = withKind(draft, kind);
    else draft.kind = kind;
  }

  async function save(): Promise<void> {
    errors = validateSource(draft, isNew, existingIds);
    if (Object.keys(errors).length) return;
    busy = true;
    failure = "";
    try {
      await onsave(configFrom(draft), isNew);
    } catch (error) {
      failure = error instanceof Error ? error.message : "Backend unreachable";
      busy = false;
    }
  }
</script>

<section class="src-card src-form br" aria-label={isNew ? "New source" : "Edit source"}>
  <header class="src-card__head">
    <span class="t-panel">{isNew ? "NEW SOURCE" : `EDIT · ${source?.name}`}</span>
    <span class="grow"></span>
    <Button sm onclick={oncancel}>CANCEL</Button>
    <Button sm primary disabled={busy} onclick={save}>{busy ? "SAVING…" : "SAVE"}</Button>
  </header>
  {#if failure}<p class="src-card__error" role="alert">{failure}</p>{/if}

  <div class="src-form__grid">
    <SelectField label="KIND" options={KINDS} bind:value={() => draft.kind, (kind) => pickKind(kind as SourceKind)} />
    <Field label="ID" bind:value={draft.id} text readonly={!isNew} error={errors.id} hint={isNew ? "Permanent. e.g. septa" : undefined} />
    <div class="src-form__flags"><Toggle label="ENABLED" bind:checked={draft.enabled} /></div>
    <Field label="NAME" bind:value={draft.name} text error={errors.name} hint="MARC Train" />
    <Field label="AGENCY" bind:value={draft.agency} text error={errors.agency} hint="Display operator name" />
    <Field label="ROUTE TYPES" bind:value={draft.route_types} error={errors.route_types} hint="GTFS route_type filter, e.g. 2. Empty: all" />

    <div class="src-form__wide">
      <Field label={draft.kind === "amtraker" ? "STATIC GTFS URL (OPTIONAL)" : "STATIC GTFS URL"} bind:value={draft.static_url} text error={errors.static_url} />
    </div>
    {#if realtime}
      <div class="src-form__wide"><Field label="TRIP UPDATES URL" bind:value={draft.rt_trip_updates_url} text error={errors.rt_trip_updates_url} /></div>
      <div class="src-form__wide"><Field label="VEHICLE POSITIONS URL" bind:value={draft.rt_vehicle_positions_url} text error={errors.rt_vehicle_positions_url} /></div>
      <div class="src-form__wide"><Field label="ALERTS URL" bind:value={draft.rt_alerts_url} text error={errors.rt_alerts_url} /></div>
    {/if}

    <Field
      label="API KEY"
      type="password"
      bind:value={draft.api_key}
      placeholder={draft.has_key ? "stored · type to replace" : ""}
      hint="Write-only: the backend never returns it"
      disabled={draft.clear_key}
    />
    <Field label="KEY HEADER" bind:value={draft.key_header} text hint="Header or query parameter name" />
    <div class="src-form__flags">{#if draft.has_key}<Checkbox label="CLEAR STORED KEY" bind:checked={draft.clear_key} />{/if}</div>
    <Field label="STATIC REFRESH" bind:value={draft.static_refresh_h} unit="h" error={errors.static_refresh_h} />
    {#if draft.kind !== "lines"}
      <Field label="REALTIME POLL" bind:value={draft.rt_poll_s} unit="s" error={errors.rt_poll_s} />
    {/if}
  </div>
</section>

<script lang="ts">
  /**
   * Map inspector (brief 8.3, 9.5): overlays the right 480 px of the canvas. The selected item's data block is the
   * Map hero: its ID at 48 px, line 2 at 13 px. Three kinds: a tracked train, a feed site (a faulted one carries
   * the ACTIONS block with ACK) and a place.
   */
  import type { Snippet } from "svelte";
  import { api } from "$lib/api/client";
  import Button from "$lib/components/Button.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import KeyValue from "$lib/components/KeyValue.svelte";
  import MilepostTag from "$lib/components/MilepostTag.svelte";
  import PositionGlyph from "$lib/components/PositionGlyph.svelte";
  import SimTag from "$lib/components/SimTag.svelte";
  import * as fmt from "$lib/hud/fmt";
  import { chToMhz } from "$lib/hud/band";
  import { feedName } from "$lib/hud/roles";
  import type { GlyphState } from "$lib/hud/tile";
  import { router } from "$lib/router.svelte";
  import { live } from "$lib/stores/live.svelte";
  import type { Feed, Reception, TrainPosition } from "$lib/types/live";
  import type { FeedLook } from "./lib/inputs";
  import { shortName } from "./lib/labelPlacer";
  import type { Selection } from "./lib/selection";
  import type { MapData, Place, Route } from "./lib/types";

  interface Props {
    selection: Selection;
    data: MapData;
    /** feed looks by id (the inspector reads the same tone as the map) */
    looks: Record<string, FeedLook>;
    onclose: () => void;
  }
  let { selection, data, looks, onclose }: Props = $props();

  const snap = $derived(live.state!);
  const active = $derived(snap.active_transmissions);
  const placeById = $derived(
    Object.fromEntries([...data.places.stations, ...data.places.landmarks, ...data.places.detectors].map((p) => [p.id, p] as const)),
  );

  /** A train's ROUTE row names the count it is on: "NEC" on the NEC count, "CFP · RF&P" on the RF&P count. */
  function countName(route: Route | undefined, t: TrainPosition): string {
    if (!route) return t.route_id;
    const parts = route.name.split(" · ");
    if (parts.length < 2 || !t.prefix) return route.name;
    if (parts.includes(t.prefix)) return t.prefix;
    return [t.prefix, ...parts.filter((x) => x !== "NEC")].join(" · ");
  }

  const reception = (r: Reception): string => `${fmt.snr(r.snr_db)} · ${fmt.dbfs(r.rssi_dbfs)} · ${(r.dist_km ?? 0).toFixed(1)} KM`;

  let acking = $state(false);
  async function ack(feed: Feed): Promise<void> {
    acking = true;
    try {
      await api.feeds.ack(feed.id);
    } finally {
      acking = false;
    }
  }
</script>

{#snippet hero(id: string, cls: string, sim: boolean, line2: string)}
  <div class="mp-insp-lead">
    <div class="hero__big mp-insp-hero {cls}">{id}</div>
    <div class="mp-insp-sub">{#if sim}<SimTag />{/if}<span>{line2}</span></div>
  </div>
{/snippet}

{#snippet head(title: string, kind: string, glyph: GlyphState | null, sim: boolean, lead: Snippet)}
  <div class="inspector__head">
    {#if glyph}<PositionGlyph state={glyph} />{/if}
    <span class="t-panel">{title}</span>
    {#if sim}<SimTag />{/if}
    <Chip text="ESC" button onclick={onclose} />
  </div>
  <div class="inspector__kind">{kind}</div>
  {@render lead()}
{/snippet}

<aside class="inspector br" aria-label="Inspector">
  {#if selection.kind === "train"}
    {@const t = selection.train}
    {@const id = fmt.trainId(t.train_id)}
    {@const tx = active.find((a) => a.train_id === t.train_id)}
    {@const ch = fmt.channelNumber(t.channel ?? "")}
    {@const next = t.next_stop ? placeById[t.next_stop] : undefined}
    {#snippet lead()}{@render hero(id, tx ? "is-tx" : "", t.sim, t.data_block[1])}{/snippet}
    {@render head(id, `TRACKED TRAIN · ${t.line}`, tx ? "tx" : null, t.sim, lead)}
    <section class="inspector__sec">
      <h4>POSITION</h4>
      <div class="mp-insp-mp">
        <MilepostTag mp={t.mp_label.replace("≈", "")} />
        <div>
          <KeyValue label="ROUTE" value={countName(data.routes.routes.find((r) => r.id === t.route_id), t)} />
          <KeyValue label="DIRECTION" value={t.direction} />
          <KeyValue label="SPEED" value={String(t.speed_mph)} unit="MPH" />
          <KeyValue label="NEXT STOP" value={next && t.next_stop_t != null ? `${shortName(next)} · ${fmt.clock(t.next_stop_t, snap.tz.name).slice(0, 5)}` : fmt.BLANK} />
        </div>
      </div>
    </section>
    <section class="inspector__sec">
      <h4>CHANNEL</h4>
      <KeyValue label="CHANNEL" value="{t.channel ?? fmt.BLANK} · {fmt.aar(ch || null)}" />
      <KeyValue label="FREQUENCY" value={fmt.freq(ch ? chToMhz(ch) : null)} unit="MHz" />
    </section>
    {#if tx}
      <section class="inspector__sec">
        <h4>RECEPTIONS · {tx.receptions?.length ?? 0}</h4>
        {#each tx.receptions ?? [] as r (r.feed_id)}
          <KeyValue label="{feedName(r.feed_id)}{r.feed_id === tx.feed_id ? ' · PRIMARY' : ''}" value={reception(r)} />
        {/each}
      </section>
    {/if}
  {:else if selection.kind === "feed"}
    {@const f = selection.feed}
    {@const look = looks[f.id]}
    {@const heard = active.filter((a) => a.receptions?.some((r) => r.feed_id === f.id))}
    {#snippet lead()}
      {@render hero(f.short, look.fault ? "mp-hero-fault" : look.stale ? "mp-hero-stale" : look.glyph === "tx" ? "is-tx" : "", f.sim, look.l2)}
    {/snippet}
    {@render head(f.short, `FEED SITE · ${f.site}`, look.glyph === "idle-dim" ? "idle" : look.glyph, f.sim, lead)}
    <section class="inspector__sec">
      <h4>SITE</h4>
      <KeyValue label="LOCATION" value="{f.lat.toFixed(4)} N · {Math.abs(f.lon).toFixed(4)} W" />
      <KeyValue label="COVERAGE RADIUS" value={String(f.coverage_radius_km)} unit="KM" />
      <KeyValue label="CENTRE" value={fmt.freq(f.center_mhz)} unit="MHz" />
    </section>
    <section class="inspector__sec">
      <h4>STATE</h4>
      <KeyValue label="STATE" value={look.fault ? f.label : look.stale ? "STALE" : "OK"} />
      {#if look.fault || look.stale}
        <KeyValue label="IN STATE" value={f.in_state_label || fmt.BLANK} />
      {:else}
        <KeyValue label="SNR" value={fmt.snr(f.snr_db)} />
      {/if}
      <KeyValue label="LAST SAMPLE" value={fmt.age(f.last_sample_age_s, "age")} />
      {#if look.fault}<KeyValue label="ACK" value={f.acked ? "ACK'D" : "UNACKED"} />{/if}
    </section>
    {#if look.fault}
      <section class="inspector__sec">
        <h4>ACTIONS</h4>
        <div class="insp-btns">
          <Button primary={!f.acked} disabled={f.acked || acking} onclick={() => ack(f)}>{f.acked ? "ACK'D" : "ACK"}</Button>
          <Button onclick={() => router.go(`/feeds?feed=${f.id.replace(/^feed-/, "")}`)}>OPEN IN FEEDS &amp; BANKS</Button>
        </div>
      </section>
    {/if}
    <section class="inspector__sec">
      <h4>HEARING NOW · {heard.length}</h4>
      {#each heard as tx (tx.id)}
        {@const r = tx.receptions!.find((x) => x.feed_id === f.id)!}
        <KeyValue label="{tx.aar} · {fmt.trainId(tx.train_id ?? tx.speaker)}{tx.feed_id === f.id ? ' · PRIMARY' : ''}" value={reception(r)} />
      {:else}
        <KeyValue label="ON AIR" value={fmt.BLANK} />
      {/each}
    </section>
  {:else}
    {@const p = selection.place as Place}
    {@const here = snap.trains.positions.filter((t) => t.next_stop === p.id || t.at_place === p.id)}
    {#snippet lead()}{@render hero(shortName(p), "", false, `${p.lat.toFixed(4)} N · ${Math.abs(p.lon).toFixed(4)} W`)}{/snippet}
    {@render head(shortName(p), `${p.kind.toUpperCase()}${p.milepost ? ` · ${p.milepost}` : ""}`, null, false, lead)}
    <section class="inspector__sec">
      <h4>SERVED BY · {p.lines?.length ?? 0}</h4>
      {#each p.lines ?? [] as line, i (line)}<KeyValue label={String(i + 1).padStart(2, "0")} value={line} />{:else}<KeyValue label="LINES" value={fmt.BLANK} />{/each}
    </section>
    <section class="inspector__sec">
      <h4>TRAINS AT OR NEXT TO · {here.length}</h4>
      {#each here as t (t.train_id)}
        <KeyValue label={fmt.trainId(t.train_id)} value={t.at_place === p.id ? "AT STATION" : `DUE ${t.next_stop_t != null ? fmt.clock(t.next_stop_t, snap.tz.name).slice(0, 5) : fmt.BLANK}`} />
      {:else}
        <KeyValue label="TRAINS" value={fmt.BLANK} />
      {/each}
    </section>
  {/if}
</aside>

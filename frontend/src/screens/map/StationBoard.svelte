<script lang="ts">
  /**
   * Departures board for a station (GET /api/transit/stations/{id}/board): the next trains and those that left
   * in the last 30 minutes, scheduled against realtime time, with the track when the agency gives one.
   */
  import { api } from "$lib/api/client";
  import { BLANK } from "$lib/hud/fmt";
  import type { Board, BoardEntry } from "$lib/types/transit";
  import { trainTag } from "./lib/transitView";

  interface Props {
    placeId: string;
  }
  let { placeId }: Props = $props();

  const REFRESH_MS = 30_000;
  const UPCOMING_ROWS = 8;
  const DEPARTED_ROWS = 6;

  let board = $state.raw<Board | null>(null);
  let failed = $state(false);

  $effect(() => {
    const id = placeId;
    board = null;
    failed = false;
    let live = true;
    const load = async (): Promise<void> => {
      try {
        const next = await api.transit.board(id);
        if (live) [board, failed] = [next, false];
      } catch {
        if (live) failed = true;
      }
    };
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  });

  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
  const hhmm = (iso: string | null): string => (iso ? clock.format(new Date(iso)) : BLANK);
  const tone = (e: BoardEntry): string => (e.status === "cancelled" ? "is-fault" : "");
  const label = (e: BoardEntry): string => (e.event === "arrival" ? `${e.status === "cancelled" ? "CANCELLED" : "ARRIVES"}` : e.status.toUpperCase());
</script>

{#snippet rows(list: BoardEntry[])}
  {#each list as e (`${e.agency}-${e.train}-${e.scheduled}`)}
    <div class="bd-row {tone(e)}" title="{e.route ?? ''} · {label(e)}">
      <span class="bd-t">{hhmm(e.scheduled)}</span>
      <span class="bd-t bd-est">{e.estimated && hhmm(e.estimated) !== hhmm(e.scheduled) ? hhmm(e.estimated) : ""}</span>
      <span class="bd-n">{trainTag(e)}</span>
      <span class="bd-d">{e.event === "arrival" ? `FROM ${e.origin ?? BLANK}` : (e.headsign ?? e.route ?? BLANK)}</span>
      <span class="bd-k">{e.track ? `TRK ${e.track}` : label(e)}</span>
    </div>
  {/each}
{/snippet}

{#if board && board.sources.length}
  <section class="inspector__sec">
    <h4>DEPARTURES · {board.upcoming.length}</h4>
    {@render rows(board.upcoming.slice(0, UPCOMING_ROWS))}
    {#if !board.upcoming.length}<div class="bd-none">NO TRAINS IN THE NEXT 3 HOURS</div>{/if}
  </section>
  <section class="inspector__sec">
    <h4>DEPARTED · LAST 30 MIN · {board.departed.length}</h4>
    {@render rows(board.departed.slice(0, DEPARTED_ROWS))}
    {#if !board.departed.length}<div class="bd-none">NONE</div>{/if}
    {#each board.attribution as a (a)}<div class="bd-attrib">{a}</div>{/each}
  </section>
{:else if board}
  <section class="inspector__sec">
    <h4>DEPARTURES</h4>
    <div class="bd-none">NO PASSENGER SERVICE DATA FOR THIS PLACE</div>
  </section>
{:else if failed}
  <section class="inspector__sec">
    <h4>DEPARTURES</h4>
    <div class="bd-none">BOARD UNAVAILABLE</div>
  </section>
{/if}

<style>
  .bd-row { display: grid; grid-template-columns: 44px 44px 100px 1fr auto; gap: 8px; align-items: baseline; padding: 5px 0; border-bottom: 1px solid var(--grid); font: var(--type-name); letter-spacing: var(--track-name); text-transform: uppercase; color: var(--ink); }
  .bd-t { font: var(--type-num); font-variant-numeric: tabular-nums; }
  .bd-est { color: var(--ink-2); }
  .bd-n { white-space: nowrap; }
  .bd-d { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-2); text-transform: uppercase; }
  .bd-k { font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: 0.08em; color: var(--ink-3); white-space: nowrap; }
  .is-fault .bd-n, .is-fault .bd-k { color: var(--state-fault); text-decoration: line-through; }
  .bd-none, .bd-attrib { padding: 6px 0; font: 500 var(--fs-11)/1.2 var(--font-label); letter-spacing: 0.08em; color: var(--ink-3); text-transform: uppercase; }
</style>

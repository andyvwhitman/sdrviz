/**
 * Bootstrap sequence (docs/build-plan.md A2): read URL params, POST /sim/jump if `scenario`,
 * load the session, open the socket. `<html data-ready="1">` is set after the first snapshot
 * (see ws/connection.ts) or, on /login, once the session is known; the screenshot script waits on it.
 */

import { api, setUnauthorizedHandler } from "./api/client";
import { applyParamsToDocument, params } from "./params";
import { listen } from "./stores/listen.svelte";
import { session } from "./stores/session.svelte";
import { connect, disconnect } from "./ws/connection";

let jumped = false;

/** Apply ?scenario= once, before the first socket opens. `freeze=1` stops the clock for deterministic frames. */
async function jumpToScenario(): Promise<void> {
  if (jumped || !params.scenario) return;
  jumped = true;
  const sim = await api.sim
    .jump({ scenario: params.scenario, speed: params.freeze ? 0 : params.speed })
    .catch((error) => console.warn("sim jump failed", error));
  if (sim?.scenario_feed) listen.choose(sim.scenario_feed); // the scenario is about that node; this browser follows it
}

/** Everything that needs a logged-in session. */
let generation = 0;

export async function startLive(): Promise<void> {
  const mine = ++generation;
  await jumpToScenario();
  if (mine !== generation) return; // stopped (logout, 401) while the jump was in flight
  connect();
}

export function stopLive(): void {
  generation++;
  disconnect();
}

/** Called once from main.ts. */
export async function boot(): Promise<void> {
  applyParamsToDocument();
  setUnauthorizedHandler(() => session.expire());
  await session.check();
}

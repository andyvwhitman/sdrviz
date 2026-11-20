/**
 * Listen while held: the one hold this browser has. It sends listen_hold / listen_release, plays the held channel,
 * and shows only what the server says (listen_state): never a state it has not sent.
 */
import { audio } from "$lib/stores/audio.svelte";
import { live } from "$lib/stores/live.svelte";
import { sendOp } from "$lib/ws/connection";
import { holdFailed, type ServerState } from "./gesture";
import { listenFlash } from "./listenFlash.svelte";

interface Held {
  feedId: string;
  channel: number;
}

class ListenHold {
  held = $state<Held | null>(null);
  /** the last listen_state for the held channel */
  state = $state<ServerState | null>(null);
  /** when `state` last changed, for the timer and the no-response wait */
  since = $state(0);
  /** ticks while held, so the plate's timer moves */
  now = $state(Date.now());
  #tick: ReturnType<typeof setInterval> | undefined;
  /** what the plate showed last, kept for the 400 ms after release */
  lastText = "";

  constructor() {
    live.on("listen_state", (message) => {
      const held = this.held;
      if (!held || message.feed_id !== held.feedId || message.aar_channel !== held.channel) return;
      this.#set(message.state);
      if (message.state === "failed" || message.state === "released") {
        // the server dropped it: the bracket retracts, a new press retries
        this.#stop();
        if (message.state === "failed") listenFlash.say(holdFailed(held.channel, message.reason));
      }
    });
    // a reconnect is a new server client: ask again for what is still held
    live.on("snapshot", () => this.held && sendOp({ op: "listen_hold", feed_id: this.held.feedId, aar_channel: this.held.channel }));
  }

  /** the pointer went down long enough */
  begin(feedId: string, channel: number): void {
    this.held = { feedId, channel };
    this.#set(null);
    this.now = Date.now();
    this.#tick = setInterval(() => (this.now = Date.now()), 1000);
    audio.hold(channel);
    sendOp({ op: "listen_hold", feed_id: feedId, aar_channel: channel });
  }

  /** every 5 s while held */
  renew(): void {
    if (this.held) sendOp({ op: "listen_hold", feed_id: this.held.feedId, aar_channel: this.held.channel });
  }

  /** release, cancel, blur, leave, unmount */
  end(): void {
    if (!this.held) return;
    sendOp({ op: "listen_release", feed_id: this.held.feedId, aar_channel: this.held.channel });
    this.#stop();
  }

  #set(state: ServerState | null): void {
    if (state !== null && state === this.state) return; // a repeated answer does not restart the timer
    this.state = state;
    this.since = Date.now();
  }

  #stop(): void {
    clearInterval(this.#tick);
    this.held = null;
    this.state = null;
    audio.hold(null);
  }
}

export const listenHold = new ListenHold();

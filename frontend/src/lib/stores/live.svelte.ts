/** The live state: one reactive LiveState, updated in place by WebSocket deltas. */

import type { LiveState } from "$lib/types/live";
import type { MessageOf, ServerMessage, ServerMessageType } from "$lib/ws/protocol";
import { applyMessage } from "./reduce";

type Handler<T extends ServerMessageType> = (message: MessageOf<T>) => void;

class LiveStore {
  /** null until the first snapshot arrives */
  state = $state<LiveState | null>(null);
  /** sim clock speed from `hello` (0 when frozen) */
  simSpeed = $state(1);

  private handlers = new Map<ServerMessageType, Set<(message: ServerMessage) => void>>();

  /** Apply one server message, then tell subscribers (live-ops listens for keyup, lofar_row, ...). */
  apply(message: ServerMessage): void {
    if (message.type === "hello") this.simSpeed = message.sim.speed;
    else if (message.type === "snapshot") this.state = snapshotOf(message);
    else if (this.state) applyMessage(this.state, message);
    this.handlers.get(message.type)?.forEach((handler) => handler(message));
  }

  /** Subscribe to one message type; returns the unsubscribe function. */
  on<T extends ServerMessageType>(type: T, handler: Handler<T>): () => void {
    const set = this.handlers.get(type) ?? new Set();
    const listener = handler as unknown as (message: ServerMessage) => void;
    set.add(listener);
    this.handlers.set(type, set);
    return () => set.delete(listener);
  }

  reset(): void {
    this.state = null;
  }
}

/** A snapshot carries the LiveState either under `state` or flattened next to `type`. */
function snapshotOf(message: MessageOf<"snapshot">): LiveState {
  if ("state" in message && message.state) return message.state;
  const { type: _type, ...rest } = message as unknown as { type: string } & LiveState;
  return rest as LiveState;
}

export const live = new LiveStore();

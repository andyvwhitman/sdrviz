/** Wires the live socket to the stores. One connection per page. */

import { live } from "$lib/stores/live.svelte";
import { levels } from "$lib/stores/levels.svelte";
import { link } from "$lib/stores/link.svelte";
import { session } from "$lib/stores/session.svelte";
import { spectrum } from "$lib/stores/spectrum.svelte";
import { LiveSocket } from "./client";
import type { BinaryFrame, ClientOp, ServerMessage } from "./protocol";

type AudioListener = (frame: Extract<BinaryFrame, { kind: "audio" }>) => void;

const audioListeners = new Set<AudioListener>();

/** The kit audio engine subscribes here for live audio chunks. */
export function onAudioFrame(listener: AudioListener): () => void {
  audioListeners.add(listener);
  return () => audioListeners.delete(listener);
}

function handleMessage(message: ServerMessage): void {
  live.apply(message);
  if (message.type === "snapshot") {
    link.gotData();
    document.documentElement.dataset.ready = "1";
  } else if (message.type === "level") {
    levels.push(message.levels);
  }
}

function handleBinary(frame: BinaryFrame): void {
  if (frame.kind === "spectrum") spectrum.push(frame);
  else audioListeners.forEach((listener) => listener(frame));
}

const socket = new LiveSocket({
  onOpen: () => spectrum.resume(),
  onClose: (_code, retrying) => {
    link.lost();
    if (!retrying) session.expire(); // 4401: the session is gone, the router sends us to /login
  },
  onMessage: handleMessage,
  onBinary: handleBinary,
});

spectrum.bind((feedId) => socket.send({ op: "watch", feed_id: feedId }));

export const sendOp = (op: ClientOp): void => socket.send(op);

/** Open the socket (idempotent). Call after the session is known to be authenticated. */
export function connect(): void {
  link.lost(); // the outage clock starts now, so a dead backend reaches RECONNECTING then NO LINK
  socket.start();
}

export function disconnect(): void {
  socket.stop();
  live.reset();
}

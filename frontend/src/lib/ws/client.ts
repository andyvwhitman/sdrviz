/** Reconnecting WebSocket: decodes JSON and binary frames and reports open/close to its owner. */

import { backoffDelayS } from "./link";
import { decodeBinary, type BinaryFrame, type ClientOp, type ServerMessage } from "./protocol";

/** Server closes with 4401 when the session cookie is missing or expired. */
export const CLOSE_UNAUTHENTICATED = 4401;

export interface LiveSocketHandlers {
  onOpen(): void;
  /** Called on every close; `retrying` is false for 4401 (the owner should go to /login). */
  onClose(code: number, retrying: boolean): void;
  onMessage(message: ServerMessage): void;
  onBinary(frame: BinaryFrame): void;
}

export function liveSocketUrl(): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws/live`;
}

export class LiveSocket {
  private socket: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private stopped = true;

  constructor(
    private readonly handlers: LiveSocketHandlers,
    private readonly url: () => string = liveSocketUrl,
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.attempt = 0;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.socket?.close();
    this.socket = null;
  }

  send(op: ClientOp): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(op));
  }

  private open(): void {
    const socket = new WebSocket(this.url());
    socket.binaryType = "arraybuffer";
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.handlers.onOpen();
    };
    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data === "string") this.handlers.onMessage(JSON.parse(event.data) as ServerMessage);
      else this.handlers.onBinary(decodeBinary(event.data as ArrayBuffer));
    };
    socket.onclose = (event: CloseEvent) => {
      if (this.socket !== socket) return; // a superseded socket
      this.socket = null;
      const retrying = !this.stopped && event.code !== CLOSE_UNAUTHENTICATED;
      this.handlers.onClose(event.code, retrying);
      if (retrying) this.scheduleRetry();
      else this.stopped = true;
    };
    // `error` is always followed by `close`, which does the work.
  }

  private scheduleRetry(): void {
    const delayMs = backoffDelayS(this.attempt++) * 1000;
    this.retryTimer = setTimeout(() => this.open(), delayMs);
  }
}

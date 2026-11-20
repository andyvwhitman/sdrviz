/**
 * Waterfall gestures (direction section 5): the pure logic. A press on a channel slot is a short click (select), or,
 * held long enough without moving, a listen-while-held. The wall wires pointer events to `Press`; the hold store
 * sends the ops. Texts for the plate are plain functions here so every row of the table is testable.
 */

/** a press shorter than this is a click; one held this long starts listening */
export const HOLD_MS = 300;
/** the hold must not drift further than this (px) before it starts */
export const MOUSE_SLOP = 6;
export const TOUCH_SLOP = 8;
/** the server drops a hold after 15 s without a renewal */
export const RENEW_MS = 5000;
/** still tuning after this long: the node is not answering */
export const NO_RESPONSE_MS = 5000;

export interface PressHandlers {
  /** a short press on a channel; absent on the phone (no select there) */
  onClick?: (channel: number) => void;
  onHold: (channel: number) => void;
  /** every RENEW_MS while the hold lasts */
  onRenew: (channel: number) => void;
  /** the hold ended, whatever the reason */
  onRelease: (channel: number) => void;
}

/** One left press (or one touch) on a channel slot, from pointer down to pointer up or cancel. */
export class Press {
  #x: number;
  #y: number;
  #slop: number;
  #moved = false;
  #holding = false;
  #done = false;
  #holdTimer: ReturnType<typeof setTimeout>;
  #renewTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    readonly channel: number,
    x: number,
    y: number,
    touch: boolean,
    private handlers: PressHandlers,
  ) {
    this.#x = x;
    this.#y = y;
    this.#slop = touch ? TOUCH_SLOP : MOUSE_SLOP;
    this.#holdTimer = setTimeout(() => this.#startHold(), HOLD_MS);
  }

  get holding(): boolean {
    return this.#holding;
  }

  /** Moving further than the slop before the hold starts makes this a drag: neither a click nor a hold. */
  move(x: number, y: number): void {
    if (this.#holding || this.#moved) return;
    if (Math.hypot(x - this.#x, y - this.#y) >= this.#slop) {
      this.#moved = true;
      clearTimeout(this.#holdTimer);
    }
  }

  /** The button or finger came up. */
  up(): void {
    if (this.#done) return;
    const click = !this.#holding && !this.#moved;
    this.#end();
    if (click) this.handlers.onClick?.(this.channel);
  }

  /** pointercancel, Escape, window blur, pointer leave, unmount: ends the hold, never clicks */
  cancel(): void {
    if (!this.#done) this.#end();
  }

  #startHold(): void {
    this.#holding = true;
    this.handlers.onHold(this.channel);
    this.#renewTimer = setInterval(() => this.handlers.onRenew(this.channel), RENEW_MS);
  }

  #end(): void {
    this.#done = true;
    clearTimeout(this.#holdTimer);
    clearInterval(this.#renewTimer);
    if (this.#holding) this.handlers.onRelease(this.channel);
    this.#holding = false;
  }
}

/* ---------------------------------------------------------------- right-click */

export type RightClick = "add" | "needs-admin" | "already" | "none";

/** What a right-click on a slot does: only an admin adds, and only what is not enabled on the node yet. */
export function rightClickAction(channel: number | null, isAdmin: boolean, listed: boolean): RightClick {
  if (channel === null) return "none";
  if (!isAdmin) return "needs-admin";
  return listed ? "already" : "add";
}

/* ---------------------------------------------------------------- plate texts */

/** ink: normal; ink-2: a refusal or a wait; fault: a failed action the user can retry */
export type Tone = "ink" | "ink-2" | "fault";
export interface Message {
  text: string;
  tone: Tone;
  /** how long it stays, in ms */
  ms: number;
}

export const chName = (ch: number): string => `CH${String(ch).padStart(2, "0")}`;
/** the four-digit form of a channel number: 54 is "5454", 7 is "0707" */
export const aar4 = (ch: number): string => String(ch).padStart(2, "0").repeat(2);

/** The plate for a short click on a slot that is not in the list. */
export function unlistedClick(ch: number, isAdmin: boolean): Message {
  return { text: `${chName(ch)} NOT ENABLED${isAdmin ? " · RIGHT-CLICK TO ADD" : ""}`, tone: "ink-2", ms: 2500 };
}

/** The cursor's second line after a dwell on a slot. */
export function dwellHint(listed: boolean, isAdmin: boolean): string {
  if (listed) return "CLICK TO SELECT · HOLD TO LISTEN";
  return isAdmin ? "HOLD TO LISTEN · RIGHT-CLICK TO ADD" : "HOLD TO LISTEN";
}

export const addingMessage = (ch: number): Message => ({ text: `ADDING · ${chName(ch)} …`, tone: "ink-2", ms: 30000 });
export const needsAdmin = (): Message => ({ text: "□ ADDING NEEDS ADMIN", tone: "ink-2", ms: 2500 });
export const alreadyOn = (ch: number, node: string): Message => ({ text: `${aar4(ch)} ALREADY ON ${node}`, tone: "ink-2", ms: 4000 });

/** The result of POST /api/frequencies/from-channel. */
export function addedMessage(ch: number, node: string, created: boolean, label: string): Message {
  const text = created ? `${aar4(ch)} ADDED · ENABLED ON ${node}` : `${label.toUpperCase()} · ${aar4(ch)} ENABLED ON ${node}`;
  return { text, tone: "ink", ms: 4000 };
}
export const notAdded = (ch: number, reason: string): Message => ({ text: `${aar4(ch)} NOT ADDED · ${reason.toUpperCase()}`, tone: "fault", ms: 4000 });

/** A node that cannot be listened to: no request is made. */
export const nodeDown = (node: string, stateWord: string): Message => ({ text: `${node} ${stateWord.toUpperCase()} · CANNOT LISTEN`, tone: "ink-2", ms: 2500 });

/** The server refused or failed a hold (listen_state failed, or a 403). */
export function holdFailed(ch: number, reason: string | undefined): Message {
  if (/admin|forbidden|permission|denied/i.test(reason ?? "")) return { text: "LISTEN NEEDS ADMIN", tone: "ink-2", ms: 4000 };
  return { text: `${chName(ch)} · LISTEN FAILED · ${(reason ?? "unknown").toUpperCase()}`, tone: "fault", ms: 4000 };
}

/* ---------------------------------------------------------------- the hold plate */

export type ServerState = "tuning" | "listening" | "released" | "failed";

export interface HoldView {
  channel: number;
  node: string;
  /** the last listen_state from the server; null before the first answer */
  state: ServerState | null;
  /** ms since the current state began */
  inStateMs: number;
  /** the channel is already enabled on the node (no tuning step) */
  enabled: boolean;
  mhz: number;
  audioMuted: boolean;
}

/** The plate while a hold lasts, from the server's state alone. Null: nothing to show (no answer yet, or over). */
export function holdPlate(view: HoldView): { text: string; tone: Tone } | null {
  const name = chName(view.channel);
  if (view.state === "tuning") {
    if (view.inStateMs >= NO_RESPONSE_MS) return { text: `NO RESPONSE FROM ${view.node}`, tone: "ink-2" };
    return { text: `TUNING · ${name} · ${view.node}`, tone: "ink-2" };
  }
  if (view.state === "listening") {
    const where = view.enabled ? "ENABLED" : view.mhz.toFixed(3);
    return { text: `LISTENING · ${name} · ${where}${view.audioMuted ? " · AUDIO MUTED" : ""}`, tone: "ink" };
  }
  return null;
}

/** 00:04 */
export function heldTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

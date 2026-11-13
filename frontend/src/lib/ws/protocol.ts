/**
 * WebSocket protocol, mirroring docs/build-plan.md 3.4 byte for byte.
 * Text frames are JSON `{type, ...}`; binary frames start with a fixed big-endian header.
 */

import type { Channel, Degraded, Fault, Feed, Header, LiveState, Reception, TrainPosition, TxRow, CtcRoute, Word, DetectorReading, TranscriptState } from "$lib/types/live";

export const PROTOCOL_VERSION = 1;

/* ------------------------------------------------------------------ text frames */

export interface HelloMessage {
  type: "hello";
  protocol: number;
  sim: { scenario: string | null; speed: number; clock_s: number };
  server_time: string;
}
export interface SnapshotMessage {
  type: "snapshot";
  state: LiveState;
}
export interface TickMessage {
  type: "tick";
  t: number;
  clock: string;
  clock_tenths: string;
}
export interface ChannelMessage extends Pick<Channel, "id" | "state" | "tx" | "last_heard" | "coverage" | "channel_fault" | "status_readout"> {
  type: "channel";
}
export interface KeyupMessage {
  type: "keyup";
  tx_id: string;
  channel_id: string;
  aar: string;
  feed_id: string;
  receptions: Reception[];
  role: string;
  role_tag: string;
  speaker: string;
  train_id: string | null;
  place_id: string | null;
  off_bank: boolean;
  t: number;
  /** the new transcript row, state "decoding" */
  row: TxRow;
}
export interface KeydownMessage {
  type: "keydown";
  tx_id: string;
  channel_id: string;
  duration_s: number;
  t: number;
}
export interface WordsMessage {
  type: "words";
  tx_id: string;
  state: TranscriptState;
  words: Word[];
  transcript: string;
  confidence: number | null;
  detector?: DetectorReading | null;
}
export interface LevelMessage {
  type: "level";
  t: number;
  levels: Record<string, { db: number; peak: number }>;
}
export interface FeedMessage extends Partial<Feed> {
  type: "feed";
  feed_id: string;
}
export interface FaultsMessage {
  type: "faults";
  faults: Fault[];
  degraded: Degraded[];
  header: Header;
  status_line: string[];
}
export interface TrainsMessage {
  type: "trains";
  positions: TrainPosition[];
  ctc: Record<string, CtcRoute>;
}
export interface LofarRowMessage {
  type: "lofar_row";
  t: number;
  cells: Record<string, Record<string, number>>;
}

export type ServerMessage =
  | HelloMessage
  | SnapshotMessage
  | TickMessage
  | ChannelMessage
  | KeyupMessage
  | KeydownMessage
  | WordsMessage
  | LevelMessage
  | FeedMessage
  | FaultsMessage
  | TrainsMessage
  | LofarRowMessage;

export type ServerMessageType = ServerMessage["type"];
export type MessageOf<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>;

/** Client to server. Mute and solo are client-side gains, so the server sends everything subscribed. */
export type ClientOp =
  | { op: "audio"; channels: string[] }
  | { op: "watch"; feed_id: string | null }
  | { op: "ping" };

/* ------------------------------------------------------------------ binary frames */

export const FRAME_AUDIO = 1;
export const FRAME_SPECTRUM = 2;

export const CODEC_PCM_S16LE = 0;
export const CODEC_OPUS = 1;

export const AUDIO_FLAG_FIRST = 0b01;
export const AUDIO_FLAG_LAST = 0b10;

/** `u8 kind=1, u8 codec, u8 aar_channel, u8 flags, u32 tx_seq, u32 offset_ms`, then payload. */
export interface AudioFrame {
  kind: "audio";
  codec: number;
  aarChannel: number;
  first: boolean;
  last: boolean;
  txSeq: number;
  offsetMs: number;
  payload: Uint8Array;
}

/** `u8 kind=2, u8 flags, u16 n_bins, f32 center_mhz, f32 span_mhz, u32 t_ms`, then n_bins int8 dBFS. */
export interface SpectrumFrame {
  kind: "spectrum";
  flags: number;
  centerMhz: number;
  spanMhz: number;
  tMs: number;
  bins: Int8Array;
}

export type BinaryFrame = AudioFrame | SpectrumFrame;

export const AUDIO_HEADER_BYTES = 12;
export const SPECTRUM_HEADER_BYTES = 16;

export function decodeBinary(buffer: ArrayBuffer): BinaryFrame {
  const view = new DataView(buffer);
  const kind = view.getUint8(0);

  if (kind === FRAME_AUDIO) {
    const flags = view.getUint8(3);
    return {
      kind: "audio",
      codec: view.getUint8(1),
      aarChannel: view.getUint8(2),
      first: (flags & AUDIO_FLAG_FIRST) !== 0,
      last: (flags & AUDIO_FLAG_LAST) !== 0,
      txSeq: view.getUint32(4, false),
      offsetMs: view.getUint32(8, false),
      payload: new Uint8Array(buffer, AUDIO_HEADER_BYTES),
    };
  }
  if (kind === FRAME_SPECTRUM) {
    const bins = view.getUint16(2, false);
    return {
      kind: "spectrum",
      flags: view.getUint8(1),
      centerMhz: view.getFloat32(4, false),
      spanMhz: view.getFloat32(8, false),
      tMs: view.getUint32(12, false),
      bins: new Int8Array(buffer, SPECTRUM_HEADER_BYTES, bins),
    };
  }
  throw new Error(`unknown binary frame kind ${kind}`);
}

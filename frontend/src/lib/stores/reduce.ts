/**
 * Delta reducer: applies one WebSocket message to a LiveState in place.
 * Pure of any framework so it is unit-tested on plain objects; the store passes its $state proxy.
 */

import type { LiveState, Lofar, TxRow } from "$lib/types/live";
import type { KeyupMessage, LofarRowMessage, ServerMessage } from "$lib/ws/protocol";

/** Transcript rows kept in memory (the scenario log window is 40). */
export const TRANSCRIPT_LIMIT = 200;

function rowFromKeyup(m: KeyupMessage): TxRow {
  if (m.row) return { ...m.row, receptions: m.row.receptions ?? m.receptions };
  return {
    id: m.tx_id,
    t_offset_s: m.t,
    clock: "",
    clock_tenths: "",
    aar: m.aar,
    aar4: "",
    frequency_id: m.channel_id,
    label: "",
    off_bank: m.off_bank,
    feed_id: m.feed_id,
    feed_label: "",
    role: m.role,
    role_tag: m.role_tag,
    speaker: m.speaker,
    train_id: m.train_id,
    place_id: m.place_id,
    duration_s: 0,
    state: "decoding",
    final_state: "final",
    live: true,
    transcript: "",
    words: [],
    confidence: null,
    detector: null,
    sim: true,
    receptions: m.receptions,
  };
}

const rowsFor = (state: LiveState, id: string): TxRow[] =>
  [...state.transcript.rows, ...state.active_transmissions].filter((row) => row.id === id);

/**
 * A new 30 s LOFAR row: every sparse cell moves one row down (the oldest fall off the grid) and the
 * new values enter at row 0. `newest` is feed id -> channel number -> dBFS.
 */
function foldLofarRow(lofar: Lofar, newest: LofarRowMessage["cells"]): void {
  const grid = lofar.cells as Record<string, Record<string, [number, number][]>>;
  for (const feedId of new Set([...Object.keys(grid), ...Object.keys(newest)])) {
    const channels = (grid[feedId] ??= {});
    for (const channel of new Set([...Object.keys(channels), ...Object.keys(newest[feedId] ?? {})])) {
      const older = (channels[channel] ?? []).flatMap(([row, db]): [number, number][] => (row + 1 < lofar.rows ? [[row + 1, db]] : []));
      const db = newest[feedId]?.[channel];
      channels[channel] = db == null ? older : [[0, db], ...older];
    }
  }
}

export function applyMessage(state: LiveState, message: ServerMessage): void {
  switch (message.type) {
    case "tick":
      state.t_offset_s = message.t;
      state.clock = message.clock;
      state.clock_tenths = message.clock_tenths;
      break;

    case "channel": {
      const channel = state.channels.find((c) => c.id === message.id);
      if (channel) {
        const { type: _type, ...patch } = message;
        Object.assign(channel, patch);
      }
      break;
    }

    case "keyup": {
      const row = rowFromKeyup(message);
      state.active_transmissions.push(row);
      state.transcript.rows.unshift(row);
      state.transcript.rows.length = Math.min(state.transcript.rows.length, TRANSCRIPT_LIMIT);
      state.transcript.count_today += 1;
      break;
    }

    case "keydown":
      state.active_transmissions = state.active_transmissions.filter((row) => row.id !== message.tx_id);
      for (const row of rowsFor(state, message.tx_id)) {
        row.live = false;
        row.duration_s = message.duration_s;
      }
      break;

    case "words":
      for (const row of rowsFor(state, message.tx_id)) {
        row.state = message.state;
        row.words = message.words;
        row.transcript = message.transcript;
        row.confidence = message.confidence;
        if (message.detector !== undefined) row.detector = message.detector;
      }
      break;

    case "feed": {
      const feed = state.feeds.find((f) => f.id === message.feed_id);
      if (feed) {
        const { type: _type, feed_id: _id, ...patch } = message;
        Object.assign(feed, patch);
      }
      break;
    }

    case "faults":
      state.faults = message.faults;
      state.degraded = message.degraded;
      state.header = message.header;
      state.status_line = message.status_line;
      break;

    case "trains":
      state.trains.positions = message.positions;
      state.trains.tracked_count = message.positions.length;
      state.ctc = message.ctc;
      break;

    case "lofar_row":
      foldLofarRow(state.lofar_60m, message.cells);
      break;

    // hello and snapshot are the store's job; level messages feed their own store.
    default:
      break;
  }
}

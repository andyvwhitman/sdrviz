/**
 * Web Audio playback for /ws/live audio frames (8 kHz s16le PCM, 100 ms chunks).
 *
 * One voice per AAR channel: a GainNode and a play cursor. Chunks are queued back to back on the
 * cursor; a new transmission, or a cursor that has fallen behind, restarts it a little ahead of
 * "now" (the jitter buffer). A cursor that has run too far ahead (a burst after a network stall)
 * is pulled back so the delay never grows past MAX_LAG_S.
 */

import type { AudioFrame } from "$lib/ws/protocol";

const SAMPLE_RATE = 8_000;
const CODEC_PCM_S16LE = 0;
const JITTER_S = 0.25;
const MAX_LAG_S = 1.5;
const RAMP_S = 0.05; // gain changes glide instead of clicking

interface Voice {
  gain: GainNode;
  cursor: number; // context time where the next chunk starts
  txSeq: number;
  lastOffsetMs: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private voices = new Map<number, Voice>();
  private gains = new Map<number, number>();

  /** Must run inside a user gesture (a click), or the browser keeps the context suspended. */
  start(): void {
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
  }

  stop(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.voices.clear();
  }

  get running(): boolean {
    return this.ctx !== null;
  }

  /** Output gain (0..1) for one AAR channel number. */
  setGain(aar: number, gain: number): void {
    this.gains.set(aar, gain);
    const voice = this.voices.get(aar);
    if (voice && this.ctx) voice.gain.gain.setTargetAtTime(gain, this.ctx.currentTime, RAMP_S);
  }

  play(frame: AudioFrame): void {
    const ctx = this.ctx;
    if (!ctx || frame.codec !== CODEC_PCM_S16LE || frame.payload.byteLength < 2) return;
    const voice = this.voiceFor(ctx, frame.aarChannel);

    // Two bank channels on the same AAR frequency each get a copy of the frame; play it once.
    if (frame.txSeq === voice.txSeq && frame.offsetMs <= voice.lastOffsetMs) return;

    const now = ctx.currentTime;
    if (frame.first || frame.txSeq !== voice.txSeq || voice.cursor < now) voice.cursor = now + JITTER_S;
    else if (voice.cursor > now + MAX_LAG_S) voice.cursor = now + JITTER_S;
    voice.txSeq = frame.txSeq;
    voice.lastOffsetMs = frame.offsetMs;

    const source = ctx.createBufferSource();
    source.buffer = toBuffer(ctx, frame.payload);
    source.connect(voice.gain);
    source.start(voice.cursor);
    voice.cursor += source.buffer.duration;
  }

  private voiceFor(ctx: AudioContext, aar: number): Voice {
    let voice = this.voices.get(aar);
    if (!voice) {
      const gain = ctx.createGain();
      gain.gain.value = this.gains.get(aar) ?? 0;
      gain.connect(ctx.destination);
      voice = { gain, cursor: 0, txSeq: -1, lastOffsetMs: -1 };
      this.voices.set(aar, voice);
    }
    return voice;
  }
}

function toBuffer(ctx: AudioContext, payload: Uint8Array): AudioBuffer {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const samples = Math.floor(payload.byteLength / 2);
  const buffer = ctx.createBuffer(1, samples, SAMPLE_RATE);
  const out = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return buffer;
}

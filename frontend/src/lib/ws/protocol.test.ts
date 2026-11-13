import { describe, expect, it } from "vitest";
import { decodeBinary, AUDIO_HEADER_BYTES, SPECTRUM_HEADER_BYTES } from "./protocol";

/** Build a frame by hand, byte for byte as docs/build-plan.md 3.4 lays it out (big-endian). */
function audioFrame(flags: number, payload: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(AUDIO_HEADER_BYTES + payload.length);
  const view = new DataView(buffer);
  view.setUint8(0, 1); // kind
  view.setUint8(1, 0); // codec: PCM
  view.setUint8(2, 54); // aar channel
  view.setUint8(3, flags);
  view.setUint32(4, 0x01020304); // tx_seq
  view.setUint32(8, 1500); // offset_ms
  new Uint8Array(buffer, AUDIO_HEADER_BYTES).set(payload);
  return buffer;
}

function spectrumFrame(bins: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(SPECTRUM_HEADER_BYTES + bins.length);
  const view = new DataView(buffer);
  view.setUint8(0, 2);
  view.setUint8(1, 0);
  view.setUint16(2, bins.length);
  view.setFloat32(4, 160.89);
  view.setFloat32(8, 2.4);
  view.setUint32(12, 123456);
  new Int8Array(buffer, SPECTRUM_HEADER_BYTES).set(bins);
  return buffer;
}

describe("decodeBinary", () => {
  it("decodes an audio chunk", () => {
    const frame = decodeBinary(audioFrame(0b01, [1, 2, 3, 4]));
    expect(frame).toMatchObject({ kind: "audio", codec: 0, aarChannel: 54, first: true, last: false, txSeq: 0x01020304, offsetMs: 1500 });
    if (frame.kind === "audio") expect(Array.from(frame.payload)).toEqual([1, 2, 3, 4]);
  });

  it("reads both flag bits", () => {
    const frame = decodeBinary(audioFrame(0b11, []));
    expect(frame).toMatchObject({ first: true, last: true });
  });

  it("decodes a spectrum frame with signed dBFS bins", () => {
    const frame = decodeBinary(spectrumFrame([-47, -100, 0, 12]));
    expect(frame.kind).toBe("spectrum");
    if (frame.kind === "spectrum") {
      expect(frame.centerMhz).toBeCloseTo(160.89, 3);
      expect(frame.spanMhz).toBeCloseTo(2.4, 3);
      expect(frame.tMs).toBe(123456);
      expect(Array.from(frame.bins)).toEqual([-47, -100, 0, 12]);
    }
  });

  it("rejects an unknown kind", () => {
    expect(() => decodeBinary(new Uint8Array([9, 0, 0, 0]).buffer)).toThrow(/unknown binary frame kind 9/);
  });
});

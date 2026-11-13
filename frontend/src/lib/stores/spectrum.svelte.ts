import type { SpectrumFrame } from "$lib/ws/protocol";

/** Spectrum frames kept for the waterfall: 4 Hz for 30 s. */
export const FRAME_RING = 120;

class SpectrumStore {
  /** feed id the server is streaming, null when nobody watches */
  watched = $state<string | null>(null);
  latest = $state.raw<SpectrumFrame | null>(null);

  private ring: SpectrumFrame[] = [];
  private sendWatch: (feedId: string | null) => void = () => {};

  /** The connection registers how to tell the server. */
  bind(send: (feedId: string | null) => void): void {
    this.sendWatch = send;
  }

  watch(feedId: string | null): void {
    if (feedId === this.watched) return;
    this.watched = feedId;
    this.ring = [];
    this.latest = null;
    this.sendWatch(feedId);
  }

  push(frame: SpectrumFrame): void {
    this.ring.push(frame);
    if (this.ring.length > FRAME_RING) this.ring.shift();
    this.latest = frame;
  }

  /** Oldest first. Read `latest` first to subscribe to changes. */
  frames(): readonly SpectrumFrame[] {
    return this.ring;
  }

  /** Re-send the watch after a reconnect. */
  resume(): void {
    if (this.watched) this.sendWatch(this.watched);
  }
}

export const spectrum = new SpectrumStore();

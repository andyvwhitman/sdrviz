/**
 * Channel levels from the 10 Hz `level` messages. M16 reads the last level; M15 reads the rolling
 * envelope (meters and waveforms do not depend on audio being enabled).
 */

export interface Level {
  db: number;
  peak: number;
}

/** 12.8 s of envelope at 10 Hz; the tile waveform shows the newest 6 s. */
export const ENVELOPE_LENGTH = 128;

class LevelStore {
  last = $state<Record<string, Level>>({});
  /** bumped on every update so envelope readers re-run */
  version = $state(0);

  private envelopes = new Map<string, number[]>();

  /** One `level` message. Channels absent from it have gone quiet. */
  push(levels: Record<string, Level>): void {
    for (const [id, level] of Object.entries(levels)) this.append(id, level.db);
    for (const [id, envelope] of this.envelopes) {
      if (!(id in levels)) this.trim(envelope, envelope.length ? Math.min(...envelope) : 0);
    }
    this.last = levels;
    this.version += 1;
  }

  /** Oldest first, newest last. Not reactive by itself: read `version` first. */
  envelope(channelId: string): readonly number[] {
    return this.envelopes.get(channelId) ?? [];
  }

  private append(id: string, db: number): void {
    const envelope = this.envelopes.get(id) ?? [];
    this.trim(envelope, db);
    this.envelopes.set(id, envelope);
  }

  private trim(envelope: number[], db: number): void {
    envelope.push(db);
    if (envelope.length > ENVELOPE_LENGTH) envelope.shift();
  }
}

export const levels = new LevelStore();

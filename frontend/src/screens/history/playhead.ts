/** Playback position as a 0..1 fraction of the clip, from the audio element's clock. */
export function playbackProgress(currentTime: number, duration: number): number {
  if (!(duration > 0) || !Number.isFinite(currentTime)) return 0;
  return Math.min(1, Math.max(0, currentTime / duration));
}

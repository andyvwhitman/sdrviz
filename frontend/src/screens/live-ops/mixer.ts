/**
 * Audio mixer rules, in one place for the tiles, the inspector and the audio engine.
 * Mute and solo live in the `prefs` store; the server sends every subscribed channel
 * and the client applies the gain (build-plan 3.4), so this is what the engine multiplies by.
 */

import type { Prefs } from "$lib/types/api";

export const volumesOf = (prefs: Prefs | null): Record<string, number> => prefs?.volume ?? {};

/** The `prefs.update` patch that sets one channel's volume. */
export const volumePatch = (prefs: Prefs, channelId: string, volume: number): Partial<Prefs> => ({
  volume: { ...volumesOf(prefs), [channelId]: volume },
});

export interface Mix {
  muted: ReadonlySet<string>;
  solo: ReadonlySet<string>;
  /** per channel, 0..1; a channel with no entry plays at full volume */
  volumes: Readonly<Record<string, number>>;
}

export const DEFAULT_VOLUME = 1;

export const volumeOf = (mix: Mix, channelId: string): number => mix.volumes[channelId] ?? DEFAULT_VOLUME;

/** Solo wins over everything: while any channel is soloed only the soloed ones are heard. */
export function isAudible(mix: Mix, channelId: string): boolean {
  if (mix.solo.size > 0) return mix.solo.has(channelId);
  return !mix.muted.has(channelId);
}

/** The gain the engine applies to a channel: 0 when it is not audible, else its volume. */
export const gainOf = (mix: Mix, channelId: string): number => (isAudible(mix, channelId) ? volumeOf(mix, channelId) : 0);

/** A tile reads as dimmed while others are soloed and it is not one of them. */
export const isDimmedBySolo = (mix: Mix, channelId: string): boolean => mix.solo.size > 0 && !mix.solo.has(channelId);

/** Channels the server should stream: everything audible (a muted channel needs no audio). */
export const subscribedChannels = (mix: Mix, channelIds: readonly string[]): string[] => channelIds.filter((id) => isAudible(mix, id));

export const LEVER_LIST = { m: "muted", s: "solo" } as const;
export type LeverKey = keyof typeof LEVER_LIST;

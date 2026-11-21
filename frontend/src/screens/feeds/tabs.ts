/** The two Feeds tabs and how they live in the URL (`?tab=transit`; the default tab is left out). */

export type FeedsTab = "sdr" | "transit";

export const TAB_ORDER: readonly FeedsTab[] = ["sdr", "transit"];

/** An unknown or missing `?tab=` is the SDR tab. */
export const tabFromQuery = (value: string | null): FeedsTab => (value === "transit" ? "transit" : "sdr");

/** The `?tab=` value that names a tab: null for the default. */
export const tabQuery = (tab: FeedsTab): string | null => (tab === "sdr" ? null : tab);

/** The tab a Left or Right arrow moves to from `tab`, or null for any other key. The ends do not wrap. */
export function tabAfterKey(tab: FeedsTab, key: string): FeedsTab | null {
  const step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
  if (!step) return null;
  return TAB_ORDER[Math.min(TAB_ORDER.length - 1, Math.max(0, TAB_ORDER.indexOf(tab) + step))];
}

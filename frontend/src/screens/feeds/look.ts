/** Pure display logic of the Feeds & Banks screen, ported from design/mockups/feeds.js. */

import { BLANK, num } from "$lib/hud/fmt";
import type { GlyphState } from "$lib/hud/tile";
import type { Channel, Feed } from "$lib/types/live";
import type { BankRecord } from "./types";

export interface FeedLook {
  frame: "idle" | "stale" | "fault" | "offline";
  glyph: GlyphState;
  /** colour class of the state words */
  tone: "" | "is-fault" | "is-stale";
}

/** Feed visual state (brief 8.9 escalation): an acknowledged fault drops to the stale frame. */
export function feedLook(feed: Feed): FeedLook {
  if (!feed.enabled) return { frame: "offline", glyph: "offline", tone: "is-stale" };
  if (feed.state === "fault") return { frame: feed.acked ? "stale" : "fault", glyph: "fault", tone: "is-fault" };
  if (feed.state === "offline") return { frame: "offline", glyph: "offline", tone: "is-stale" };
  if (feed.state === "stale") return { frame: "stale", glyph: "stale", tone: "is-stale" };
  return { frame: "idle", glyph: "idle", tone: "" };
}

/** Round half away from zero on a decimal-safe value, so a card and the inspector always agree. */
export const roundDp = (value: number, digits: number): number => {
  const k = 10 ** digits;
  return Math.round(value * k + Math.sign(value) * 1e-9) / k;
};

export const fix = (value: number | null | undefined, digits: number): string => (value == null ? BLANK : num(roundDp(value, digits), digits));
export const pct = (value: number | null | undefined): string => (value == null ? BLANK : String(Math.round(value)));

/** "sdrviz-agent · SIM" -> "sdrviz-agent" */
export const driverName = (feed: Pick<Feed, "driver">): string => feed.driver.replace(/\s*·\s*SIM$/, "");
/** "LND-02 New Carrollton" -> "NEW CARROLLTON" */
export const siteName = (feed: Pick<Feed, "name" | "short">): string => feed.name.replace(feed.short, "").trim().toUpperCase();
/** "Baltimore Harbor" -> "BAL", "Freight - CSX/NS" -> "FRE": the design's rule, not the backend's `short` (FRT, HBR). */
export const bankAbbr = (bank: Pick<BankRecord, "name">): string => bank.name.split(/[\s-]+/)[0].slice(0, 3).toUpperCase();

export const channelNumber = (channel: Pick<Channel, "aar">): number => parseInt(channel.aar.replace(/\D/g, ""), 10);

/** Measured values exist only while samples flow. */
export const isMeasured = (feed: Pick<Feed, "state">): boolean => feed.state === "ok";

/** "bank-harbor" style id from a display name. */
export const slugify = (text: string, prefix: string): string => `${prefix}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

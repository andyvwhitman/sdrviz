/** Seed constants: feed callsigns and speaker role tags (police dropped, decision 13). */

const FEED_CALLSIGNS: Record<string, string> = {
  "feed-alx": "ALX-01",
  "feed-lnd": "LND-02",
  "feed-bwi": "BWI-03",
  "feed-bay": "BAY-04",
};

/** "feed-bwi" -> "BWI-03"; unknown ids print upper-cased. */
export const feedName = (id: string | null | undefined): string => FEED_CALLSIGNS[id ?? ""] ?? String(id ?? "").toUpperCase();

const ROLE_TAGS: Record<string, string> = {
  crew: "CRW",
  dispatcher: "DSP",
  operator: "OPR",
  detector: "DET",
  yardmaster: "YDM",
  mow: "MOW",
  MOW: "MOW",
  unknown: "UNK",
};

/** "crew" -> "CRW" */
export const roleTag = (role: string | null | undefined): string => ROLE_TAGS[role ?? ""] ?? "UNK";

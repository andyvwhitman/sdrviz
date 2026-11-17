/**
 * Station and stop names for tight spaces. GTFS names carry boilerplate ("BWI RAIL STATION MARC", "SLIDELL AMTRAK
 * STATION"): grouped stations use the backend's `short_name`, the rest are cleaned here. The full name belongs in a
 * tooltip and in the station panel's header.
 */

/** Agency and boilerplate words at the end of a name, stripped one after another. */
const TRAILING = [/\s+AMTRAK STATION$/i, /\s+RAIL STATION$/i, /\s+AMTRAK$/i, /\s+MARC$/i, /\s+VRE$/i, /\s+AT PENN STATION$/i];
/** An agency word in the middle of a name ("UNION STATION MARC WASHINGTON"). */
const INFIX = /\s+(MARC|AMTRAK|VRE)(?=\s)/gi;
const STATION = /\s+STATION$/i;

/**
 * Stations whose short form would be ambiguous or lose the city ("PENN" is Baltimore, New York and Newark alike).
 * Matched against the raw name; a grouped station's own `short_name` still wins in `displayName`.
 */
const KEEP_CITY: [RegExp, string][] = [
  [/^PENN STATION MARC$/i, "Baltimore Penn"],
  [/^(BALTIMORE|BAL) PENN( STATION)?( MARC| AMTRAK)?$/i, "Baltimore Penn"],
  [/^(NEW YORK PENN( STATION)?|PENN STATION)$/i, "New York Penn"],
  [/^(GRAY )?30TH ST(REET)?( STATION)?$/i, "Philadelphia 30th Street"],
];

function stripBoilerplate(name: string): string {
  let out = name.trim().replace(INFIX, "");
  for (let changed = true; changed; ) {
    changed = false;
    for (const pattern of TRAILING) {
      const next = out.replace(pattern, "");
      if (next !== out && next.trim()) [out, changed] = [next, true];
    }
  }
  return out;
}

/**
 * A cleaned name. A trailing " STATION" goes too, but only where the result stays unique among `peers` (the other
 * names in the same list or view), so "PENN STATION" is kept beside a plain "PENN".
 */
export function cleanName(name: string, peers: readonly string[] = []): string {
  const city = KEEP_CITY.find(([pattern]) => pattern.test(name.trim()));
  if (city) return city[1];
  const kept = stripBoilerplate(name);
  const bare = kept.replace(STATION, "");
  if (bare === kept || !bare.trim()) return kept;
  const taken = peers.some((p) => p !== name && stripBoilerplate(p).toLowerCase() === bare.toLowerCase());
  return taken ? kept : bare;
}

/** A stop's name for display: the backend's short name for a grouped station, else the cleaned name. */
export function displayName(stop: { name: string; short_name?: string | null }, peers: readonly string[] = []): string {
  return stop.short_name || cleanName(stop.name, peers);
}

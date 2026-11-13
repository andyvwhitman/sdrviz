# Transit sources (real trains)

> v1.1: sources now live in the database (table `transit_source`, seeded once from `app/transit/sources.py`
> `DEFAULT_SOURCES`) and are edited on the Settings page or through `/api/transit/sources`. The
> `SDRVIZ_TRANSIT_SOURCES` setting is gone (`[]` still switches the feature off, used by the tests). See
> "Seeded sources" at the end; the older text below still describes MARC, VRE and Amtrak.

Checked 2026-11-13. The backend (`backend/app/transit/`) reads the sources below; the list is the
`transit_sources` setting (`SDRVIZ_TRANSIT_SOURCES`, a JSON list; `[]` turns the feature off).
A key, where an agency needs one, goes in a source's `api_key` / `key_header`.

| Agency | Static schedule | Realtime | Key |
|---|---|---|---|
| MARC (Maryland MTA) | `https://feeds.mta.maryland.gov/gtfs/marc` | GTFS-RT `https://mdotmta-gtfs-rt.s3.amazonaws.com/MARC+RT/marc-tu.pb` (trip updates), `.../marc-vp.pb` (vehicle positions) | none |
| VRE | `https://gtfs.vre.org/containercdngtfsupload/google_transit.zip` | GTFS-RT `https://gtfs.vre.org/containercdngtfsupload/TripUpdateFeed`, `.../VehiclePositionFeed` | none |
| Amtrak | none needed (see below) | Amtraker v3 JSON `https://api.amtraker.com/v3/trains`, stations `https://api.amtraker.com/v3/stations` | none |

## MARC and VRE

Both publish a standard GTFS zip and GTFS-Realtime protobuf feeds with no key, parsed with
`gtfs-realtime-bindings`. The old `vre.org/gtfs/...` and `vre.org/gtfs-realtime/...` URLs in older
catalogs are dead (403/404); the `gtfs.vre.org` host is the current one (VRE's 2024 developer guide).

- Feeds are empty (a bare header) when no trains are running, overnight. That is "ok, 0 vehicles".
- MARC stops are per direction ("BWI RAIL STATION MARC nb/sb"); the mapping groups them under one station.
- VRE stops are platforms under a parent station; a platform named with a digit is the track ("2").
- MARC trip ids are `Train400`; the train number is the `trip_short_name` ("Train 400" -> 400).

## Amtrak

Amtrak publishes no official GTFS-Realtime. Its static GTFS exists (`content.amtrak.com/content/gtfs/GTFS.zip`,
18 MB, schedules only) but carries no positions. Options considered:

1. **Amtraker v3 API (chosen).** Community JSON API over the data behind Amtrak's own train map. Per running
   train: lat/lon, heading, speed, route, destination, and every stop with scheduled and estimated/actual times
   and platform. One request (`/v3/trains`, ~450 KB) covers positions and boards; `/v3/stations` gives station
   coordinates (fetched daily). No key.
2. Amtrak's own track-a-train endpoints (decrypted by hand). Same upstream data, but undocumented, the
   encryption can change, and using it directly invites breakage and terms problems. Amtraker already does this.
3. Transitland / Mobility Database Amtrak "RT" entries. These are derived from the same community sources and
   add a registration/API key.

Terms and caveats for Amtraker:

- A descriptive `User-Agent` header is required or the request is blocked (the adapter sends one).
- Data is ODC-By 1.0: **the UI must credit Amtraker where the data is shown** (the departures board does).
- No uptime guarantee and no stated rate limit; we poll once a minute. A dead Amtraker only greys the Amtrak
  rows (status `error` in `/api/transit/sources`).
- Amtraker lists trains that are running or about to start, not the whole day's timetable, so the Amtrak part of
  a board only shows trains Amtraker currently knows. Using Amtrak's static GTFS for the rest is possible later.

## API

- `GET /api/transit/sources` - per source: state (`starting`/`ok`/`error`), last static and realtime update,
  last errors, counts, and how many of the app's stations were matched to stops.
- `GET /api/transit/vehicles?agency=` - live positions inside the map region (bbox south 38.2, west -78.1,
  north 39.7, east -76.0): agency, route, train number, headsign, lat, lon, bearing, speed_mph, delay_s, updated.
- `GET /api/transit/stations/{place_id}/board?back=30&ahead=180` - `place_id` is an id from `/api/geo/places`
  (`wash-union`, `new-carrollton`, `bwi`, ...). Returns `upcoming` and `departed` entries with scheduled vs
  estimated time, delay, track and status, plus the Amtraker attribution when Amtrak is included.

Places map to stops by distance (nearest place wins) and, beyond 250 m, a shared word in the name; up to 1 km.
Static GTFS zips are cached in `data/transit/` (gitignored) and refreshed daily.

## Seeded sources (checked 2026-11-13)

Static GTFS is cached in `data/transit/<id>-gtfs.zip` (refreshed per `static_refresh_h`; `lines` sources 168 h) and,
for `lines` sources, the simplified geometry in `data/transit/<id>-lines.json`, so a restart does not re-parse.
Requests carry only the generic `sdrviz/0.1` User-Agent. All URLs below need no key.

| id | kind | enabled | static feed | notes |
|---|---|---|---|---|
| amtrak | amtraker | yes | `https://content.amtrak.com/content/gtfs/GTFS.zip` (verified, 18 MB) + Amtraker live | route_types [2] drops Thruway buses; 49 rail routes with shapes; `exclude_routes` [42985, 42948] drops the "Commuter Rail" copies of MARC Penn Line and CTrail Shore Line East; `stale_after_s` 360 |
| marc | gtfs + RT + alerts | yes | `https://feeds.mta.maryland.gov/gtfs/marc` | alerts: `https://feeds.mta.maryland.gov/alerts.pb` (system-wide, filtered to MARC); `stale_after_s` 120 |
| vre | gtfs + RT | no | `https://gtfs.vre.org/containercdngtfsupload/google_transit.zip` | `stale_after_s` 120 |
| lirr | lines | yes | `https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip` | |
| mnr | lines | yes | `https://rrgtfsfeeds.s3.amazonaws.com/gtfsmnr.zip` | Metro-North |
| septa | lines | yes | `https://github.com/septadev/GTFS/releases/latest/download/gtfs_public.zip` | zip of zips; the `google_rail.zip` inside is used |
| mbta | lines | yes | `https://cdn.mbta.com/MBTA_GTFS.zip` | route_types [2] = Commuter Rail only |
| metra | lines | yes | `https://schedules.metrarail.com/gtfs/schedule.zip` | CSV padded with spaces; parser strips |
| caltrain | lines | yes | `https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip` | |
| smart | lines | yes | `https://data.trilliumtransit.com/gtfs/smart-ca-us/smart-ca-us.zip` | Sonoma-Marin |
| metrolink | lines | yes | `https://metrolinktrains.com/globalassets/about/gtfs/gtfs.zip` | |
| coaster | lines | **no** | `https://lfportal.nctd.org/staticGTFS/google_transit.zip` | the server resets Python/httpx TLS handshakes (curl works); enable if that changes |
| sounder | lines | yes | `https://www.soundtransit.org/GTFS-rail/40_gtfs.zip` | also Link light rail is route_type 0, excluded |
| wes | lines | yes | `https://developer.trimet.org/schedule/gtfs.zip` | 43 MB, 5 s first load; WES only |
| frontrunner | lines | yes | `https://gtfsfeed.rideuta.com/GTFS.zip` | |
| rtd-rail | lines | yes | `https://www.rtd-denver.com/files/gtfs/google_transit.zip` | commuter rail lines (A, B, G, N) |
| tre | lines | yes | `https://www.dart.org/transitdata/latest/google_transit.zip` | Trinity Railway Express (+ one more rail route) |
| sunrail | lines | yes | `https://corporate.sunrail.com/gtfs/google_transit.zip` | |

Load time on the dev Mac: Amtrak 2.5 s, the big lines feeds 0.1-6 s each (MBTA 5.6 s, TriMet 5.3 s), all 17 in
under 45 s at startup (two parse at a time); with the JSON cache a restart takes under a second per lines source.

### Per-source settings added later

- `exclude_routes` (decision 20): raw GTFS `route_id`s dropped while parsing the static feed, so their trips, stop
  times, shapes, lines and stops are gone, and realtime positions on those routes are ignored. Amtrak's two
  "Commuter Rail" routes (42985 MARC Penn Line, 42948 CTrail Shore Line East) are excluded because each agency is
  the only source for its own trains. Edit or clear it in Settings (PUT the source); the static feed is re-parsed.
  An existing database gets the Amtrak value once, when the column is added.
- `stale_after_s` (decision 22): how old a train's position may be before the map treats it as stale. Seeds:
  amtrak 360, marc 120, vre 120; any other source defaults to `max(120, 2 * rt_poll_s)` when not set.
- Station groups (decisions 16 and 21): `app/transit/data/stations.json`, see docs/transit-api.md "Station groups".

### Needs a key or registration (not seeded)

- **NJ Transit rail**: GTFS download (`njtransit.com/rail_data.zip`) and realtime sit behind a developer-portal
  registration; the file did download anonymously during the check, but the terms require an account, so skipped.
- **Capitol Corridor, ACE** (Altamont): their own sites refuse automated downloads (403) and the 511 Bay Area
  feed needs a token. Amtrak's feed already draws Capitol Corridor.
- **Metra realtime**, **Metro Transit (Northstar)**, **NICTD South Shore Line**, **Tri-Rail**, **TEXRail**
  (Trinity Metro's public feed carries no rail routes), **Brightline**: no keyless static GTFS URL found.

## Brightline (added 2026-11-13)

- Static GTFS: `https://feed.gobrightline.com/bl_gtfs.zip` (Brightline's own S3 bucket, listed on
  `https://feed.gobrightline.com/`; refreshed daily; 6 stations, shapes, calendars a year ahead).
- GTFS-RT: `https://feed.gobrightline.com/trip_updates.pb` and `https://feed.gobrightline.com/position_updates.pb`.
  No service alerts feed is published. No API key.
- Amtraker also carries Brightline (and VIA Rail) trains; the Amtrak source drops every train whose `provider` is
  not "Amtrak" (decision 31), so Brightline comes only from its own feed and VIA not at all.

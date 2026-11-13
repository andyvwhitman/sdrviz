# Station merge radius (2026-11-13)

Question (decision 29): how close must an Amtrak station and a commuter rail station be to count as the same
station and merge automatically? Owner's starting point: 0.125 mi (201 m) or 0.25 mi (402 m).

## Method

- Data: the cached static GTFS of Amtrak (rail routes only, Commuter Rail routes 42985/42948 excluded) and 16
  commuter rail feeds: MARC, VRE, MBTA, SEPTA, LIRR, Metro-North, Metra, Metrolink, Caltrain, Sounder, TRE,
  SunRail, FrontRunner, RTD rail, SMART, WES. Stations are the app's own station records (parent stations, or
  the platforms of one name grouped together).
- For each of the 522 Amtrak stations, the nearest station of each commuter feed and its distance. Every pair
  within 1 mile (90 pairs) was checked by hand. Raw pairs: `station-merge-pairs.json`. Script:
  `tools/station_merge_radius.py` (run from backend/: `PYTHONPATH=. .venv/bin/python ../tools/station_merge_radius.py OUT.json`).

## Results

| Distance | Pairs | Same station? |
|---|---|---|
| 0-100 m | 76 | all the same station (e.g. Baltimore Penn 12 m, BWI 38 m, New Carrollton 87 m, South Station 7 m) |
| 100-200 m | 4 | all the same: Burbank Airport 112, Philadelphia 30th St 129, Poughkeepsie 141, Anaheim ARTIC 150 |
| 200-310 m | 5 | all the same: Cornwells Heights 200, **Washington Union (MARC) 229**, Denver Union 243, Provo 292, **LA Union 305** |
| 310-800 m | 0 | none |
| 800 m + | 3 | all different: Sanford Auto Train vs SunRail Sanford 863, Lorton Auto Train vs VRE Lorton 1017, NY Penn vs Grand Central 1496 |

The true matches end at 305 m and the first false one is at 863 m: a clean gap.

- **0.125 mi (201 m) is too tight:** it misses Washington Union's MARC platforms (229 m), Denver, Provo and
  Los Angeles Union, and only just catches Cornwells Heights (200 m).
- **0.25 mi (402 m) catches every real match** with about 100 m to spare above LA Union, and stays more
  than 450 m below the first false match.

Near misses, all handled by the "nearest only" rule:
- Chicago Union vs Metra's Ogilvie (Chicago OTC) at 404 m: just outside 402 m anyway, and Union Station's nearest
  Metra station is Metra's own Chicago Union record at 51 m.
- North Philadelphia: SEPTA has the Amtrak platform (0 m) and a separate SEPTA station at 155 m.
- La Grange: Metra LaGrange Road 42 m, Stone Ave 586 m.
- No commuter station is within 402 m of two different Amtrak stations.

## Recommendation (adopted, decision 29, ticket BE-10)

- Radius **400 m (0.25 mi)**, configurable (`SDRVIZ_TRANSIT_MERGE_RADIUS_M`, default 400).
- **Nearest only:** each Amtrak station merges with at most one station per other source, the nearest within the
  radius; a commuter station joins at most one group (its nearest Amtrak station).
- Intercity-to-commuter pairs only; commuter stations join each other through the Amtrak station they share
  (MARC and VRE at Washington Union).
- The curated list is overrides: force a merge the rule misses, or block a wrong one. Group ids `st:<amtrak code>`.
- Re-run the script when a commuter feed is added and check the 300-800 m band by hand.

Also found: three Amtrak stations (BOS, BBY, BON) all displayed as "Boston" and two (STS, NHV) as "New Haven"
because station-name cleaning stripped too much; merged names now come from the clearest member name (BE-10).

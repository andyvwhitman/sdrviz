# Railfan review, sprint 1

Reviewed 2026-11-13 around 14:45-14:55 EST, live site at 1920x970 and 1180x820, plus API spot checks. Screenshots are in `/private/tmp/claude-501/-Users-andy-Code-sdrviz/dc1fec01-2c61-4ccf-957d-14b364a6eac4/scratchpad/review-railfan/`. `d-` files are 1920 wide and `i-` files are the iPad size.

## Verdict

The scaffolding is good. Train list, one docked panel, station boards with LEFT/NOW dividers, a full-day MARC timetable and the Union Station track schematic all work, and marker, stale and freshness cues are honest. The data is not yet trustworthy enough to chase a train with. The WAS board shows long-distance trains "-41 to -46 MIN early" because estimated departures at layover stops are copied from the arrival estimate. Non-stop passes (the headline railfan feature, decision 17) do not exist anywhere. Trains cannot be matched to the Union schematic tracks. The default regional map is crowded and hides trains behind labels and the list. Radio and transit are still two separate worlds, which is expected: decision 25 defers radio on transit pages.

## BUGS (wrong or broken)

1. **WAS board departure delays are wildly negative (major).**
   - What I saw: the WAS departures board (d-4-was.png) shows Amtrak 40 "-45 MIN", 1147 "-41", 1099 "-39", 1138 "-27", 19 "-42" and 50 "-46".
   - Checked via the API: `/transit/trips/amtrak:1147-13` has WAS arr_sched 16:12 / arr_est 16:19 and dep_sched 17:00 / dep_est 16:19. The estimated departure equals the estimated arrival, ignoring the scheduled layover. The vehicle itself says +12 min.
   - Why it matters: WAS is the first board a railfan opens. A train "45 minutes early" is nonsense and breaks trust in every other number.
   - Suggestion: estimated departure = max(scheduled departure, estimated arrival + minimum dwell), or scheduled departure plus the arrival delay. Never earlier than scheduled departure at a terminal or through-reversal. Add a backend test.
   - The same trip page shows the same bad WAS departure estimate (e.g. 40 and 1147).

2. **Board and trip page disagree (major).**
   - Floridian 40 is physically at Alexandria, stopped, with data 7 min stale. The vehicle and trip page say next stop WAS 15:12, on time.
   - The WAS arrivals API says est 14:27, state "passed", -2700 s.
   - Also 1195: the NCR board said "LEFT" at 14:47 while the position was still about 2 miles north of NCR at 14:45 and 121 mph.
   - Why it matters: "passed" is derived from the estimated clock, not from the position. One screen says the train has arrived and another says it is still coming.
   - Suggestion: derive passed/current from the live position or last-stop sequence when fresh. Otherwise label "est." and never show "LEFT" for a train the feed has not yet placed past the stop.

3. **Amtrak vanishes briefly after a backend restart (major, transient).**
   - Right after the backend reloaded (static loaded 14:33), `/transit/vehicles` returned only 10 Brightline vehicles under source "amtrak" for about a minute. The map then showed MARC and VRE only: "55 live", no Amtrak on the NEC.
   - It recovered at the next poll (172 Amtrak).
   - Why it matters: there is no hint that the Amtrak feed is warming up. It looks like "no trains on the NEC".
   - Suggestion: report source state "warming" until the first full Amtraker poll matches the static schedule, and show a banner. Do not return a partial list.

4. **Passed rows show the schedule, not the actual (minor).**
   - Floridian 41 left WAS 13:48 "on time" but the vehicle is now +16 min.
   - Decision 18 records actuals, but boards and the trip page show only one time per stop. Acela 2133's BAL row shows arrival 14:34 (-5), yet the train was still at Baltimore at 14:46 and leaving at 28 mph.
   - Suggestion: show the actual or estimated departure for passed rows and an arrival/departure pair at stops. Cross-check the "ON TIME" chip against position: a train still in the station 5+ minutes after its estimated departure is late.

5. **Same trip, different headsign by board (minor).** On NCR, 1195's departure says "Washington Union Station" but its arrival says "Boston". The arrival list shows the origin. Label the arrivals column "FROM" or show both.

6. **Labels and names (minor).**
   - MARC names carry raw GTFS suffixes and forms: "UNION STATION MARC WASHINGTON", "PENN STATION MARC", "BWI RAIL STATION MARC", "BRUNSWICK MD MARC". Amtrak uses "Baltimore Penn", "Baltimore Airport", "Washington Union".
   - Amtrak headsigns are "NY MOYNIHAN TRAIN HALL AT PENN STATION" and "Miami Amtrak Station".
   - Normalize to short railfan names: WAS, BAL, BWI, NYP, NCR.
   - The Amtrak source also carries VIA Rail ("Corridor", `v20`..`v67`) and Brightline under agency "Amtrak".

## GAPS (missing features)

7. **No non-stop passes (blocker for the stated use case).** The Acela 2133 trip lists 7 stops, with no NCR, Metropark or Aberdeen pass. NCR's board has no "Passing" tab, and `?passing=` params are ignored. The "check a train passing New Carrollton without stopping" walkthrough is impossible. Decision 17 is decided but not built.
   - Suggestion: interpolate pass times along the route shape, label them "PASSES · DOES NOT STOP · ~14:32", and show them as unmistakably different rows in both the trip stop list and the NCR/BWI board. Acela and the Regionals skipping stops is the core railfan question.

8. **No track and platform on station boards.** The WAS departures board has no track column. Only NYP shows "TRK 13" in a trip. The data is `track: null` for everything else, so even a Details toggle has nothing to show. Decision 19 had Amtraker supplying tracks; surface it whenever present (WAS track announcements) and show "TBD" otherwise. Also show the track on the schematic when known.

9. **The Union Station schematic cannot be used for live trains (major).**
   - The train list overlays and hides upper-level tracks 7-12 (d-8-union-sch.png).
   - No train markers sit on it, no occupancy, no K Tower / CP state, and no selecting a track to see the train.
   - Suggestion: move or collapse the list in schematic mode, and place trains with a known track on their track. Trains without one get an "approaching from NEC / RF&P" marker at the throat.

10. **Position and speed context is thin.**
    - The trip panel shows speed in mph, "REALTIME", data age and next stop. It has no mile marker or nearest CP, no heading arrow, no direction and no track name (the NEC has 2-4 tracks). The persona asks for "MP 96.4, between CP Landover and K".
    - The geo map shows milepost text in a pointer readout and the schematic shows "NEC 135.7", so the mileposts exist.
    - Suggestion: put "Near CP X / MP nn.n" in the trip panel from the nearest milepost segment.

11. **Marker labels are only "Amtrak 20" or "MARC 424".** There is no service name, delay or heading on the label. Show a short form ("A20 CRES +4"), and use a hollow or dashed marker with age for stale positions (the freshness dot exists in the list only).

12. **No filters or layer toggles on the map.** There is no Amtrak / MARC / VRE / MBTA toggle, no route filter and no "hide long-distance". The national view is 200+ trains of noise, and MBTA (39 vehicles) is mixed in. Add operator chips on the list header.

13. **No train history.** There is no previous-day or "last 10 runs" record, even though actuals are stored (decision 18). The same train number runs different consists daily; at least show last observed time at DC.

14. **The route page is only a timetable.** It has no live trains overlaid on the grid, no pass columns and no links from a train column to a trip. In the docked panel only 3-4 trip columns fit (d-9-route.png). Open it maximized by default, or add "now" highlighting for running trips.

## POLISH

15. **The train list covers the map and is clipped (major for desktop).**
    - It sits on top of the NEC, the Baltimore area and the Union schematic. With 15 trains in view only 13 rows show (VRE 303 and 325 are cut off).
    - Suggestion: cap height with scroll, default it collapsed on a docked panel, and allow sorting by delay or distance to a point.

16. **Label collisions.** Amtrak 2133 sits under MARC 435 at Baltimore, 1116 overlaps BWI AIRPORT, and 1195 and 1155 are hidden behind Seabrook and Alexandria labels (d-0-map.png). Add collision handling that prefers the selected train, then the one with the largest delay.

17. **iPad (1180x820).**
    - The header's FEEDS and ASR chips overlap the SETTINGS tab (i-1-was.png).
    - The list truncates to 4 columns.
    - The panel hides about 40% of the map, and the route chips are clipped on the right.
    - The whole thing is workable, but the header collision is visible on every page.

18. **Status chip semantics.**
    - Auto Train 52 shows "+361 MIN" in red/orange, while an actual 6-hour delay is real; show hours ("+6 H 01").
    - Stale data is marked only by a small amber dot, but the trip panel says "STALE" clearly. Keep that wording on the list too.

19. **Live Ops (i-4-live.png).**
    - The channel tiles are good: K Tower, Ivy City, Amtrak 47, WASH TERM and so on. The transcript shows "UNK / NOT RECORDED" rows with no text yet, which is fine as a placeholder.
    - Later: with radio-on-transit-pages deferred (decision 25), a plain link "K TOWER covers this area" from a trip is still a natural future step. I am not asking for it now.

## Top 5 for next sprint

1. Fix the WAS departure estimate (terminal and layover stops) and the passed/LEFT logic so boards, trip pages and vehicles agree (findings 1, 2, 4).
2. Build non-stop passes: trip stop list, NCR/BWI "Passing" rows, label "PASSES · DOES NOT STOP · ~time" (finding 7).
3. Surface tracks and platforms wherever the data exists (boards, trip, schematic), and make the Union schematic show live trains (findings 8, 9).
4. Clean up the desktop map: scrollable or collapsible train list that does not cover the schematic, label collisions, operator filters (findings 11, 12, 15, 16).
5. Show "warming" state after restart, plus name normalization and a nearest CP / milepost line in the trip panel (findings 3, 6, 10).

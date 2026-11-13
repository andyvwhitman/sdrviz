# Persona: the DC-Baltimore railfan

Scanner on the belt, Amtraker open on the phone, standing at the end of the platform at Odenton, Halethorpe or
Bowie. I do not need to be told a train is late (Amtraker does that). I want to know **what it is, where it is,
what it is doing, and what the radio is saying about it**. sdrviz is the only tool that could put the radio and
the schedule on the same screen, so that is where it should be better than everything else I use.

## 1. What I want to see

### Map / schematic
- Train symbol and number on the marker ("A171", "MARC 537", "CSX Q410"), not just a dot. Amtrak trains are
  numbers; freights are symbols or the road engine number heard on the radio.
- Position as **milepost plus nearest interlocking/CP** ("MP 96.4, between CP Landover and K"), not only lat/lon.
  That is how dispatchers and I describe where something is. The schematic should snap trains to the track line.
- Real versus estimated position must be visually obvious (solid vs. hollow marker, plus age). Estimated
  positions are fine, but I will chase a train that is not there if you don't tell me.
- Heading, speed, and which track (NEC has 2-4 tracks; "Track 2 northbound" matters for photos).
- Radio activity on the map: a pulse at the location a channel is tied to (K Tower, Ivy City, a CP) when it keys
  up, with the last transcript snippet on hover.
- Freights and MOW/hi-rail vehicles that GTFS will never show, as "radio-only" ghosts (see section 2).
- Toggle layers: Amtrak / MARC / VRE / freight (radio-derived) / MOW. Filter by route or by "only things I haven't
  shot".

### Train window (floating, from a marker)
- Header: train number, route name, operator, origin to destination, status chip (on time / late / early /
  estimated).
- Speed now plus a small **speed history sparkline**. Useful if the feed is vehicle positions (MARC);
  Amtraker gives coarse data, so it should say so.
- Next stop with ETA vs. scheduled, and ETA to the *next point I care about* (my pinned spot).
- **Consist/equipment**, when obtainable: lead loco number (ACS-64 6xx, P42 1xx, Siemens Venture/Airo sets,
  MARC MP36/GP39/ALP-45, Amfleet vs. Viewliner, "Acela set 2xxx"). Free-text from user reports and radio ("lead
  unit 4 6 0 3") is okay and must be labelled as unverified.
- Radio panel: channel/dispatcher the train was last heard on, last few transmissions mentioning it (time, channel,
  transcript text, audio play button).
- Link to station and trip pages; "follow this train" (window stays and map tracks it).

### Station page
- Board with scheduled/estimated/actual times and track assignments. At Union Station, the track is the most
  interesting field and it is posted late; show "track TBD" honestly and update when the radio or feed reveals it.
- **"What's coming past this spot in the next hour"**: every scheduled train *through* the station including
  non-stops (Acela and many NEC Regionals blow through BWI/New Carrollton; MARC skips). GTFS only lists stops, so
  non-stops must be derived from the trip's stop sequence plus shape. This is the single most useful railfan view.
- Direction-aware: northbound / southbound columns, with expected meets ("171 and MARC 421 pass at ~14:32").
- Radio channels that cover this location, with a live tile and recent transcripts.
- Spot notes: photo angle/sun position by time of day (morning/afternoon), parking, legal access (MARC platform vs.
  Amtrak property vs. public road), cop/trespass warnings. Community-editable notes, private by default.
- Alerts/detours/service advisories for this station.

### Route (schedule) page
- Timetable grid (as in the API), plus **where each train in the grid is right now** and a per-train delay column.
- Equipment pattern (e.g. which Penn Line trains are push-pull with ALP-45s versus MP36s) if user-supplied.
- Seasonal and special service flags: holiday schedules, specials, inauguration/event trains, Amtrak detours.
- Which radio channels/dispatchers a route normally uses along its length.

### Trip page
- Full stop list with scheduled / estimated / **actual** times (actuals logged as the train passes; GTFS-RT rarely
  keeps them, so we store them ourselves).
- Live or estimated position on schematic and map, milepost and nearest CP.
- Timeline interleaving **stops and radio events** ("14:12 K Tower: 'Train 171 cleared at 7'", "14:20 AAR 20: ...").
- Consist and photo log if known; history of this train number's last N runs (typical delays, usual track,
  usual equipment). Patterns are what let me plan a chase.

## 2. Linking radio and GTFS

The honest position: radio audio is messy, transcripts have errors, and trains are rarely identified by their
GTFS ids. Treat correlation as **probabilistic evidence attached to a trip**, never as a fact, and show the score.

**Identifiers to extract from transcripts**
- Train numbers ("train one seven one", "two-twelve", "Amtrak 171", "MARC 537", "VRE 304").
- Locomotive numbers ("Amtrak 4 6 0 3", "MARC 62", "CSX 3 0 2 1"), which lets me infer consist.
- Locations: interlocking names (K, Ivy City, Landover, Odenton, Bowie, Halethorpe, Bayview and so on), milepost
  calls, station names, track numbers. Build a gazetteer from the schematic data rather than guessing.
- Phrases: "cleared", "stop signal", "holding", "head end" / "rear end", "on the ground", "in the clear",
  "deadhead", "light power", "equipment move", "hi-rail", "foul" (work-zone permissions).

**Correlation rules, in order of strength**
1. Explicit train number in the transcript matching an active trip's `train` (plus agency, plus plausible time
   window): strong. Attach to the trip and show on the trip page.
2. Locomotive number matching one previously tied to a trip, or to a trip's expected equipment: medium.
3. Channel + time + place: a key-up on the Union Station terminal/yard channel within +/-10 min of a scheduled
   arrival or departure, with a train at or near K/Union: weak. Show as "possibly related". The terminal channel
   is chatty (yard crews, Ivy City, mechanical), so weak matches should never auto-claim a train.
4. Position: a train within X miles of a channel's coverage point when the key-up happened, with a speaker saying
   a location that matches: medium.

**Channel/dispatcher modelling**
- Each channel gets a *territory*: milepost range or node list (Amtrak Washington dispatcher; Baltimore
  dispatching; CSX Capital/Baltimore subdivisions; NS; MARC/VRE ops; Union Station terminal; Ivy City yard).
  A train's "current dispatcher" is derived from its position against those territories, then shown as "expected
  on channel X". Real use: "that was Washington dispatch, so the train is in his territory".
- A train handed off between territories (e.g. at Baltimore Penn) is a nice, cheap derived event.
- Radio coverage is local: SDR reception range limits what we hear. Surface "last heard" per channel so silence is
  not mistaken for "nothing happening".

**Radio-only objects (the interesting stuff)**
- "Unscheduled": a transcript with train/loco/location evidence and *no* matching GTFS trip becomes a
  **radio-only sighting** pinned to its location with confidence, expiring after some minutes. These are the
  deadheads, equipment moves (Ivy City to Union or to Baltimore Penn), light power, specials, Capitol Limited or
  Cardinal detours, MOW trains, hi-rails, and all freights.
- Users can promote a sighting to a named event ("Cardinal detoured via ...", "Presidential special") and
  attach photos/notes.
- Reverse also matters: a scheduled trip that has no radio evidence and is overdue may be annulled, held, or
  just outside our coverage. Show "no radio contact".

**UX details**
- Click a transcript line: highlights the candidate train(s) and location on the map. Click a train: filters the
  transcript list to its mentions. Both directions, always.
- Corrections: let me fix "seven one" to "one seven one" and bind the transcript to a trip. Corrections feed the
  alias and ASR vocabulary lists (train numbers, loco numbers, CP names). This is how the system improves.
- Alert rules: "ping me when 4 6 0 3 is mentioned", "when anything is heard on K Tower channel", "when train
  67 leaves Union", "when something radio-only shows up near my station".

## 3. Data sources beyond GTFS

| Source | What it gives | Reality check |
|---|---|---|
| Amtraker (api.amtraker.com) | Amtrak positions, status, times | Already planned. Unofficial, derived from Amtrak's own app; be polite with polling, expect breakage. |
| Transitdocs | Aggregated schedule/status views | Good as a cross-check; check terms before pulling data programmatically. |
| MARC GTFS-RT | Positions, trip updates, alerts | Official and public. Best data in the area; key may be required. |
| VRE GTFS-RT | Same for VRE | Usually available; needs keys/terms review. Ready to enable. |
| Amtrak Status Maps (ASM, Chicago-based user tool) | Historical and live arrival data | Not an API; useful for validating our actuals. Do not scrape without permission. |
| OpenRailwayMap / OpenStreetMap | Track geometry, milepost-ish tags, signals, tunnels | ODbL. Use for the track line for snapping trains and the schematic; cache and attribute. |
| Radio reference / RadioReference.com | Channel lists, frequencies | Database is paid for API access; their terms limit redistribution. User-entered config is safer. |
| Own SDR + ASR transcripts | Everything above | The one source nobody else has. Store transcripts with timestamp, channel, audio snippet, and confidence. |
| Amtrak/CSX/NS public service alerts | Detours, MOW notices | Amtrak publishes advisories; CSX/NS customer notices exist. Text parsing is brittle; link, don't promise. |
| FRA/Railroad safety data, track charts | Mileposts, interlocking locations | Public, but incomplete for names; hand-built gazetteer is likely. |
| Crowd sources (Discord, Facebook groups, RailPictures, Flickr, user reports) | Consists, specials, spotting reports | Great but no APIs, many are private. Provide a manual "report a sighting" form instead. Do not scrape Discord. |
| Weather / sunrise-sunset | Photo conditions | Easy and free (NWS, sunrise formulas). Nice for the spot page. |
| Fleet rosters (Amtrak/MARC/VRE locomotive rosters) | Number to type mapping | Public enthusiast knowledge. Seed a small table by hand. |
| Positive Train Control data | Train ids, authority | Not public. Don't count on it. |
| AIS-style rail tracking (e.g. ADS-B equivalents) | n/a | No public equivalent exists for US rail. |

Terms reminder: no scraping of closed communities, no redistribution of paid radio databases, and no publishing
of anything that reveals crew details. Cache politely, attribute, and keep user data private by default.

## 4. Top 10 priorities

1. **Train number and type on every marker**, with real/estimated state and age. Without this nothing else works.
2. **Milepost + nearest interlocking** for each train (snap to track geometry; show on schematic).
3. **"Passing this spot in the next hour"** including non-stops, per station and per user-pinned spot.
4. **Radio to trip linking by train number** with transcript snippets on the train window and trip page; clickable
   in both directions.
5. **Radio-only sightings**: unscheduled moves, deadheads, freights and MOW shown as separate, expiring objects.
6. **Channel territory model**: which dispatcher/channel a train should be on, plus "last heard".
7. **Actuals log**: store actual pass/arrival times per trip so history, typical delays and track assignments are
   available later.
8. **Consist/locomotive info**, starting with user and transcript entered numbers and a small fleet table.
9. **Alerts**: train/loco/channel/location watches with a ping (push or sound).
10. **Spot notes and photo planning**: sun angle, access notes, history of that train's usual timing.

## 5. Questions for the other personas

1. **To the GTFS expert:** Amtrak and MARC feeds list stops, not the track between them. How should we derive
   "pass-through" times at non-stopping locations (shape distance interpolation along `shapes.txt`, or something
   better), and how accurate can that be, given that Amtraker only gives sparse updates? Also, how do trip ids
   map to train numbers across the static and RT feeds (do they stay stable day to day)?
2. **To the GTFS expert:** What should we do with trips that appear in RT but not in static (added trips,
   extras, specials) and with `CANCELED` / `ADDED` / `DUPLICATED` schedule relationships? I want these to be
   first-class, not dropped, because they are exactly the unusual moves I follow.
3. **To the everyday rider:** When a train is reported on the radio as held or stopped, or a delay is evident
   from a transcript before the feed shows it, how much of that would you want surfaced on the station and trip
   pages (and in what words), and would a "heard on radio" note be useful or just noise and a source of anxiety?

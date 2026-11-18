# Railfan review, 2026-11-17

Reviewer: the DC-Baltimore railfan persona (`docs/personas/railfan.md`). View: standing at the end of the platform
with a scanner and Amtraker. Questions: is it useful in the field, is the data right, what is missing.

What I used: the review app (simulation ON, so some trains carry a SIM tag and are not real), the API on 8171
(`/transit/vehicles`, `/transit/stations/...`, `/transit/trips/...`, `/frequencies`, `/banks`) and Playwright
screenshots of the map and the MARC 859 trip panel. Caveat up front: about 6 of the 200 tracked trains are sim, and
the "SIM" tag is on the map labels but not in the vehicle JSON I pulled. I could not click a station marker into its
panel from the script (the click went to the map), so station findings come from the API, not from the panel.

## Ranked findings

### 1. Odenton / Halethorpe / Bowie State show no Amtrak at all (the core miss)
- Tried: `/transit/stations/marc:11985` (Odenton), with back=60, ahead=120. Result: six MARC Penn Line trains
  (642, 544, 449, 446, 451, 448) and nothing else. Same for every MARC-only station.
- Wrong: Acelas and Regionals go through Odenton, Halethorpe and Bowie State at 80-125 mph every few minutes. They
  never appear because they do not stop and GTFS only lists stops. The trip panel already has the right idea for MARC
  ("ST DENIS: PASSES, DOES NOT STOP ~18:28") but only for a train's own line. Amtrak trips list only their
  stops (Acela 2126: Washington, BWI, Baltimore Penn, ...), no pass-throughs.
- Why it matters: at the platform end the question is "what is the next thing through here", and 2/3 of the answer
  (Amtrak, plus the freights) is missing. This is exactly the page the owner wants next.
- Fix: derive pass-through times by interpolating along the route shape between the two bracketing stops, tag them
  `passes` and `estimated`, and include them in station boards for every station the shape goes through.

### 2. Delay and status disagree with the ETAs on MARC (late trains shown "ON TIME")
- MARC 859 (API, 19:09): `delay_s` 81, status `on_time`; next stop Riverdale eta 19:09:59 vs scheduled 19:02 = 8 min
  late. Panel stop list shows +10 min at Riverdale, header says DELAY: ON TIME.
- MARC 544: delay 41, `on_time`; next stop BWI eta 19:12:29 vs scheduled 19:07 = 5.5 min late.
- MARC 579: delay 0, eta 19:14:04 vs sched 19:08 = 6 min late. 642: delay 70, eta earlier than scheduled by 2 min.
- Why it matters: I will believe the chip and miss or mis-time a train. It looks like the vehicle `delay_s` is
  taken from a stale or different source field than the per-stop estimates (the 544 board row also says 363 s at
  Odenton while the vehicle says 41 s).
- Fix: one source of truth: vehicle delay = delay at next stop (eta minus scheduled), and the status chip derives from
  that. On the map list, the same value.

### 3. "Next stop" is wrong or misleading in several cases
- Acela 2127 (NY>Washington, sim-looking): position is 38.913,-76.993 (the Union Station throat, speed 31 mph)
  but the trip says next stop Philadelphia 30th Street (ETA 19:19) with Newark passed. Position and schedule position
  cannot both be true. If this is sim, tag it; if it is the real feed mixing a train number, it needs a sanity
  check (distance from position to next stop vs ETA).
- Trains standing in a station show it as `next` (129 and 138 at Baltimore Penn and BWI, speed 0, bearing 0/315).
  Should be `at station, departing hh:mm`.
- MARC 859 at Riverdale: panel says NEXT STOP Union Station 19:31 and Riverdale is marked current, then shows 
  Union at +9 min while Riverdale-to-Union is about 12 minutes of running. I do not trust 19:31 (I would expect
  about 19:22-19:24).
- Far-away estimates are garbage: Silver Meteor 97 (Washington current) has Miami arriving 18:04 (-3300 s, 55 min
  early) and West Palm Beach 30 min early. Early propagation down the line should be capped (schedules have recovery
  but not 55 minutes).

### 4. Names are inconsistent across feeds, so the same place is five different strings
- Amtrak stop names: "Baltimore Airport", "Baltimore Penn", "Washington Union", "Philadelphia 30th Street".
  Group station records: "BWI Marshall Airport", "Baltimore Penn Station", "Washington Union Station".
  MARC: "BWI RAIL STATION MARC", "PENN STATION MARC", "UNION STATION MARC Washington", "MARTINSBURG W VA MARC",
  "BRUNSWICK MD MARC" (shouted, with a "MARC" suffix on every stop).
- Headsigns on station boards come from raw GTFS: "Ny Moynihan Train Hall At Penn Station", "Miami Amtrak Station",
  "New Orleans Union Passenger Terminal", "Philadelphia" (vs 30th Street elsewhere). The map list says "Washington
  Union" for Amtrak, "Union Station Washington" for MARC.
- Why: I want to read "NYP", "BWI", "BAL", "WAS", "ODN" the way the radio and Amtraker do. Fix: a display-name table
  keyed by station code (the group stations already have `code` WAS, BAL, BWI), use it for headsigns, next stops and
  origin/destination everywhere. Title-case MARC names and drop the suffix.

### 5. Position is only lat/lon; no milepost, no CP, no track
- The trip/vehicle panel has no milepost, nearest interlocking, track number or heading in words. The map labels show
  "NEC 98.8 · CH54" (milepost and channel) on a few labels, which is the right idea, but I cannot tell the datum.
  Trains I read as near Baltimore say 101.0, near Aberdeen 65-80. Amtrak's own NEC mileposts count from New York
  (Baltimore Penn is in the 180s, Washington about 226), and the CSX/B&O and VRE lines have their own (BAA, CFP codes
  appear). Tell me which datum, and put it on the panel, e.g. "MP 187.4 NEC, between CP Bay and CP Gunpow".
- `track` is None on every real trip stop (only the sim Acela has tracks 11/3/5). Union track assignment is the single
  most requested field; at minimum show "track TBD" rather than nothing, and say where it will come from (Amtrak
  posts it ~10 min out, MARC/Amtraker rarely give it).
- Speed 0 with bearing 0 on stopped trains is shown as a heading; bearing on a stopped train is not data.

### 6. The radio link is not in the train window
- Trip panel for MARC 859 shows status, route, next stop, delay, speed, position, data age, stops. There is nothing
  about radio: no "last heard on", no transcript snippets, no channel/dispatcher for its territory, no hint of a
  CH54 relationship. The map labels carry "CH54" but nothing ties a key-up to a train.
- This is the differentiator against Amtraker and the MARC app and it is currently absent from the user's view.
  Minimum viable: in each train/station panel, "last 3 transmissions on the channel(s) covering this location" with
  time, channel and text, plus "last heard HH:MM" per channel so silence is not read as "quiet".

### 7. Frequency table: labels are plausible, but thin and some lines are unverified
Checked what I can from the data and from what I know of the AAR plan (I could not reach the web from this session,
so no external verification, treat as "consistent", not "confirmed"):
- Channel arithmetic is self-consistent: AAR 7 = 160.215, step 15 kHz, so 160.290 = AAR 12, 160.350 = AAR 16, 160.365 =
  AAR 17, 160.440 = AAR 22, 160.515 = AAR 27, 160.815 = AAR 47, 160.920 = AAR 54, 160.995 = AAR 59. All eight rows
  obey it. Good.
- Amtrak NEC road on 160.920 (AAR 54) is the channel every DC-Baltimore railfan scans; the "road/dispatcher" label and
  the note about MARC Penn Line using it match what I hear. Correct, high confidence deserved.
- Washington Terminal / K Tower / Ops2 / Ivy City (160.440, 160.290, 160.350, 160.995) are single-source "sporadic,
  removed from scan" per the notes. I would not show these as live reception targets: the table itself says feed
  owners report them off. Show "unverified" in the UI, not just in a notes field. The 160.350 vs Ivy City conflict note
  is honest; leave it.
- Missing: there are no CSX (Capital and Baltimore subs, which carry the Camden Line and all the freights I want),
  NS (Manassas line, VRE), MARC/VRE operations, or Baltimore (Bayview/Penn) channels at all. The bank is "NEC Corridor"
  only; the map draws CSX CAPITAL, CSX METRO SUB and NS-VRE MANASSAS lines, so the radio side does not cover what
  the map implies. A freight-capable page needs those channels in the table first.
- AMTK 47 (160.815) is rated low and "Philadelphia-area listing"; MOW 27/47 are fine as "MOW" but should be off the
  default bank for a spotter; Auto Train (160.365) at Lorton is a cute extra.

### 8. The map's train list is clipped and not useful at a glance
- "TRAINS IN VIEW 24" opens a table (train, service, operator, next station, status) that only shows 7 rows, the 8th
  row (Acela) is cut off mid-text, and it sits over the Baltimore labels. No scroll hint. Sort appears to be by train
  number, not by anything I would use. No direction, no ETA clock time (only "+47 MIN", an offset).
- Clicking a label does nothing; only the small marker is a hit target (I had to click coordinates). On a phone that
  is a miss. Labels collide at Baltimore ("BALT... ENN", "AMTK 138" overlapping).
- "Real vs estimated": the panel shows POSITION: REALTIME, and DATA AS OF / AGE. Good. But the map marker looks the
  same for estimated vs realtime (I saw no hollow marker), and stale ones are not distinguished.

### 9. Nice things that are already right (keep)
- The non-stop idea on the trip page ("PASSES · DOES NOT STOP ~18:28") and the "EST. NEXT" row. This is the
  seed of finding 1.
- Data age on every panel, `stale_after_s` in the API, `delay_suspect` flag on vehicles.
- Alias/train numbers on markers (AMTK 138, MARC 859, VRE 315).
- Correct current Amtrak service names (Floridian, Carolinian, Vermonter, Cardinal) and sensible MARC train number
  patterns (8xx Camden/Brunswick, 4xx-6xx Penn).

### 10. Missing entirely (lower priority than the above)
Consist/loco number, radio-only sightings (freights, MOW, light power), alerts/detours, watch rules ("ping me for
train 67"), spot notes (sun, parking, access), history of actual pass times, MARC "annulled" handling (a cancelled
MARC trip would show as `cancelled` on the board; I never saw one to test).

## Trainspotting page: what I need

One page, one purpose: "I am standing here, what is coming through, and when." Route: `/spot`. Works on a phone
in sunlight: high-contrast, big type, no map required (map optional as a small inset).

### Input: the position
- Default: browser geolocation, snapped to the nearest point on any rail line within 300 m. Show "snapped to NEC MP
  xxx.x, 140 m" so I can see what it thought.
- Pickers: station list (Odenton, Halethorpe, Bowie State, BWI, Savage, ...), saved spots (name, lat/lon, MP), and a
  free "milepost on line" entry ("NEC MP 187.4") for a footbridge. Spots are private, stored per user.
- Track side: optional "which track / side of the corridor", since the NEC is 4 tracks at Odenton.
- Time window control: 30 min, 1 h, 2 h (default 60), plus "behind" 10 min for passed trains.

### The table (one row per train passing the spot)
Columns, in this order:
1. **ETA** at spot, clock time `19:24` in big type, with `~` if estimated and `±2m` uncertainty if I can compute it.
2. **In** countdown, `in 11 min` / `NOW` / `2 min ago`. Updates every second.
3. **Train**, number plus short name: `A171 NER`, `A2126 ACELA`, `MARC 449`, `VRE 335`, `CSX Q410` (freight symbol).
4. **Operator** chip (Amtrak / MARC / VRE / CSX / NS) with the line colour.
5. **Dir**: `NB`/`SB` (or `EB/WB` on the Camden/Brunswick/Manassas lines) with an arrow, and "toward Baltimore" /
   "toward Washington" as the tooltip. Direction filter at the top (both / NB / SB).
6. **Where now**: distance and place: `4.2 mi S, at Bowie State` (or `at Union, departing 19:12`). One line, no map.
7. **Stops here?** `PASSES` (bold) or `STOPS 19:24`. This is the column that Amtraker cannot give me.
8. **Speed** (live mph) if realtime; blank if not known.
9. **Basis** (real vs estimated): a solid dot with age (`GPS 20 s`) for live position; a hollow dot `SCHED` (schedule
   only) or `EST` (interpolated); a red `STALE` when age > the source's stale threshold. Never mix them silently.
10. **Delay**: `+6 min` vs scheduled, derived from ETA minus schedule (not the raw vehicle field, see finding 2).
11. **Radio**: last heard line mentioning the train, with channel and time, tap to expand. Blank is fine; "no radio
    contact" is a real state.

Hide on narrow phones: Operator (merge into Train), Speed, Delay, Radio (open under the row on tap). Keep ETA, In,
Train, Dir, Stops-here, Basis.

### Sort and grouping
- Sort by ETA ascending, always. No grouping by operator (I can use the operator filter chips).
- Passed trains (up to 10 minutes back) at the top in dim grey, collapsed to one line, fading and then dropping out.
- Approaching (within 15 min or within 10 miles): normal weight; the next one gets a coloured left border and a
  larger row.
- At-spot (within 90 seconds either side of ETA, or within 0.5 mile): `NOW`, inverted/highlighted row, with an
  optional sound/vibration (setting). This is the "get the camera up" cue.
- Meets: when two trains' ETAs are within 90 s and opposite directions, tag both `MEET`. Free and railfan-gold.

### How far ahead
- Default 60 minutes; adjustable 30/60/120. For a slow freight/radio-only section, widen to 3 h.
- Also show a **"next 3 by direction"** strip at the top: next NB and next SB with their countdowns. This is what I
  glance at.
- Trains that are "far but on the way" (e.g. 2 h out) show as a dimmed count at the bottom: `+7 more in the next
  2 h`. Do not list everything for a day.

### Real versus estimated
- Three explicit tiers per row: LIVE (a position within `stale_after_s`; ETA from position/speed along the shape),
  RT-SCHEDULE (trip updates only, no position), SCHEDULE (no realtime, e.g. a train not yet departed).
- Show uncertainty band and the age of the last fix. If the last fix is old and the train is near me, say `last fix 7
  min ago`.
- Do not hide a stale train: it is exactly the one I will wait for. Keep the row, flag it, and let the ETA widen.
- Hard rule: a position/ETA that contradicts the trip's next stop (finding 3) is shown as `CHECK` instead of a
  confident time.

### What to do with freights and radio-only things
- GTFS will never have them. Treat them as **radio sightings**, listed in the same table with Basis = `RADIO`:
  `CSX Q410?  heard 19:02 CH 41 "approaching Savage"  ETA ~19:20 ±10`. Put them in a separate collapsible
  block "Heard, not scheduled" under the main table, so they never pollute scheduled ETAs.
- A sighting expires after N minutes (setting, default 30) and shrinks to "last heard".
- Each carries a confidence (`explicit symbol`, `loco number`, `place only`) from the correlation score, with the
  transcript line and an audio play button. Weak matches say "possibly".
- Radio-derived location is turned into an ETA only when the transcript has a place I can map to a milepost
  (gazetteer needed) and a direction; otherwise show "heard near Savage 6 min ago" with no clock time.
- A radio-only line without any place is a separate "activity on this channel" ticker, not a train.
- Heard-but-silent channel coverage: always show "last heard on 160.920: 3 min ago" so silence is not "nothing".

### What makes it better than Amtraker and the MARC app
1. **Passes, not just stops.** Both apps are station-centric; mine is spot-centric, including non-stops and every
   operator in one list (Amtraker shows no MARC; the MARC app shows no Amtrak or VRE).
2. **A true ETA to my spot** (position along the shape plus speed), not the next-station ETA.
3. **Radio on the same line.** The thing neither has: what the dispatcher just said, linked to the train row, and
   freights/MOW/light moves that nobody tracks.
4. **Honest data state**: live vs estimated vs stale, per row, plus a "feed health" line.
5. **Meets and direction**: tag opposing trains arriving together; next NB / next SB strip.
6. **Spot memory**: save the spot, the lighting note and the access note; show "sun is behind the train until
   17:10" later.
7. **Alerts**: "ping me when any Acela is <10 min from here", "ping when 4603 is heard", "radio-only near me".
8. **History**: "A171 is usually 6 min late here, usually track 2". Needs the actuals log (store pass times).

### Backend this needs (so you can plan)
- Pass-through ETAs: per trip, interpolate time along the shape between the bracketing stops, offset by current delay;
  decay the delay toward zero over distance, and cap the propagated early/late value (finding 3).
- Snap a point to a line: nearest shape + distance along it; for each vehicle compute along-track distance to the spot
  (same direction, ahead of the spot only).
- One endpoint, e.g. `GET /api/transit/spot?lat=&lon=&ahead=60&back=10` returning rows with the fields above and
  `basis`, plus the heard-radio block; poll every 15 s, countdown client-side.
- A gazetteer table of CPs/mileposts keyed to shapes for "where now" text.
- Consistent display names (finding 4) and a data-age/consistency check on every row.

### Smallest first version (do this first, in this order)
1. `/spot` with a station picker and a 60 minute window, rows from the station board **plus pass-throughs**
   (finding 1), columns ETA, In, Train, Operator, Dir, Stops/Passes, Basis, Delay.
2. Geolocation + milepost snap and a `NOW` highlight.
3. Radio block ("last heard on channels covering this spot", no correlation yet).
4. Radio-sightings (freights) and alerts.

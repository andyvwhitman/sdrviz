# Persona: the transit rider

I commute MARC Baltimore (Penn) to Washington Union Station most weekdays, take a Northeast Regional to New York now and then, and use VRE occasionally. I live in Transit, Citymapper, the MARC tracker, the Amtrak app and the departure boards. I open an app standing on a platform or at my front door with one question: **is my train on time, and what do I do about it?**

## What I want to see

**Map**
- My trains, big and obvious. Other trains smaller and quieter. A train dot carries its number ("MARC 537") and a color for status (on time / late / unknown), not just a dot.
- Lines drawn in the agency colors I know (MARC Penn Line, Northeast Regional). Station names at sensible zoom only.
- A "stale" look (faded, dashed ring) for a train whose position is old or estimated from the schedule.
- Don't care about: every commuter network in the country at once, bearing arrows, raw lat/lon, source names, vehicle IDs, stops of agencies I never ride. Let me filter to "my agencies" or "near me".

**Train window (click a train)**
- Header: number, route, to where ("MARC 537 to Baltimore Penn"). Then one plain sentence: "12 min late, next stop BWI at 5:41 pm (was 5:29)".
- Next 3 stops with time and delay, "Full trip" link. Speed and freshness small, at the bottom: "Updated 40 s ago".
- Don't care about: bearing, feed ids, exact coordinates.

**Station page**
- Two tabs: Departures (default) and Arrivals. Rows: time, train, destination, track, status. Sorted by time, with the next one highlighted.
- Show the last 1 to 2 passed trains greyed out, so I can answer "did I miss it, or is it late?" Collapse older ones.
- Track in a large badge, or "Track TBD" until announced. A filter chip for line/direction (e.g. "to Washington").
- Alerts for this station on top. Don't care about: a flat list of all lines when I only use two; show them, but let me collapse by line.

**Route page**
- A timetable grid for today, current direction first, and a "now" marker so the next trains are scrolled into view. Weekday/weekend/holiday switch.
- Live badges (late/cancelled) on the columns for today. Route-wide alerts at top.
- Don't care about: shapes, route ids, agency boilerplate.

**Trip page**
- Vertical stop list: passed (checked, actual time), current ("between Halethorpe and BWI"), upcoming (estimated time, scheduled time struck through if different, track).
- Small map with the train and the remaining line. Delay history trend ("lost 8 min since Baltimore") is a nice extra.
- If a trip has no live data, say "Schedule only, no live position" up top, not buried.

## Finding things fast
- **Home screen = "My stuff"**: pinned stations, pinned trains/trips (e.g. "MARC 537, weekdays"), recent. One tap to a station board or trip.
- **"My train"**: pin a train number once; it appears every day as that day's trip. Pin a commute ("Baltimore Penn to Union, ~5:15 pm") that picks the next 3 matching trains.
- **Search** that takes anything I'd type: "537", "Union Station", "BWI", "Penn Line", "Amtrak 171". Results are grouped (Trains, Stations, Routes), with today's running trains first. Works with typos and partial names.
- **iPad**: big touch targets (44 px min), station boards usable one-handed, no hover-only controls (click/tap does what hover does), pinch map, bottom-sheet or side-panel instead of tiny floating windows.
- **Big monitor**: board in a side panel next to the map, several pinned stations as a wall of boards, auto-refreshing. Keyboard: `/` to search.
- Deep links per station, route and trip, so I can bookmark or send them.

## How to talk to me (plain language)
- **Delays**: "12 min late" with the new time first ("Arrives 5:41 pm, was 5:29"). Color plus words, never color alone. Under 2 min is "On time". "Early" is shown as early, I may miss it.
- **Cancellations**: "Cancelled" in red on the row, never silently disappearing. Say what to do: "Next train: MARC 539 at 6:05 pm". Distinguish "cancelled" from "no live data".
- **Track**: "Track 8" large, or "Track not assigned yet (usually announced ~10 min before)". If the track changes, flag it: "Track changed from 7 to 8".
- **Stale data**: "Live position 40 s ago" is fine; past ~2 minutes, say "Last seen 4 min ago, position may be off". "Estimated from the schedule, not live" is a different label from "live". If the whole feed is down: "MARC live data is unavailable, showing the schedule".
- **When to leave**: show "leave in 14 min" for a pinned station when I set a walk/drive time. Updates as the delay changes.
- Never show raw seconds, ISO times, or ids. Use local time, 12-hour, with the date only if it isn't today.

## Radio for "my train"
- Valuable, secondarily. When a train is stopped for no visible reason, hearing the dispatcher ("signal problem at Bowie") beats any app's "delayed". It is why I'd use this app instead of the others.
- Link it simply: on a train window / trip page, a "Listen" button for the radio channel covering that train's current area (the territory it's in right now), with the label "Dispatcher for this area, live". No promise the crew is on it; be honest about that.
- Must be opt-in, off by default, with clear mute and no autoplay when the app opens. Show a transcript or at least activity indicator ("Active now") if available.
- Don't care about: frequency numbers on the transit pages (put them in a details line), or a separate radio UI when I only want the train.

## Top 10 priorities
1. Is my train on time: status and delay in one plain sentence, everywhere it appears.
2. Station departure board that is correct and fast, with track and passed trains greyed.
3. Pinned stations and "my train", one tap from the home screen.
4. Search by train number or station name that just works.
5. Cancellations and disruptions visible and explained, with the next alternative.
6. Honest freshness: live vs estimated vs schedule-only, with age.
7. Trip page: remaining stops with estimated times, and where the train is now.
8. iPad-first touch usability; the big monitor gets multi-board layouts.
9. Route timetable with live overlay and the "now" position.
10. Radio: one-tap, opt-in listening for the area where my train is.

## Questions for the other personas
1. **GTFS expert**: GTFS-RT is unreliable for MARC and Amtrak (missing trip updates, track often absent, cancelled trips, train number vs trip id mismatches). How do we guarantee that "my train" resolves to the right trip every day, and what do we show when RT is missing or contradicts the schedule?
2. **Railfan/railspotter**: Which radio channel/area should we link to a given train, and how confident can we be about that match (territory, dispatcher boundaries, Amtrak vs MARC vs freight)? How should the UI show a low-confidence match without misleading a commuter?
3. **Both**: You will want dense details (consists, equipment, raw feed fields, frequencies). What is the one-click boundary between my simple view and your detailed view, so I never see the clutter unless I ask for it?

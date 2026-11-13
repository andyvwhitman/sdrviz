# Persona discussion: answers to the cross-questions

Voices: GTFS = the data expert, RIDER = the commuter, FAN = the railfan. Inputs: the three files in docs/personas/.

## GTFS expert answers

To the rider (stale or schedule-only times: show "~10:42 (estimated, last update 6 min ago)" or hide?)
- Show it, labelled. Hiding a time is worse than a labelled time, because people plan around the schedule anyway.
- Rule: fresh (age < 2x poll, ~3 min) = counting down, normal ink. Stale = time stays, struck-through style plus "last update 6 min ago", countdown stops.
- If the whole source is down: show the schedule, grey, with one banner "MARC live data unavailable, showing the schedule". Never mix styles inside one column.
- Hide only when there is no time at all (NO_DATA stop): show "no prediction".

To the railfan (identifiers to follow a train across days and sources)
- Accept train number + service date as the key. That is stable and mirrors how Amtrak and MARC name trains.
- Equipment, loco numbers and block continuation: accept "unknown" unless the feed provides block_id; never guess them from the schedule.
- Radio-supplied loco numbers are fine, but stored as user/transcript evidence, labelled unverified.
- Nothing is derived from trip_id across days: Amtrak reuses a train number with different trip_ids per date range.

To both (which DC stations are one place, merged or separate boards?)
- One merged board per curated station group, with agency/platform filter chips. Rider wants a single "Union" board; fan wants all platforms.
- The curated seed list: Washington Union (WAS), Alexandria (ALX), New Carrollton (NCR), BWI Marshall (BWI), Baltimore Penn (BAL), Rockville, Silver Spring, College Park, Odenton, Aberdeen, Wilmington. Verified by hand, with Amtrak codes as the key.
- Heuristic matches (distance, name) only produce "suggested merges" in settings, never silent merges.

## Rider answers

To the GTFS expert ("my train" must resolve to the right trip every day; what when RT is missing or contradicts?)
- Pins store a train number + agency (+ weekday pattern), never a trip_id. Each day it resolves to that day's trip via train number + service date.
- When there is no RT: the row shows "Schedule only", top of the trip page, not buried.
- When RT contradicts the schedule (cancelled in RT, not in static): trust RT, show "Cancelled" and the next alternative train.
- If the number does not run today: "MARC 537 does not run today (weekday only)" with the neighbours, not a 404.

To the railfan (which radio channel for a train, how to show low confidence?)
- Link by territory: the channel for the area the train is in right now, labelled "Dispatcher for this area". That is honest and needs no transcript matching.
- Transcript-based matches ("heard on radio") never appear in the default view. They sit under Details.
- Low confidence is never displayed as a claim: no train-specific wording below "strong".
- Always opt-in, no autoplay.

To both (one-click boundary between simple and detailed)
- A single "Details" toggle at the top right of each page, remembered per device. Off = my view; on = adds columns/sections. No second page.
- Off view never shows: ids, sources, raw timestamps, bearing, equipment, frequencies, radio transcripts.
- Anything that changes my decision (cancelled, track change, stale data, alert) is in the simple view.

## Railfan answers

To the GTFS expert (pass-through times at non-stops; train-number to trip-id mapping)
- Wanted: shape distance interpolation between the bracketing stops, with the stop positions projected onto the shape. Accept +/- a couple of minutes on the NEC and show it as "~14:32 (est. pass)".
- Honest label: pass times are always "estimated", never "predicted". When a real position is available within 5 min, refine using it.
- Trip id to train number: I accept matching by train number + service date, as you say. The Details view shows both so I can spot mismatches.

To the GTFS expert (added/cancelled/duplicated trips)
- Added trips must have a page (built from RT alone) and a badge "Added / not in schedule". They go in a "Specials" filter on boards.
- Cancelled stays on the board, struck through, with partial cancellations ("skips BWI") per stop.
- If a trip is neither in static nor in RT, keep the last RT snapshot for 2 hours as "last known" so I can still read what it was.

To the rider (how much radio on station/trip pages?)
- Agree with the rider: default view shows nothing from transcripts. A single quiet line under Details: "Heard on radio 14:12 (possible)".
- What I would argue for: a stop/hold heard on the radio before the feed shows it may be shown as a note, on trip page only, once confidence is "strong" (explicit train number), with the words "Reported on radio, not confirmed".
- No anxiety wording, no "delayed" derived from radio. Radio never changes the status chip.

## Consensus and disagreements

Consensus
- Three time states (scheduled / predicted / actual) and three position states (realtime / estimated / last-known) with age, everywhere.
- Station id is a curated group; trip identity is train + service date; every id is namespaced and URL-safe.
- Cancelled and added trips are first-class; cancelled rows stay visible.
- One page per entity, one Details toggle; radio is later, opt-in, and never alters status.
- RT (including Amtraker) wins over the schedule; no track extrapolation ("Track TBD").

Disagreements (not resolved)

| Topic | Rider | GTFS | Fan | Taken into the design |
|---|---|---|---|---|
| Stale times | Show with age | Show with age, stop countdown | Show with age | Agreed in practice; thresholds are a config value |
| Non-stop passes on station page | Hide | Optional | Top feature | Off by default, "Passing" tab; user decision D3 |
| Radio note in default view | Never | Neutral | At "strong" only | Details only in phase 3; decision D8 |
| Merged vs per-agency boards | One board | One + filters | All platforms | One board + chips, platform column in Details |
| Pins / My stuff | Needs it | Neutral | Wants spots/watches | Phase 2, local storage first; decision D7 |

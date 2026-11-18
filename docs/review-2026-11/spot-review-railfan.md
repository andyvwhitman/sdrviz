# /spot review, railfan persona (first build, real transit data)

Tested 2026-11-17 19:46-19:53 EST against the review backend (8171) and page (5197), phone viewport 390x844,
real Amtrak/MARC/VRE feeds. Spots: Odenton, Halethorpe, BWI, Union Station, New Carrollton, an off-line "footbridge"
(39.15,-76.73: it turned out to be 2.8 km from any line, so it only exercised the empty state), and 39.5,-77.5.
I sampled the API every 30 s for 5 minutes at Odenton, BWI and New Carrollton and compared with `/vehicles`, the
Odenton MARC board (`/stations/marc:11985`) and the trip page.

## Verdict

The structure is right and, for MARC, it is already better than anything I carry: 446, 451, 448 and 455 at Odenton
match the station board to the second (19:46:32, 19:57:41, 20:33:00, 21:13:00), STOPS/PASSES is right everywhere I
checked (Acela 2128/2167/2127 PASS Odenton, Halethorpe and New Carrollton; MARC 451 PASSES Halethorpe but STOPS at
BWI and Odenton), NB/SB is right on the NEC, the schedule-only rows are honestly hollow with `~`, and the phone layout
fits with no horizontal scroll. The "no line / blocked location" states are good.

But I would not trust it on the platform yet for **Amtrak**. Amtrak positions in this feed are 2-5 minutes old, are
still called `live`, and the "position overrules the clock" rule anchors them to *now* instead of to the time of the
fix. Result: a train that has already gone by is shown as "NOW" or "~1 MIN" for minutes, then jumps to "PASSED".
That is the one failure that costs me a shot, so it is must-fix 1. Everything else is polish next to it.

## Must-fix

### 1. Position-based ETA ignores the age of the fix (BACKEND, `/approaching`)

Seen, all on the real feed:

- **BWI, 19:46:19 to 19:48:36.** Acela 2167 SB was `state: at_sp`, `eta_in_s: 0` on every poll for 2.5 minutes, its
  `delay_s` climbing 633, 710, 740, 771 (exactly 30 s per 30 s). The vehicle was a fix at BWI's coordinates, speed 0,
  `age_s` 219 to 295. At 19:49:06 the feed refreshed and the same train became `passed`, with `eta` 19:40:49
  (498 s ago). It had left BWI about 5 minutes before the page first said NOW.
- **Odenton, same train.** ETA slid 1:1 with the clock (`eta_in_s` stuck at 452 for 90 s, ETA 19:55:07 -> 19:56:08).
  After the refresh it became 19:51:30 (in 144), and by 19:52 it was already in "PASSED ~6M". On the page at 19:47-19:49 the
  header said "NEXT AT SPOT ~7 MIN, AMTK 2167" for a train that had actually gone by Odenton about 19:45.
- **New Carrollton, Amtrak 129 (112 mph, fix 157-295 s old).** ETA 19:49:02, then 19:49:37, then 19:50:08, `eta_in_s`
  stuck at 86-92 for a minute. The truth, once the feed refreshed: it passed at 19:46:56 (-131 s). Same pattern for 2167 at
  New Carrollton: `eta_in_s` frozen at 555 while the ETA rose 19:58:21 -> 20:00:52.

What it should be: the ETA from a position is `fix_time + distance_at_fix / speed`, with `fix_time = generated - age_s`,
never `generated + ...`. If that is already in the past the train has passed (or, if it was stationary at the fix,
"stopped, no better than X"). A train with `speed 0` is not "arriving in `distance / typical speed` seconds, forever":
show it as dwelling and do not slide its ETA. As the number is a lower bound it must also not make `delay_s` grow
by a minute per minute. (The doc says positions are held "within 130 mph"; at 112 mph with a 4-minute-old fix that
bound is meaningless unless it is anchored at the fix time.)

### 2. Amtrak fixes 3-5 minutes old are `basis: "live"` (BACKEND data, plus FRONTEND label)

Every Amtrak vehicle I looked at had `age_s` 147-296 (MARC: 14-37). All were `basis: live`, `stale: false`. The page
does tell the truth in small type ("TRACKED POS 5M"), but the row dot is the same solid square as a 20-second MARC
fix. For a train doing 112 mph, 5 minutes is 9 miles.
- Backend: give Amtrak a `stale_after_s` that matches Amtraker's real cadence (I would say mark `stale` past about 120 s
  and not let it overrule the clock past about 180 s), and expose the age on the train row (it is in `vehicle.age_s`).
- Frontend: when age is over about 60 s show a different basis glyph and the age on the row (`GPS 4m`), not just in the
  header. The persona asked for exactly this ("solid dot with age, red STALE").

### 3. Delay is not consistent along the same train (BACKEND)

Acela 2167, same minute, 19:47:36: delay at BWI +633 s, Odenton +627 s, New Carrollton +109 s (earlier: +795), Union
**0**. After the refresh: BWI passed +303, New Carrollton +194..+345, Union still 0 (sched 20:03:00, ETA 20:03:00). A
train that is 4-10 minutes late at every stop it has just passed is not on time at Union. Same smell for the
ETA geometry: at 19:46 Odenton 19:53:50 and New Carrollton 19:56:57 are 13 miles apart (about 250 mph) while the "to go" figures were 12.1 and
33.4 km. `delay_s` for a stop beyond the last reported one should carry the last known delay forward (as the doc says it
does for skipped stops), and ETAs further down the line must be at least ETA at the nearer point plus distance at a sane speed for the
operator. Union showed `to_go` of 47.7 km in 1001 s (107 mph) for a train that was sitting at BWI.

### 4. Parallel branches 2 km away are listed as trains "passing" my spot (BACKEND default plus FRONTEND)

- BWI (39.1923,-76.6941): MARC 858 and MARC 860, Camden Line trains, `pass_distance_m` **1974**, are rows 2 and 8 of the
  list ("PASSED 7M NB", ETA 20:29:57). Halethorpe: 858 and 860 at 886 m, shown as "EB ▶ PASSES".
  I am standing on the Penn Line platform and will never see these.
- At BWI the same Camden train is NB, at Halethorpe it is EB: the direction label flips between two points on the same
  line because the bearing sits near 45 degrees. For the railfan, a Camden Line train is "toward Camden" in both places.

Fix: default `radius_km` to about 0.5 (the persona asked for 300 m snap) and/or let the page dim and tag rows whose
`pass_distance_m` is over about 300 m ("0.9 km away, other line"), and by default hide them. Backend: keep one stable
direction label per trip/line (EB/WB for Camden/Brunswick) rather than bearing at the point.

### 5. Tapping a row navigates away from the page (FRONTEND)

On the phone, tapping a train row opens the map with the train window (screenshot shows it) and I have lost my spot,
the countdowns and the scroll position. On the platform I want the row to expand in place (consist, radio, stops, basis
age), with the train window as a link in it. At least keep the back gesture returning to the same /spot state.

### 6. MEET strip labels overlap (FRONTEND)

At Union (390 px) the text on the timeline strip reads "MEET~208052": the two MEET labels print on top of each other
and of the axis. Also a MEET at the terminal station (Acela 2128 NB leaving and 2167 SB arriving at 20:02-20:03) is
not a meet for a spotter; suppress MEET for two trains that both stop at the spot, or when the spot is a terminal.

### 7. Rows show minutes only, no clock time (FRONTEND)

The persona asked for the clock time in big type with `~`, and countdown beside it. Rows show "~28 MIN" and nothing
else; there is no 19:24 anywhere on a row. A countdown cannot be compared with a timetable or with what the radio says.
Also the countdown only updates per minute (`7 MIN` -> `6 MIN`), while inside 2 minutes I want seconds ("1:42"), as the
persona asked.

## Nice-to-have

- **Spot name in the header.** Halethorpe (6 m from the line) only says "SPOT · NORTHEAST REGIONAL"; Odenton says "NEAR
  ODENTON"; Union says "FREDERICKSBURG LINE" (the VRE line was merely the nearest) and New Carrollton says "PENN -
  WASHINGTON". Prefer the corridor name ("NEC") and the nearest station within 300 m ("AT HALETHORPE").
- **Union dwell.** For a train that stops at the spot (Union, a terminal), show arrival and departure. 186 and 90 are
  listed once, at the arrival ETA; for Silver Star 90 the NC ETA was 32 minutes after the Union ETA, which looks like
  an error until you know about the dwell. Also 2128 is the originating train, ETA 20:02 at Union is its departure.
- **Delay chip threshold.** MARC 451 +101 s shows no chip and 2167 shows "+10 MIN"; fine, but show the chip from +2
  minutes and say "early" for early trains, as I would like to know 129 is 6 minutes early at Union.
- **Estimated trains with no vehicle** (2128, `basis: estimated`, `eta_basis: realtime`) look good. Say where the train is
  ("at Penn Station, departs 19:20") in the Where-now line when `vehicle` is null; today it is blank.
- **Radio column** is not there yet (expected for v1); "no radio contact" should be an explicit state when it lands.
- **VRE** returned zero trains at Union at 19:46 (the evening service had ended); plausible but I could not verify
  the VRE path with a train in the window. Re-test at 16:30.
- **Mid-gap spots.** I never got a clean mid-gap footbridge sample (my 2.8 km miss). The "NO LINE WITHIN 2 KM · USE IT"
  state is good; add the nearest line's distance in metres when it is under 3 km, and offer snapping.
- **Odenton "stops" check.** 446 showed `speed 0`, at_sp, 21 s after its ETA while dwelling at Odenton; flipping to PASSED
  1 minute later matched the board's 19:45:51 departure. Good. Consider showing "DEPARTED" for stopping trains.

## Cross-check summary

| Check | Result |
|---|---|
| MARC at Odenton vs station board | Match to the second (446, 451, 448, 455) |
| STOPS/PASSES | Right for every Penn Line and Acela row; Camden Line rows are noise (item 4) |
| NB/SB on NEC | Right; EB/WB flips on Camden Line (item 4) |
| Passed trains | Shown for 10 minutes, dim; but see item 1 (late, then jump) |
| Real vs estimated | `~` and hollow for schedule rows is clear; Amtrak "live" is overstated (item 2) |
| Delay vs ETA | Equal by construction; inconsistent along a train (item 3) |
| Empty / blocked / no line | Good ("NO LINE WITHIN 2 KM", "LOCATION BLOCKED, PICK A STATION", "NO TRAINS IN THE NEXT 60 MIN") |
| Tick-down | MARC rows tick correctly; Amtrak position rows freeze or slide (item 1) |

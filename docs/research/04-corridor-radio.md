# 04 — Corridor Radio Research (DC to Baltimore)

Compiled 2026-11-08 by the Corridor Radio Researcher (reports to gmunk-director).
Area covered: about 20 mi south of Washington DC (Quantico / Woodbridge, VA) to about 20 mi north of Baltimore (Edgewood / Aberdeen, MD), plus Perryville as the NEC anchor at the north end.

Seed files written:

| File | Contents |
|---|---|
| `data/seed/frequencies.json` | 33 channels with AAR number, railroad, use, line, mode, confidence, notes, source URLs |
| `data/seed/places.json` | 37 stations, 17 landmarks/yards/tunnels (3 added in audit), 13 defect detectors, 4 **fictional** SDR feed sites |
| `data/seed/banks.json` | 3 banks: NEC Corridor (9), Freight - CSX/NS (15), Commuter (8) |
| `data/seed/transmissions.json` | 92 **fictional** transmissions over a 24 h period |

All JSON is produced by a small generator script (kept in the researcher's scratchpad, not the repo). It validates AAR math, bank/feed references, and checks that no two transmissions on one channel overlap.

---

## 1. AAR channel formula

The classic AAR plan uses 15 kHz steps from channel 07 (160.215 MHz) to channel 97 (161.565 MHz). Anchor values match the published list at <https://www.qsl.net/n4jri/aar_ch.htm> (07 = 160.215, 08 = 160.230, 54 = 160.920, 97 = 161.565). The same list also appears in on-track-on-line's Amtrak tables (<https://www.on-track-on-line.com/amtfreq-nec.shtml>).

```
aar_channel = (freq_mhz - 160.110) / 0.015        valid for 07..97
freq_mhz    = 160.110 + 0.015 * aar_channel
```

- Channels 02–06 (159.810–160.200) do not follow this spacing (same qsl.net list).
- **Narrowband / NXDN:** RadioReference forum posts report that the AAR plan adds 6.25 kHz "very narrow" channels numbered 307–497, placed between the 15 kHz centres, for NXDN-VN. They also report that CSX radios are mostly Kenwood NXDN-capable and that NS licenses list both 12.5 kHz FMN and 6.25 kHz NXDN (<https://forums.radioreference.com/threads/railroads-and-nxdn.362261/page-2>, <https://forums.radioreference.com/threads/aar-narrowband-migration.234739/>). These are **self-reported forum claims**, so confidence is low. The exact 3xx/4xx numbering scheme was not verified against AAR S-9556, which is not public. The AREMA ballot document that references the plan is at <https://arema.org/files/comm/ballots/CSIT/MP%2022.01.01%20Rev%202025%20Clean.pdf>.
- **Mode in seed data:** every entry is `NFM` (analog narrowband FM). The Baltimore Broadcastify feed has a line for "NXDN digital channels" but gives no frequencies (<https://www.broadcastify.com/listen/feed/43356>). For the mockup, treat NXDN as a future mode flag. A 2.4 MS/s capture centred near 160.89 MHz covers the whole 160.215–161.565 band.
- **Telemetry (not voice):** the Kensington feed notes 452/457 MHz DPU/EOT data (<https://m.broadcastify.com/listen/feed/35407>). That is outside the one-stream AAR band and is not in the seed data.

## 2. Frequencies

Confidence key: **high** = several independent sources agree, including a 2025–26 feed listing. **med** = one good source, or older wiki data. **low** = a single hobbyist label, conflicting sources, or use not documented.

### Amtrak / Washington Terminal

| MHz | AAR | Use | Line / area | Conf. | Sources |
|---|---|---|---|---|---|
| 160.920 | 54 | Road / dispatcher | NEC, Washington to Perryville and beyond. MARC Penn Line runs on it | high | [otol](https://www.on-track-on-line.com/amtfreq-nec.shtml), [RRDB PA](https://www.radioreference.com/db/subcat/89592), [Bcfy Balt](https://www.broadcastify.com/listen/feed/43356), [railfanguides](https://railfanguides.us/dc/map2/index.htm) |
| 160.440 | 22 | Terminal | Washington Union Station area | med | [otol](https://www.on-track-on-line.com/amtfreq-nec.shtml), [PTV](https://philadelphiatransitvehicles.info/?p=2721), [Franconia](https://www.broadcastify.com/listen/feed/34638) |
| 160.290 | 12 | Terminal (K Tower) | Union Station | med | [Franconia](https://www.broadcastify.com/listen/feed/34638) |
| 160.350 | 16 | Terminal ops 2 | Union Station | med | [Franconia](https://www.broadcastify.com/listen/feed/34638) |
| 160.995 | 59 | Yard | Ivy City | med | [Franconia](https://www.broadcastify.com/listen/feed/34638) |
| 160.515 | 27 | MOW | NEC | med | [RRDB PA](https://www.radioreference.com/db/subcat/89592), [Franconia](https://www.broadcastify.com/listen/feed/34638) |
| 160.815 | 47 | MOW (PA) / "road" (VA) | NEC | low | same as above |
| 161.295 | 79 | Police | Amtrak PD, DC area | med *(raised in audit)* | [Franconia](https://www.broadcastify.com/listen/feed/34638), [RR forum](https://forums.radioreference.com/threads/amtrak-police-channel.132409) |
| 160.365 | 17 | Auto Train (use unknown) | Lorton, VA | med *(raised in audit)* | [Franconia](https://www.broadcastify.com/listen/feed/34638) |

Notes:
- A 2021 Amtrak Mid-Atlantic "PW Line" PDF on trainaficionado.com was seen only as a search snippet. It called 160.290 "Washington Terminal Operations 1" and 160.350 "Operations 2", and the PDF now returns 404. Its old URL is <https://www.trainaficionado.com/wp-content/uploads/2021/04/Mid-Atlantic-Division-PW-Line-APRIL2021.pdf>. **Unverified.**
- Ivy City: the Franconia feed's own channel table says 160.995. A search-engine summary attributed 160.350 to Ivy City instead. The seed data uses 160.995 and flags the conflict.
- No MARC-specific channel was found. MARC trains use the host railroad's channels: Amtrak on the Penn Line, CSX on Camden and Brunswick (<https://m.broadcastify.com/listen/feed/35407>). This is **inferred** from host-railroad practice.

### CSX (Baltimore Division)

| MHz | AAR | Use | Line / area | Conf. | Sources |
|---|---|---|---|---|---|
| 160.230 | 08 | Road | Capital, Alexandria Ext., Metropolitan, Old Main Line, Baltimore Terminal, Philadelphia subs. MARC Camden/Brunswick | high | [Capital](https://wiki.radioreference.com/index.php/WS-Capital_Sub), [BZ](https://wiki.radioreference.com/index.php/BZ-Baltimore_Terminal_Sub), [Metro](https://wiki.radioreference.com/index.php/ME-Metropolitan_Sub), [OML](https://wiki.radioreference.com/index.php/OM-Old_Main_Line_Sub), [Phila](https://wiki.radioreference.com/index.php/PA-Philadelphia_Sub), [Bcfy Balt](https://www.broadcastify.com/listen/feed/43356) |
| 160.320 | 14 | Dispatcher (BC) | Capital, Alexandria Ext., Metropolitan, OML | high | same set |
| 161.100 | 66 | Dispatcher (BE) | Baltimore Terminal, Philadelphia subs | high | [BZ](https://wiki.radioreference.com/index.php/BZ-Baltimore_Terminal_Sub), [Phila](https://wiki.radioreference.com/index.php/PA-Philadelphia_Sub), [Bcfy Balt](https://www.broadcastify.com/listen/feed/43356) |
| 161.550 | 96 | Road | RF&P Sub (VRE Fredericksburg Line) | high | [RF&P](https://wiki.radioreference.com/index.php/RR-Richmond_Fredericksburg_and_Potomac_Sub), [otol](https://www.on-track-on-line.com/amtfreq-nec.shtml), [Franconia](https://www.broadcastify.com/listen/feed/34638) |
| 160.410 | 20 | Dispatcher (BD) | RF&P Sub | high | same set |
| 161.400 | 86 | Dispatcher (BF) | Hanover Sub | high *(raised in audit)* | [Bcfy Balt](https://www.broadcastify.com/listen/feed/43356) |
| 161.070 | 64 | Road | Landover Sub (DC) | med | [Landover](https://wiki.radioreference.com/index.php/L0-Landover_Sub), [Franconia](https://www.broadcastify.com/listen/feed/34638) |
| 161.340 | 82 | Dispatcher (desk "BC" per wiki, "NI" per feed) | Landover Sub | med | same set |
| 160.785 | 45 | MOW | N. Virginia | high *(raised in audit)* | [Franconia](https://www.broadcastify.com/listen/feed/34638) |
| 160.875 | 51 | Police | CSX PD | med | [Franconia](https://www.broadcastify.com/listen/feed/34638) |
| 161.490 | 92 | Yard | Jessup (BAA17.0) | med | [Capital](https://wiki.radioreference.com/index.php/WS-Capital_Sub) |
| 160.800 | 46 | Yard | Benning (QL133.5) | low *(lowered in audit: conflicts with Franconia "AMTK01 Amtrak")* | [Landover](https://wiki.radioreference.com/index.php/L0-Landover_Sub) |
| 160.530 | 28 | Yard | Bayview (BAK89.6) | high | [Phila](https://wiki.radioreference.com/index.php/PA-Philadelphia_Sub), [Bcfy Balt](https://www.broadcastify.com/listen/feed/43356) |
| 160.470 | 24 | Yard | Locust Point | high | [BZ](https://wiki.radioreference.com/index.php/BZ-Baltimore_Terminal_Sub), [Bcfy Balt](https://www.broadcastify.com/listen/feed/43356) |
| 161.160 | 70 | Yard | Curtis Bay | high | same set |
| 161.055 | 63 | Industrial switching | Seawall, Marley Neck | med | [Bcfy Balt](https://www.broadcastify.com/listen/feed/43356) |
| 161.220 | 74 | Coal pier | Curtis Bay | med | [Bcfy Balt](https://www.broadcastify.com/listen/feed/43356) |

Defect detectors: the wiki pages list detector locations but not their frequencies. Based on standard practice, the seed data assumes each detector talks on its sub's road channel. The Franconia feed hears RF&P detectors MP 95.8, 106.4 and 84.6 while scanning, which is consistent with this but does not prove it (<https://www.broadcastify.com/listen/feed/34638>). The feed's MP 106.4 detector near Alexandria is not on the 2018 wiki page. It may be newer and is not in the seed data.

### Norfolk Southern

| MHz | AAR | Use | Line / area | Conf. | Sources |
|---|---|---|---|---|---|
| 160.950 | 56 | Road | Hagerstown District (Alexandria to Manassas, B-Line). VRE Manassas Line | high | [Manassas](https://www.broadcastify.com/listen/feed/20190), [Franconia](https://www.broadcastify.com/listen/feed/34638) |
| 160.245 | 09 | Dispatcher (Hagerstown desk, Atlanta) | same | med | [Franconia](https://www.broadcastify.com/listen/feed/34638) |
| 161.565 | 97 | MOW | N. Virginia | low *(lowered in audit)* | [Franconia](https://www.broadcastify.com/listen/feed/34638) |
| 161.070 | 64 | Yard | Bayview / Baltimore ops (Lancaster YM) | med | [Bcfy Balt](https://www.broadcastify.com/listen/feed/43356) |

- NS is moving from one channel per district to a road + dispatcher pair (<https://forums.radioreference.com/threads/norfolk-southern-rail-frequency-changes.394254>, a forum report). Older sources call the Virginia territory the "Washington District". The Manassas feed calls it "Hagerstown District".
- 161.070 is used for both CSX Landover Sub (DC) and NS Bayview (Baltimore), about 35 mi apart. The schema allows the same frequency under different ids, and the UI should not assume frequencies are unique.
- An NS Port Road Branch claim of 160.980 or 161.070 is out of area and conflicting, so it was left out (<https://forums.radioreference.com/threads/ns-frequency-changes-system-wide.392979/page-6>).

### Others (Baltimore harbor)

| MHz | AAR | Railroad | Use | Conf. | Source |
|---|---|---|---|---|---|
| 160.980 | 58 | Canton Railroad | Road/yard | med | [Bcfy Balt](https://www.broadcastify.com/listen/feed/43356) |
| 160.590 | 32 | Tradepoint Rail | Road | med | [RRDB](https://www.radioreference.com/db/subcat/90744) |
| 160.845 | 49 | Tradepoint Rail | MOW | med | [RRDB](https://www.radioreference.com/db/subcat/90744) |

The RRDB also lists Tradepoint 161.115 and 161.520 without a use. Those two are left out.

**Not found / left out:** a dedicated VRE channel, a dedicated MARC dispatch channel, Amtrak NEC defect detectors (none documented for this stretch), and the Amtrak NEC dispatcher desk name.

## 3. Places

- **Stations (37):** coordinates are from Wikidata P625, pulled via each station's Wikipedia article. Every record has a `source` link to its Wikidata item. NEC mileposts (`NEC 95.7` etc., counted from Philadelphia) come from <https://en.wikipedia.org/wiki/List_of_Northeast_Corridor_infrastructure>. CSX mileposts (CFPxx, BAAxx, ...) come from the RadioReference sub pages.
- **Landmarks (14):** yards, tunnels and bridges. Several are neighbourhood or nearby-item centroids. Benning Yard's coordinate is an **unsourced approximation** (low confidence). Each such case is flagged in `note`.
- **Rail lines (for the map):** NEC / MARC Penn (Washington–Baltimore–Perryville). CSX Capital Sub / MARC Camden (Washington–Camden Station). CSX Metropolitan Sub / MARC Brunswick (Washington–Silver Spring–Gaithersburg). CSX RF&P / VRE Fredericksburg (Union Station–L'Enfant–Long Bridge–Alexandria–Quantico). NS / VRE Manassas (Alexandria–Burke–Manassas). CSX Landover Sub (Landover–Benning–Virginia Ave tunnel). CSX Baltimore Terminal (Howard St tunnel, Locust Point, Curtis Bay). CSX Philadelphia Sub (Bayview to the NE). CSX Old Main Line (Halethorpe/St Denis to the W). Geometry should come from OSM per decision #10.
- **Detectors (13):** names, mileposts and coordinates are from the RadioReference wiki pages cited above. The wiki gives exact coordinates.

### Fictional SDR feeds (clearly marked `fictional: true`)

| id | Name | lat, lon | Radius | Hears |
|---|---|---|---|---|
| feed-alx | ALX-01 Alexandria | 38.8150, -77.0700 | 18 km | RF&P, NS, NEC terminal, police, MOW |
| feed-lnd | LND-02 New Carrollton | 38.9420, -76.8850 | 20 km | NEC, Washington Terminal, CSX Capital/Landover, Benning, Jessup |
| feed-bwi | BWI-03 Elkridge | 39.2150, -76.7150 | 16 km | NEC, CSX Capital/OML, Jessup |
| feed-bay | BAY-04 East Baltimore | 39.2950, -76.5600 | 22 km | NEC, CSX BE/Bayview/harbor, NS Bayview, Canton, Tradepoint |

Each feed site is placed in a general area, not at a real address. Hardware strings are fictional too.

## 4. Banks

1. **NEC Corridor** (9): 160.920, 160.440, 160.290, 160.350, 160.995, 160.515, 160.815, 161.295, 160.365
2. **Freight - CSX/NS** (15): 160.230, 160.320, 161.100, 161.550, 160.410, 161.070 (CSX), 161.340, 160.785, 160.530, 161.160, 160.470, 161.490, 160.950, 160.245, 161.070 (NS)
3. **Commuter** (8): 160.920, 160.230, 160.320, 161.550, 160.410, 160.950, 160.245, 160.995

A possible fourth bank, **Baltimore Harbor** (Canton, Tradepoint, Curtis Bay, Locust Point, Seawall, coal pier), is left for the designer to decide on.

## 5. Dummy transmissions (all FICTIONAL)

There are 92 transmissions on 30 channels. They are spread across 24 h, with peaks around the morning (05:00–09:00) and evening (15:00–18:00) commuter rushes and steady freight traffic overnight. Each record has `t_offset_s`, `clock_local`, `frequency_id`, `freq_mhz`, `aar_channel`, `feed_id`, `speaker_role`, `speaker`, `duration_s` (estimated at about 2.6 words/s + 1 s) and `transcript`.

Speaker roles used: crew, dispatcher, detector, yardmaster, operator, MOW, police.

Authenticity choices:
- **Real place names and mileposts:** detector mileposts are real (St. Denis 6.7, Hyattsville 33.7, Newington 95.8, Neabsco 84.6, Waverly 92.3, White Marsh 80.4, Belcamp 68.2, Kensington 11.6, Laurel 21.7, Ilchester 10.7). So are signal names: RF&P (Van Dorn, AF, RO, Slaters Lane, Lorton, Pohick), NS (CR Tower, Edsall, Springfield, Burke), and CSX control point HB from the Baltimore feed.
- **Invented events and numbers:** the events themselves, axle counts, train speeds, unit numbers, crew calls and the Hyattsville hotbox defect are made up. Train symbols are plausible but invented: CSX Q/M/I/K/E/L/Y symbols, NS 213/H75, Amtrak 66/67/86/95/125/176/2104/2153/2163/2257, MARC 4xx (Penn) and 8xx (Camden/Brunswick), and VRE 3xx.
- **Simplification:** Amtrak NEC signal calls use station names (e.g., "approach medium, Odenton") rather than interlocking names. The research did not verify most NEC interlocking names beyond Landover, Bowie and C.

## 6. Open items / caveats

- Most RadioReference wiki pages were last edited between 2017 and 2023. The two Broadcastify listings (Baltimore, 10/22/2025, and Franconia, live 2026) are the most current sources. Several Franconia channels are marked "turned off" by their owner, which means not heard, not necessarily retired.
- NXDN use in the corridor is unconfirmed. When a real SDR is attached, run a scan to check.
- Amtrak police traffic may be encrypted or on a separate system: an FCC filing notes Amtrak PD is on a separate radio system (<https://docs.fcc.gov/public/attachments/DOC-334884A2.pdf>). If it is heard, consider whether to show it at all.

---

## Verification log (adversarial audit, 2026-11-08)

Auditor: adversarial verifier, gmunk-director research team. Method: re-opened every cited page with WebFetch, ran at least one independent WebSearch per channel, recomputed AAR math, and resolved yard and station coordinates against Wikidata (`wbgetentities`) and OpenStreetMap Nominatim. Statements below marked **(snippet)** come from search-engine summaries of pages that could not be opened directly. Treat them as unverified.

### Checks that passed

- **AAR math:** all 33 entries satisfy `(f − 160.110) / 0.015 = aar_channel` exactly, and every channel is inside 07–97. The anchor values (07 = 160.215, 08 = 160.230, 09 = 160.245, 12 = 160.290, 54 = 160.920, 96 = 161.550, 97 = 161.565, and the irregular 02–06) match <https://www.qsl.net/n4jri/aar_ch.htm>.
- **Fabrication check:** every frequency appears verbatim on at least one cited page. Nothing was removed.
  - Franconia feed listing re-fetched: <https://www.broadcastify.com/listen/feed/34638>.
  - Baltimore feed re-fetched ("as of 10/22/2025"): <https://www.broadcastify.com/listen/feed/43356>.
  - RRDB NE Corridor (PA) and Tradepoint pages re-fetched: <https://www.radioreference.com/db/subcat/89592>, <https://www.radioreference.com/db/subcat/90744>.
  - All seven CSX wiki sub pages re-fetched. Each one matches the seed values for road, desk, yard and detector mileposts and coordinates.
- **Railroad attribution:** consistent with the sources, except for the conflicts listed below.
- **transmissions.json:** all 92 records reference a `frequency_id` that exists in frequencies.json, with matching `freq_mhz` and `aar_channel`. All `feed_id`s exist, and each feed's `hears` list contains the channel it is logged on. All detector `frequency_id`s and bank members resolve.
- **places.json stations:** all 50 Wikidata-sourced coordinates match the cited item's P625 exactly (0.00 km difference). Each item's English label matches the station it is used for.

### Changes to `data/seed/frequencies.json`

Every change is also recorded in the entry's `notes`, prefixed `[verify]`. A `meta.verified` field was added.

| id | Change | Why |
|---|---|---|
| csx-benning | med → **low**; Franconia added as a (conflicting) source | Franconia labels 160.800 "AMTK01 Amtrak", not CSX Benning. The only CSX source is the 2017 wiki (<https://wiki.radioreference.com/index.php/L0-Landover_Sub>). |
| ns-mow | med → **low** | Single feed label. Searches found 161.565 only as an NS dispatcher channel elsewhere (<https://railroadfan.com/wiki/index.php/NS_Radio_Frequencies>, snippet). A forum claim (snippet, unverified) says NS has no system-wide MOW channel. |
| csx-bf-disp | med → **high**; Hanover wiki added | <https://wiki.radioreference.com/index.php/HV-Hanover_Sub> (2017) gives road 160.230 and BF dispatcher 161.400. RRDB PA (<https://www.radioreference.com/db/aid/3166>) calls the same frequency "086 BE Disp", so the desk letter is in dispute but the frequency is not. |
| csx-mow | med → **high**; RRDB PA added | RRDB PA CSX listing tags 160.785 "045 MOW" (<https://www.radioreference.com/db/aid/3166>). |
| csx-police | RRDB PA added; mode caveat | RRDB PA lists 160.875 "051 Police" as **NXDN digital**. The mode is left as `NFM` because the Franconia analog scanner hears it, but treat the mode as uncertain. |
| amtk-police | low → **med**; DC scanning blog added | 2015 blog (self-reported): 161.2950 is licensed to Amtrak at Lorton (<https://dcscanning.blogspot.com/2015/08>). The Union Station "ch 079 Amtrak Police" and RRDB DC "PL 156.7" claims are snippets only. |
| amtk-auto-train | low → **med**; DC scanning blog added | Same blog: 160.3650 is licensed to Amtrak at Lorton. The use is still undocumented. |
| csx-ni-disp | `line` rewritten to show both desk names | No source puts the NI desk on Landover. Search results (snippet) tie NI to the Trenton Sub. The wiki says BC. The 161.340 frequency is confirmed by two sources. |
| amtk-ivy-city | "160.350 conflict" note removed and replaced | No primary page reproduces it. During this audit a search summary made the same kind of row mix-up, so the original claim was most likely a summary artifact. 160.995 for Ivy City remains **single-source**: the only independent hit is a forum post that hears unidentified traffic on 160.995 (snippet). |
| ns-hag-disp | Manassas feed and railroadfan NS list added | 160.245 is a documented NS dispatcher channel in other districts. Nothing independent ties it to the Hagerstown District. Kept at med. |
| csx-road | note added | The Kensington feed URL (<https://www.broadcastify.com/listen/feed/35407>) served an unrelated non-rail feed on 2026-11-08, probably because the feed is offline. Its content (160.23 road, 452/457 MHz DPU, MARC) is now known only from a snippet. |
| csx-be-disp | note added | 161.100 is also "heavily used at Lorton" by Auto Train (<https://on-track-on-line.com/autotrain-misc.shtml>), which confirms the Franconia "AUTO 1" label. |
| tpr-mow | note added | 160.845 is also licensed to Amtrak at Lorton (<https://dcscanning.blogspot.com/2015/08>), which matches Franconia "AMTK 1". |
| amtk-wash-ops2 | note added | The 2021 Amtrak PDF snippet again shows "160.350 MHz Washington Terminal Operations 2". The PDF still returns 404. |

Confidence totals after the audit: high 12, med 18, low 3. Before the audit they were high 10, med 20, low 3.

### Changes to `data/seed/places.json`

| id | Change | Why |
|---|---|---|
| benning-yd | 38.896, −76.950 → **38.89032, −76.95651** | The old value was an unsourced estimate. The new one is the OSM "Benning Yard" feature (about 0.8 km away). |
| ivy-city | → **38.91521, −76.99013** | The old value was the neighborhood centroid. The new one is the OSM "Ivy City Yard" feature (about 0.7 km away). |
| locust-point | → **39.26777, −76.60588** | The old value was the neighborhood centroid. The new one is the OSM "Locust Point Yard" feature (about 1.3 km away). |
| curtis-bay | → **39.23637, −76.59076** | The old value was the neighborhood centroid. The new one is the OSM "Curtis Bay Yard" feature (about 1.1 km away). |
| lorton | Renamed "Lorton (VRE)" and Auto Train line removed | The Wikidata point is the VRE station, 38.7150, −77.2144 (<https://en.wikipedia.org/wiki/Lorton_station_(VRE)>). The Auto Train terminal is a separate site. |
| lorton-auto-train | **Added**: 38.7084, −77.2207 | <https://en.wikipedia.org/wiki/Lorton_station_(Auto_Train)>. Matches the OSM station node. |
| bayview-yd, jessup-yd | **Added** (OSM yard features) | The seed had channels for these yards but no map point. |
| alexandria, lorton, woodbridge, quantico | `milepost_note` added | The CFP station mileposts are not on any cited page. They are consistent with the wiki's detector and control-point mileposts but are **estimates**. |
| wash-union | `milepost_note` added | "NEC 135.7" is derived: C Interlocking is at 134.6 on Wikipedia's list, plus about 1.1 mi to Union Station. |

The NEC station mileposts (Perryville 59.5 … New Carrollton 127.0, Landover 128.8, Gunpowder bridge 78.9) all match <https://en.wikipedia.org/wiki/List_of_Northeast_Corridor_infrastructure>. All 13 detector coordinates and mileposts match the wiki pages. The fictional feed sites were not checked, since they are fictional by design.

### Not changed, but flagged

- **transmissions.json, tx-088:** "NS detector Burke, milepost 18.8" is not in any source. The Manassas feed lists NS detectors at 31.6, 39.4, B10.1 and B19.7 (<https://www.broadcastify.com/listen/feed/20190>). Section 5 says detector mileposts are real, so this one should be treated as invented. Either relabel it or move it to a sourced detector.
- **transmissions.json, tx-052/060/061:** the transcripts say "NI dispatcher". Given the desk dispute above, a neutral "Landover dispatcher" would be safer.
- **Candidate addition (not added):** Auto Train on 161.100 at Lorton is well supported (Franconia, On Track On Line). The ALX-01 feed could carry it as a separate id, since the same frequency is CSX BE in Baltimore. The designer or director should decide.
- **FCC claim in section 6:** <https://docs.fcc.gov/public/attachments/DOC-334884A2.pdf> could not be text-extracted in this audit, so the "Amtrak PD on a separate radio system" claim is **unverified**.
- **NS Port Road and Tradepoint 161.115 / 161.520 exclusions:** I agree with leaving them out.
- **Generator script:** the original generator lives in the researcher's scratchpad. Re-running it would overwrite these hand fixes, so apply them upstream first.
- **Unreachable during the audit:** RadioReference forum threads (HTTP 503) and the trainaficionado 2021 PDF (HTTP 404). Every claim that depends on them stays marked unverified.

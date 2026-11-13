# 01 — GMUNK Film Work: Oblivion, Tron: Legacy, Tron: Ares

Research by the Film Work Analyst for the gmunk-director. Compiled 2026-11-08.

**How to read this document**
- Every factual claim has a source link. Most primary material is GMUNK's own portfolio (gmunk.com), which is **self-reported** framing by the studio. Third-party press is noted as such.
- **[ESTIMATE]** marks values I derived myself, mainly hex colors. No published source gives exact hex values for any of the three films. They are approximations for sdrviz tokens, not specs.
- **[UNVERIFIED]** marks fan identifications, secondhand reports, or sources I could not open directly.
- No film stills are embedded. Reels and breakdown pages are linked.

---

## 1. Who GMUNK is (short)

- Bradley G. Munkowitz ("GMUNK") is a design director who now runs GMUNK Studio, Inc. His portfolio lists *Tron: Legacy* (Dec 2010, "Feature Film Hologram Design"), *Oblivion* (Apr 2013, "Feature Film Interface Design"), and two *Tron: Ares* projects (Oct 2025, "Computer Vision" and "Finding Eve"). Source: https://gmunk.com
- On *Tron: Legacy* he worked as a freelancer who put together a team inside Digital Domain, not as a DD staffer: "We were this outside unit that just parked in a corner of Digital Domain facility and just did our own thing." Source: https://www.pushing-pixels.org/2011/06/01/visual-effects-of-tron-legacy-and-beyond-conversation-with-gmunk.html
- His long collaborator across both Kosinski films is director Joseph Kosinski. On *Oblivion* he said the team "worked directly with one layer, and that was Joe directly", with "no studio input, at least on the graphics." (GMUNK's comment on the Motionographer post.) Source: https://motionographer.com/2013/04/19/bradley-g-munkowitz-oblivion-screen-graphics

---

## 2. Oblivion (2013)

### 2.1 Scope and credits
- The work was done for Crater Lake Productions / director Joseph Kosinski in three parts: Light Table UI, Bubbleship UI, and HUD GFX (drone, scope, weapons, vehicles). GMUNK was Design Director. Other credits include Jake Sargeant, Joseph Chan(imal), Alexander Perry, David Lewandowski and Navarro Parker. Source: https://gmunk.com/OBLIVION-GFX
- Pixomondo did the VFX integration of the table and cockpit shots. Danny Yount (Prologue Films) designed the titles. Source: https://www.provideocoalition.com/hud-and-gui-graphics-in-oblivion/

### 2.2 Visual language
- **The brief (verbatim):** "functionality and minimalism while utilizing a bright, unified color palette", made to work on both dark and light backgrounds. Source: https://gmunk.com/OBLIVION-GFX (also quoted at https://motionographer.com/2013/04/19/bradley-g-munkowitz-oblivion-screen-graphics)
- **Consistency as a rule:** the team "designed and animated all of the HUD UI for the various machines and weaponry in the film" so the whole film shares one visual language. Source: https://gmunk.com/OBLIVION-GFX
- **Greeble kept under control:** the drone and scope HUDs favored function over excess and kept "Greeble" in check. Source: https://gmunk.com/OBLIVION-GFX
- **Typeface:**
  - UI font: **Blender** (Nik Thoenen; Gestalten/Binnenland, 2003). This comes from Navarro Parker as reported by ProVideo Coalition, so it is secondhand. Sources: https://www.provideocoalition.com/hud-and-gui-graphics-in-oblivion/ and https://www.typewolf.com/blender
  - Main title: Neutraface. **[UNVERIFIED]**, fan ID only. Source: https://www.dafont.com/forum/read/411463/oblivion-2013-end-credits-font-please-read-before-assuming-anything
- **Line weights and geometry (observed in the linked reels; my reading, not sourced to the designers):** thin, single-weight hairlines; circular radar and compass rings with fine tick marks; rectangular panels with corner brackets instead of full boxes; small uppercase labels with wide letter-spacing; a lot of empty space. Watch: https://vimeo.com/64377100 (GFX Montage) and https://vimeo.com/67778891 (Oblivion FUI Process Reel)
- **Color:**
  - The base is white/pale-blue linework. A third-party UX critique notes the HUD's white "could pose a potential accessibility issue" against bright backgrounds.
  - Red is reserved for alerts and warnings: "clearly shown through strategic use of the color red". Source: https://fuzzymath.com/blog/evaluating-interface-design-of-oblivion
  - Approximate tokens **[ESTIMATE]**: line white `#F2F7FA`; pale cyan `#BFE6F2`; mid cyan `#5FC8E6`; alert red `#E8463A`; warm accent orange `#F2A03D`; background (dark screens) `#05080B`; light-table white surface `#E9EEF1`.
- **Glow/bloom:**
  - Kept low. On light-table screens the lines read as crisp and luminous rather than heavy neon.
  - In the Bubbleship, the hologram sits in the glass. Pixomondo added "reflections, scratches, and smudges" to the cockpit glass so it felt physically present. Source: https://www.provideocoalition.com/hud-and-gui-graphics-in-oblivion/

### 2.3 Information-design patterns
- **Light Table as a four-screen ops console:** main map (Bubbleship, Drone and Scav positions), Drone Monitor (vitals and fuel), Hydro Rig monitor (resource collection), and Weather screen (Tet status and weather vitals). Extras: a Map Diagnostic screen on a white tabletop and standalone "Rogue Signal" analysis windows. Source: https://gmunk.com/OBLIVION-GFX
  - This is the closest film analog to sdrviz: a fixed grid of status panels plus a map, watched for long stretches by an operator (Vika).
- **Alerts:** out-of-commission drones and radiation zones are flagged red on the map. On the Bubbleship HUD, a radiation proximity warning moves the distance readout to the center for an at-a-glance read. The motorcycle low-fuel warning alternates with speed/gear instead of replacing them. Source: https://fuzzymath.com/blog/evaluating-interface-design-of-oblivion
- **Critique worth keeping:** the light table gives every section equal space, though the primary workflow deserves more. Red is also reused for the non-alert radar target, which muddies the meaning. Source: https://fuzzymath.com/blog/evaluating-interface-design-of-oblivion
- **Signal analysis as a window:** the "Rogue Signal" windows are a direct film precedent for an RF-signal inspector panel. Source: https://gmunk.com/OBLIVION-GFX

### 2.4 Motion language
- The GFX Montage and FUI Process Reel show the motion (https://vimeo.com/64377100, https://vimeo.com/67778891). My observations, not designer statements:
  - Panels build on line by line: frame first, then ticks, then labels, then data.
  - Rings rotate and radar sweeps rotate.
  - Numbers count up.
  - Glitches are short and rare.
- Much of the light-table animation played back practically: "played as practical on-set animations on plasma screens embedded into the table", or comped by Pixomondo where Vika interacts with it. Source: https://www.provideocoalition.com/hud-and-gui-graphics-in-oblivion/
- Drag-and-drop from the light table to the HUD is called "pretty clear, not to mention intuitive". Source: https://fuzzymath.com/blog/evaluating-interface-design-of-oblivion

### 2.5 Tools and process
- Two-part process, delivered as flat screen graphics, built mainly in **Illustrator and After Effects with some Cinema 4D**. **[UNVERIFIED]**: this comes from a search-result summary of the Digital Media World article, which returned HTTP 409 when fetched. Source: https://digitalmediaworld.tv/in-depth/oblivion-motion-graphics
- Navarro Parker's documented work used Cinema 4D / MoGraph (secondhand). Source: https://www.provideocoalition.com/hud-and-gui-graphics-in-oblivion/
- The team researched flight-simulator and helicopter combat interfaces and "modernized" them for the Bubbleship, which GMUNK calls the most researched task. Source: https://gmunk.com/OBLIVION-GFX
- Working conditions, self-reported: small team, normal hours (about 11am to 9pm). Source: https://motionographer.com/2013/04/19/bradley-g-munkowitz-oblivion-screen-graphics
- Autofuss produced a separate GFX Process Montage (Ian Colon, editor/DP). Source: https://gmunk.com/OBLIVION-GFX
- Further reel: https://www.behance.net/gallery/49675041/oblivion-gfx

---

## 3. Tron: Legacy (2010)

### 3.1 Scope and credits
- "Over 12 minutes of holographic content." Self-reported; other interviews give 8 to 12 minutes. Source: https://gmunk.com/TRON-Legacy and https://www.pushing-pixels.org/2011/06/01/visual-effects-of-tron-legacy-and-beyond-conversation-with-gmunk.html
- Sequences: Solar Sailor (Quorra DNA), Throne Room, Disc Game scoreboard, Board Room, Rectifier Globe, Arena Fireworks, Portal Climax, Opening Titles. Source: https://gmunk.com/TRON-Legacy
- Credits include GMUNK (Graphics Design Director), Jake Sargeant, Joseph Chan, David Lewandowski, Adam Swaab, and JT (Josh) Nimoy (Lead Code Artist). Source: https://gmunk.com/TRON-Legacy

### 3.2 Visual language
- **Geometry:** hexagonal grids and mesh cages, concentric rings, circular formations, Voronoi noise, isometric surfaces, Ernst Haeckel-inspired organic structure that still follows "a graphic structural rulebook". Source: https://gmunk.com/TRON-Legacy
- **Grid discipline:** the Opening Titles "follow a strict grid", and the Board Room asked the team to "dust off their grid-based graphic design chops". Sources: https://gmunk.com/TRON-Legacy and https://gmunk.com/TRON-Board-Room
- **Third-party read:** "very minimalist and used a lot of angled lines, geometry and neon-style glows against a dark setting", with a recurring hexagon motif. Source: https://www.hudsandguis.com/2011/04/19/tron-legacy-ui/
- **Linework systems:** generative, not hand-keyed. The "Egyptian" algorithm produced "traveling linear linework" for bracket and derez animations, and the Tronlines app produced circular formations based on light tracers. Source: https://gmunk.com/TRON-Disc-Game
- **Typeface:** no designer source names a UI typeface. The franchise wordmark is custom lettering. Fan IDs suggest Helvetica Neue Light-like supporting type and the TR2N lookalike font. **[UNVERIFIED]** Sources: https://pixellogo.com/blogs/pixellogo-blog-2/the-graphic-production-and-font-design-of-tron-legacy and https://fontmeme.com/tron-font/
- **Color:**
  - GMUNK: "We got to love the glowing light blue a lot." The Board Room "got a full spectrum." Pinks were wished for but would never have been approved. Source: https://www.pushing-pixels.org/2011/06/01/visual-effects-of-tron-legacy-and-beyond-conversation-with-gmunk.html
  - Approximate tokens **[ESTIMATE]**: Tron cyan `#6FE3FF`; core-hot white-cyan `#DFFBFF`; deep cyan `#1A8FB5`; Clu/antagonist orange `#FF8A1E`; amber `#FFB347`; background `#020406`.
- **Glow/bloom:**
  - Strong but controlled: a white-hot core line with a cyan halo, against near-black.
  - The holograms also had to light the live-action actors, so compositing was central to the work. Source: search summary of https://www.pushing-pixels.org/2011/06/01/visual-effects-of-tron-legacy-and-beyond-conversation-with-gmunk.html

### 3.3 Information-design patterns
- **Scoreboard bracket:** 8 bracketed matches with 16 combatants, built "to collapse so it could handle later rounds". In other words, a data structure that re-lays itself out as state changes. Source: https://gmunk.com/TRON-Disc-Game
- **Data decoding as concentric rings:** Clu's extraction of Flynn's data starts as chaos and resolves into "concentric rings of decoded data". The team modernized "disc defragmentation diagrams". Source: https://gmunk.com/TRON-Throne-Room
- **Spread/infection on a globe:** "HexVirus" linework infects continent contours, then moves inward. The design was "greatly simplified" to "ensure a quick read". Source: https://gmunk.com/TRON-Rectifier-Globe
- **Legibility over density (GMUNK):** "the more complex, deep and insane it looks, the better, but sometimes it sacrifices the quick read … we had to take out a lot of greeble so the point of the graphics was understood quickly." Source: https://www.pushing-pixels.org/2011/06/01/visual-effects-of-tron-legacy-and-beyond-conversation-with-gmunk.html

### 3.4 Motion language
- **Derez:** linework travels and dissolves a bracket entry when a combatant loses. Source: https://gmunk.com/TRON-Disc-Game
- **Unlock and dissolve:** Flynn's boot-up hologram "fades bit by bit" before the data restructures. The camera "gracefully pushes through" the rings. Source: https://gmunk.com/TRON-Throne-Room
- **Sync to voice:** the Opening Titles are synced to Flynn's voiceover. Source: https://gmunk.com/TRON-Legacy
- **Match the performer:** for gestural scenes, "We made it match his gestures." Source: https://www.pushing-pixels.org/2011/06/01/visual-effects-of-tron-legacy-and-beyond-conversation-with-gmunk.html
- Schedule, self-reported: Solar Sailor took about 3 months, the opening sequence about 1.5 months, and fireworks and vehicle UIs a couple of weeks each. Source: same Pushing Pixels interview.

### 3.5 Tools and process
- openFrameworks concept apps (Tronlines, Beam-Pusher, Twist by Josh Nimoy), handed off to DD's Houdini team for final render with stereo, DoF and motion blur. Also Maya, Illustrator, Cinema 4D (MoGraph), V-Ray. Fireworks were delivered as 14 XML slider presets. Source: https://gmunk.com/TRON-Legacy
- Stereo cameras were brought into "3D applications, like Cinema4D". Three or four look-dev review cycles with Kosinski, starting from paper sketches. Source: https://www.pushing-pixels.org/2011/06/01/visual-effects-of-tron-legacy-and-beyond-conversation-with-gmunk.html
- Board Room graphics were "delivered as asset libraries to be programmed for playback and manipulation live on set". Source: https://gmunk.com/TRON-Board-Room
- Nimoy's software-art documentation: https://motionographer.com/2011/04/03/josh-nimoy-tron-legacy-software-art
- Breakdowns: https://www.slashfilm.com/522718/vfx-breakdowns-the-user-interfaces-and-holograms-of-tron-legacy/ and https://www.hudsandguis.com/2011/04/19/tron-legacy-ui/

---

## 4. Tron: Ares (2025, GMUNK Studio)

### 4.1 Scope and credits
- GMUNK Studio, Inc. for Disney: "Computer Vision" and "Finding Eve" (hologram/memory sequence). A team of twenty artists made "more than sixty shots" of computer vision and interface. Source: https://gmunk.com/TRON-Ares-Computer-Vision
- GMUNK's own post gives a broader scope: "over 2 years working on all the computer vision, screen interfaces, hologram design and a wide assortment of concept work for over 250 shots". The 60 vs. 250 gap is unexplained (likely a different scope; self-reported). Source: https://x.com/gmunk/status/1980672924253319261
- Credits: Bradley G. Munkowitz (CCO), **Jayse Hansen (GFX Design Lead)**, Adam Swaab (Lead VFX Artist, also on Legacy), and others. Source: https://gmunk.com/TRON-Ares-Computer-Vision
- Context: ILM led the film's VFX. GMUNK was one of several supporting vendors. Sources: https://beforesandafters.com/2025/12/04/the-tron-ares-issue-is-here/ and https://www.animationmagazine.net/2025/10/going-off-the-grid-the-vfx-of-tron-ares/
- Reels: https://www.artofvfx.com/tron-ares-gmunk-gfx-reel/ and an Instagram breakdown reel linked from https://beforesandafters.com/2026/04/16/all-the-tron-ares-visual-effects-breakdowns-in-one-place/

### 4.2 Visual language
- **Concept:** "What does perception look like when it belongs to a machine?" "The interface was never decoration. It was the visible expression of the machine intelligence at work." Source: https://gmunk.com/TRON-Ares-Computer-Vision
- **Geometry:**
  - Custom **square-packing** algorithms divide each plate into a hierarchy of cells, a "computational lattice" that is a spatial map of where information can sit.
  - Dense point clouds and fine fibrous linework.
  - "Hard computational structures dissolve into flowing fields of connected points."
  - Source: https://gmunk.com/TRON-Ares-Computer-Vision
- **Finding Eve:** "Thousands of images became spatial coordinates. Grids became architecture." Mosaics and overlapping planes, volumetric fog, beams and pulses of light, and telephoto bokeh on point fields. Source: https://gmunk.com/TRON-Ares-Finding-Eve
- **Color (film-level):** production designer Darren Gilford: "For the Dillinger Grid, we immediately went to red … ENCOM was green, like the Emerald City." Flynn's Grid "is the same blue as before". Source: https://www.fantasylandnews.com/?p=23074
  - GMUNK's pages give no palette for the computer-vision work.
  - Approximate tokens **[ESTIMATE]**: Dillinger red `#FF2A1F`; hot red-orange core `#FF6A3D`; ENCOM green `#3DFF8A`; Flynn blue `#6FE3FF`; background `#030202`.
- **Typeface:** not documented in any source found. **[UNKNOWN]**
- **Glow/bloom:** atmosphere-driven (fog, beams, bokeh) rather than a uniform neon outline. Source: https://gmunk.com/TRON-Ares-Finding-Eve

### 4.3 Information-design patterns
- **One dominant datum:** the 29-minute derez limit makes a central timer the most important element. "Time became the most important piece of data in the entire system." Source: https://gmunk.com/TRON-Ares-Computer-Vision
- **Layered analysis:** points of interest come first, then trackers, measurements, source code, scanning behaviors, point clouds and reactive data built outward from them. Source code, scanning pulses and data collapse "drift beneath the analysis layers". Source: same.
- **Composition-aware placement:** each plate was studied for composition, symmetry and depth before any graphics were placed. Graphics are integrated into the photography, not overlaid on it. Source: same.

### 4.4 Motion language
- "Scan, track, connect, populate, animate." This is an additive layering order. Source: https://gmunk.com/TRON-Ares-Computer-Vision
- Points first held by photo grids are released into a drifting star field. Parallax comes from foreground elements passing the lens while distant clusters fade into haze. Source: https://gmunk.com/TRON-Ares-Finding-Eve

### 4.5 Tools and process
- The only tool named is the custom square-packing algorithm. No commercial software is listed. Sources: https://gmunk.com/TRON-Ares-Computer-Vision and https://gmunk.com/TRON-Ares-Finding-Eve
- Deeper coverage is behind befores & afters issue #44 (Patreon). Not reviewed. https://beforesandafters.com/2025/12/04/the-tron-ares-issue-is-here/

---

## 5. Other notable GMUNK projects

Categories as listed on https://gmunk.com unless noted otherwise.

| Project | Type | Year | Link |
|---|---|---|---|
| BOX (Bot & Dolly) | Robotic projection mapping; GMUNK design director | 2013 | https://gmunk.com/BOX, https://motionographer.com/2013/09/24/bot-dolly-box/ |
| Windows 10 Desktop | Global branding; logo drawn with laser light (with Adam LaBay, secondhand) | 2015 | https://gmunk.com/Windows-10-Desktop, https://www.clubic.com/windows-os/windows-10/actualite-771746-fond-ecran-windows-10-portail-espace-gmunk.html |
| Audi Pure Imagination | Commercial | 2016 | https://gmunk.com/Audi-Pure-Imagination |
| Telestron | Robotic light installation | 2017 | https://gmunk.com/Telestron |
| The Totem | Illuminated sculpture | 2022 | https://gmunk.com/The-Totem |
| DECIMA x OFFF2022 | Title sequence | 2022 | https://gmunk.com/DECIMA-x-OFFF2022 |
| Disney TRON Lightcycle Run | Commercial campaign | 2023 | https://gmunk.com/Disney-TRON-Lightcycle-Run |
| Synapse Code | Experiential film | 2024 | https://gmunk.com/Synapse-Code-Patterns-of-a-Digital-Consciousness |
| Billie Eilish 2024 World Tour | Concert visuals | 2024 | https://gmunk.com/Billie-Eilish-2024-World-Tour |
| NASA Europa Clipper | Marketing campaign | 2024 | https://gmunk.com/NASA-Europa-Clipper |
| Rivian Borealis x Art Basel | Experiential activation | 2025 | https://gmunk.com/Rivian-Borealis-x-Art-Basel |
| InfraMunk / Symbiocene Mythologica | Digital art collections | 2021 | https://gmunk.com |
| Tycho ("See"), Eric Prydz, Beck | Music video / concert visuals **[UNVERIFIED]**, secondhand listing | ~2014 | https://toolofna.com/talent/ai/gmunk |

---

## 6. Cross-film synthesis

| Axis | Oblivion | Tron: Legacy | Tron: Ares |
|---|---|---|---|
| Base | White/pale-cyan hairlines; works on dark and light | Glowing light blue on near-black | Point fields and lattices in atmosphere |
| Signal color | Red = alert only | Orange = antagonist, blue = protagonist | Red = Dillinger, green = ENCOM, blue = Flynn |
| Geometry | Rings, ticks, brackets, panels | Hexes, concentric rings, generative linework | Square-packed cells, point clouds |
| Hierarchy rule | Promote the critical number to center on warning | Cut greeble for a "quick read" | One dominant datum (the timer) |
| Motion | Build-ons, sweeps, count-ups | Travel-and-dissolve linework, derez | Scan, track, connect, populate, animate |
| Process | Flat 2D (AI/AE/C4D [UNVERIFIED]), in-camera playback | Code-art apps feeding a Houdini render | Custom algorithms over plates |

A thread running through all three (supported by the quotes above): **ornament is allowed only when it reads as function, and legibility wins when the two conflict.** This matches the director brief in `.claude/agents/gmunk-director.md` and locked decision #7 (Oblivion base, Tron accents as semantic color) in `docs/decisions.md`.

---

## 7. Transferable patterns for sdrviz

The sdrviz semantics come from decision #7: cyan = idle/armed, amber/orange = transmitting, red = fault, a muted tone for stale/offline, and white/pale-cyan hairlines on near-black. Each pattern cites its film precedent.

### 7.1 Frequency tiles
1. **Oblivion bracket panel:** corner brackets (not full borders) in 1px pale-cyan, with an uppercase, letter-spaced label (Blender-like geometric sans; pick a licensable equivalent). (Oblivion HUD style, §2.2)
2. **Hold back color.** The tile frame stays white/pale-cyan while idle. Only one element changes color on key-up: the frame turns amber and the label stays white. Never use red for anything except a fault, which avoids the "red radar target" ambiguity flagged at https://fuzzymath.com/blog/evaluating-interface-design-of-oblivion.
3. **Promote the critical value.** While a channel transmits, its key datum (elapsed TX time or signal level) gets larger and moves to the tile's center, as the Bubbleship moves distance to center on a warning (§2.3).
4. **Alternate rather than replace.** If a tile must show a warning (for example, squelch stuck open), alternate it with the normal readout, like the motorcycle fuel/speed display (§2.3).
5. **Collapsing bracket layout:** the tile grid re-lays itself when banks are added or removed, animated like the Disc Game bracket collapse (§3.3).

### 7.2 Activity meters
1. **Count-up numerics and tick-ring meters:** a thin ring with fine ticks and a single sweeping arc. The fill is amber during TX and cyan at rest (Oblivion radar/compass rings, §2.2).
2. **Cut greeble.** Each meter shows one quantity. Decorative sub-ticks only where they mark real scale ("take out a lot of greeble", §3.3).
3. **Decay, not snap.** The level falls with a short exponential decay so the meter feels "alive when the radio talks, quiet when idle" (director brief).

### 7.3 Transcripts
1. **Build-on typing:** a new line draws its rule first, then the timestamp and channel tag, then the text, staggered by about 40–80 ms **[ESTIMATE]** (build-on order from the Oblivion reels, §2.4).
2. **Decode-resolve:** while Moonshine is processing, show a faint scrambled-glyph placeholder that resolves into the final text. This echoes the Throne Room chaos-to-ordered-rings decoding (§3.3). Keep it under about 300 ms of visible scramble for readability.
3. **Speaker/channel tag in the semantic color:** amber while that channel is live, settling to white once the line is final.

### 7.4 Spectrum and waterfall
1. **Square-pack the band:** use a subdivided cell lattice as the background grid. Major cells mark channel spacing and finer cells appear only on zoom (Ares square-packing hierarchy, §4.2).
2. **Scan pulse:** a slow, low-opacity vertical sweep across the spectrum (Oblivion radar sweep; Ares "scanning pulses", §4.3). Pause it when the user is interacting.
3. **Analysis layers drift beneath:** put frequency labels and channel-name annotations as a quiet layer under the trace, and keep the trace itself crisp white-cyan with a small glow (core plus halo, Tron Legacy, §3.2).
4. **"Rogue Signal" inspector:** clicking a carrier opens a bracketed analysis window, a direct precedent from the Oblivion Light Table (§2.3).

### 7.5 Map
1. **Light-table main map:** positions of feeds and trains on a dark (or optional pale "diagnostic") surface. Coverage zones are drawn the way Oblivion draws radiation zones: hairline outlines with a sparse hatch, red only if a feed is faulted (§2.3).
2. **Contour linework:** shorelines and rail lines as single-weight hairlines. Train trails can use the Tron "traveling linework" treatment, a short bright head with a fading tail (§3.3).
3. **Spread animation for outages:** when a feed goes stale, its coverage contour desaturates inward, borrowing the Rectifier Globe infection-from-contour motion (§3.3). Keep it simple ("greatly simplified to ensure a quick read").
4. **Range rings and coordinate readouts** around each feed site: functional ornament per the director brief.

### 7.6 Health status
1. **One dominant datum:** as Ares makes the timer the most important element, the health screen gets one hero value (for example, "feeds nominal 4/5" or "worst latency"), and everything else is secondary (§4.3).
2. **Four-panel console:** a direct analog of the Light Table: Feeds, Decoder/Transcriber, Storage, and Network. Unlike Oblivion, give the primary panel more space than the others (critique in §2.3).
3. **Muted for stale:** offline/stale uses a desaturated grey-cyan **[ESTIMATE]** `#4A5A63`. Red stays reserved for an active fault, so red always means "act now".
4. **Layered build-on on load:** frame, then grid, then labels, then live values, following the Ares order "scan, track, connect, populate, animate" (§4.4). Run it once on screen entry, never on every update.

### 7.7 Suggested starting tokens [ESTIMATE]
| Token | Hex | Role |
|---|---|---|
| `bg` | `#05080B` | near-black base |
| `line` | `#E6F4F8` | primary hairline/white text |
| `line-dim` | `#7FA6B3` | secondary text, grid |
| `cyan` | `#5FD3EE` | idle/armed |
| `amber` | `#FFA53A` | transmitting |
| `red` | `#FF3B30` | fault |
| `muted` | `#4A5A63` | stale/offline |
These are derived by eye from the films and from decision #7. The design stage should validate their contrast.

---

## 8. Gaps and open items
- No primary source gives exact colors or typefaces for Tron: Legacy or Tron: Ares interfaces. The Oblivion font (Blender) rests on one secondhand report.
- The Digital Media World Oblivion article (tools, "two-part process") could not be fetched (HTTP 409). The tool claim is taken from a search summary.
- The Tron: Ares shot counts disagree (60+ vs. 250+), and both figures are self-reported.
- The befores & afters Tron: Ares issue (#44) is paywalled and was not reviewed.
- The Vimeo reels were behind a verification wall during this research. Motion observations in §2.4 should be confirmed by watching them.

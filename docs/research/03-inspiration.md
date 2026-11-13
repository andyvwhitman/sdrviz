# 03 — Outside Inspiration (Inspiration Scout)

Research for the gmunk-director. Scope: work GMUNK was **not** involved in that fits his sensibility (restraint, hairline geometry, data as instrument, semantic light) and that we can borrow from for sdrviz, a radio-monitoring HUD.

Locked decisions this respects (from `docs/decisions.md`): Oblivion base with Tron accents used as semantic color (cyan = idle/armed, amber/orange = transmitting, red = fault), white or pale-cyan hairlines on near-black, SVG for HUD chrome, Canvas/WebGL for spectrum and waterfall, and a pure SVG map with no basemap.

**Confidence markers used below**
- **[V]** Verified: stated by the cited source, usually a primary source, a trade press interview, or a standards body.
- **[S]** Secondary or self-reported: from a forum, blog, uploaded document, or the designer's own account. Treat as plausible, not settled.
- **[U]** Uncertain: sources conflict, or this is my own inference or recommendation, not a sourced fact.
- "Steal" items are design recommendations, so they are opinion by definition.

No film stills are embedded here. Follow the links to see the work.

**Exclusion check:** I did not confirm that any designer below collaborated with GMUNK. A search for a GMUNK and Ash Thorp collaboration found nothing ([search note, LBB Online on GMUNK](https://lbbonline.com/news/director-gmunk-and-creative-production-partner-tool-rejoin-forces)) **[U]**. Researcher (b), who covers collaborators, should cross-check names, especially Ash Thorp and Jayse Hansen.

---

## 1. FUI studios and designers

### 1.1 Territory Studio (London)
- **Facts.** Founded in London in 2010. Credits include *Prometheus*, *Guardians of the Galaxy*, *Ex Machina*, *The Martian*, *Blade Runner 2049* and *Dune* ([Wikipedia](https://en.wikipedia.org/wiki/Territory_Studio)) **[V]**.
- ***The Martian.*** About 400 on-set screens across eight sets. Mission Control had either 85 or almost 100 screens; sources differ ([Design Week](https://www.designweek.co.uk/for-new-film-the-martian-territory-takes-nasa-screens-30-years-into-the-future/), [Gizmodo](https://gizmodo.com/how-nasa-helped-make-the-martians-user-interfaces-reale-1734698612)) **[V; count S]**. NASA's Dave Lavery supplied reference photos and data. The team studied "what data was prioritized and when, how that was organized and depicted on screen" ([Gizmodo](https://gizmodo.com/how-nasa-helped-make-the-martians-user-interfaces-reale-1734698612), [Pushing Pixels interview](https://www.pushing-pixels.org/?p=11034)) **[V]**.
- ***Blade Runner 2049.*** About 100 screens, mostly played back live on set ([Adobe blog](https://blog.adobe.com/en/publish/2017/12/11/screens-help-define-the-world-of-blade-runner-2049)) **[V]**. The team "stepped away from the Mac" for two weeks of analogue tests: macro photography of fruit, prints drawn into, crumpled, then rescanned. Andrew Popplestone: "if it doesn't add to the story, it's useless" ([It's Nice That](https://www.itsnicethat.com/articles/nicer-tuesdays-december-2017-territory-studio-170118)) **[V]**. Every screen was built to carry a specific plot point ([Design Museum Q&A](https://designmuseum.org/exhibitions/past-exhibitions/beazley-designs-of-the-year-2018/qa-with-david-sheldon-hicks-founder-of-territory-studio)) **[V]**.
- **Steal:**
  1. **Priority-over-time mapping (The Martian).** Before drawing Live Ops, list what an operator needs at idle, when a channel keys up, and during a fault. Show each layer only at its moment. This is a direct analogue of Mission Control's data-priority analysis.
  2. **"One screen, one story point."** Each sdrviz screen gets one sentence stating its job. Example: "History answers *what was said on channel 54 between 14:00 and 15:00*." Cut anything that doesn't serve that sentence.
  3. **Analogue texture, used sparingly (BR2049).** Real texture beats procedural noise. A faint scanned paper or film grain at 2–3% opacity on stale or offline panels could signal age without adding color **[U: needs director approval; could fight the Oblivion cleanliness]**.

### 1.2 Perception (New York)
- **Facts.** *Iron Man 2* (2010) was their breakthrough. It began as one VFX shot and grew to more than 125 shots of interface design ([Engadget](https://www.engadget.com/2015-12-14-perception-ui-design.html), [Perception site](https://www.experienceperception.com/iron-man-2.html)) **[V]**. For *Black Panther* they designed most of Wakanda's technology, including Shuri's lab UI ([School of Motion](https://www.schoolofmotion.com/blog/endgame-black-panther-future-consulting-perception-john-lepore)) **[V]**.
- **Principles (John LePore).** The interface "is built for one thing and one thing only, and that is to tell the story". Realism matters so knowledgeable viewers don't find it "offensive, insulting, childish or over-simplified". For real products: "if it's not broken, don't fix it" ([Pushing Pixels](https://www.pushing-pixels.org/?p=12751)) **[V]**.
- **Steal:** LePore's real-product rule is a guardrail for us. Keep the conventions radio people already know: frequency increasing left to right, dB on a vertical axis, the waterfall scrolling down. Put the novelty in the rendering, not in breaking those conventions.

### 1.3 Cantina Creative (Culver City)
- **Facts.** Designed the Helicarrier bridge screens and Iron Man HUDs for *The Avengers* (2012). It was the first stereo HUD, and a key beat was the HUD changing mode from neutral to battle ([ProVideo Coalition](https://www.provideocoalition.com/Marvels_The_Avengers_Taking_the_HUD_to_new_heights/)) **[V]**. For *Age of Ultron* they made four new HUDs, including a "HUD within a HUD" for the Hulkbuster ([Cantina Creative](https://cantinacreative.com/film/avengers-age-ultron)) **[V]**.
- **Steal:**
  1. **Mode-change choreography.** The neutral-to-battle rotation maps onto our idle-to-TX moment. When a channel keys up, its panel shouldn't just turn amber. It should perform a short, consistent transition: brackets snap in, a readout ticks, the hairline brightens. The same move every time, so it reads as a state change, not decoration.
  2. **HUD within a HUD.** Use a focused sub-instrument for a selected feed: a nested, tighter-gridded panel inside the main frame. This suits the Feeds admin "inspect one SDR" view.

### 1.4 Jayse Hansen (freelance; Iron Man Mark VII HUD, *The Hunger Games*, *Top Gun: Maverick*)
- **Facts and quotes** ([Pushing Pixels](https://www.pushing-pixels.org/?p=7447)) **[V, self-reported practice]**:
  - He consulted an A-10 pilot, who said "the first thing he teaches his students is how to focus on the important stuff as you need it."
  - He warns that generic sci-fi leaves you "with a bunch of circles and random text." In the Mark VII, "all the graphics had a purpose."
  - He uses negative space so the actor's face reads through the glass.
  - He hunts outside film for "a neat color palette" as "the best reference to use to make your stuff look unique."
- He later worked with Lockheed Martin Skunk Works on *Top Gun: Maverick* ([No Film School](https://nofilmschool.com/creating-revamped-nostalgia-top-gun-maverick)) **[S]**.
- **Steal:**
  1. **Interview a practitioner.** Hansen's pilot interview translates directly. Ask a railfan scanner listener, or ideally a dispatcher, what they glance at first. My guess is the active channel, the train symbol or ID, and the milepost **[U]**.
  2. **Negative space as content.** Hansen kept the actor's face visible. Our "face" is the waterfall and the transcript. Keep chrome out of those areas entirely.

### 1.5 Ash Thorp
- **Facts.** UI designer on *Prometheus* ([Inventing Interactive](https://inventinginteractive.com/category/interview-2/)). Creative director and designer on the *Total Recall* (2012) UI ([Motionographer](https://motionographer.com/2012/08/06/total-recall-ui-in-depth-with-ash-thorp/), [Art of VFX](https://www.artofvfx.com/2889/)). Lead motion graphics designer on *Ender's Game* ([Art of VFX](https://www.artofvfx.com/enders-game-ash-thorp-creative-director/)). Concept artist, not UI lead, on *Ghost in the Shell* (2017), where MPC and Territory also contributed FUI ([HUDS+GUIS](https://www.hudsandguis.com/home/2017/4/17/ghostintheshell-fui)) **[V]**.
- **Steal:** His *Total Recall* and *Ender's Game* work sets dense micro-type against large calm fields. That is the right density gradient for Stats: one big number or chart per panel, with tiny monospace annotations at the edges. Look at the reels via the links.

### 1.6 Mark Coleran
- **Facts.** Screen graphics for the *Bourne* films, *Children of Men*, *The Island* and *Mission: Impossible III*. He later moved into real products at Bonfire Labs ([Fast Company](https://www.fastcompany.com/1663199/a-master-of-sci-fi-movie-gadgets-moves-over-to-the-real-world)) **[V]**. He is widely credited with coining "FUI" ([Riagenic essay](https://riagenic.com/blog/the-godfather-of-fui)) **[S]**. One essay reports he died in June 2024 ([same](https://riagenic.com/blog/the-godfather-of-fui)) **[U: single source]**.
- **Steal:** His *Bourne* screens borrow the look of real surveillance and ops software, with plain tables, logs and timestamps ([gallery](https://www.pushing-pixels.org/coleran/gallery-category/fui/index.html)). This is the model for the transcript log: a disciplined, timestamped, monospace table that feels like an ops console, not a chat app.

### 1.7 BLIND LTD and The Expanse art department
- **Facts.** BLIND LTD did the *Andor* Season 2 FUI: TIE cockpit displays, targeting scopes, industrial and medical devices ([HUDS+GUIS](https://www.hudsandguis.com/home/2026/andor-s2)) **[V]**. Andrew Booth of BLIND favors practical, in-camera screens like *2001*, *Star Wars* and *Alien* ([Pushing Pixels](https://www.pushing-pixels.org/?p=9997)) **[V]**. On *The Expanse*, Rhys Yorke notes Martian ships used red interfaces and that few sci-fi screens break from blue ([Pushing Pixels](https://www.pushing-pixels.org/?p=18324)) **[V]**.
- **Steal:** *The Expanse* gave each faction its own UI color. For us, color should be reserved for state (locked decision 7). Distinguish **feeds** (Pi SDR boxes) or **railroads** (Amtrak, MARC, VRE, CSX, NS) with glyphs, line patterns and labels instead. Never by hue, or hue stops meaning state.

---

## 2. Films and series with strong screen graphics (non-GMUNK)

| Work | What's documented | Steal for sdrviz |
|---|---|---|
| *2001: A Space Odyssey* (1968) | Screen content was hand-prepared film, rear-projected onto set screens ([Wikipedia: Rear projection](https://en.wikipedia.org/wiki/Rear_projection)) **[V]**. Details of the HAL readouts are still forum-level **[S]**. | Big flat fields of color with one bold readout each. Use for full-bleed alarm and fault states: one red field, one sentence, no clutter. |
| *Alien* (1979) | Nostromo vector graphics by System Simulation Ltd ([History of CG](https://historyofcg.com/pages/system-simulation)) **[S]**. Wake-up screen described as white line art ([fbpe](https://old.fbpe.org/alien-1979-computer-scene.html)) **[S]**. MU/TH/UR naming ([Wikipedia](https://en.wikipedia.org/wiki/MU_/_TH_/_UR)) **[V]**. | Vector wireframe terrain and line-only geometry. The Map can render the corridor as pure stroked vectors with no fills, close to Nostromo approach graphics. Already compatible with decision 10. |
| *Neon Genesis Evangelion* (1995) | Deep integration of typography into animated storytelling, mostly Helvetica, with a bootleg Century title face ([Fonts In Use](https://fontsinuse.com/uses/28760/neon-genesis-evangelion)) **[V]**. Large Mincho type mixed vertically and horizontally ([Kotani, Shimane Univ.](https://ir.lib.shimane-u.ac.jp/48855/files/769)) **[V abstract only]**. | Typography as alarm. A fault or emergency state (for example "EMERGENCY" heard on the road channel) could use one oversized condensed word filling a panel. Use rarely, because overuse ruins it. |
| *The Martian* (2015) | See 1.1. | Mission-control wall plus consoles: a shared overview (Map and band) above per-feed detail. Fits Live Ops on a large monitor. |
| *Blade Runner 2049* (2017) | See 1.1. | Texture for "stale" states only **[U]**. |
| *The Expanse* (2015–22) | See 1.7. | Faction color is a warning case. Keep hue for state. |
| *Andor* (2022–25) | See 1.7. | Industrial, slightly clunky instrument framing. Hard bezels around canvases make them read as hardware. |

---

## 3. Real-world instrument design

### 3.1 Radar PPI and phosphor persistence
- **Facts.** The P7 radar phosphor was a two-layer cascade screen ([GE Techni-Talk 1952](https://worldradiohistory.com/Archive-Company-Publications/GE-Techni-Talk/GE-Techni-Talk-1952-08-09.pdf)) **[V]**. It flashed blue-white, then left a yellow-green afterglow ([Google Patents US3114907](https://www.google.ca/patents/US3114907)) **[V]**. Long persistence kept targets visible after the sweep passed ([CAA report via ROSA P](https://rosap.ntl.bts.gov/view/dot/81457/dot_81457_DS1.pdf)) **[S: OCR-garbled]**. Digital scan converters later simulated persistence by reducing stored brightness at fixed intervals ([US4412220](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/4412220)) **[V]**.
- **Steal:**
  1. **Two-stage decay as a state signal.** A transmission appears bright, a near-white flash, then decays over a few seconds into a dimmer tone. This gives "just happened" versus "happened a while ago" for free. Implementation: multiply the previous canvas frame by about 0.96 each frame, which is the scan-converter technique.
  2. **Sweep line.** A slow radial or linear sweep across the Map or band overview reads as "the system is listening" during idle. Keep it at very low brightness so it isn't fatiguing.

### 3.2 Passive sonar LOFARgram
- **Facts.** Frequency on x, time on y, new lines added at the top, covering minutes to hours. Steady tonals show as lines. Original output was printed on electrostatic paper for SOSUS ([Wikipedia: LOFAR](https://en.wikipedia.org/wiki/Low_Frequency_Analyzer_and_Recorder)) **[V]**.
- **Steal:** This is the ancestor of our waterfall, and it argues for a **long-horizon waterfall** next to the live one. Show one compressed strip of the last hour or two of the AAR band, so recurring users (the yard channel, the road channel, defect detectors) show up as vertical stripes. That makes the band's daily rhythm visible at a glance.

### 3.3 Air traffic control data blocks
- **Facts.** A data block must show flight ID and altitude at minimum ([FAA JO 7110.65 Ch.5](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_14.html)) **[V]**. The ERAM full data block has a position symbol, a leader line, a velocity vector, and lettered fields. Controllers can offset blocks and change leader length ([POSCON ERAM docs](https://forums.poscon.net/docs/support/manuals/eramv1/data-blocks/)) **[S: sim community docs]**. FAA human-factors guidance limits meaningful colors to a small set ([FAA Notice N JO 7210.673](https://www.faa.gov/documentLibrary/media/Notice/N%20JO%207210.673.pdf)) **[S: from search summary]**.
- **Steal:** **Train data blocks on the Map.** A small position glyph, a hairline leader, and a two-line monospace tag: line 1 is the train ID or symbol (e.g. `MARC 538`), line 2 is the milepost and last-heard channel (e.g. `MP 101.4 · CH54`). Let the user drag the tag offset like a controller. Feed sites get the same treatment. This is the strongest single borrow for the Map.

### 3.4 NASA Mission Control (MOCR)
- **Facts.** The restored Apollo MOCR shows monochrome CRT consoles plus large projected group displays on the front wall ([Space Center Houston](https://spacecenter.org/restoring-apollo-mission-control/), [NASA](https://www.nasa.gov/johnson/history/apollo-mcc-restoration/)) **[V]**. 1960s human-factors reports covered group-display requirements and glare on TV monitors ([ibiblio index](https://ibiblio.org/apollo/Documents/IMCC/List%20of%20Technical%20Reports%20and%20Memorandums%20Concerning%20Human%20Factor%20Engineering.pdf)) **[V index; contents unread]**.
- **Steal:** **Group display plus console split.** Live Ops gets a "front wall" strip (band overview, map thumbnail, feed health) and "consoles" below for each channel. Also: monochrome consoles were usable for long shifts, which argues for keeping per-channel panels nearly monochrome and reserving color for state.

### 3.5 Oscilloscopes
- **Facts.** Large Tektronix CRTs used an internal 8 × 10 division graticule ([TekWiki 154-0633-xx](https://w140.com/tekwiki/wiki/154-0633-14)) **[V]**. Explanations for why 8 × 10 are forum-level ([AAC forum](https://forum.allaboutcircuits.com/threads/number-of-divisions-in-oscilloscope-graticule.178101/)) **[S]**.
- **Steal:** **Graticule as the only grid.** Use a fixed division grid with minor ticks along the center axes only, as on a scope. It's legitimate "functional ornament" in the director's sense. Apply it behind the spectrum trace and the audio scope. Label the scale per division (`10 dB/div`, `12.5 kHz/div`) in a corner, scope-style, instead of labeling every gridline.

### 3.6 Spectrum analyzers and SDR waterfalls
- **Facts.**
  - SDR++ 1.2.1 ships turbo, viridis, plasma and other colormaps ([Fedora package listing](https://pkgdex.org/fedora/41/x86_64/updates/sdrpp-1.2.1-2.fc41.rpm.html)) **[V]**.
  - OpenWebRX pairs a live spectrum (current level) with a waterfall (history), with brighter meaning stronger ([OpenWebRX GitHub](https://github.com/jketterl/openwebrx)) **[V]**.
  - RFAnalyzer advises setting the lower color limit just below the noise floor and the upper limit just above the strongest signal for contrast ([RFAnalyzer docs](https://demantz.github.io/RFAnalyzer/fft.html)) **[V]**.
  - Google's Turbo colormap (2019) improves on Jet ([Google Research](https://research.google/blog/turbo-an-improved-rainbow-colormap-for-visualization/)) **[V]**. NASA's Joshua Stevens criticized its uneven lightness ([summary](https://hub.packtpub.com/turbo-googles-new-color-palette-for-data-visualization-addresses-shortcomings-of-the-common-rainbow-palette-jet/amp/)) **[S]**.
- **Steal and conflict:**
  1. **Don't use Turbo or Jet.** A rainbow waterfall would use every hue and break the semantic palette (decision 7). Recommend a **single-hue lightness ramp**: near-black, then deep cyan, then pale cyan, then white. Strong signals read as "hot" by brightness alone.
  2. **Composite the TX color.** Draw an amber overlay or outline only on the channel slot that is currently transmitting, on top of the monochrome waterfall. Color then means state, not power.
  3. **Auto noise-floor clamp** (RFAnalyzer advice) so the waterfall stays calm. A fixed bright floor is fatiguing over hours.
  4. **Channel-grid overlay.** AAR channels are 15 kHz apart from 160.215 MHz (ch 07) to 161.565 MHz (ch 97) ([qsl.net N4JRI](https://www.qsl.net/n4jri/aar_ch.htm), [RadioReference forum](https://forums.radioreference.com/threads/aar-freq.204594/)) **[V; lower-channel numbering S]**. Draw hairline channel ticks on the waterfall with numbers only on monitored channels. This is the radio equivalent of a track diagram.

### 3.7 Cockpit glass and alerting
- **Facts.**
  - 14 CFR 25.1322(e) requires red for warnings, amber or yellow for cautions, and any color other than red or green for advisories. Red, amber and yellow must be used sparingly for non-alerting functions ([FAA 25.1322](https://www.faa.gov/sites/faa.gov/files/2022-11/25.1322.pdf), [Federal Register 2010](https://www.govinfo.gov/content/pkg/FR-2010-11-02/pdf/2010-27629.pdf)) **[V]**.
  - AC 25-11B gives display guidance ([FAA AC 25-11B](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_25-11B.pdf)) **[V; section 5.3 not read in full]**.
  - "Dark cockpit": in normal operation the panel is essentially dark and lights only for abnormal states ([Lean Enterprise Institute](https://www.lean.org/the-lean-post/articles/the-dark-cockpit-what-aviation-can-teach-lean-leaders/), [SimTuts A320](https://simtuts.com/type-rating/a320/aircraft-general)) **[S]**.
  - Boeing's 787 is described as "need-to-show" ([Flight Global](https://www.flightglobal.com/display-philosophy/16611.article)) **[S]**.
- **Steal:**
  1. **Dark-cockpit idle.** At idle, nothing glows above a baseline. Healthy feeds are *quiet* (dim pale-cyan hairlines), not green. Only a change brightens. This matches the brief: "quiet when idle, alive when the radio talks."
  2. **Flag for the director: the amber conflict.** In aviation, amber means caution. Our locked palette uses amber for *transmitting*, which is a normal, frequent event. Users with aviation or industrial backgrounds may read amber as trouble. Decision 7 is locked, so this is not a proposal to change it. Two ways to reduce the risk: (a) render TX amber as a warm, saturated orange (Tron: Legacy-style) rather than a yellow-amber, and put "degraded" and "stale" in the muted tone, never amber. (b) Never use amber for any non-TX warning. **[U: recommendation]**
  3. **No green.** Aviation reserves green for "normal/engaged". We have no green in the palette, which keeps it clean. Keep it that way.

---

## 4. Graphic design movements and systems

### 4.1 Swiss / International Typographic Style
- **Facts.** Josef Müller-Brockmann formalized the grid system, first presented his grid approach in 1961, and published *Grid Systems in Graphic Design* (Niggli, 1981) ([Draw Down](https://draw-down.com/products/grid-systems-in-graphic-design), [The Art Bog review](https://theartbog.com/book-review-grid-systems-in-graphic-design-by-josef-muller-brockmann/)) **[V]**.
- **Steal:** One modular grid for every screen (for example a 12-column grid on an 8 px baseline). Every panel edge, bracket and label snaps to it. Flush-left, ragged-right labels. One grotesk or neo-grotesk for labels plus one monospace for numbers. Asymmetric layouts read as engineered, not decorated.

### 4.2 Harry Beck and the schematic diagram
- **Facts.** Beck was a technical draughtsman who drew electrical circuit diagrams. His London Underground diagram (1931 design, published 1933) used only horizontal, vertical and 45° lines, evenly spaced stations, and an enlarged centre. He also made 22.5° variants ([Wikipedia: Tube map](https://en.wikipedia.org/wiki/Tube_map), [London Transport Museum](https://www.ltmuseum.co.uk/collections/collections-online/people/item/1996-7354), [Jenny 2006](https://mail.colororacle.org/berniejenny/pdf/2006_Jenny_DistortedNetworkMaps.pdf)) **[V]**.
- **Steal:** Offer a **schematic corridor view** next to the geographic Map. Straighten the NEC, the Capital Sub and the Camden Line into Beck-style 0°/45° lines with stations evenly spaced and the DC and Baltimore terminals enlarged. CTC panels (section 5) are the railroad's own version of this, so it's doubly on-brand. The geographic d3-geo map stays for coverage.

### 4.3 Dieter Rams / Braun
- **Facts.** The Braun T 1000 world receiver (dated 1961–63; sources differ) was built to receive transmissions worldwide. Its complex wavelength controls needed a thick manual kept in a drop-down cover ([V&A](https://collections.vam.ac.uk/item/O168288), [Brooklyn Museum](https://www.brooklynmuseum.org/objects/170035)) **[V]**. Commentators cite it as an example of Rams's ten principles ([Worn & Wound](https://wornandwound.com/art-time-dieter-rams-ten-principles-good-design/)) **[S]**.
- **Steal:**
  1. **Lid over complexity.** The T 1000 kept its manual behind a cover. sdrviz should keep advanced controls (gain, squelch, FFT size, PPM correction) behind a disclosure on the Feeds and Banks admin screen. Live Ops shows only what's needed.
  2. **Dial-scale typography.** Use evenly spaced tick scales with sparse numerals for the frequency axis and the squelch control, like a Rams-era tuning scale. Look at the object via the museum links.

### 4.4 NASA Graphics Standards Manual (Danne & Blackburn)
- **Facts.** Designed 1974–75 by Danne & Blackburn around the "worm" logotype, rescinded in 1992, and reissued by Jesse Reed and Hamish Smyth in 2015–16 ([Design Week](https://www.designweek.co.uk/inspiration/nasa-graphics-standards-manual-by-danne-blackburn/), [collectSPACE](https://www.collectspace.com/news/news-090115c-nasa-logo-worm-manual.html)) **[V]**.
- **Steal:** The format itself. The film-graphics designer's spec should look like this manual: numbered sections, clear specimens, and rules for color, type and spacing with measurements. It also suits a project that wants to feel "instrument-grade".

### 4.5 Edward Tufte
- **Facts.** The data-ink ratio is data-ink divided by total ink, introduced in *The Visual Display of Quantitative Information* (1983). Sparklines are word-sized graphics, and he argues they maximize data density ([Columbia CC19 notes](https://jtr13.github.io/cc19/tuftes-principles-of-data-ink.html), [R Journal 2015](https://journal.r-project.org/articles/RJ-2015-003/RJ-2015-003.pdf)) **[V]**. A 2007 study found viewers preferred a standard bar chart over the minimalist version (same R Journal source) **[V]**.
- **Steal:**
  1. **Sparklines in channel rows.** A 60-minute activity sparkline next to each channel name in Live Ops and Banks.
  2. **Don't over-strip.** The 2007 result is a reminder that some redundant structure (brackets, frames) helps people find things. The HUD frame is earned redundancy.

### 4.6 *Unknown Pleasures* and pulsar CP 1919
- **Facts.** Harold Craft made a stacked-line plot of pulsar CP 1919 at Arecibo for his 1970 PhD thesis. It was reproduced in *The Cambridge Encyclopaedia of Astronomy* (1977), and Peter Saville inverted it to white-on-black for Joy Division's 1979 cover ([Scientific American](https://www.scientificamerican.com/article/the-pulsar-chart-that-became-a-pop-icon-turns-50-joy-division-rsquo-s-unknown-pleasures)) **[V]**.
- **Steal:** A **ridgeline spectrum history**: the last N FFT frames drawn as stacked, hidden-line hairline traces in white on black. It's a lighter-weight, more "wireframe" alternative to a filled waterfall, and it's radio-astronomy data, so it belongs here. Good for an idle-state band overview or the Stats screen hero.

### 4.7 Technical drawing conventions **[U: general practice, not separately sourced]**
- **Steal:** Dimension lines with arrowheads and centered values for span measurements (the bandwidth of a selected channel, the distance between feeds on the Map). Title blocks in panel corners (screen name, feed ID, UTC time, revision or build). Registration and crop marks at panel corners. All of these count as "functional ornament" under the director's rules.

---

## 5. Railroad visual vernacular

### 5.1 CTC dispatcher panels
- **Facts.**
  - The first CTC was installed in 1927 on 40 miles of New York Central, controlled from Fostoria, Ohio.
  - The hallmark is a panel with a graphical depiction of the railroad, showing every block between interlockings. Signals are shown at Stop (typically red) or "displayed" (typically green). Occupancy is shown as bold or colored lines. Trains are tagged on the diagram, usually by lead locomotive number. Modern systems show "a highly simplified mock-up of the track" ([Wikipedia: CTC](https://en.wikipedia.org/wiki/Centralized_traffic_control)) **[V]**.
  - A 1959 Union Switch & Signal pushbutton machine was built from modular 3-ft units with a track-diagram section ([Railway Signaling 1959, jonroma.net](https://jonroma.net/media/signaling/railway-signaling/1959/Pushbutton%20console%20for%20CTC.pdf)) **[V]**. Earlier boards used miniature levers and pushbuttons ([TRHA](https://www.trha.ca/?p=26560)) **[S]**.
  - Model railroaders restore and drive real US&S panels, for example the SP Shasta panel run with JMRI ([JMRI](https://www.jmri.org/community/examples/SPShasta.shtml)) **[V]**. Photo reference: Penn Central US&S CTC at Thorndale ([RailPictures](https://railpictures.net/photo/630340)).
- **Steal:**
  1. **The track-diagram strip** is the native railroad HUD. Show each monitored line as a single horizontal hairline. Occupied blocks become thicker strokes. Interlockings are small boxes with their names in small caps. Train tags sit above the line. Re-color for sdrviz semantics: occupancy in pale cyan, a train whose crew is *currently talking* in amber, a fault in red. Don't copy CTC's red occupancy, because red is our fault color.
  2. **Modular units.** The 1959 machine's 3-ft modules suggest one panel module per subdivision (NEC Washington–Baltimore, Capital Sub, Camden Line, Brunswick Line, RF&P), tiled side by side. This also suits multiple feeds later.
  3. **Lever row.** A row of square toggles under the diagram, one per channel (mute, solo, record), styled like CTC levers or pushbuttons with lit indicators above them.

### 5.2 Stringline / time-distance graphs
- **Facts.** Stringline diagrams (space on one axis, time on the other) have been used "for more than a century" ([FRA Railroad Traffic Planner](https://railroads.dot.gov/sites/fra.dot.gov/files/fra_net/2009/rr0902.pdf)) **[V]**. Zurich's dispatcher display draws a red current-time line that steps every five minutes, plus green bands for conflict-free slack ([railweb.ch](https://www.railweb.ch/funnel/zch_disp/time_dis/time_dis.htm)) **[V]**. Mid-century automatic train graphs recorded trains passing locations ([Railway Signaling 1944](https://www.jonroma.net/media/signaling/railway-signaling/1944/Electronics%20In%20Signaling.pdf)) **[V]**.
- **Steal:** **A stringline for History and Stats.** X is milepost (DC to Baltimore), y is time. Each dummy train is a hairline string. Every radio transmission becomes a tick on the string of the train that made it (or a free-floating tick when no train ID was heard). This one plot merges trains, positions and radio traffic, and nobody in the SDR world does it **[U: novelty claim based on my survey, not exhaustive]**. The "now" line should be pale cyan, not red, to keep red for faults.

### 5.3 Signals: Pennsylvania Railroad position lights
- **Facts.** The PRR position-light signal (first in service 1915 on the Main Line) shows aspects by the *arrangement* of lamps, mimicking semaphore blade positions, rather than by color. The classic PRR position light is amber only. The three-lamp form settled around 1921. Amtrak and SEPTA still use modern adaptations ([railroadsignals.us](https://railroadsignals.us/signals/pl), [Railway Signaling 1925, jonroma.net](https://jonroma.net/media/signaling/railway-signaling/1925/The%20Position%20Light%20Signal.pdf), [The Trackside Photographer](https://thetracksidephotographer.com/2017/08/03/they-all-fall-down-2/)) **[V]**. Rulebook reference: ([PRR signal rules](https://alkrugarchive.github.io/rrfacts/signals/PRR/sigrules_PRR.htm)) **[S]**.
- **Steal:** This is the corridor's own vernacular, since the DC–Baltimore NEC is ex-PRR. **Encode state by geometry as well as color**, which also helps accessibility. Each channel's status glyph is a three-dot row: horizontal for idle, diagonal for listening or squelch open, vertical for transmitting, then tinted per the palette. It's colorblind-safe, honest to the territory, and a lovely "only-here" detail.

### 5.4 Mileposts and lineside signage
- **Facts.** On railroads, locations are identified by milepost ([Trains forum](https://cs.trains.com/trn/f/111/t/294447.aspx)) **[S]**. Signs vary by railroad and era ([Position Light blog](https://position-light.blogspot.com/2018/11/signs-signs-everywhere-sign-part-1.html?m=0)) **[S]**. Missouri Pacific's older markers were thin metal with raised numbers, later replaced by aluminum with reflective numerals ([MoPac Historical Society](https://mopac.org/?p=5349)) **[S]**. I found no AAR or AREMA milepost drawing; AREMA would be the next place to look **[U]**.
- **Steal:** **Milepost as the primary location unit.** Show `MP 101.4` instead of lat/long everywhere a railfan would expect it: data blocks, transcript rows, the stringline axis. Style them as small vertical "milepost" tags, a narrow rectangle with stacked numerals, which echoes the physical posts.

### 5.5 Railroad radio conventions
- **Facts.** The AAR plan numbers channels so that a radio's window shows a TX/RX pair. Amtrak's NEC road channel 160.920 MHz is channel 54 and displays as `5454` ([RadioReference forum](https://forums.radioreference.com/threads/aar-freq.204594/)) **[S]**. Narrowbanding added 7.5 kHz interstitial channels numbered 107–197, and 6.25 kHz channels 307–497 ([same thread](https://forums.radioreference.com/threads/aar-freq.204594/)) **[S]**. Channel ranges are in the AREMA C&S manual ([AREMA MP 22.01.01](https://arema.org/files/comm/ballots/CSIT/MP%2022.01.01%20Rev%202025%20Clean.pdf)) **[V exists; contents not reviewed]**. Corridor frequencies are researcher (d)'s job, so cross-check there.
- **Steal:** Show channels as railfans read them: a 4-digit `TXRX` readout in a segmented or monospace face (`5454`), with MHz as secondary text. It's authentic and compact.

---

## 6. Live-audio visualization patterns

| Pattern | Facts | Use in sdrviz |
|---|---|---|
| **VU meter** | ANSI C16.5-1942 / IEC 60268-17: reaches 99% of 0 VU in 300 ms, with the same fall time. Approximates perceived loudness and misses transients ([Wikipedia: VU meter](https://en.wikipedia.org/wiki/VU_meter), [Tape Op](https://tapeop.com/tutorials/54/meters)) **[V]**. | Per-channel level bar with VU-like ballistics, so it moves calmly with speech. Good for long-session comfort. |
| **PPM** | Fast attack (about 5–10 ms; sources differ) and slow decay ([Elliott Sound Products](https://sound-au.com/project55.htm), [NRC PDF](https://nationalradioclub.org/articles/Peak_Program_Meter.pdf)) **[V; figures disagree, S]**. | A thin peak-hold tick riding on the VU bar, the way broadcast meters pair the two. Peak-hold also signals clipping or over-deviation. |
| **Phosphor decay** | Section 3.1. | Every live element (meter, trace, waterfall row) lags behind with decay, so activity leaves a trail that fades into quiet. |
| **Scrolling waveform strip** | **[U: common practice]** | During TX, a hairline waveform scrolls inside the channel panel. At key-up it freezes and becomes the clip thumbnail in History. One visual object, from live to archived. |
| **Speech spectrogram** | LOFAR in section 3.2 shows the same time-frequency principle. | Click a transcript line to show a small 0–4 kHz spectrogram of that clip. Formant bands are visible, and it helps a user judge whether a transcript is credible. |
| **Ridgeline / joy plot** | Section 4.6. | Idle band overview. |
| **Squelch gate as geometry** | **[U: recommendation]** | Draw the squelch threshold as a dashed horizontal hairline on the channel's spectrum slot. When the signal crosses it, the line goes solid and the TX choreography (1.3) fires. This shows *why* audio started. |
| **Word-level transcript reveal** | **[U: recommendation; depends on Moonshine timing output]** | Words build on as they're decoded, typewriter-style, matching the director's "numbers that tick." Low-confidence words render in the muted tone, not a new color. |

---

## 7. Synthesis for the director

The ten borrows most worth the director's time, ranked by fit with the brief and the locked decisions **[U: my ranking]**:

1. **Track-diagram strip** from CTC panels (5.1), recolored to our semantics.
2. **Stringline graph** merging trains, mileposts and transmissions (5.2).
3. **ATC-style train and feed data blocks** on the Map (3.3).
4. **Dark-cockpit idle**, where healthy means quiet rather than green (3.7).
5. **Single-hue waterfall** with an amber overlay only on the transmitting slot. No rainbow colormaps (3.6).
6. **Phosphor two-stage decay** for "just happened" versus "a while ago" (3.1).
7. **Position-light geometry glyphs** for channel state, which are colorblind-safe and native to the corridor (5.3).
8. **Graticule-only grids** with per-division scale labels (3.5).
9. **Mode-change choreography** at key-up, the same every time (1.3).
10. **Beck-style schematic corridor view** beside the geographic Map (4.2).

**Things to avoid, with reasons:**
- Generic circles and random text (Hansen, 1.4).
- Faction or railroad hues, which break semantic color (1.7).
- Rainbow colormaps (3.6).
- CTC red for occupancy, which collides with fault red (5.1).
- Amber for anything except TX (3.7).

**Open item for the director** (not a user decision; decision 7 is locked): how to separate TX amber from aviation-style caution amber. See 3.7, item 2.

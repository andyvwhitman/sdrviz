# Requests from the `map` package

Owner: `frontend/src/screens/map/**`. The lead folds shared-kit items into `$lib` and tells the package.

## Shared kit

1. **Title block OSM cell.** `AppShell.svelte` renders `<TitleBlock ... />` without the `osm` prop, so the fifth cell
   (`© OpenStreetMap contributors`, spec 4.5) is missing on `/map`. Pass `osm={route.id === "map"}`. The bezel
   attribution is drawn by the Map screen itself.
2. **`DataBlockSvg` / `PositionGlyphSvg`: dim idle glyph.** Feed sites at rest use the dim armed mark (`state-idle-dim`).
   The kit glyph has no `dim` option, so the Map wraps the block in `<g class="mp-dim">` and `map.css` recolours
   `.f-idle` inside it. A `dim?: boolean` on `PositionGlyphSvg` (and `glyphDim` on the block geometry) would remove that rule.
3. **Not in the kit yet, built locally in `screens/map/`** (move them to `$lib/components` if another screen wants them):
   `PingRing.svelte` (M14, animated by `.ping.is-firing`, or frozen at `progress` for the motion study),
   `RegMark.svelte` (M4; `screens/live-ops` and `screens/system` carry their own copies too),
   `SelectBracket.svelte` (the four corner ticks of a selected object), and the inspector markup
   (`MapInspector.svelte` writes `.inspector`, `.inspector__head`, `.inspector__sec` directly; there is no `Inspector.svelte`).
   A kit `Inspector` with a header (glyph, title, SIM, ESC), a kind line, a lead slot and titled sections would replace it.
4. **Scale bar** (two M2 rulers on one baseline, km above and mi below) is `ScaleBar.svelte`; a kit `TickRuler` would replace it.

## Backend and contract

5. `LiveState` carries no `map` block (counts, `corner_readout`); the Map computes the corner readout from
   `places` and `trains.tracked_count`. Fine as long as `/geo/places` keeps all 37 stations and 13 detectors.
6. `GET /geo/{rail,water,places,routes}` return untyped JSON; the Map declares the shapes it reads in `lib/types.ts`.
   When `schema.gen.ts` exists, replace them.
7. The feed inspector's `OPEN IN FEEDS & BANKS` goes to `/feeds?feed=<feed id>`. The Feeds screen does not read a query yet;
   agree on the parameter name (`?feed=`, or `?inspect=` as Live Ops uses for objects).
8. Train positions arrive at 1 Hz on `trains`; the Map keeps a placement until the set of trains changes or a train has
   moved 12 px (about 17 s at 60 mph), then re-solves. If the backend ever sends faster updates nothing changes.

## Spec and mockup notes

9. **Schematic rise.** Spec 4.5 says 138 px at 1920 and 172 px at 1440. `map.js` (the approved renders) uses 172 px at both
   sizes and 112 px for Philadelphia at 1440 (172 at 1920). The Map follows the mockup so the frames match; the spec text
   should say 172 / 172 / 112.

## Deviations from the mockups

- Live (unfrozen) frames differ from mockup frames only where live data moves (train positions, timers); frozen scenarios match.
- ON AIR rows ellipsize long train names (for example `CSX BE DISPATCHER`) so they do not run into the VIA column.
- The bottom status bar has no OSM cell until request 1 above lands in `AppShell`; the bezel attribution is present.

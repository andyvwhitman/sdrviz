# Map geometry attribution

`rail.geojson` and `water.geojson` are derived from OpenStreetMap data.

**© OpenStreetMap contributors.** The data is available under the Open Database License (ODbL 1.0): <https://www.openstreetmap.org/copyright>. The derived files are a produced work under the same licence.

Every map view must show `© OpenStreetMap contributors`, linked to the copyright page (brief §9.5, layer 11).

## How it was made

`python3 tools/fetch_geo.py` ran one Overpass extract over the bounding box 38.5,-77.5,39.6,-76.05 (S, W, N, E), Quantico VA to Perryville MD. Parallel tracks within 30 m were collapsed to one line and lines were Douglas-Peucker simplified (20 m rail, 70 m shoreline). Rail `class` is `nec`, `passenger` (used by an OSM `route=train` relation) or `freight`.

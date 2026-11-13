"""Fetch the track-level detail layer for sdrviz's map: every track, switch and platform at the terminals.

The regional map (tools/fetch_geo.py) keeps only main lines, with parallel tracks collapsed. Zoomed in
on a terminal, the map draws this layer instead: individual tracks with their numbers (Union Station
tracks 1-30, yard leads...), crossovers, switches, signals, buffer stops and platforms, from OSM, the
same data OpenRailwayMap shows. Metro (WMATA) and other subway / light rail are left out.

One Overpass query covers all the areas in AREAS; each feature is clipped to its area and carries the
area id. Output: data/geo/rail_detail.geojson (+ the .js twin), ODbL like the rest of data/geo.

Standard library only. Run from the repo root:

    python3 tools/fetch_detail.py            # fetch (cached) + build
    python3 tools/fetch_detail.py --refresh  # ignore the cache and re-query
"""

from __future__ import annotations

import argparse
import json
import sys

from fetch_geo import ATTRIBUTION, OUT_DIR, REPO, overpass, simplify, to_xy

# id: (name, (south, west, north, east)). Each is a terminal or key interlocking on the radio's patch.
AREAS: dict[str, tuple[str, tuple[float, float, float, float]]] = {
    "union": ("Washington Union Station · Ivy City", (38.893, -77.013, 38.925, -76.975)),
    "lenfant": ("L'Enfant · Virginia Ave · Long Bridge", (38.872, -77.045, 38.889, -77.005)),
    "alexandria": ("Alexandria", (38.798, -77.072, 38.815, -77.052)),
    "benning": ("Benning (CSX)", (38.885, -76.965, 38.905, -76.935)),
    "carrollton": ("New Carrollton", (38.940, -76.885, 38.957, -76.860)),
    "bwi": ("BWI", (39.183, -76.705, 39.200, -76.684)),
    "penn": ("Baltimore Penn Station", (39.298, -76.640, 39.318, -76.600)),
    "bayview": ("Bayview", (39.293, -76.545, 39.310, -76.515)),
}

POINTS = {"switch", "signal", "buffer_stop", "railway_crossing"}
SKIP_OPERATORS = ("Washington Metropolitan Area Transit Authority", "WMATA")
TOLERANCE_M = 0.3  # keeps a switch's diverging curve; tracks are about 4.5 m apart
DECIMALS = 6  # about 0.1 m


def query() -> str:
    parts = []
    for _, (s, w, n, e) in AREAS.values():
        box = f"({s},{w},{n},{e})"
        parts += [
            f'way["railway"="rail"]{box};',
            f'node["railway"~"^({"|".join(sorted(POINTS))})$"]{box};',
            f'way["railway"="platform"]{box};',
            f'way["public_transport"="platform"]["train"="yes"]{box};',
        ]
    return "[out:json][timeout:180];\n(\n  " + "\n  ".join(parts) + "\n);\nout tags geom;\n"


def inside(lat: float, lon: float, box: tuple[float, float, float, float]) -> bool:
    s, w, n, e = box
    return s <= lat <= n and w <= lon <= e


def clip(geometry: list[dict], box: tuple[float, float, float, float]) -> list[list[dict]]:
    """Runs of the line inside the box, each extended one point past the edge so it reaches the frame."""
    runs, run = [], []
    for i, p in enumerate(geometry):
        if inside(p["lat"], p["lon"], box):
            if not run and i > 0:
                run.append(geometry[i - 1])
            run.append(p)
        elif run:
            runs.append([*run, p])
            run = []
    if run:
        runs.append(run)
    return [r for r in runs if len(r) > 1]


def line(points: list[dict]) -> list[list[float]]:
    xy = [to_xy(p["lon"], p["lat"]) for p in points]
    kept = set(simplify(xy, TOLERANCE_M))
    return [[round(p["lon"], DECIMALS), round(p["lat"], DECIMALS)] for p, q in zip(points, xy) if q in kept]


def track_props(tags: dict) -> dict:
    props = {"kind": "track", "service": tags.get("service", "main")}
    if ref := tags.get("railway:track_ref") or tags.get("ref"):
        props["ref"] = ref
    for key in ("usage", "operator", "name"):
        if key in tags:
            props[key] = tags[key]
    return props


def build(data: dict) -> list[dict]:
    """Tracks and platforms clipped per area; switches and other points only where they sit on a kept track
    (Metro's switches are tagged without an operator, so this is what keeps them out)."""
    tracks = [e for e in data["elements"] if e["type"] == "way" and e.get("tags", {}).get("railway") == "rail"]
    kept = [e for e in tracks if not e["tags"].get("operator", "").startswith(SKIP_OPERATORS)]
    on_track = {(p["lat"], p["lon"]) for e in kept for p in e.get("geometry", [])}
    features = []
    for element in data["elements"]:
        tags = element.get("tags", {})
        if tags.get("operator", "").startswith(SKIP_OPERATORS):
            continue
        if element["type"] == "node" and (element["lat"], element["lon"]) not in on_track:
            continue
        for area_id, (_, box) in AREAS.items():
            if element["type"] == "node":
                if tags.get("railway") in POINTS and inside(element["lat"], element["lon"], box):
                    props = {"kind": tags["railway"], "area": area_id}
                    if ref := tags.get("ref") or tags.get("railway:ref"):
                        props["ref"] = ref
                    geometry = {"type": "Point", "coordinates": [round(element["lon"], DECIMALS), round(element["lat"], DECIMALS)]}
                    features.append({"type": "Feature", "properties": props, "geometry": geometry})
                continue
            is_platform = tags.get("railway") == "platform" or tags.get("public_transport") == "platform"
            if is_platform and tags.get("train") != "yes":
                break  # Metro, light rail and Purple Line platforms
            props = {"kind": "platform", **({"ref": tags["ref"]} if "ref" in tags else {})} if is_platform else track_props(tags)
            for run in clip(element.get("geometry", []), box):
                geometry = {"type": "LineString", "coordinates": line(run)}
                features.append({"type": "Feature", "properties": {**props, "area": area_id}, "geometry": geometry})
    return features


def write(features: list[dict]) -> None:
    collection = {
        "type": "FeatureCollection",
        "attribution": ATTRIBUTION,
        "license": "ODbL-1.0",
        "generator": "tools/fetch_detail.py",
        "areas": {area_id: {"name": name, "bbox": [w, s, e, n]} for area_id, (name, (s, w, n, e)) in AREAS.items()},
        "note": "track-level detail: every railway=rail track (no Metro), switches, signals, buffer stops, platforms",
        "features": features,
    }
    text = json.dumps(collection, separators=(",", ":"), ensure_ascii=False)
    path = OUT_DIR / "rail_detail.geojson"
    path.write_text(text, encoding="utf-8")
    twin = f'(window.SDRVIZ_DATA = window.SDRVIZ_DATA || {{}})["data/geo/rail_detail.geojson"] = {text};\n'
    (OUT_DIR / "rail_detail.geojson.js").write_text(twin, encoding="utf-8")
    print(f"  wrote {path.relative_to(REPO)}: {len(features)} features, {len(text) / 1024:.0f} KB")


def summary(features: list[dict]) -> None:
    for area_id, (name, _) in AREAS.items():
        mine = [f["properties"] for f in features if f["properties"]["area"] == area_id]
        kinds = {k: sum(p["kind"] == k for p in mine) for k in ("track", "switch", "signal", "buffer_stop", "platform")}
        refs = sorted({p["ref"] for p in mine if p["kind"] == "track" and "ref" in p}, key=lambda r: (len(r), r))
        print(f"  {name:40} {kinds}  track numbers: {', '.join(refs[:16]) or '-'}{' ...' if len(refs) > 16 else ''}")


def main() -> int:
    assert __doc__ is not None
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true", help="ignore the cached Overpass response")
    args = parser.parse_args()
    data = overpass("rail_detail", query(), args.refresh)
    features = build(data)
    write(features)
    summary(features)
    return 0


if __name__ == "__main__":
    sys.exit(main())

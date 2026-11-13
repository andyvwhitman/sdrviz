"""For every Amtrak rail station, the nearest station of each commuter rail feed: distance and names.

Run from backend/: PYTHONPATH=. .venv/bin/python ../tools/station_merge_radius.py OUT.json
See docs/research/station-merge-radius.md.
"""
import json, re, sys
from pathlib import Path
from app.transit.gtfs_static import GtfsStatic
from app.transit.places import distance_m

DATA = Path(__file__).resolve().parents[1] / "data" / "transit"
COMMUTER = ["marc", "vre", "mbta", "septa", "lirr", "mnr", "metra", "metrolink", "caltrain", "sounder", "tre", "sunrail", "frontrunner", "rtd-rail", "smart", "wes"]
EXCLUDE = {"amtrak": ["42985", "42948"]}

def stations(name):
    kw = {"exclude_routes": EXCLUDE[name]} if name in EXCLUDE else {}
    feed = GtfsStatic.from_zip(DATA / f"{name}-gtfs.zip", [2], full=False, **kw)
    return list(feed.stations.values())

amtrak = stations("amtrak")
pairs = []
for name in COMMUTER:
    try:
        st = stations(name)
    except Exception as e:
        print("skip", name, e, file=sys.stderr); continue
    for a in amtrak:
        best = min(st, key=lambda s: distance_m(a.lat, a.lon, s.lat, s.lon), default=None)
        if best is None: continue
        d = distance_m(a.lat, a.lon, best.lat, best.lon)
        if d <= 1609:
            pairs.append({"feed": name, "amtrak_id": a.id, "amtrak": a.name, "other_id": best.id, "other": best.name, "m": round(d)})
pairs.sort(key=lambda p: p["m"])
json.dump(pairs, open(sys.argv[1], "w"), indent=1)
print(len(amtrak), "amtrak stations;", len(pairs), "pairs within 1 mi")

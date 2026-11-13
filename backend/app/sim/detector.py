"""Defect-detector fields parsed from a detector transmission's transcript."""

import re

_RE = {
    "axles": re.compile(r"Total axles (\d+)"),
    "mph": re.compile(r"speed (\d+) miles"),
    "defect": re.compile(r"Defect, defect\. (.+?)\. Train speed"),
    "mp": re.compile(r"milepost (\d+\.\d)"),
}


def detector_fields(role: str, transcript: str, place: dict | None) -> dict | None:
    """The `detector` object of a transmission row; None unless the speaker is a detector."""
    if role != "detector":
        return None
    out: dict = {}
    for key in ("axles", "mph"):
        match = _RE[key].search(transcript)
        out[key] = int(match.group(1)) if match else None
    match = _RE["defect"].search(transcript)
    out["defect"] = bool(match)
    out["defect_text"] = match.group(1) if match else None
    if place and place.get("kind") == "detector":
        out["mp_label"] = re.sub(r"([A-Z]+)(\d)", r"\1 \2", place["milepost"])
        out["detector_id"] = place["id"]
    else:
        match = _RE["mp"].search(transcript)
        out["mp_label"] = f"MP {match.group(1)}" if match else None
        out["detector_id"] = None
    return out

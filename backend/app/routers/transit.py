from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response

from ..deps import RT
from ..transit.geometry import Bbox
from ..transit.models import Alert, Board, Line, StationBoard, StationSuggestion, Stop, Timetable, Trip, Vehicle
from ..transit.sources import SourceConfig, TransitSource

router = APIRouter(prefix="/transit", tags=["transit"])


def parse_bbox(text: str) -> Bbox:
    try:
        west, south, east, north = (float(part) for part in text.split(","))
    except ValueError:
        raise HTTPException(status_code=422, detail="bbox must be w,s,e,n") from None
    return west, south, east, north


BBox = Annotated[str, Query(description="w,s,e,n in degrees")]
OptionalBBox = Annotated[str | None, Query(description="w,s,e,n in degrees")]


# --- sources ---------------------------------------------------------------------


@router.get("/sources")
def sources(rt: RT) -> list[TransitSource]:
    """Every configured feed with its state, last update, counts and last error."""
    return rt.transit.sources() if rt.transit else []


def _service(rt):
    if rt.transit is None:
        raise HTTPException(status_code=503, detail="transit is turned off")
    return rt.transit


@router.post("/sources", status_code=201)
async def add_source(body: SourceConfig, rt: RT) -> TransitSource:
    service = _service(rt)
    if body.id in service.configs:
        raise HTTPException(status_code=409, detail=f"source {body.id!r} exists")
    return await service.apply(body)


@router.put("/sources/{source_id}")
async def update_source(source_id: str, body: SourceConfig, rt: RT) -> TransitSource:
    service = _service(rt)
    if source_id not in service.configs:
        raise HTTPException(status_code=404, detail=f"no source {source_id!r}")
    return await service.apply(body.model_copy(update={"id": source_id}))


@router.delete("/sources/{source_id}", status_code=204)
async def delete_source(source_id: str, rt: RT) -> Response:
    if not await _service(rt).remove(source_id):
        raise HTTPException(status_code=404, detail=f"no source {source_id!r}")
    return Response(status_code=204)


@router.post("/sources/{source_id}/refresh")
async def refresh_source(source_id: str, rt: RT) -> TransitSource:
    service = _service(rt)
    if source_id not in service.configs:
        raise HTTPException(status_code=404, detail=f"no source {source_id!r}")
    return await service.refresh(source_id)


@router.get("/stats")
def stats(rt: RT) -> dict:
    """Per-source load timings and the memory of the transit indexes."""
    return rt.transit.stats() if rt.transit else {"sources": [], "memory_mb": 0, "enabled": 0}


# --- map layers ------------------------------------------------------------------


@router.get("/lines")
def lines(rt: RT, bbox: BBox, zoom: float | None = None) -> dict[str, list[Line]]:
    """Route geometry in the box, simplified for its width (`zoom` is accepted but the box decides)."""
    return {"lines": rt.transit.lines(parse_bbox(bbox)) if rt.transit else []}


@router.get("/stops")
def stops(rt: RT, bbox: BBox, zoom: float | None = None) -> dict[str, list[Stop]]:
    """Stations in the box, thinned when the box is wide."""
    return {"stops": rt.transit.stops(parse_bbox(bbox)) if rt.transit else []}


# --- trains ----------------------------------------------------------------------


@router.get("/vehicles")
def vehicles(rt: RT, bbox: OptionalBBox = None, agency: str | None = None) -> list[Vehicle]:
    """Live and estimated train positions from every enabled source."""
    if not rt.transit:
        return []
    return rt.transit.vehicles(agency=agency, bbox=parse_bbox(bbox) if bbox else None)


@router.get("/alerts")
def alerts(rt: RT, source: str | None = None) -> list[Alert]:
    """Active service alerts (MARC today) that name a source's routes, stops or trips."""
    return rt.transit.alerts(source) if rt.transit else []


@router.get("/trips/{trip_id:path}")
def trip(trip_id: str, rt: RT, date: date | None = None) -> Trip:
    """A trip with every stop; `date` shows a scheduled trip on that service day instead of today's run."""
    found = rt.transit.trip(trip_id, day=date) if rt.transit else None
    if found is None:
        raise HTTPException(status_code=404, detail=f"no trip {trip_id!r}")
    return found


# --- stations and routes -----------------------------------------------------------


@router.get("/stations/suggestions")
def station_suggestions(rt: RT) -> list[StationSuggestion]:
    """Stations of different sources that look like one (near each other, or same name) and are in no group."""
    return rt.transit.suggestions() if rt.transit else []


@router.get("/stations/{place_id}/board")
def station_board(
    place_id: str,
    rt: RT,
    back: Annotated[int, Query(ge=0, le=240, description="minutes of departed trains to include")] = 30,
    ahead: Annotated[int, Query(ge=1, le=1440, description="minutes of upcoming trains to include")] = 180,
) -> Board:
    """The app-place board: upcoming trains and those that left in the last `back` minutes."""
    board = rt.transit.board(place_id, back_min=back, ahead_min=ahead) if rt.transit else None
    if board is None:
        raise HTTPException(status_code=404, detail=f"no station {place_id!r}")
    return board


@router.get("/stations/{stop_id:path}")
def station(
    stop_id: str,
    rt: RT,
    back: Annotated[int, Query(ge=0, le=720)] = 60,
    ahead: Annotated[int, Query(ge=1, le=1440)] = 240,
    date: date | None = None,
    agency: str | None = None,
    source: str | None = None,
) -> StationBoard:
    """Departures and arrivals at a station: a group (`st:was`), or any stop id (`<source>:<stop_id>`).

    A member stop id gives its group's merged board. Passed rows within `back` minutes are included. With `date`
    (YYYY-MM-DD) the whole scheduled service day is listed instead, back and ahead ignored. `agency` / `source`
    keep only that operator's rows.
    """
    found = (
        rt.transit.station(stop_id, back_min=back, ahead_min=ahead, on=date, agency=agency, source=source)
        if rt.transit
        else None
    )
    if found is None:
        raise HTTPException(status_code=404, detail=f"no station {stop_id!r}")
    return found


@router.get("/routes/{route_id:path}")
def route(route_id: str, rt: RT, date: date | None = None) -> Timetable:
    """The timetable grid of a route (`<source>:<route_id>`) for a date, by direction."""
    found = rt.transit.route(route_id, date) if rt.transit else None
    if found is None:
        raise HTTPException(status_code=404, detail=f"no route {route_id!r}")
    return found

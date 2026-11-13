from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response

from ..audio.cache import job_for
from ..audio.synth import ClipJob, missing_tools
from ..deps import DB, RT
from ..models import Transmission
from ..schemas import TransmissionOut, TransmissionPage, Waveform
from ..services import history, search
from ..services.search import MAX_LIMIT, TxFilter
from ..sim.data import tx_from_row
from ..sim.timefmt import offset_from_iso

router = APIRouter(prefix="/transmissions", tags=["transmissions"])


def filters(
    start: str | None = Query(None, description="ISO-8601 window start"),
    end: str | None = Query(None, description="ISO-8601 window end"),
    frequency_id: str | None = None,
    aar: int | None = Query(None, description="AAR channel number"),
    feed_id: str | None = Query(None, description="Heard by this feed"),
    role: str | None = None,
    train_id: str | None = None,
    place_id: str | None = None,
    bank_id: str | None = None,
    state: str | None = None,
    min_duration: float | None = None,
    defect: bool = False,
    q: str | None = Query(None, description="Keywords in transcript, speaker or train (prefix match)"),
) -> TxFilter:
    try:
        start_t = offset_from_iso(start) if start else None
        end_t = offset_from_iso(end) if end else None
    except ValueError as err:
        raise HTTPException(status_code=422, detail=f"Bad ISO-8601 time: {err}") from err
    return TxFilter(
        start_t,
        end_t,
        frequency_id,
        aar,
        feed_id,
        role,
        train_id,
        place_id,
        bank_id,
        state,
        min_duration,
        defect,
        q,
    )


Filters = Annotated[TxFilter, Depends(filters)]


@router.get("")
def list_transmissions(
    f: Filters,
    session: DB,
    rt: RT,
    order: Literal["asc", "desc"] = "desc",
    limit: int = Query(100, ge=1, le=MAX_LIMIT),
    cursor: str | None = None,
) -> TransmissionPage:
    pairs = search.find(session, rt.world, f, order)
    items, next_cursor = search.page(pairs, order, limit, cursor)
    return TransmissionPage(
        items=[search.to_out(row, t) for row, t in items], total=len(pairs), next_cursor=next_cursor
    )


@router.get("/summary")
def summary(f: Filters, session: DB, rt: RT) -> dict[str, Any]:
    """Totals, hero line and the 24 h airtime scrubber. Without a window: the last hour up to the sim clock."""
    end = f.end_t if f.end_t is not None else rt.clock.now()
    return history.summarize(session, rt.world, f, end)


def get_or_404(session: DB, tx_id: str) -> Transmission:
    row = session.get(Transmission, tx_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"No transmission {tx_id!r}")
    return row


def clip_job(row: Transmission) -> ClipJob:
    if row.kind == "kerchunk":
        return ClipJob(id=row.id, text="", duration_s=row.duration_s)
    return job_for(tx_from_row(row))


def render_or_503(rt: RT, row: Transmission) -> None:
    if missing_tools():
        raise HTTPException(status_code=503, detail=f"Fake audio needs {', '.join(missing_tools())} on the PATH")
    rt.audio.ensure(clip_job(row))


@router.get("/{tx_id}")
def read_transmission(tx_id: str, session: DB) -> TransmissionOut:
    row = get_or_404(session, tx_id)
    return search.to_out(row, row.t_offset_s)


@router.get("/{tx_id}/audio")
def audio(tx_id: str, session: DB, rt: RT, request: Request) -> Response:
    """The clip as WebM/Opus, rendered on first request. HTTP Range is supported."""
    row = get_or_404(session, tx_id)
    render_or_503(rt, row)
    # FileResponse answers Range requests itself.
    return FileResponse(rt.audio.webm_path(tx_id), media_type="audio/webm; codecs=opus")


@router.get("/{tx_id}/waveform")
def waveform(tx_id: str, session: DB, rt: RT, bins: int = Query(240, ge=8, le=2000)) -> Waveform:
    row = get_or_404(session, tx_id)
    render_or_503(rt, row)
    return Waveform(duration_s=row.duration_s, peaks=rt.audio.peaks(tx_id, bins) or [])

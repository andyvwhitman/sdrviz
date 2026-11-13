from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import literal_column
from sqlmodel import select

from ..deps import DB, RT
from ..models import Bank, Frequency, FrequencyBase

router = APIRouter(prefix="/frequencies", tags=["frequencies"])

AAR_FIRST_MHZ, AAR_STEP_MHZ = 160.110, 0.015


def aar_for(freq_mhz: float) -> int:
    return round((freq_mhz - AAR_FIRST_MHZ) / AAR_STEP_MHZ)


def checked(body: FrequencyBase) -> Frequency:
    """The table row for a request body; the AAR channel is derived from the frequency or must agree with it."""
    expected = aar_for(body.freq_mhz)
    if body.aar_channel is not None and body.aar_channel != expected:
        raise HTTPException(
            status_code=422, detail=f"{body.freq_mhz} MHz is AAR channel {expected}, not {body.aar_channel}"
        )
    return Frequency(**{**body.model_dump(), "aar_channel": expected})


def get_or_404(session: DB, freq_id: str) -> Frequency:
    freq = session.get(Frequency, freq_id)
    if freq is None:
        raise HTTPException(status_code=404, detail=f"No frequency {freq_id!r}")
    return freq


@router.get("")
def list_frequencies(session: DB) -> list[Frequency]:
    return list(session.exec(select(Frequency).order_by(literal_column("rowid"))).all())


@router.post("", status_code=201)
def create_frequency(body: FrequencyBase, session: DB, rt: RT) -> Frequency:
    if session.get(Frequency, body.id):
        raise HTTPException(status_code=409, detail=f"Frequency {body.id!r} already exists")
    freq = checked(body)
    session.add(freq)
    session.commit()
    rt.reload_world()
    return freq


@router.get("/{freq_id}")
def read_frequency(freq_id: str, session: DB) -> Frequency:
    return get_or_404(session, freq_id)


@router.put("/{freq_id}")
def update_frequency(freq_id: str, body: FrequencyBase, session: DB, rt: RT) -> Frequency:
    get_or_404(session, freq_id)
    if body.id != freq_id:
        raise HTTPException(status_code=422, detail="The body id must match the URL")
    freq = session.merge(checked(body))
    session.commit()
    rt.reload_world()
    return freq


@router.delete("/{freq_id}", status_code=204)
def delete_frequency(freq_id: str, session: DB, rt: RT, force: bool = False) -> Response:
    freq = get_or_404(session, freq_id)
    banks = [b for b in session.exec(select(Bank)).all() if freq_id in b.frequency_ids]
    if banks and not force:
        names = ", ".join(b.id for b in banks)
        raise HTTPException(
            status_code=409, detail=f"Frequency is in bank(s) {names}; use ?force=true to remove it from them"
        )
    for bank in banks:
        bank.frequency_ids = [f for f in bank.frequency_ids if f != freq_id]
        session.add(bank)
    # The recorded history keeps its rows; they are ignored by the live view once the channel is gone.
    session.delete(freq)
    session.commit()
    rt.reload_world()
    return Response(status_code=204)

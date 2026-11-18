from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import literal_column
from sqlmodel import select

from ..db import bank_short
from ..deps import DB, RT
from ..models import Bank, BankBase, Feed, Frequency, Prefs
from ..schemas import PrefsModel

router = APIRouter(prefix="/banks", tags=["banks"])


def get_or_404(session: DB, bank_id: str) -> Bank:
    bank = session.get(Bank, bank_id)
    if bank is None:
        raise HTTPException(status_code=404, detail=f"No bank {bank_id!r}")
    return bank


def checked(body: BankBase, session: DB) -> Bank:
    known = set(session.exec(select(Frequency.id)).all())
    if unknown := [f for f in body.frequency_ids if f not in known]:
        raise HTTPException(status_code=422, detail=f"Unknown frequencies: {', '.join(unknown)}")
    if session.get(Feed, body.home_feed) is None:
        raise HTTPException(status_code=422, detail=f"Unknown home feed {body.home_feed!r}")
    return Bank(**{**body.model_dump(), "short": body.short or bank_short(body.id, body.name)})


@router.get("")
def list_banks(session: DB) -> list[Bank]:
    return list(session.exec(select(Bank).order_by(literal_column("rowid"))).all())


@router.post("", status_code=201)
def create_bank(body: BankBase, session: DB, rt: RT) -> Bank:
    if session.get(Bank, body.id):
        raise HTTPException(status_code=409, detail=f"Bank {body.id!r} already exists")
    bank = checked(body, session)
    session.add(bank)
    session.commit()
    rt.reload_world()
    return bank


LIVE_BANK_ID = "bank-live"  # the bank the operator builds by clicking the waterfall
AAR_FIRST_MHZ, AAR_STEP_MHZ = 160.110, 0.015


class LiveChannelIn(BaseModel):
    aar_channel: int = Field(ge=1, le=255)
    feed_id: str | None = None  # the feed whose waterfall was clicked: the live bank's home feed


def live_frequency(session: DB, aar_channel: int) -> Frequency:
    """The table's frequency on this AAR channel, or a new placeholder row for it."""
    if existing := session.exec(select(Frequency).where(Frequency.aar_channel == aar_channel)).first():
        return existing
    freq = Frequency(
        id=f"live-ch{aar_channel:02d}",
        label=f"CH{aar_channel:02d}",
        freq_mhz=round(AAR_FIRST_MHZ + AAR_STEP_MHZ * aar_channel, 3),
        aar_channel=aar_channel,
        railroad="UNKNOWN",
        use="live",
        confidence="low",
        notes="added from the waterfall",
    )
    session.add(freq)
    return freq


@router.post("/live/channels")
def add_live_channel(body: LiveChannelIn, session: DB, rt: RT) -> Bank:
    """Listen to a channel: put it in the live bank (made on first use). Nodes on the banks preset start decoding it."""
    freq = live_frequency(session, body.aar_channel)
    bank = session.get(Bank, LIVE_BANK_ID)
    if bank is None:
        home = body.feed_id or next(iter(rt.world.feeds), None)
        if home is None:
            raise HTTPException(status_code=409, detail="No feed to listen with")
        bank = Bank(
            id=LIVE_BANK_ID, name="Live", short="LIVE", home_feed=home, description="Channels picked on the waterfall"
        )
    if freq.id not in bank.frequency_ids:
        bank.frequency_ids = [*bank.frequency_ids, freq.id]  # a new list, so the JSON column is saved
    session.add(bank)
    session.commit()
    session.refresh(bank)
    rt.reload_world()
    rt.publish_snapshot()
    return bank


@router.delete("/live/channels/{aar_channel}")
def remove_live_channel(aar_channel: int, session: DB, rt: RT) -> Bank:
    """Stop listening: take the channel out of the live bank (the frequency row stays)."""
    bank = get_or_404(session, LIVE_BANK_ID)
    ids = {f.id for f in session.exec(select(Frequency).where(Frequency.aar_channel == aar_channel))}
    bank.frequency_ids = [f for f in bank.frequency_ids if f not in ids]
    session.add(bank)
    session.commit()
    session.refresh(bank)
    rt.reload_world()
    rt.publish_snapshot()
    return bank


@router.get("/{bank_id}")
def read_bank(bank_id: str, session: DB) -> Bank:
    return get_or_404(session, bank_id)


@router.put("/{bank_id}")
def update_bank(bank_id: str, body: BankBase, session: DB, rt: RT) -> Bank:
    get_or_404(session, bank_id)
    if body.id != bank_id:
        raise HTTPException(status_code=422, detail="The body id must match the URL")
    bank = session.merge(checked(body, session))
    session.commit()
    rt.reload_world()
    return bank


@router.delete("/{bank_id}", status_code=204)
def delete_bank(bank_id: str, session: DB, rt: RT) -> Response:
    bank = get_or_404(session, bank_id)
    if rt.prefs.active_bank == bank_id:
        raise HTTPException(status_code=409, detail="This is the active bank; activate another one first")
    session.delete(bank)
    session.commit()
    rt.reload_world()
    return Response(status_code=204)


@router.post("/{bank_id}/activate")
async def activate_bank(bank_id: str, session: DB, rt: RT) -> PrefsModel:
    get_or_404(session, bank_id)
    rt.save_prefs(Prefs(**{**rt.prefs.model_dump(), "active_bank": bank_id, "displayed_feed": None}))
    rt.publish_snapshot()
    return PrefsModel.model_validate(rt.prefs, from_attributes=True)

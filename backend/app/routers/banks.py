from fastapi import APIRouter, HTTPException, Response
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

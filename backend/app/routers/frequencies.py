from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import literal_column
from sqlmodel import col, delete, select

from ..auth import ADMIN
from ..deps import DB, RT
from ..models import Assignment, Bank, Frequency, FrequencyBase

router = APIRouter(prefix="/frequencies", tags=["frequencies"])

AAR_FIRST_MHZ, AAR_STEP_MHZ = 160.110, 0.015


def aar_for(freq_mhz: float) -> int:
    return round((freq_mhz - AAR_FIRST_MHZ) / AAR_STEP_MHZ)


def freq_for(aar_channel: int) -> float:
    return round(AAR_FIRST_MHZ + AAR_STEP_MHZ * aar_channel, 3)


class AssignmentOut(BaseModel):
    feed_id: str
    enabled: bool


class FrequencyOut(FrequencyBase):
    """A frequency with the feeds it is assigned to (enabled or not); an unassigned one has an empty list."""

    aar_channel: int
    assignments: list[AssignmentOut] = []


class EnabledIn(BaseModel):
    enabled: bool = True


class FromChannelIn(BaseModel):
    aar_channel: int = Field(ge=1, le=97)  # the AAR band: 160.125 to 161.565 MHz
    feed_id: str


class FromChannelOut(BaseModel):
    frequency: FrequencyOut
    created: bool  # False: the table already had a frequency on this channel


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


def out(session: DB, freq: Frequency) -> FrequencyOut:
    rows = session.exec(
        select(Assignment).where(Assignment.frequency_id == freq.id).order_by(literal_column("rowid"))
    ).all()
    return FrequencyOut(**freq.model_dump(), assignments=[AssignmentOut(**row.model_dump()) for row in rows])


@router.get("")
def list_frequencies(session: DB) -> list[FrequencyOut]:
    assigned: dict[str, list[AssignmentOut]] = {}
    for row in session.exec(select(Assignment).order_by(literal_column("rowid"))):
        assigned.setdefault(row.frequency_id, []).append(AssignmentOut(**row.model_dump()))
    freqs = session.exec(select(Frequency).order_by(literal_column("rowid"))).all()
    return [FrequencyOut(**freq.model_dump(), assignments=assigned.get(freq.id, [])) for freq in freqs]


@router.post("", status_code=201, dependencies=[ADMIN])
def create_frequency(body: FrequencyBase, session: DB, rt: RT) -> FrequencyOut:
    if session.get(Frequency, body.id):
        raise HTTPException(status_code=409, detail=f"Frequency {body.id!r} already exists")
    freq = checked(body)
    session.add(freq)
    session.commit()
    rt.reload_world()
    return out(session, freq)


@router.post("/from-channel", dependencies=[ADMIN])
def from_channel(body: FromChannelIn, session: DB, rt: RT) -> FromChannelOut:
    """Right-click on the waterfall: the frequency on this AAR channel (made, labelled with the number twice, if the
    table has none), assigned to the feed and enabled there."""
    if body.feed_id not in rt.world.feeds:
        raise HTTPException(status_code=422, detail=f"Unknown feed {body.feed_id!r}")
    freq = session.exec(
        select(Frequency).where(Frequency.aar_channel == body.aar_channel).order_by(literal_column("rowid"))
    ).first()
    created = freq is None
    if freq is None:
        freq = Frequency(
            id=f"live-ch{body.aar_channel:02d}",
            label=f"{body.aar_channel:02d}{body.aar_channel:02d}",
            freq_mhz=freq_for(body.aar_channel),
            aar_channel=body.aar_channel,
            railroad="UNKNOWN",
            use="live",
            confidence="low",
            notes="added from the waterfall",
        )
        session.add(freq)
    session.merge(Assignment(frequency_id=freq.id, feed_id=body.feed_id, enabled=True))
    session.commit()
    rt.reload_world()
    rt.publish_snapshot()
    return FromChannelOut(frequency=out(session, freq), created=created)


@router.get("/{freq_id}")
def read_frequency(freq_id: str, session: DB) -> FrequencyOut:
    return out(session, get_or_404(session, freq_id))


@router.put("/{freq_id}", dependencies=[ADMIN])
def update_frequency(freq_id: str, body: FrequencyBase, session: DB, rt: RT) -> FrequencyOut:
    get_or_404(session, freq_id)
    if body.id != freq_id:
        raise HTTPException(status_code=422, detail="The body id must match the URL")
    freq = session.merge(checked(body))
    session.commit()
    rt.reload_world()
    return out(session, freq)


@router.put("/{freq_id}/assignments/{feed_id}", dependencies=[ADMIN])
def assign(freq_id: str, feed_id: str, body: EnabledIn, session: DB, rt: RT) -> FrequencyOut:
    """Assign the frequency to the feed, enabled or disabled (creates the assignment or changes it)."""
    freq = get_or_404(session, freq_id)
    if feed_id not in rt.world.feeds:
        raise HTTPException(status_code=404, detail=f"No feed {feed_id!r}")
    session.merge(Assignment(frequency_id=freq_id, feed_id=feed_id, enabled=body.enabled))
    session.commit()
    rt.reload_world()
    rt.publish_snapshot()
    return out(session, freq)


@router.delete("/{freq_id}/assignments/{feed_id}", dependencies=[ADMIN])
def unassign(freq_id: str, feed_id: str, session: DB, rt: RT) -> FrequencyOut:
    freq = get_or_404(session, freq_id)
    row = session.get(Assignment, (freq_id, feed_id))
    if row is None:
        raise HTTPException(status_code=404, detail=f"{freq_id!r} is not assigned to {feed_id!r}")
    session.delete(row)
    session.commit()
    rt.reload_world()
    rt.publish_snapshot()
    return out(session, freq)


@router.delete("/{freq_id}", status_code=204, dependencies=[ADMIN])
def delete_frequency(freq_id: str, session: DB, rt: RT) -> Response:
    freq = get_or_404(session, freq_id)
    for bank in session.exec(select(Bank)).all():  # banks go in G-4
        if freq_id in bank.frequency_ids:
            bank.frequency_ids = [f for f in bank.frequency_ids if f != freq_id]
            session.add(bank)
    session.exec(delete(Assignment).where(col(Assignment.frequency_id) == freq_id))
    # The recorded history keeps its rows; they are ignored by the live view once the channel is gone.
    session.delete(freq)
    session.commit()
    rt.reload_world()
    return Response(status_code=204)

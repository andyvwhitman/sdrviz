"""The recording table: one row per saved transmission. Rows are kept forever; only the audio expires."""

from datetime import datetime

from sqlmodel import Field, SQLModel


class Recording(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    frequency_id: str = Field(index=True)
    aar_channel: int
    feed_id: str
    feed_lat: float | None = None
    feed_lon: float | None = None
    started_at: datetime = Field(index=True)  # UTC
    duration_s: float
    audio_path: str  # relative to the audio directory: YYYY/MM/DD/<frequency_id>-<tx>.ogg
    audio_bytes: int
    audio_state: str = "ok"  # ok | expired
    transcript: str = ""
    transcript_state: str = "pending"  # pending | done | failed | empty
    engine: str = ""  # the transcriber that wrote the transcript
    created_at: datetime

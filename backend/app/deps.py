"""FastAPI dependencies shared by the routers."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request
from sqlmodel import Session

from .db import open_session
from .runtime import Runtime


def get_runtime(request: Request) -> Runtime:
    return request.app.state.rt


RT = Annotated[Runtime, Depends(get_runtime)]


def get_session(rt: RT) -> Iterator[Session]:
    with open_session(rt.db) as session:
        yield session


DB = Annotated[Session, Depends(get_session)]

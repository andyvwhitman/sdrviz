"""Test fixtures: every test gets its own copy of a once-seeded database and a fresh app."""

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import create_schema, make_engine, seed_if_empty
from app.main import create_app

PASSWORD = "test-password"


@pytest.fixture(scope="session")
def template_db(tmp_path_factory) -> Path:
    settings = Settings()
    path = tmp_path_factory.mktemp("template") / "sdrviz.sqlite"
    engine = make_engine(path)
    create_schema(engine)
    seed_if_empty(engine, settings)
    engine.dispose()  # checkpoints the WAL into the main file
    return path


@pytest.fixture
def settings(template_db, tmp_path) -> Settings:
    db_path = tmp_path / "sdrviz.sqlite"
    shutil.copy(template_db, db_path)
    return Settings(
        password=PASSWORD,
        secret="test-secret",
        db_path=db_path,
        audio_dir=tmp_path / "audio",
        sim_start="14:07:30",
        sim_speed=0.0,  # frozen: tests assert exact moments
        prerender_audio=False,
    )


@pytest.fixture
def client(settings):
    """A logged-in client; the sim clock is frozen at 14:07:30 (the `keyed` moment)."""
    with TestClient(create_app(settings)) as test_client:
        response = test_client.post("/api/auth/login", json={"password": PASSWORD})
        assert response.status_code == 204
        yield test_client


@pytest.fixture
def anonymous(settings):
    with TestClient(create_app(settings)) as test_client:
        yield test_client

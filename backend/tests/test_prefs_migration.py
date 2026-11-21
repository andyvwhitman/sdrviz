"""Decision 73: `listen_feed` left the prefs row; a database that still has the column keeps working."""

from sqlalchemy import text

from app.db import create_schema, make_engine, open_session
from app.models import Prefs


def test_an_old_prefs_table_with_listen_feed_still_loads_and_saves(tmp_path):
    engine = make_engine(tmp_path / "old.sqlite")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE prefs (id INTEGER PRIMARY KEY, listen_feed VARCHAR, muted JSON, solo JSON, "
                          "record JSON, volume JSON, active_bank VARCHAR)"))  # fmt: skip
        conn.execute(text("""INSERT INTO prefs VALUES (1, 'node-2', '["a"]', '[]', '[]', '{}', 'bank-1')"""))
    create_schema(engine)

    with open_session(engine) as session:
        prefs = session.get(Prefs, 1)
        assert prefs is not None and prefs.muted == ["a"] and not hasattr(prefs, "listen_feed")
        session.merge(Prefs(id=1, muted=["b"]))
        session.commit()
    with engine.begin() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(prefs)"))}
    assert "listen_feed" in columns and "active_bank" not in columns  # the old column is left, unused
    engine.dispose()

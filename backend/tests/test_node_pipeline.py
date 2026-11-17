"""app.node runs without the web app: no imports from the rest of app, and the pipeline works on its own."""

import ast
from pathlib import Path

import numpy as np

from app.node.pipeline import Pipeline

from .test_radio_dsp import BLOCK, CENTER, CH08, CH54, RATE, rtl_bytes

NODE_DIR = Path(__file__).resolve().parents[1] / "app" / "node"


def test_node_package_imports_nothing_from_the_rest_of_app():
    for path in NODE_DIR.glob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.ImportFrom):
                assert node.level <= 1, f"{path.name} imports from outside app.node"
                assert not (node.module or "").startswith("app"), f"{path.name} imports {node.module}"
            elif isinstance(node, ast.Import):
                assert not any(alias.name.startswith("app") for alias in node.names)


def test_pipeline_reports_key_up_chunks_levels_and_key_down():
    pipeline = Pipeline(RATE, CENTER, first_seq=500)
    assert pipeline.set_channels({"ch54": CH54, "ch08": CH08, "far": CENTER + 5_000_000}) == []
    assert sorted(pipeline.channels) == ["ch08", "ch54"]  # the third is outside the window

    quiet = np.random.default_rng(2).normal(127.5, 2.5, BLOCK * 2).clip(0, 255).astype(np.uint8).tobytes()
    for _ in range(6):
        assert not pipeline.process(quiet).chunks

    result = pipeline.process(rtl_bytes(0.1), want_spectrum=True)
    assert [(up.key, up.tx_seq) for up in result.key_ups] == [("ch54", 500)]
    assert [(c.key, c.first, c.last, c.offset_ms, len(c.pcm)) for c in result.chunks] == [
        ("ch54", True, False, 0, 1600)
    ]
    assert set(result.levels) == {"ch54"} and result.spectrum is not None

    result = pipeline.process(rtl_bytes(0.1))
    assert [(c.first, c.offset_ms) for c in result.chunks] == [(False, 100)]
    assert pipeline.open_channels() == ["ch54"]

    assert pipeline.set_channels({"ch08": CH08}) == ["ch54"]  # dropped while on air: the caller ends it


def test_set_squelch_reaches_running_channels():
    pipeline = Pipeline(RATE, CENTER)
    pipeline.set_channels({"ch54": CH54})
    pipeline.set_squelch(12.0)
    assert (pipeline.channels["ch54"].squelch.open_db, pipeline.channels["ch54"].squelch.close_db) == (12.0, 9.0)
    pipeline.set_channels({"ch54": CH54, "ch08": CH08})
    assert pipeline.channels["ch08"].squelch.open_db == 12.0


def test_pipeline_pool_gives_the_same_chunks():
    from concurrent.futures import ThreadPoolExecutor

    channels = {"ch54": CH54, "ch08": CH08}
    serial, threaded = Pipeline(RATE, CENTER), None
    with ThreadPoolExecutor(3) as pool:
        threaded = Pipeline(RATE, CENTER, pool=pool)
        for pipeline in (serial, threaded):
            pipeline.set_channels(channels)
        for _ in range(7):
            a, b = serial.process(rtl_bytes(0.1)), threaded.process(rtl_bytes(0.1))
            assert a.chunks == b.chunks

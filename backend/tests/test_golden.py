"""The live-state port must reproduce tools/gen_sim.py: compare it with data/sim/scenarios/*.json."""

import json
import math
import re

import pytest

from app.config import Settings
from app.sim import live_state
from app.sim.scenarios import SCENARIOS

SCENARIO_DIR = Settings().sim_dir / "scenarios"

# Keys a screen consumes. `summary`, `generator`, `history`, `stats` and `map` have other endpoints.
CONSUMED = [
    "header", "status_line", "faults", "degraded", "feeds", "system",
    "active_transmissions", "transcript", "trains", "ctc", "lofar_60m",
    "displayed_feed_admin", "clock", "clock_tenths",
]  # fmt: skip
# spark_60m: the port emits 60 per-minute bins where the generator wrote 12 (spec gap 13.4.2).
# banks, off_bank: gone with the banks (decision 66).
IGNORED = {"spark_60m", "banks", "off_bank"}
TRAIN_TOLERANCE = 0.11  # trains.json rounds times to 0.1 s, which moves interpolated positions slightly


def assert_same(actual, expected, path="$"):
    if isinstance(expected, dict):
        assert isinstance(actual, dict), path
        assert set(expected) - IGNORED <= set(actual), (
            f"{path}: missing {set(expected) - set(actual)}"
        )  # extras are allowed
        for key in expected.keys() - IGNORED:
            assert_same(actual[key], expected[key], f"{path}.{key}")
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(actual) == len(expected), (
            f"{path}: length {len(actual)} != {len(expected)}"
        )
        for i, (a, e) in enumerate(zip(actual, expected, strict=True)):
            assert_same(a, e, f"{path}[{i}]")
    elif isinstance(expected, float) and isinstance(actual, int | float):
        assert math.isclose(actual, expected, abs_tol=TRAIN_TOLERANCE if path.startswith("trains") else 1e-6), (
            f"{path}: {actual} != {expected}"
        )
    elif isinstance(expected, str) and path.startswith("trains") and ("mp" in path or "data_block" in path):
        assert numbers_close(actual, expected), f"{path}: {actual!r} != {expected!r}"
    else:
        assert actual == expected, f"{path}: {actual!r} != {expected!r}"


def numbers_close(actual: str, expected: str) -> bool:
    """Milepost labels ('≈NEC 98.3'): equal text, numbers within one rounding step (0.1)."""
    split = re.compile(r"(\d+\.\d+)")
    a, e = split.split(actual), split.split(expected)
    return len(a) == len(e) and all(
        math.isclose(float(x), float(y), abs_tol=0.11) if i % 2 else x == y
        for i, (x, y) in enumerate(zip(a, e, strict=True))
    )


@pytest.mark.parametrize("name", list(SCENARIOS))
def test_live_state_matches_scenario(client, name):
    spec = SCENARIOS[name]
    rt = client.app.state.rt
    expected = json.loads((SCENARIO_DIR / f"{name}.json").read_text(encoding="utf-8"))
    state = live_state.build(rt.inputs, spec.t, spec.feed, scenario=spec)
    state = json.loads(json.dumps(state))  # what a client receives
    for key in CONSUMED:
        assert_same(state[key], expected[key], key)
    assert state["listen_feed"] == spec.feed
    # `channels`: the listened feed's enabled frequencies, each the same as the generator's view of it.
    by_id = {channel["id"]: channel for channel in expected["channels"]}
    assert state["channels"] and all(
        assert_same(channel, by_id[channel["id"]], f"channels[{channel['id']}]") is None
        for channel in state["channels"]
    )
    rows = [{k: v for k, v in row.items() if k not in IGNORED} for row in expected["transcript"]["rows"]]
    assert state["transcript"]["rows"] == rows

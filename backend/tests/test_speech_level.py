"""The level stream of a voiced key-up has bursts and gaps; a carrier-only key-up stays steady."""

from dataclasses import replace

from app.sim.engine import speech_level
from app.sim.types import Tx

WORDS = ({"w": "a", "t": 1.0}, {"w": "b", "t": 3.0})


def make_tx(words: tuple[dict, ...]) -> Tx:
    return Tx(
        id="t", t=0.0, duration=5.0, channel="c", role="crew", speaker=None, text="", place_id=None, train_id=None,
        state="final", sim=True, receptions=(), words=words, confidence=None, latency=1.0,
    )  # fmt: skip


def test_gap_before_the_first_word_and_burst_inside_one() -> None:
    tx = make_tx(WORDS)
    assert speech_level(tx, 0.5) == 0.0
    assert 0.35 <= speech_level(tx, 1.5) <= 1.0
    assert speech_level(tx, 4.8) == 0.0  # past the last word's tail


def test_carrier_only_is_steady() -> None:
    assert speech_level(replace(make_tx(WORDS), words=()), 2.0) == 1.0

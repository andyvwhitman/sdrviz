"""The four scripted moments of the recorded day (design/spec.md, tools/gen_sim.py SCENARIOS)."""

from dataclasses import dataclass

from .timefmt import parse_clock


@dataclass(frozen=True)
class ScenarioSpec:
    name: str
    clock: str  # HH:MM:SS
    bank: str  # active bank at that moment
    admin_feed: str  # the feed the Feeds & Banks inspector opens on
    admin_feed_why: str
    summary: str

    @property
    def t(self) -> float:
        return parse_clock(self.clock)


SCENARIOS: dict[str, ScenarioSpec] = {
    s.name: s
    for s in (
        ScenarioSpec(
            "listening",
            "03:40:00",
            "bank-nec",
            "feed-lnd",
            "Nothing is off: the active bank's home feed.",
            "Dark cockpit: nothing keyed; NEC bank last key-up 42 min ago on CH54.",
        ),
        ScenarioSpec(
            "fault",
            "14:06:22",
            "bank-commuter",
            "feed-lnd",
            "The worst feed (unacked fault) is inspected first.",
            "BAY-04 STALE 1M 12S and LND-02 FAULT · LINK LOST, unacknowledged.",
        ),
        ScenarioSpec(
            "fault-acked",
            "14:06:36",
            "bank-commuter",
            "feed-lnd",
            "The acked fault is still the worst feed.",
            "As fault, after LND-02 was acknowledged at 14:06:31.",
        ),
        ScenarioSpec(
            "keyed",
            "14:07:30",
            "bank-commuter",
            "feed-bay",
            "BAY-04 is the only sdrviz-agent feed and hears 2 of the 3 live key-ups "
            "(CH66 at -12.9 dBFS), so the inspector shows agent-era telemetry beside live TX.",
            "CH54 MARC 433 + CH08 CSX K741 + off-bank CH66 transmitting; feeds recovered.",
        ),
    )
}

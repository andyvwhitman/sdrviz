"""A-4: a node whose dongle fell off USB still says rtl_tcp is connected; the missing samples give it away."""

import time

import numpy as np

from app.live import node_protocol as wire
from app.live import protocol
from app.nodes import session as node_session

from .test_gain_guard import health
from .test_node_ws import enrolled_node, wait_for


def spectrum_frame() -> bytes:
    bins = np.full(1024, -90, dtype=np.int8).tobytes()
    return wire.pack_frame(1, protocol.spectrum_frame(160.89, 1.536, 1, bins))


def node_info(client, node_id) -> dict:
    return client.get(f"/api/nodes/{node_id}").json()


def fault_events(client, node_id) -> list[str]:
    return [e["detail"] for e in node_info(client, node_id)["events"] if e["kind"] == "fault"]


def test_node_without_samples_is_flagged_and_recovers(client, monkeypatch):
    monkeypatch.setattr(wire, "HEARTBEAT_S", 0.1)
    monkeypatch.setattr(node_session, "NO_SAMPLES_AFTER_S", 0.5)
    node, node_id = enrolled_node(client)
    try:
        node.send(health(28.0))  # rtl_tcp "connected", cpu 10: the node's own report looks fine throughout
        node.ws.send_bytes(spectrum_frame())
        wait_for(lambda: node_info(client, node_id)["health"] is not None)
        assert node_info(client, node_id)["health"]["rtl_tcp"] == "connected"

        # The dongle is gone: health messages keep coming, frames stop.
        def report_until_flagged() -> bool:
            node.send(health(28.0))
            return node_info(client, node_id)["health"]["rtl_tcp"] == node_session.NO_SAMPLES

        wait_for(report_until_flagged, timeout=5)
        assert len(fault_events(client, node_id)) == 1 and "no samples" in fault_events(client, node_id)[0]

        node.ws.send_bytes(spectrum_frame())  # the dongle is back
        wait_for(lambda: node_info(client, node_id)["health"]["rtl_tcp"] == "connected")
        assert fault_events(client, node_id)[0] == "samples are arriving again"
    finally:
        node.close()


def test_node_with_steady_frames_is_not_flagged(client, monkeypatch):
    monkeypatch.setattr(wire, "HEARTBEAT_S", 0.1)
    monkeypatch.setattr(node_session, "NO_SAMPLES_AFTER_S", 0.5)
    node, node_id = enrolled_node(client)
    try:
        node.send(health(28.0))
        for _ in range(12):
            node.ws.send_bytes(spectrum_frame())
            time.sleep(0.1)
        assert node_info(client, node_id)["health"]["rtl_tcp"] == "connected"
        assert fault_events(client, node_id) == []
    finally:
        node.close()

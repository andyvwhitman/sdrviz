"""Hold to listen: a client holds a channel on a node's waterfall and hears it while it holds.

Client ops (ws /ws/live):
    {"op": "listen_hold", "feed_id": "node-1", "aar_channel": 54}   start, and renew every 5 s
    {"op": "listen_release", "feed_id": "node-1", "aar_channel": 54} stop (both fields optional: all of the client's)

While any client holds a channel, the node's decode list is its enabled assignments plus the held channels. A hold
not renewed for 15 s, a release and a disconnect all drop it. The audio comes as ordinary audio frames (keyed by the
AAR channel in the frame header) to the holding clients only. Held listening is never recorded, transcribed or shown
as a tile.

The holder is told where it stands with `listen_state` messages:
    {"type": "listen_state", "feed_id", "aar_channel", "state": "tuning" | "listening" | "released" | "failed",
     "reason"?: str}
`tuning`: the node has been told; `listening`: the node confirmed it decodes the channel (at once if it already did);
`released`: the hold ended (reason `released` or `timeout`); `failed`: it could not start (reason says why).
"""

import logging
import time
from typing import TYPE_CHECKING

from . import protocol
from .hub import Client, Hold

if TYPE_CHECKING:
    from ..runtime import Runtime

log = logging.getLogger(__name__)

HOLD_TTL_S = 15.0  # a hold not renewed for this long is dropped (the client renews every 5 s)
MAX_HOLDS = 4  # per client
AAR_CHANNELS = range(1, 98)


class Listening:
    def __init__(self, rt: "Runtime"):
        self.rt = rt
        self.clock = time.monotonic  # tests replace it

    # --- the client's ops ---------------------------------------------------------------------------------------------

    def hold(self, client: Client, feed_id: object, aar_channel: object) -> None:
        if not (isinstance(feed_id, str) and isinstance(aar_channel, int) and aar_channel in AAR_CHANNELS):
            return
        key = (feed_id, aar_channel)
        if existing := client.holds.get(key):  # a renewal
            existing.expires = self.clock() + HOLD_TTL_S
            return
        node = self.rt.nodes.node_for_feed(feed_id)
        if node is None or node.status != "ONLINE":
            reason = "node offline" if node else "not a node"
            self._tell(client, key, "failed", reason)
            return
        if len(client.holds) >= MAX_HOLDS:
            self._tell(client, key, "failed", "too many holds")
            return
        already = aar_channel in self.rt.nodes.channels_for(node)  # decoded without this hold
        client.holds[key] = Hold(self.clock() + HOLD_TTL_S, "listening" if already else "tuning")
        self._tell(client, key, client.holds[key].state)
        if not already:
            self.rt.push_node_channels()

    def release(self, client: Client, feed_id: object = None, aar_channel: object = None) -> None:
        keys = [k for k in client.holds if feed_id in (None, k[0]) and aar_channel in (None, k[1])]
        for key in keys:
            del client.holds[key]
            self._tell(client, key, "released", "released")
        if keys:
            self.rt.push_node_channels()

    def drop_client(self, client: Client) -> None:
        """The client is gone: its holds go with it (it cannot be told)."""
        if client.holds:
            client.holds.clear()
            self.rt.push_node_channels()

    # --- time and the node ------------------------------------------------------------------------------------------

    def sweep(self) -> None:
        """Drop the holds that were not renewed in time."""
        now, changed = self.clock(), False
        for client in list(self.rt.hub.clients):
            for key, hold in list(client.holds.items()):
                if hold.expires <= now:
                    del client.holds[key]
                    self._tell(client, key, "released", "timeout")
                    changed = True
        if changed:
            self.rt.push_node_channels()

    def channels(self, feed_id: str) -> set[int]:
        """The AAR channels held on a feed now (expired holds do not count even before the next sweep)."""
        now = self.clock()
        return {
            aar
            for client in self.rt.hub.clients
            for (fid, aar), hold in client.holds.items()
            if fid == feed_id and hold.expires > now
        }

    def node_replied(self, feed_id: str, channels: list[int], failure: str | None) -> None:
        """The node answered the `channels` command: held channels in it are listening, or the holds failed."""
        failed = False
        for client in list(self.rt.hub.clients):
            for key, hold in list(client.holds.items()):
                if key[0] != feed_id or key[1] not in channels or hold.state != "tuning":
                    continue
                if failure is None:
                    hold.state = "listening"
                    self._tell(client, key, "listening")
                else:
                    del client.holds[key]
                    self._tell(client, key, "failed", failure)
                    failed = True
        if failed:
            self.rt.push_node_channels()  # the failed channels leave the node's list

    def _tell(self, client: Client, key: tuple[str, int], state: str, reason: str | None = None) -> None:
        extra = {"reason": reason} if reason else {}
        message = protocol.message("listen_state", feed_id=key[0], aar_channel=key[1], state=state, **extra)
        self.rt.hub.send_to(client, message)

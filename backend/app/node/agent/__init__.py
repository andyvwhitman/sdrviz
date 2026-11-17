"""The `sdrviz-node` agent: runs next to rtl_tcp on a Pi, receives the channels and uplinks them to the server.

Uses app.node (receiver chain) and, for the wire format, app.live.protocol, app.live.node_protocol and
app.live.opus. Nothing else from app: it runs without FastAPI, the database or the hub.
"""

AGENT_VERSION = "0.1.0"

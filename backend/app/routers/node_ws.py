"""The /ws/node WebSocket: remote receiver nodes connect here (protocol: docs/node-protocol.md)."""

from fastapi import APIRouter, WebSocket

router = APIRouter()


@router.websocket("/ws/node")
async def node_socket(websocket: WebSocket) -> None:
    await websocket.app.state.rt.node_connections.handle(websocket)

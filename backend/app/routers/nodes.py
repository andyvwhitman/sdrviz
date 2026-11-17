"""/api/nodes: Settings creates, lists, patches, re-keys and revokes nodes and sends them commands."""

from fastapi import APIRouter, HTTPException

from ..deps import RT
from ..nodes.schemas import CommandIn, CommandResult, NodeCreate, NodeDetail, NodeOut, NodePatch, NodeWithKey
from ..nodes.service import NodeNotFound, NodeOffline

router = APIRouter(prefix="/nodes", tags=["nodes"])


def _not_found(node_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"Unknown node {node_id!r}")


@router.get("")
def list_nodes(rt: RT) -> list[NodeOut]:
    return rt.nodes.list()


@router.post("", status_code=201)
def create_node(body: NodeCreate, rt: RT) -> NodeWithKey:
    try:
        node, key = rt.nodes.create(body.name, body.location, body.preset)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return NodeWithKey(node=node, key=key)


@router.get("/{node_id}")
def get_node(node_id: str, rt: RT) -> NodeDetail:
    try:
        return rt.nodes.get(node_id)
    except NodeNotFound as error:
        raise _not_found(node_id) from error


@router.patch("/{node_id}")
def patch_node(node_id: str, body: NodePatch, rt: RT) -> NodeOut:
    try:
        return rt.nodes.update(node_id, body.name, body.location, body.preset)
    except NodeNotFound as error:
        raise _not_found(node_id) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/{node_id}/rekey")
def rekey_node(node_id: str, rt: RT) -> NodeWithKey:
    try:
        node, key = rt.nodes.rekey(node_id)
    except NodeNotFound as error:
        raise _not_found(node_id) from error
    return NodeWithKey(node=node, key=key)


@router.post("/{node_id}/revoke")
def revoke_node(node_id: str, rt: RT) -> NodeOut:
    try:
        return rt.nodes.revoke(node_id)
    except NodeNotFound as error:
        raise _not_found(node_id) from error


@router.post("/{node_id}/commands")
async def send_command(node_id: str, body: CommandIn, rt: RT) -> CommandResult:
    try:
        return await rt.nodes.send_command(node_id, body)
    except NodeNotFound as error:
        raise _not_found(node_id) from error
    except NodeOffline as error:
        raise HTTPException(status_code=409, detail="Node is not online") from error

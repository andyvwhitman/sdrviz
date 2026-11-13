import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response

from ..deps import RT

router = APIRouter(prefix="/geo", tags=["geo"])

CACHE = {"Cache-Control": "public, max-age=3600"}


def _etag(path: Path) -> str:
    stat = path.stat()
    return f'"{stat.st_mtime_ns:x}-{stat.st_size:x}"'


def _geojson(request: Request, path: Path) -> Response:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"{path.name} is not installed")
    headers = {**CACHE, "ETag": _etag(path)}
    if request.headers.get("if-none-match") == headers["ETag"]:
        return Response(status_code=304, headers=headers)
    return FileResponse(path, media_type="application/geo+json", headers=headers)


@router.get("/rail")
def rail(request: Request, rt: RT) -> Response:
    return _geojson(request, rt.settings.geo_dir / "rail.geojson")


@router.get("/water")
def water(request: Request, rt: RT) -> Response:
    return _geojson(request, rt.settings.geo_dir / "water.geojson")


@router.get("/places")
def places(rt: RT) -> JSONResponse:
    path = rt.settings.seed_dir / "places.json"
    return JSONResponse(json.loads(path.read_text(encoding="utf-8")), headers=CACHE)


@router.get("/routes")
def routes(rt: RT) -> JSONResponse:
    path = rt.settings.sim_dir / "routes.json"
    return JSONResponse(json.loads(path.read_text(encoding="utf-8")), headers=CACHE)

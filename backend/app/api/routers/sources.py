from fastapi import APIRouter, Depends, HTTPException
from pathlib import Path
from app.models import User
from app.api.dependencies import require_roles
from app.schemas.source import SourceResponse

router = APIRouter(prefix="/sources", tags=["Sources"])

_SOURCES: list[SourceResponse] = []


BASE_DIR = Path("/app/data_sources").resolve()

def _validate_path(path: str) -> Path:
    target_path = (BASE_DIR / path).resolve()
    if not target_path.is_relative_to(BASE_DIR):
        raise HTTPException(status_code=400, detail="Недопустимый путь")
    return target_path

@router.get("/", response_model=list[SourceResponse])
async def get_sources(
    admin_user: User = Depends(require_roles(["admin"]))
):
    """Список настроенных источников данных"""
    return _SOURCES

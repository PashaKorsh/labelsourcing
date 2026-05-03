from fastapi import APIRouter, Depends, HTTPException
from app.models import User
from app.api.dependencies import require_roles
from app.schemas.source import SourceResponse

router = APIRouter(prefix="/sources", tags=["Sources"])

# Заглушка — реальная конфигурация источников будет реализована отдельно
_SOURCES: list[SourceResponse] = []


def _validate_path(path: str) -> None:
    """Проверяет путь на отсутствие directory traversal"""
    if ".." in path:
        raise HTTPException(status_code=400, detail="Недопустимый путь")


@router.get("/", response_model=list[SourceResponse])
async def get_sources(
    admin_user: User = Depends(require_roles(["admin"]))
):
    """Список настроенных источников данных"""
    return _SOURCES

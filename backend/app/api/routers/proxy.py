import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Task, Dataset, User, SourceType
from app.api.dependencies import get_current_user
from app.api.utility_manager import manager, UtilityOffline, UtilityFileError

router = APIRouter(prefix="/proxy", tags=["Proxy"])

_BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
}
_CACHE_HEADERS = {"Cache-Control": "private, max-age=3600"}


@router.get("/{task_id}")
async def proxy_task_image(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Проксирует изображение задачи, скрывая оригинальный источник от браузера.

    URL-датасет     → сервер скачивает картинку по http(s) через httpx.
    Utility-датасет → сервер запрашивает файл у локальной утилиты через WS-туннель.
    """
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    dataset = await db.get(Dataset, task.dataset_id)
    if dataset is not None and dataset.source_type == SourceType.UTILITY:
        return await _proxy_from_utility(dataset, task)

    return await _proxy_from_url(task.url)


async def _proxy_from_url(url: str) -> StreamingResponse:
    async with httpx.AsyncClient(headers=_BROWSER_HEADERS, follow_redirects=True, timeout=30.0) as client:
        try:
            upstream = await client.get(url)
            upstream.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=502, detail=f"Источник вернул {e.response.status_code}")
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Ошибка подключения к источнику: {e}")

    content_type = upstream.headers.get("content-type", "application/octet-stream")
    return StreamingResponse(iter([upstream.content]), media_type=content_type, headers=_CACHE_HEADERS)


async def _proxy_from_utility(dataset: Dataset, task: Task) -> StreamingResponse:
    if dataset.utility_id is None or not dataset.utility_folder:
        raise HTTPException(status_code=502, detail="Датасет не привязан к папке утилиты")
    try:
        content_type, body = await manager.fetch_file(dataset.utility_id, dataset.utility_folder, task.url)
    except UtilityOffline:
        raise HTTPException(status_code=503, detail="Утилита не в сети")
    except UtilityFileError as e:
        raise HTTPException(status_code=502, detail=e.detail or "Утилита не смогла отдать файл")

    return StreamingResponse(iter([body]), media_type=content_type, headers=_CACHE_HEADERS)

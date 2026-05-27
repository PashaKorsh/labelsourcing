import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Task, User
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/proxy", tags=["Proxy"])


@router.get("/{task_id}")
async def proxy_task_image(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Проксирует изображение задачи, скрывая оригинальный URL от браузера."""
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        try:
            upstream = await client.get(task.url)
            upstream.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=502,
                detail=f"Источник вернул {e.response.status_code}",
            )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=502,
                detail=f"Ошибка подключения к источнику: {e}",
            )

    content_type = upstream.headers.get("content-type", "application/octet-stream")
    headers = {"Cache-Control": "private, max-age=3600"}
    return StreamingResponse(
        content=iter([upstream.content]),
        media_type=content_type,
        headers=headers,
    )

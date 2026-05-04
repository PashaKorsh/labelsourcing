from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.database import get_db
from app.models import Label, User
from app.api.dependencies import require_roles
from app.schemas.label import LabelStatusUpdate

router = APIRouter(prefix="/labels", tags=["Labels"])


@router.patch("/{label_id}/status")
async def update_label_status(
        label_id: uuid.UUID,
        status_in: LabelStatusUpdate,
        db: AsyncSession = Depends(get_db),
        admin_user: User = Depends(require_roles(["admin", "moderator"]))
):
    """Изменить статус разметки — только Админ/Модератор"""
    label = await db.get(Label, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Разметка не найдена")

    label.status = status_in.status
    await db.commit()
    return {"status": "updated"}

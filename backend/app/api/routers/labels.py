from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from app.database import get_db
from app.models import Label, Assignment, User
from app.api.dependencies import require_roles

router = APIRouter(prefix="/labels", tags=["Labels"])

ALLOWED_ASSIGNMENT_STATUSES = {"in_progress", "done", "expired", "rejected"}


class LabelStatusUpdate(BaseModel):
    status: str


@router.patch("/{label_id}/status")
async def update_label_status(
        label_id: uuid.UUID,
        status_in: LabelStatusUpdate,
        db: AsyncSession = Depends(get_db),
        admin_user: User = Depends(require_roles(["admin", "moderator"]))
):
    """Изменить статус ассайнмента через его label — для валидации (Админ/Модератор)"""
    stmt = select(Label).where(Label.id == label_id)
    result = await db.execute(stmt)
    label = result.scalar_one_or_none()

    if not label:
        raise HTTPException(status_code=404, detail="Разметка не найдена")

    new_status = status_in.status
    if new_status not in ALLOWED_ASSIGNMENT_STATUSES:
        raise HTTPException(status_code=422, detail=f"Недопустимый статус: {new_status}")

    assignment = await db.get(Assignment, label.assignment_id)
    assignment.status = new_status

    await db.commit()
    return {"status": "updated"}

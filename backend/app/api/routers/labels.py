from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
from app.database import get_db
from app.models import Label, User
from app.api.dependencies import get_current_user, require_roles
from app.schemas.label import LabelCreate, LabelResponse, LabelStatusUpdate

router = APIRouter(prefix="/labels", tags=["Labels"])

@router.post("/", response_model=LabelResponse)
async def submit_label(
    label_in: LabelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Сохранить результат разметки пользователя (полигоны/боксы)"""
    new_label = Label(
        task_id=label_in.task_id,
        user_id=current_user.id,
        data=label_in.data
    )
    db.add(new_label)
    await db.commit()
    await db.refresh(new_label)
    return new_label


@router.patch("/{label_id}/status")
async def update_label_status(
        label_id: uuid.UUID,
        status_in: LabelStatusUpdate,
        db: AsyncSession = Depends(get_db),
        admin_user: User = Depends(require_roles(["admin", "moderator"]))
):
    label = await db.get(Label, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Разметка не найдена")

    # Сохраняем вердикт админа
    label.data["review_status"] = status_in.status  # Если пишем в JSONB
    # label.status = status_in.status # Если добавил колонку

    await db.commit()
    return {"status": "updated"}
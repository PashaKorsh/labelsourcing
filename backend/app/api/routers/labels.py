from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Label, User
from app.api.dependencies import get_current_user
from app.schemas.label import LabelCreate, LabelResponse

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
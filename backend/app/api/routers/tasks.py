import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Task, User, Label
from app.api.dependencies import get_current_user, require_roles
from app.schemas.task import TaskCreate, TaskResponse, TaskBatchCreate
from app.schemas.label import LabelCreate, LabelResponse

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.post("/", response_model=TaskResponse)
async def create_task(
    task_in: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Добавить новую задачу в датасет"""
    new_task = Task(**task_in.model_dump())
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    return new_task


@router.post("/batch", status_code=201)
async def create_tasks_batch(
    batch_in: TaskBatchCreate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles(["admin"]))
):
    """Массовая загрузка ссылок на задачи"""
    new_tasks = [Task(dataset_id=batch_in.dataset_id, url=url) for url in batch_in.urls]
    db.add_all(new_tasks)
    await db.commit()
    return {"status": "success", "added": len(new_tasks)}


@router.put("/{task_id}/labels", response_model=LabelResponse)
async def submit_label(
    task_id: uuid.UUID,
    label_in: LabelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Сохранить или перезаписать разметку для задачи в конкретном датасете.
    Одна задача может быть в нескольких датасетах — dataset_id разделяет контексты разметки."""
    stmt = select(Label).where(
        Label.task_id == task_id,
        Label.dataset_id == label_in.dataset_id,
        Label.user_id == current_user.id
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.data = label_in.data
        await db.commit()
        await db.refresh(existing)
        return existing

    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    new_label = Label(
        task_id=task_id,
        dataset_id=label_in.dataset_id,
        user_id=current_user.id,
        data=label_in.data
    )
    db.add(new_label)
    await db.commit()
    await db.refresh(new_label)
    return new_label

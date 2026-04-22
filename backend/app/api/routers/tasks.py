import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Task, User, Label
from app.api.dependencies import get_current_user, require_roles
from app.schemas.task import TaskCreate, TaskResponse, TaskBatchCreate

router = APIRouter(prefix="/tasks", tags=["Tasks"])

@router.post("/", response_model=TaskResponse)
async def create_task(
    task_in: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Добавить новую задачу в датасет (картинку)"""
    new_task = Task(**task_in.model_dump())
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    return new_task

@router.get("/dataset/{dataset_id}", response_model=list[TaskResponse])
async def get_tasks_by_dataset(
    dataset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить все задачи для конкретного набора данных"""
    query = select(Task).where(Task.dataset_id == dataset_id)
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/batch", status_code=201)
async def create_tasks_batch(
    batch_in: TaskBatchCreate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles(["admin"]))
):
    """Массовая загрузка ссылок на картинки"""
    new_tasks = [Task(dataset_id=batch_in.dataset_id, url=url) for url in batch_in.urls]
    db.add_all(new_tasks)
    await db.commit()
    return {"status": "success", "added": len(new_tasks)}

@router.get("/dataset/{dataset_id}/next", response_model=TaskResponse | None)
async def get_next_task(
    dataset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Выдает одну картинку, которую текущий юзер еще НЕ размечал"""
    # Ищем таски датасета, где нет лейбла от текущего юзера
    stmt = (
        select(Task)
        .where(Task.dataset_id == dataset_id)
        .where(~Task.labels.any(Label.user_id == current_user.id))
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
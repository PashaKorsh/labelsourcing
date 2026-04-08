import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Task, User
from app.api.dependencies import get_current_user
from app.schemas.task import TaskCreate, TaskResponse

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
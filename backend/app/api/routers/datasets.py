from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
import uuid

from app.database import get_db
from app.models import Dataset, User, Tag, Task, Label
from app.api.dependencies import get_current_user, require_roles
from app.schemas.dataset import DatasetCreate, DatasetResponse, DatasetUpdate
from app.schemas.task import TaskResponse

router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.post("/", response_model=DatasetResponse)
async def create_dataset(
        dataset_in: DatasetCreate,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(require_roles(["admin"]))
):
    """Создать новый набор данных"""
    labels_data = [l.model_dump() for l in dataset_in.annotation_labels] if dataset_in.annotation_labels else None
    new_dataset = Dataset(
        owner_id=current_user.id,
        title=dataset_in.title,
        description=dataset_in.description,
        annotation_labels=labels_data,
    )
    db.add(new_dataset)
    await db.commit()

    stmt = (
        select(Dataset)
        .options(selectinload(Dataset.tags))
        .where(Dataset.id == new_dataset.id)
    )
    result = await db.execute(stmt)
    db_dataset = result.scalar_one()

    db_dataset.tasks_count = 0
    db_dataset.labeled_count = 0

    return db_dataset


@router.get("/", response_model=list[DatasetResponse])
async def get_datasets(
        limit: int = 100,
        offset: int = 0,
        # Поиск по названию датасета (будет реализован позже)
        search: Optional[str] = None,
        # Фильтр по статусу (new/started/done — будет реализован позже)
        status: Optional[str] = None,
        # Фильтр по владельцу
        owner_id: Optional[uuid.UUID] = None,
        # Поиск по имени/email владельца (будет реализован позже)
        owner_search: Optional[str] = None,
        # Фильтр по тегам (будет реализован позже)
        tag_ids: Optional[List[uuid.UUID]] = None,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    """Список всех датасетов с актуальными счётчиками"""
    stmt = (
        select(
            Dataset,
            func.count(Task.id).label("tasks_count"),
            func.count(Label.id.distinct()).label("labeled_count")
        )
        .outerjoin(Task, Dataset.id == Task.dataset_id)
        .outerjoin(Label, Task.id == Label.task_id)
        .group_by(Dataset.id)
        .options(selectinload(Dataset.tags))
        .limit(limit)
        .offset(offset)
    )

    result = await db.execute(stmt)

    datasets_with_counts = []
    for row in result.all():
        dataset = row[0]
        dataset.tasks_count = row[1]
        dataset.labeled_count = row[2]
        datasets_with_counts.append(dataset)

    return datasets_with_counts


@router.get("/{dataset_id}/next", response_model=TaskResponse | None)
async def get_next_task(
        dataset_id: uuid.UUID,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    """Выдаёт следующую задачу, которую текущий пользователь ещё не размечал в этом датасете.
    Проверяем только разметку в конкретном датасете — задача может использоваться в нескольких."""
    stmt = (
        select(Task)
        .where(Task.dataset_id == dataset_id)
        .where(~Task.labels.any(
            (Label.user_id == current_user.id) & (Label.dataset_id == dataset_id)
        ))
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


@router.get("/{dataset_id}/tasks", response_model=list[TaskResponse])
async def get_dataset_tasks(
        dataset_id: uuid.UUID,
        limit: int = 100,
        offset: int = 0,
        db: AsyncSession = Depends(get_db),
        admin_user: User = Depends(require_roles(["admin"]))
):
    """Список всех задач датасета — только для Админов"""
    query = (
        select(Task)
        .where(Task.dataset_id == dataset_id)
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset_detail(
        dataset_id: uuid.UUID,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    """Деталка датасета со счётчиками"""
    stmt = (
        select(
            Dataset,
            func.count(Task.id).label("tasks_count"),
            func.count(Label.id.distinct()).label("labeled_count")
        )
        .outerjoin(Task, Dataset.id == Task.dataset_id)
        .outerjoin(Label, Task.id == Label.task_id)
        .where(Dataset.id == dataset_id)
        .group_by(Dataset.id)
        .options(selectinload(Dataset.tags))
    )

    result = await db.execute(stmt)
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="Датасет не найден")

    dataset = row[0]
    dataset.tasks_count = row[1]
    dataset.labeled_count = row[2]

    return dataset


@router.patch("/{dataset_id}", response_model=DatasetResponse)
async def update_dataset(
        dataset_id: uuid.UUID,
        update_data: DatasetUpdate,
        db: AsyncSession = Depends(get_db),
        admin_user: User = Depends(require_roles(["admin"]))
):
    stmt = select(Dataset).options(selectinload(Dataset.tags)).where(Dataset.id == dataset_id)
    result = await db.execute(stmt)
    dataset = result.scalar_one_or_none()

    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")

    if update_data.title is not None:
        dataset.title = update_data.title
    if update_data.description is not None:
        dataset.description = update_data.description

    if update_data.tag_ids is not None:
        tags_stmt = select(Tag).where(Tag.id.in_(update_data.tag_ids))
        tags_res = await db.execute(tags_stmt)
        dataset.tags = list(tags_res.scalars().all())

    if update_data.annotation_labels is not None:
        dataset.annotation_labels = [l.model_dump() for l in update_data.annotation_labels]

    await db.commit()
    await db.refresh(dataset)
    return dataset

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
import uuid

from app.database import get_db
from app.models import Dataset, User, Tag, Dataset, Task, Label
from app.api.dependencies import get_current_user, require_roles
from app.schemas.dataset import DatasetCreate, DatasetResponse, DatasetUpdate

router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.post("/", response_model=DatasetResponse)
async def create_dataset(
        dataset_in: DatasetCreate,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    """Создать новый набор данных"""
    new_dataset = Dataset(
        owner_id=current_user.id,
        description=dataset_in.description
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
        .options(selectinload(Dataset.tags))  # Не забываем подгружать теги
    )

    result = await db.execute(stmt)

    datasets_with_counts = []
    for row in result.all():
        dataset = row[0]
        dataset.tasks_count = row[1]
        dataset.labeled_count = row[2]
        datasets_with_counts.append(dataset)

    return datasets_with_counts


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

    if update_data.description:
        dataset.description = update_data.description

    if update_data.tag_ids is not None:
        tags_stmt = select(Tag).where(Tag.id.in_(update_data.tag_ids))
        tags_res = await db.execute(tags_stmt)
        dataset.tags = list(tags_res.scalars().all())

    await db.commit()
    await db.refresh(dataset)
    return dataset
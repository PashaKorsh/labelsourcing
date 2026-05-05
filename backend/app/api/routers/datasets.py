from collections import Counter
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, case, exists
from sqlalchemy.orm import selectinload
import uuid

from app.database import get_db
from app.models import Dataset, User, Tag, Task, Assignment
from app.api.dependencies import get_current_user, require_roles
from app.schemas.dataset import DatasetCreate, DatasetResponse, DatasetUpdate
from app.schemas.task import TaskResponse

router = APIRouter(prefix="/datasets", tags=["Datasets"])

ASSIGNMENT_EXPIRY_MINUTES = 30


async def _get_dataset_with_counts(db: AsyncSession, dataset_id: uuid.UUID) -> Dataset | None:
    stmt = (
        select(
            Dataset,
            func.count(Task.id).label("tasks_count"),
            func.sum(case((Task.completed_answers > 0, 1), else_=0)).label("labeled_count"),
        )
        .outerjoin(Task, Dataset.id == Task.dataset_id)
        .where(Dataset.id == dataset_id)
        .group_by(Dataset.id)
        .options(selectinload(Dataset.tags))
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        return None
    dataset = row[0]
    dataset.tasks_count = row[1]
    dataset.labeled_count = row[2] or 0
    return dataset


@router.post("/", response_model=DatasetResponse)
async def create_dataset(
        dataset_in: DatasetCreate,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(require_roles(["admin"]))
):
    labels_data = [l.model_dump() for l in dataset_in.annotation_labels] if dataset_in.annotation_labels else None
    new_dataset = Dataset(
        owner_id=current_user.id,
        title=dataset_in.title,
        description=dataset_in.description,
        required_answers=dataset_in.required_answers,
        annotation_labels=labels_data,
    )
    db.add(new_dataset)
    await db.commit()

    dataset = await _get_dataset_with_counts(db, new_dataset.id)
    return dataset


@router.get("/", response_model=list[DatasetResponse])
async def get_datasets(
        limit: int = 100,
        offset: int = 0,
        search: Optional[str] = None,
        status: Optional[str] = None,
        owner_id: Optional[uuid.UUID] = None,
        owner_search: Optional[str] = None,
        tag_ids: Optional[List[uuid.UUID]] = None,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    stmt = (
        select(
            Dataset,
            func.count(Task.id).label("tasks_count"),
            func.sum(case((Task.completed_answers > 0, 1), else_=0)).label("labeled_count"),
        )
        .outerjoin(Task, Dataset.id == Task.dataset_id)
        .group_by(Dataset.id)
        .options(selectinload(Dataset.tags))
        .limit(limit)
        .offset(offset)
    )

    if owner_id:
        stmt = stmt.where(Dataset.owner_id == owner_id)

    result = await db.execute(stmt)

    datasets_with_counts = []
    for row in result.all():
        dataset = row[0]
        dataset.tasks_count = row[1]
        dataset.labeled_count = row[2] or 0
        datasets_with_counts.append(dataset)

    return datasets_with_counts


@router.get("/{dataset_id}/next", response_model=TaskResponse | None)
async def get_next_task(
        dataset_id: uuid.UUID,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    """Бронирует и возвращает следующую доступную задачу для текущего пользователя.
    Задача считается доступной, если:
    - статус 'pending'
    - у пользователя нет активного/завершённого ассайнмента на неё
    - количество живых ассайнментов меньше required_answers датасета
    """
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")

    # Живые ассайнменты = in_progress и ещё не истёкшие
    live_count_sq = (
        select(func.count())
        .where(Assignment.task_id == Task.id)
        .where(Assignment.status == "in_progress")
        .where(Assignment.expires_at > func.now())
        .correlate(Task)
        .scalar_subquery()
    )

    # Пользователь уже работает над задачей или уже сделал её
    user_busy_sq = exists(
        select(Assignment.id)
        .where(Assignment.task_id == Task.id)
        .where(Assignment.user_id == current_user.id)
        .where(Assignment.status.in_(["in_progress", "done"]))
        .correlate(Task)
    )

    task_stmt = (
        select(Task)
        .where(Task.dataset_id == dataset_id)
        .where(Task.status == "pending")
        .where(live_count_sq < dataset.required_answers)
        .where(~user_busy_sq)
        .order_by(Task.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    result = await db.execute(task_stmt)
    task = result.scalar_one_or_none()

    if not task:
        await db.rollback()
        return None

    expires_at = datetime.utcnow() + timedelta(minutes=ASSIGNMENT_EXPIRY_MINUTES)
    assignment = Assignment(
        task_id=task.id,
        user_id=current_user.id,
        status="in_progress",
        expires_at=expires_at,
    )
    db.add(assignment)
    task.active_assignments += 1

    await db.commit()
    await db.refresh(task)
    return task


@router.get("/{dataset_id}/tasks", response_model=list[TaskResponse])
async def get_dataset_tasks(
        dataset_id: uuid.UUID,
        limit: int = 100,
        offset: int = 0,
        db: AsyncSession = Depends(get_db),
        admin_user: User = Depends(require_roles(["admin"]))
):
    """Список всех задач датасета — только для администраторов"""
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
    dataset = await _get_dataset_with_counts(db, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")
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
    if update_data.required_answers is not None:
        dataset.required_answers = update_data.required_answers
    if update_data.status is not None:
        dataset.status = update_data.status
    if update_data.annotation_labels is not None:
        dataset.annotation_labels = [l.model_dump() for l in update_data.annotation_labels]

    if update_data.tag_ids is not None:
        tags_stmt = select(Tag).where(Tag.id.in_(update_data.tag_ids))
        tags_res = await db.execute(tags_stmt)
        dataset.tags = list(tags_res.scalars().all())

    await db.commit()

    return await _get_dataset_with_counts(db, dataset_id)

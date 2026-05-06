from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, exists
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import selectinload
import uuid

from app.database import get_db
from app.models import Dataset, User, Tag, Task, Assignment, UserDatasetAccess, AssignmentStatus, TaskStatus
from app.api.dependencies import get_current_user, require_roles
from app.schemas.dataset import DatasetCreate, DatasetResponse, DatasetUpdate
from app.schemas.task import TaskResponse
from app.schemas.access import UserDatasetAccessResponse, UserDatasetAccessUpdate

router = APIRouter(prefix="/datasets", tags=["Datasets"])

ASSIGNMENT_EXPIRY_MINUTES = 30


def _compute_user_done(access: UserDatasetAccess | None, tasks_count: int) -> bool:
    if access is None:
        return False
    effective_limit = min(access.labeling_limit, tasks_count)
    return not access.can_label or access.labeled_count >= effective_limit


async def _get_dataset_with_counts(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
) -> Dataset | None:
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
    dataset.user_done = False

    if user_id is not None:
        access = (await db.execute(
            select(UserDatasetAccess).where(
                UserDatasetAccess.user_id == user_id,
                UserDatasetAccess.dataset_id == dataset_id,
            )
        )).scalar_one_or_none()
        dataset.user_done = _compute_user_done(access, dataset.tasks_count)

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
        default_labeling_limit=dataset_in.default_labeling_limit,
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
        dataset.user_done = False
        datasets_with_counts.append(dataset)

    if datasets_with_counts:
        dataset_ids = [d.id for d in datasets_with_counts]
        access_result = await db.execute(
            select(UserDatasetAccess).where(
                UserDatasetAccess.user_id == current_user.id,
                UserDatasetAccess.dataset_id.in_(dataset_ids),
            )
        )
        access_map: dict[uuid.UUID, UserDatasetAccess] = {
            a.dataset_id: a for a in access_result.scalars()
        }
        for dataset in datasets_with_counts:
            dataset.user_done = _compute_user_done(access_map.get(dataset.id), dataset.tasks_count)

    return datasets_with_counts


MAX_TASKS_PER_REQUEST = 10


@router.get("/{dataset_id}/next", response_model=list[TaskResponse])
async def get_next_task(
        dataset_id: uuid.UUID,
        count: int = Query(default=1, ge=1, le=MAX_TASKS_PER_REQUEST),
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    """Бронирует и возвращает до `count` доступных задач (max 10).
    Автоматически создаёт запись user_dataset_access при первом обращении.
    Возвращает [] если задач нет или лимит пользователя исчерпан.
    """
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")

    # Восстановление сессии: если у пользователя уже есть живые ассайнменты — вернуть их
    existing_stmt = (
        select(Task)
        .join(Assignment, Task.id == Assignment.task_id)
        .where(Task.dataset_id == dataset_id)
        .where(Assignment.user_id == current_user.id)
        .where(Assignment.status == AssignmentStatus.IN_PROGRESS)
        .where(Assignment.expires_at > func.now())
        .order_by(Task.created_at)
    )
    existing_result = await db.execute(existing_stmt)
    existing_tasks = existing_result.scalars().all()
    if existing_tasks:
        return existing_tasks

    # Upsert access-записи: создать если нет, иначе не трогать
    upsert_stmt = (
        pg_insert(UserDatasetAccess)
        .values(
            user_id=current_user.id,
            dataset_id=dataset_id,
            labeling_limit=dataset.default_labeling_limit,
        )
        .on_conflict_do_nothing(index_elements=["user_id", "dataset_id"])
    )
    await db.execute(upsert_stmt)
    await db.flush()

    access_stmt = select(UserDatasetAccess).where(
        UserDatasetAccess.user_id == current_user.id,
        UserDatasetAccess.dataset_id == dataset_id,
    )
    access = (await db.execute(access_stmt)).scalar_one()

    total_tasks = (
        await db.execute(select(func.count()).where(Task.dataset_id == dataset_id))
    ).scalar_one()

    # Проверяем права и квоту — оба случая равнозначны для пользователя.
    # Лимит не может превышать количество задач в датасете.
    effective_limit = min(access.labeling_limit, total_tasks)
    if not access.can_label or access.labeled_count >= effective_limit:
        await db.rollback()
        return []

    # Живые ассайнменты = in_progress и ещё не истёкшие
    live_count_sq = (
        select(func.count())
        .where(Assignment.task_id == Task.id)
        .where(Assignment.status == AssignmentStatus.IN_PROGRESS)
        .where(Assignment.expires_at > func.now())
        .correlate(Task)
        .scalar_subquery()
    )

    # Пользователь уже работает над задачей или уже сделал её
    user_busy_sq = exists(
        select(Assignment.id)
        .where(Assignment.task_id == Task.id)
        .where(Assignment.user_id == current_user.id)
        .where(Assignment.status.in_([AssignmentStatus.IN_PROGRESS, AssignmentStatus.DONE]))
        .correlate(Task)
    )

    task_stmt = (
        select(Task)
        .where(Task.dataset_id == dataset_id)
        .where(Task.status == TaskStatus.PENDING)
        .where(live_count_sq < dataset.required_answers)
        .where(~user_busy_sq)
        .order_by(Task.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    )

    expires_at = datetime.utcnow() + timedelta(minutes=ASSIGNMENT_EXPIRY_MINUTES)
    result_tasks: list[Task] = []

    for _ in range(count):
        if result_tasks:
            await db.flush()

        task_result = await db.execute(task_stmt)
        task = task_result.scalar_one_or_none()
        if not task:
            break

        db.add(Assignment(
            task_id=task.id,
            user_id=current_user.id,
            status=AssignmentStatus.IN_PROGRESS,
            expires_at=expires_at,
        ))
        task.active_assignments += 1
        result_tasks.append(task)

    if not result_tasks:
        await db.rollback()
        return []

    await db.commit()
    for task in result_tasks:
        await db.refresh(task)
    return result_tasks


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


@router.get("/{dataset_id}/access", response_model=list[UserDatasetAccessResponse])
async def get_dataset_access(
        dataset_id: uuid.UUID,
        db: AsyncSession = Depends(get_db),
        admin_user: User = Depends(require_roles(["admin"]))
):
    """Список записей доступа всех пользователей к датасету — только для администраторов"""
    stmt = select(UserDatasetAccess).where(UserDatasetAccess.dataset_id == dataset_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.put("/{dataset_id}/access/{user_id}", response_model=UserDatasetAccessResponse)
async def upsert_user_access(
        dataset_id: uuid.UUID,
        user_id: uuid.UUID,
        update_in: UserDatasetAccessUpdate,
        db: AsyncSession = Depends(get_db),
        admin_user: User = Depends(require_roles(["admin"]))
):
    """Создать или обновить запись доступа пользователя к датасету — только для администраторов"""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")

    stmt = select(UserDatasetAccess).where(
        UserDatasetAccess.user_id == user_id,
        UserDatasetAccess.dataset_id == dataset_id,
    )
    access = (await db.execute(stmt)).scalar_one_or_none()

    if access is None:
        access = UserDatasetAccess(
            user_id=user_id,
            dataset_id=dataset_id,
            labeling_limit=update_in.labeling_limit if update_in.labeling_limit is not None else dataset.default_labeling_limit,
            can_label=update_in.can_label if update_in.can_label is not None else True,
            can_validate=update_in.can_validate if update_in.can_validate is not None else False,
        )
        db.add(access)
    else:
        if update_in.labeling_limit is not None:
            access.labeling_limit = update_in.labeling_limit
        if update_in.can_label is not None:
            access.can_label = update_in.can_label
        if update_in.can_validate is not None:
            access.can_validate = update_in.can_validate

    await db.commit()
    await db.refresh(access)
    return access


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset_detail(
        dataset_id: uuid.UUID,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    dataset = await _get_dataset_with_counts(db, dataset_id, user_id=current_user.id)
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
    if update_data.default_labeling_limit is not None:
        dataset.default_labeling_limit = update_data.default_labeling_limit
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

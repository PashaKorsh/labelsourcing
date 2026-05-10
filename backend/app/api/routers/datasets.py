from datetime import datetime, timedelta
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, exists, cast, String
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import selectinload
import uuid

from app.database import get_db
from app.models import (
    Dataset, User, Tag, Task, Assignment, Label, UserDatasetAccess,
    AssignmentStatus, TaskStatus, TaskType,
)
from app.api.dependencies import get_current_user, require_roles
from app.schemas.dataset import DatasetCreate, DatasetResponse, DatasetUpdate
from app.schemas.task import TaskResponse
from app.schemas.access import UserDatasetAccessResponse, UserDatasetAccessUpdate

router = APIRouter(prefix="/datasets", tags=["Datasets"])

ASSIGNMENT_EXPIRY_MINUTES = 10


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
    stmt = select(Dataset).where(Dataset.id == dataset_id).options(selectinload(Dataset.tags))
    dataset = (await db.execute(stmt)).scalar_one_or_none()
    if not dataset:
        return None
    dataset.user_done = False

    if user_id is not None:
        access = (await db.execute(
            select(UserDatasetAccess).where(
                UserDatasetAccess.user_id == user_id,
                UserDatasetAccess.dataset_id == dataset_id,
            )
        )).scalar_one_or_none()
        dataset.user_done = _compute_user_done(access, dataset.tasks_count)
        if access is not None:
            dataset.user_labeling_limit = min(access.labeling_limit, dataset.tasks_count)
            dataset.user_labeled_count = access.labeled_count

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
        requires_validation=dataset_in.requires_validation,
        validation_quorum=dataset_in.validation_quorum,
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
        select(Dataset)
        .options(selectinload(Dataset.tags))
        .limit(limit)
        .offset(offset)
    )

    if owner_id:
        stmt = stmt.where(Dataset.owner_id == owner_id)

    result = await db.execute(stmt)

    datasets_with_counts = []
    for dataset in result.scalars().all():
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


def _make_live_count_subquery() -> Any:
    """Подзапрос: количество живых (in_progress, не истёкших) ассайнментов на задачу."""
    return (
        select(func.count())
        .where(Assignment.task_id == Task.id)
        .where(Assignment.status == AssignmentStatus.IN_PROGRESS)
        .where(Assignment.expires_at > func.now())
        .correlate(Task)
        .scalar_subquery()
    )


def _make_user_busy_subquery(user_id: uuid.UUID) -> Any:
    """Подзапрос: пользователь уже работает над задачей или уже выполнил её."""
    return exists(
        select(Assignment.id)
        .where(Assignment.task_id == Task.id)
        .where(Assignment.user_id == user_id)
        .where(
            (Assignment.status == AssignmentStatus.DONE) |
            (
                (Assignment.status == AssignmentStatus.IN_PROGRESS) &
                (Assignment.expires_at > func.now())
            )
        )
        .correlate(Task)
    )


async def _assign_task(
    db: AsyncSession,
    task: Task,
    user_id: uuid.UUID,
    expires_at: datetime,
) -> None:
    """Создаёт или обновляет ассайнмент на задачу."""
    existing = (await db.execute(
        select(Assignment).where(
            Assignment.task_id == task.id,
            Assignment.user_id == user_id,
        )
    )).scalar_one_or_none()

    if existing:
        if existing.status == AssignmentStatus.EXPIRED:
            task.active_assignments += 1
        existing.status = AssignmentStatus.IN_PROGRESS
        existing.expires_at = expires_at
        existing.assigned_at = datetime.utcnow()
    else:
        db.add(Assignment(
            task_id=task.id,
            user_id=user_id,
            status=AssignmentStatus.IN_PROGRESS,
            expires_at=expires_at,
        ))
        task.active_assignments += 1

    task.expires_at = expires_at


@router.get("/{dataset_id}/next", response_model=list[TaskResponse])
async def get_next_task(
        dataset_id: uuid.UUID,
        count: int = Query(default=1, ge=1, le=MAX_TASKS_PER_REQUEST),
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    """Бронирует и возвращает доступные задачи.
    Validation-задачи имеют приоритет перед annotation при наличии can_validate.
    """
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")

    # Восстановление сессии: живые ассайнменты любого типа
    existing_stmt = (
        select(Task, Assignment.expires_at)
        .join(Assignment, Task.id == Assignment.task_id)
        .where(Task.dataset_id == dataset_id)
        .where(Assignment.user_id == current_user.id)
        .where(Assignment.status == AssignmentStatus.IN_PROGRESS)
        .where(Assignment.expires_at > func.now())
        .order_by(Task.created_at)
    )
    existing_rows = (await db.execute(existing_stmt)).all()
    if existing_rows:
        for task, exp in existing_rows:
            task.expires_at = exp
        return [task for task, _ in existing_rows]

    # Upsert access-записи
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

    access = (await db.execute(
        select(UserDatasetAccess).where(
            UserDatasetAccess.user_id == current_user.id,
            UserDatasetAccess.dataset_id == dataset_id,
        )
    )).scalar_one()

    expires_at = datetime.utcnow() + timedelta(minutes=ASSIGNMENT_EXPIRY_MINUTES)
    live_count_sq = _make_live_count_subquery()
    user_busy_sq = _make_user_busy_subquery(current_user.id)
    result_tasks: list[Task] = []

    # Сначала пытаемся выдать validation-задачи (приоритет)
    if dataset.requires_validation and access.can_validate:
        val_task_stmt = (
            select(Task)
            .where(Task.dataset_id == dataset_id)
            .where(Task.type == TaskType.VALIDATION)
            .where(Task.status == TaskStatus.PENDING)
            .where(live_count_sq < dataset.validation_quorum)
            .where(~user_busy_sq)
            # Запрет самовалидации: annotator_id из метадаты != текущий пользователь
            .where(
                cast(Task.task_metadata['annotator_id'], String) != f'"{current_user.id}"'
            )
            .order_by(Task.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )

        for _ in range(count):
            if result_tasks:
                await db.flush()
            task = (await db.execute(val_task_stmt)).scalar_one_or_none()
            if not task:
                break
            await _assign_task(db, task, current_user.id, expires_at)
            result_tasks.append(task)

    # Если validation-задачи не выдали нужное количество — добираем annotation
    remaining = count - len(result_tasks)
    if remaining > 0 and access.can_label:
        effective_limit = min(access.labeling_limit, dataset.tasks_count)
        if access.labeled_count < effective_limit:
            ann_task_stmt = (
                select(Task)
                .where(Task.dataset_id == dataset_id)
                .where(Task.type == TaskType.ANNOTATION)
                .where(Task.status == TaskStatus.PENDING)
                .where(live_count_sq < dataset.required_answers)
                .where(~user_busy_sq)
                .order_by(Task.created_at)
                .limit(1)
                .with_for_update(skip_locked=True)
            )

            for _ in range(remaining):
                if result_tasks:
                    await db.flush()
                task = (await db.execute(ann_task_stmt)).scalar_one_or_none()
                if not task:
                    break
                await _assign_task(db, task, current_user.id, expires_at)
                result_tasks.append(task)

    if not result_tasks:
        await db.rollback()
        return []

    await db.commit()
    for task in result_tasks:
        await db.refresh(task)
    return result_tasks


@router.get("/{dataset_id}/stats")
async def get_dataset_stats(
        dataset_id: uuid.UUID,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    """Статистика обработки датасета: количество задач по типам/статусам и текущая фаза."""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")

    def count_q(task_type: TaskType, task_status: TaskStatus):
        return (
            select(func.count())
            .where(Task.dataset_id == dataset_id)
            .where(Task.type == task_type)
            .where(Task.status == task_status)
            .scalar_subquery()
        )

    ann_pending = (await db.execute(select(count_q(TaskType.ANNOTATION, TaskStatus.PENDING)))).scalar()
    ann_completed = (await db.execute(select(count_q(TaskType.ANNOTATION, TaskStatus.COMPLETED)))).scalar()
    val_pending = (await db.execute(select(count_q(TaskType.VALIDATION, TaskStatus.PENDING)))).scalar()
    val_completed = (await db.execute(select(count_q(TaskType.VALIDATION, TaskStatus.COMPLETED)))).scalar()

    ann_pending = ann_pending or 0
    ann_completed = ann_completed or 0
    val_pending = val_pending or 0
    val_completed = val_completed or 0

    if not dataset.requires_validation:
        phase = "labeling" if ann_pending > 0 else "complete"
    elif ann_pending > 0 and val_pending == 0:
        phase = "labeling"
    elif ann_pending > 0 and val_pending > 0:
        phase = "labeling_and_validation"
    elif ann_pending == 0 and val_pending > 0:
        phase = "validation"
    else:
        phase = "complete"

    return {
        "annotation_tasks_total": ann_pending + ann_completed,
        "annotation_tasks_pending": ann_pending,
        "annotation_tasks_completed": ann_completed,
        "validation_tasks_total": val_pending + val_completed,
        "validation_tasks_pending": val_pending,
        "validation_tasks_completed": val_completed,
        "phase": phase,
    }


@router.get("/{dataset_id}/export")
async def export_dataset_labels(
        dataset_id: uuid.UUID,
        db: AsyncSession = Depends(get_db),
        admin_user: User = Depends(require_roles(["admin"]))
):
    """Выгрузка всех разметок по датасету (без агрегации).
    Возвращает список annotation-задач с вложенными разметками всех пользователей.
    """
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")

    stmt = (
        select(Task, Assignment, Label)
        .join(Assignment, Assignment.task_id == Task.id)
        .join(Label, Label.assignment_id == Assignment.id)
        .where(Task.dataset_id == dataset_id)
        .where(Task.type == TaskType.ANNOTATION)
        .order_by(Task.created_at, Assignment.assigned_at)
    )
    rows = (await db.execute(stmt)).all()

    tasks_map: dict[str, dict] = {}
    for task, assignment, label in rows:
        task_id_str = str(task.id)
        if task_id_str not in tasks_map:
            tasks_map[task_id_str] = {
                "task_id": task_id_str,
                "task_url": task.url,
                "task_status": task.status.value,
                "labels": [],
            }
        tasks_map[task_id_str]["labels"].append({
            "label_id": str(label.id),
            "annotator_id": str(assignment.user_id),
            "assignment_status": assignment.status.value,
            "result": label.result,
            "created_at": label.created_at.isoformat(),
        })

    return list(tasks_map.values())


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


@router.delete("/{dataset_id}/progress/{user_id}", status_code=204)
async def reset_user_progress(
        dataset_id: uuid.UUID,
        user_id: uuid.UUID,
        db: AsyncSession = Depends(get_db),
        _: User = Depends(require_roles(["admin"]))
):
    """[DEV] Сбросить весь прогресс пользователя по датасету."""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")

    stmt = (
        select(Assignment)
        .join(Task, Assignment.task_id == Task.id)
        .where(Task.dataset_id == dataset_id)
        .where(Assignment.user_id == user_id)
    )
    assignments = (await db.execute(stmt)).scalars().all()

    for assignment in assignments:
        task = await db.get(Task, assignment.task_id)
        if task is None:
            continue
        if assignment.status == AssignmentStatus.DONE:
            task.completed_answers = max(0, task.completed_answers - 1)
            if task.completed_answers < dataset.required_answers:
                task.status = TaskStatus.PENDING
        elif assignment.status == AssignmentStatus.IN_PROGRESS:
            task.active_assignments = max(0, task.active_assignments - 1)
        await db.delete(assignment)

    access = (await db.execute(
        select(UserDatasetAccess).where(
            UserDatasetAccess.user_id == user_id,
            UserDatasetAccess.dataset_id == dataset_id,
        )
    )).scalar_one_or_none()
    if access:
        await db.delete(access)

    await db.commit()


@router.patch("/{dataset_id}", response_model=DatasetResponse)
async def update_dataset(
        dataset_id: uuid.UUID,
        update_data: DatasetUpdate,
        db: AsyncSession = Depends(get_db),
        admin_user: User = Depends(require_roles(["admin"]))
):
    stmt = select(Dataset).options(selectinload(Dataset.tags)).where(Dataset.id == dataset_id)
    dataset = (await db.execute(stmt)).scalar_one_or_none()

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
    if update_data.requires_validation is not None:
        dataset.requires_validation = update_data.requires_validation
    if update_data.validation_quorum is not None:
        dataset.validation_quorum = update_data.validation_quorum

    if update_data.tag_ids is not None:
        tags_stmt = select(Tag).where(Tag.id.in_(update_data.tag_ids))
        tags_res = await db.execute(tags_stmt)
        dataset.tags = list(tags_res.scalars().all())

    await db.commit()

    return await _get_dataset_with_counts(db, dataset_id)

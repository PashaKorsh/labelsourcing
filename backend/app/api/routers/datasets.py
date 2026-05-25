from datetime import datetime, timedelta
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, exists, cast, String, delete, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import selectinload, aliased
import uuid

from app.database import get_db
from app.models import (
    Dataset, User, Tag, Task, Assignment, Label, UserDatasetAccess,
    AssignmentStatus, TaskStatus, TaskType, DatasetStatus
)
from app.api.dependencies import get_current_user, require_roles
from app.schemas.dataset import DatasetCreate, DatasetResponse, DatasetUpdate
from app.schemas.task import TaskResponse
from app.schemas.access import UserDatasetAccessResponse, UserDatasetAccessUpdate

router = APIRouter(prefix="/datasets", tags=["Datasets"])

ASSIGNMENT_EXPIRY_MINUTES = 10

DEFAULT_ANNOTATION_LABELS = [{"id": "object", "label": "Object", "color": "#f59e0b"}]


def _check_dataset_access(dataset: Dataset, current_user: User) -> None:
    is_admin = any(role.name == "admin" for role in current_user.roles)
    if is_admin:
        return

    if dataset.tags:
        user_tag_ids = {t.id for t in current_user.tags}
        dataset_tag_ids = {t.id for t in dataset.tags}
        if not dataset_tag_ids.issubset(user_tag_ids):
            raise HTTPException(
                status_code=403,
                detail="Нет доступа: у вас нет необходимых тегов для этого датасета"
            )


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
    labels_data = [l.model_dump() for l in dataset_in.annotation_labels] if dataset_in.annotation_labels else DEFAULT_ANNOTATION_LABELS
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


def _get_user_status(
        dataset: Dataset,
        access: UserDatasetAccess | None,
        tasks_count: int,
        has_pending_validation: bool = False,
        has_pending_own_validation: bool = False,
) -> str:
    if dataset.status == DatasetStatus.COMPLETED:
        return "COMPLETED"
    if access is not None:
        effective_limit = min(access.labeling_limit, tasks_count)
        if not access.can_label or access.labeled_count >= effective_limit:
            if dataset.requires_validation and has_pending_validation and access.labeled_count < access.labeling_limit:
                return "IN_PROGRESS"
            if dataset.requires_validation and has_pending_own_validation:
                return "WAITING_VALIDATION"
            return "USER_DONE"
        if access.labeled_count > 0:
            return "IN_PROGRESS"
    return "NOT_STARTED"


@router.get("/", response_model=list[DatasetResponse])
async def get_datasets(
        limit: int = 20,
        offset: int = 0,
        search: Optional[str] = None,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    ValTask = aliased(Task)
    ValAssignment = aliased(Assignment)
    OwnValTask = aliased(Task)

    # Подзапрос: PENDING validation-задачи, которые текущий пользователь ещё не сделал
    # и которые он вообще может выполнить (т.е. аннотировал не он сам).
    pending_val_for_user_sq = (
        select(func.count())
        .where(ValTask.dataset_id == Dataset.id)
        .where(ValTask.type == TaskType.VALIDATION)
        .where(ValTask.status == TaskStatus.PENDING)
        .where(cast(ValTask.task_metadata['annotator_id'], String) != f'"{current_user.id}"')
        .where(
            ~exists(
                select(ValAssignment.id)
                .where(ValAssignment.task_id == ValTask.id)
                .where(ValAssignment.user_id == current_user.id)
                .where(ValAssignment.status == AssignmentStatus.DONE)
                .correlate(ValTask)
            )
        )
        .correlate(Dataset)
        .scalar_subquery()
    )

    # Подзапрос: PENDING validation-задачи по аннотациям самого пользователя (его работа ждёт проверки)
    own_pending_val_sq = (
        select(func.count())
        .where(OwnValTask.dataset_id == Dataset.id)
        .where(OwnValTask.type == TaskType.VALIDATION)
        .where(OwnValTask.status == TaskStatus.PENDING)
        .where(cast(OwnValTask.task_metadata['annotator_id'], String) == f'"{current_user.id}"')
        .correlate(Dataset)
        .scalar_subquery()
    )

    stmt = (
        select(
            Dataset,
            func.count(Label.id.distinct()).label("labeled_count"),
            pending_val_for_user_sq.label("pending_val_count"),
            own_pending_val_sq.label("own_pending_val_count"),
            UserDatasetAccess
        )
        .outerjoin(Task, Dataset.id == Task.dataset_id)
        .outerjoin(Assignment, Task.id == Assignment.task_id)
        .outerjoin(Label, Assignment.id == Label.assignment_id)
        .outerjoin(
            UserDatasetAccess,
            (UserDatasetAccess.dataset_id == Dataset.id) &
            (UserDatasetAccess.user_id == current_user.id)
        )
    )

    is_admin = any(role.name == "admin" for role in current_user.roles)
    if not is_admin:
        user_tag_ids = [t.id for t in current_user.tags]
        if user_tag_ids:
            stmt = stmt.where(
                or_(
                    ~Dataset.tags.any(),
                    ~Dataset.tags.any(~Tag.id.in_(user_tag_ids))
                )
            )
        else:
            stmt = stmt.where(~Dataset.tags.any())

    if search:
        stmt = stmt.where(Dataset.title.ilike(f"%{search}%"))

    stmt = stmt.group_by(Dataset.id, UserDatasetAccess.user_id, UserDatasetAccess.dataset_id)
    stmt = stmt.options(selectinload(Dataset.tags))
    stmt = stmt.limit(limit).offset(offset)

    result = await db.execute(stmt)

    datasets_with_counts = []
    for row in result.all():
        dataset = row[0]
        dataset.labeled_count = row[1]
        pending_val_count = row[2]
        own_pending_val_count = row[3]
        user_access = row[4]
        dataset.user_status = _get_user_status(
            dataset, user_access, dataset.tasks_count,
            has_pending_validation=pending_val_count > 0,
            has_pending_own_validation=own_pending_val_count > 0,
        )

        datasets_with_counts.append(dataset)

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
        if existing.status in (AssignmentStatus.EXPIRED, AssignmentStatus.REJECTED):
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
    Приоритет: validation-задачи → annotation-задачи.
    Типы не смешиваются в рамках одного запроса.
    """
    stmt = select(Dataset).where(Dataset.id == dataset_id).options(selectinload(Dataset.tags))
    dataset = (await db.execute(stmt)).scalar_one_or_none()

    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")

    _check_dataset_access(dataset, current_user)

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

    # Validation-задачи в приоритете (только если пользователь не исчерпал лимит)
    if dataset.requires_validation and access.labeled_count < access.labeling_limit:
        val_task_stmt = (
            select(Task)
            .where(Task.dataset_id == dataset_id)
            .where(Task.type == TaskType.VALIDATION)
            .where(Task.status == TaskStatus.PENDING)
            .where((live_count_sq + Task.completed_answers) < dataset.validation_quorum)
            .where(~user_busy_sq)
            .where(
                cast(Task.task_metadata['annotator_id'], String) != f'"{current_user.id}"'
            )
            .order_by(Task.created_at)
            .limit(count)
            .with_for_update(of=Task, skip_locked=True)
        )

        validation_tasks = (await db.execute(val_task_stmt)).scalars().all()

        for task in validation_tasks:
            await _assign_task(db, task, current_user.id, expires_at)
            result_tasks.append(task)

    remaining_count = count - len(result_tasks)

    # Annotation-задачи — только если валидации не нашлось
    if len(result_tasks) == 0 and access.can_label:
        effective_limit = min(access.labeling_limit, dataset.tasks_count)

        if access.labeled_count < effective_limit:
            ann_task_stmt = (
                select(Task)
                .where(Task.dataset_id == dataset_id)
                .where(Task.type == TaskType.ANNOTATION)
                .where(Task.status == TaskStatus.PENDING)
                .where((live_count_sq + Task.completed_answers) < dataset.required_answers)
                .where(~user_busy_sq)
                .order_by(Task.created_at)
                .limit(remaining_count)
                .with_for_update(of=Task, skip_locked=True)
            )

            annotation_tasks = (await db.execute(ann_task_stmt)).scalars().all()

            for task in annotation_tasks:
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
        admin_user: User = Depends(require_roles(["admin"]))
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
        status: Optional[str] = None,
        db: AsyncSession = Depends(get_db),
        admin_user: User = Depends(require_roles(["admin"]))
):
    stmt = (
        select(Task)
        .where(Task.dataset_id == dataset_id)
        .where(Task.type == TaskType.ANNOTATION)
    )

    if status:
        stmt = stmt.where(Task.status == status)

    stmt = stmt.limit(limit).offset(offset)

    result = await db.execute(stmt)
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
        )
        db.add(access)
    else:
        if update_in.labeling_limit is not None:
            access.labeling_limit = update_in.labeling_limit
        if update_in.can_label is not None:
            access.can_label = update_in.can_label

    await db.commit()
    await db.refresh(access)
    return access


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(
        dataset_id: uuid.UUID,
        db: AsyncSession = Depends(get_db),
        _: User = Depends(require_roles(["admin"]))
):
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    await db.delete(dataset)
    await db.commit()


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset_detail(
        dataset_id: uuid.UUID,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    dataset = await _get_dataset_with_counts(db, dataset_id, user_id=current_user.id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    _check_dataset_access(dataset, current_user)
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

    # 1. Удаляем все validation-задачи, созданные из разметки этого пользователя.
    #    Это покрывает все состояния аннотации: DONE (валидация ещё идёт),
    #    REJECTED (валидация завершена, лейбл уже удалён — per-label запрос не работал).
    #    DB-уровень CASCADE (tasks→assignments→labels) сам чистит дочерние записи.
    await db.execute(
        delete(Task)
        .where(Task.dataset_id == dataset_id)
        .where(Task.type == TaskType.VALIDATION)
        .where(Task.task_metadata['annotator_id'].astext == str(user_id))
    )

    # 2. Перечитываем ассайнменты после bulk-delete, чтобы не видеть уже удалённые
    #    ассайнменты валидаторов (cascade удалил их вместе с validation-задачами).
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
            quorum = dataset.validation_quorum if task.type == TaskType.VALIDATION else dataset.required_answers
            if task.completed_answers < quorum:
                task.status = TaskStatus.PENDING
        elif assignment.status == AssignmentStatus.IN_PROGRESS:
            task.active_assignments = max(0, task.active_assignments - 1)
        # REJECTED: задача уже откачена в _process_validation_verdict
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
    enabling_validation = (
        update_data.requires_validation is True and not dataset.requires_validation
    )

    if update_data.requires_validation is not None:
        dataset.requires_validation = update_data.requires_validation
    if update_data.validation_quorum is not None:
        dataset.validation_quorum = update_data.validation_quorum

    if update_data.tag_ids is not None:
        tags_stmt = select(Tag).where(Tag.id.in_(update_data.tag_ids))
        tags_res = await db.execute(tags_stmt)
        dataset.tags = list(tags_res.scalars().all())

    # Если валидация включается впервые — создаём validation-задачи
    # для всех уже завершённых annotation-задач, у которых их ещё нет
    if enabling_validation:
        quorum = update_data.validation_quorum if update_data.validation_quorum is not None else dataset.validation_quorum
        completed_ann_stmt = (
            select(Task)
            .where(Task.dataset_id == dataset_id)
            .where(Task.type == TaskType.ANNOTATION)
            .where(Task.status == TaskStatus.COMPLETED)
        )
        completed_tasks = (await db.execute(completed_ann_stmt)).scalars().all()

        for ann_task in completed_tasks:
            existing_val = (await db.execute(
                select(Task.id)
                .where(Task.dataset_id == dataset_id)
                .where(Task.type == TaskType.VALIDATION)
                .where(Task.task_metadata['annotation_task_id'].astext == str(ann_task.id))
                .limit(1)
            )).scalar_one_or_none()
            if existing_val is not None:
                continue

            all_labels_stmt = (
                select(Label, Assignment)
                .join(Assignment, Label.assignment_id == Assignment.id)
                .where(Assignment.task_id == ann_task.id)
                .where(Assignment.status == AssignmentStatus.DONE)
            )
            all_rows = (await db.execute(all_labels_stmt)).all()

            for done_label, done_assignment in all_rows:
                ann_data = done_label.result.get('result', [])
                db.add(Task(
                    dataset_id=dataset_id,
                    url=ann_task.url,
                    type=TaskType.VALIDATION,
                    task_metadata={
                        'annotation_task_id': str(ann_task.id),
                        'annotation_label_id': str(done_label.id),
                        'annotator_id': str(done_assignment.user_id),
                        'annotations': ann_data,
                    },
                ))

    await db.commit()

    return await _get_dataset_with_counts(db, dataset_id)

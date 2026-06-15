from datetime import datetime, timedelta
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, exists, cast, String, delete, update, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import selectinload, aliased
import uuid

from app.database import get_db
from app.models import (
    Dataset, User, Tag, Task, Assignment, Label, UserDatasetAccess,
    AssignmentStatus, TaskStatus, TaskType, DatasetStatus, SourceType, Utility
)
from app.api.dependencies import get_current_user, require_roles
from app.api.helpers import _ensure_validation_tasks, ensure_can_manage_dataset, is_admin
from app.schemas.dataset import DatasetCreate, DatasetResponse, DatasetUpdate
from app.schemas.task import TaskResponse, TaskPublicResponse
from app.schemas.access import UserDatasetAccessResponse, UserDatasetAccessUpdate

router = APIRouter(prefix="/datasets", tags=["Datasets"])

ASSIGNMENT_EXPIRY_MINUTES = 10

DEFAULT_ANNOTATION_LABELS = [{"id": "object", "label": "Object", "color": "#f59e0b"}]


async def _validate_utility(
    db: AsyncSession,
    source_type: SourceType,
    utility_id: uuid.UUID | None,
    current_user: User,
) -> uuid.UUID | None:
    """Для utility-датасета проверяет, что указана утилита текущего пользователя."""
    if source_type != SourceType.UTILITY:
        return None
    if utility_id is None:
        raise HTTPException(status_code=400, detail="Для типа 'utility' нужно указать утилиту")
    utility = await db.get(Utility, utility_id)
    if utility is None or utility.owner_id != current_user.id:
        raise HTTPException(status_code=400, detail="Утилита не найдена")
    return utility_id


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


def _compute_user_done(access: UserDatasetAccess | None) -> bool:
    if access is None:
        return False
    return not access.can_label or access.tasks_done >= access.tasks_limit


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
        dataset.user_done = _compute_user_done(access)
        if access is not None:
            dataset.user_tasks_limit = access.tasks_limit
            dataset.user_tasks_done = access.tasks_done

    return dataset


@router.post("/", response_model=DatasetResponse)
async def create_dataset(
        dataset_in: DatasetCreate,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(require_roles(["admin", "moderator"]))
):
    settings = dict(dataset_in.settings)
    if 'annotation_labels' not in settings:
        settings['annotation_labels'] = DEFAULT_ANNOTATION_LABELS

    source_type = SourceType(dataset_in.source_type)
    utility_id = await _validate_utility(db, source_type, dataset_in.utility_id, current_user)

    new_dataset = Dataset(
        owner_id=current_user.id,
        title=dataset_in.title,
        description=dataset_in.description,
        required_answers=dataset_in.required_answers,
        default_tasks_limit=dataset_in.default_tasks_limit,
        requires_validation=dataset_in.requires_validation,
        validation_quorum=dataset_in.validation_quorum,
        settings=settings,
        source_type=source_type,
        utility_id=utility_id,
    )

    if dataset_in.tag_ids:
        tags_stmt = select(Tag).where(Tag.id.in_(dataset_in.tag_ids))
        tags_res = await db.execute(tags_stmt)
        new_dataset.tags = list(tags_res.scalars().all())

    db.add(new_dataset)
    await db.commit()

    dataset = await _get_dataset_with_counts(db, new_dataset.id)
    return dataset


def _get_user_status(
        dataset: Dataset,
        access: UserDatasetAccess | None,
        has_pending_validation: bool = False,
        has_pending_annotation: bool = False,
        has_unvalidated_work: bool = False,
) -> str:
    """
    Вычисляет статус пользователя в датасете.

      NOT_STARTED        — нет access-записи (пользователь не начинал)
      IN_PROGRESS        — лимит не исчерпан и есть задачи (аннотация или валидация)
      WAITING_VALIDATION — собственная разметка ожидает проверки
      LIMIT_REACHED      — пользователь исчерпал свою квоту
      IDLE               — задач нет, но квота не исчерпана (датасет ещё может пополниться)
      COMPLETED          — датасет закрыт администратором
    """
    if dataset.status == DatasetStatus.CLOSED:
        return "COMPLETED"

    if access is None:
        return "NOT_STARTED"

    limit_reached = access.tasks_done >= access.tasks_limit

    if not limit_reached and (
        (dataset.requires_validation and has_pending_validation) or
        (access.can_label and has_pending_annotation)
    ):
        return "IN_PROGRESS"

    if dataset.requires_validation and has_unvalidated_work:
        return "WAITING_VALIDATION"

    if limit_reached:
        return "LIMIT_REACHED"

    return "IDLE"


@router.get("/", response_model=list[DatasetResponse])
async def get_datasets(
        limit: int = 20,
        offset: int = 0,
        search: Optional[str] = None,
        mine: bool = False,
        tag_ids: Optional[List[uuid.UUID]] = Query(default=None),
        status: Optional[str] = None,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    ValTask = aliased(Task)
    ValAssignment = aliased(Assignment)
    UnvalLabel = aliased(Label)
    UnvalAnnAssign = aliased(Assignment)
    UnvalAnnTask = aliased(Task)
    AnnTask2 = aliased(Task)
    AnnAssign2 = aliased(Assignment)

    # Подзапрос: есть ли PENDING validation-задачи, которые пользователь ещё не сделал
    # (аннотировал не он сам)
    pending_val_for_user_sq = (
        select(ValTask.id)
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
        .limit(1)
        .correlate(Dataset)
        .scalar_subquery()
    )

    # Подзапрос: есть ли у пользователя аннотационные лейблы, ещё не прошедшие валидацию
    user_has_unvalidated_work_sq = (
        select(UnvalLabel.id)
        .join(UnvalAnnAssign, UnvalLabel.assignment_id == UnvalAnnAssign.id)
        .join(UnvalAnnTask, UnvalAnnAssign.task_id == UnvalAnnTask.id)
        .where(UnvalAnnTask.dataset_id == Dataset.id)
        .where(UnvalAnnTask.type == TaskType.ANNOTATION)
        .where(UnvalAnnAssign.user_id == current_user.id)
        .where(UnvalAnnAssign.status == AssignmentStatus.DONE)
        .where(UnvalLabel.is_validated == False)
        .limit(1)
        .correlate(Dataset)
        .scalar_subquery()
    )

    # Подзапрос: есть ли PENDING annotation-задачи, которые пользователь ещё не выполнил
    pending_ann_for_user_sq = (
        select(AnnTask2.id)
        .where(AnnTask2.dataset_id == Dataset.id)
        .where(AnnTask2.type == TaskType.ANNOTATION)
        .where(AnnTask2.status == TaskStatus.PENDING)
        .where(
            ~exists(
                select(AnnAssign2.id)
                .where(AnnAssign2.task_id == AnnTask2.id)
                .where(AnnAssign2.user_id == current_user.id)
                .where(AnnAssign2.status == AssignmentStatus.DONE)
                .correlate(AnnTask2)
            )
        )
        .limit(1)
        .correlate(Dataset)
        .scalar_subquery()
    )

    stmt = (
        select(
            Dataset,
            func.count(Label.id.distinct()).label("labeled_count"),
            pending_val_for_user_sq.label("pending_val"),
            user_has_unvalidated_work_sq.label("has_unvalidated_work"),
            pending_ann_for_user_sq.label("has_pending_ann"),
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

    if not is_admin(current_user):
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

    if mine:
        stmt = stmt.where(Dataset.owner_id == current_user.id)

    if tag_ids:
        stmt = stmt.where(Dataset.tags.any(Tag.id.in_(tag_ids)))

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
        # row[2]: UUID или None — есть ли PENDING val-задачи для пользователя
        # row[3]: UUID или None — есть ли непроверенные лейблы пользователя
        # row[4]: UUID или None — есть ли PENDING ann-задачи для пользователя
        user_access = row[5]
        dataset.user_status = _get_user_status(
            dataset, user_access,
            has_pending_validation=bool(row[2]),
            has_unvalidated_work=bool(row[3]),
            has_pending_annotation=bool(row[4]),
        )

        datasets_with_counts.append(dataset)

    # Фильтр по пользовательскому статусу считается в Python — он не выражается в SQL
    if status:
        datasets_with_counts = [d for d in datasets_with_counts if d.user_status == status]

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
        # Единственный возможный случай: устаревший IN_PROGRESS (expires_at истёк, но не был
        # сдан — active_assignments уже был посчитан при создании, не инкрементируем повторно)
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


def _resolve_url(task: Task, use_proxy: bool, direct_base: str | None) -> str | None:
    """Картинку отдаём напрямую (url) или через наш прокси (None → браузер идёт на /proxy)."""
    if use_proxy:
        return None
    if direct_base is None:
        return task.url  # URL-датасет: задача уже хранит прямую ссылку
    # utility direct: публичный адрес + dataset_id + относительный путь (dataset_id разводит папки)
    return f"{direct_base.rstrip('/')}/{task.dataset_id}/{task.url.lstrip('/')}"


def _build_task_responses(
    tasks: list[Task], use_proxy: bool, direct_base: str | None = None,
) -> list[TaskPublicResponse]:
    return [
        TaskPublicResponse(
            id=task.id,
            dataset_id=task.dataset_id,
            type=task.type,
            completed_answers=task.completed_answers,
            active_assignments=task.active_assignments,
            status=task.status,
            task_metadata=task.task_metadata,
            expires_at=task.expires_at,
            url=_resolve_url(task, use_proxy, direct_base),
        )
        for task in tasks
    ]


@router.get("/{dataset_id}/next", response_model=list[TaskPublicResponse])
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
    stmt = (
        select(Dataset).where(Dataset.id == dataset_id)
        .options(selectinload(Dataset.tags), selectinload(Dataset.utility))
    )
    dataset = (await db.execute(stmt)).scalar_one_or_none()

    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")

    _check_dataset_access(dataset, current_user)

    # Direct-режим: картинка идёт от источника к браузеру, минуя наш сервер.
    # Для utility доступен только если у утилиты есть публичный HTTPS-адрес.
    use_proxy_setting: bool = (dataset.settings or {}).get('use_proxy', True)
    direct_base: str | None = None
    if dataset.source_type == SourceType.UTILITY:
        can_direct = dataset.utility is not None and bool(dataset.utility.public_base_url)
        use_proxy = use_proxy_setting if can_direct else True
        if not use_proxy:
            direct_base = dataset.utility.public_base_url
    else:
        use_proxy = use_proxy_setting

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
        return _build_task_responses([t for t, _ in existing_rows], use_proxy, direct_base)

    # Upsert access-записи
    upsert_stmt = (
        pg_insert(UserDatasetAccess)
        .values(
            user_id=current_user.id,
            dataset_id=dataset_id,
            tasks_limit=dataset.default_tasks_limit,
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
    if dataset.requires_validation and access.tasks_done < access.tasks_limit:
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
    if len(result_tasks) == 0 and access.can_label and access.tasks_done < access.tasks_limit:
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
    return _build_task_responses(result_tasks, use_proxy, direct_base)


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
    ensure_can_manage_dataset(dataset, current_user)

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
        current_user: User = Depends(get_current_user)
):
    """Выгрузка всех разметок по датасету (без агрегации).
    Возвращает список annotation-задач с вложенными разметками всех пользователей.
    """
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    ensure_can_manage_dataset(dataset, current_user)

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
        current_user: User = Depends(get_current_user)
):
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    ensure_can_manage_dataset(dataset, current_user)

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
        current_user: User = Depends(get_current_user)
):
    """Список записей доступа всех пользователей к датасету — владелец или админ"""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    ensure_can_manage_dataset(dataset, current_user)
    stmt = select(UserDatasetAccess).where(UserDatasetAccess.dataset_id == dataset_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.put("/{dataset_id}/access/{user_id}", response_model=UserDatasetAccessResponse)
async def upsert_user_access(
        dataset_id: uuid.UUID,
        user_id: uuid.UUID,
        update_in: UserDatasetAccessUpdate,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    """Создать или обновить запись доступа пользователя к датасету — владелец или админ"""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    ensure_can_manage_dataset(dataset, current_user)

    stmt = select(UserDatasetAccess).where(
        UserDatasetAccess.user_id == user_id,
        UserDatasetAccess.dataset_id == dataset_id,
    )
    access = (await db.execute(stmt)).scalar_one_or_none()

    if access is None:
        access = UserDatasetAccess(
            user_id=user_id,
            dataset_id=dataset_id,
            tasks_limit=update_in.tasks_limit if update_in.tasks_limit is not None else dataset.default_tasks_limit,
            can_label=update_in.can_label if update_in.can_label is not None else True,
        )
        db.add(access)
    else:
        if update_in.tasks_limit is not None:
            access.tasks_limit = update_in.tasks_limit
        if update_in.can_label is not None:
            access.can_label = update_in.can_label

    await db.commit()
    await db.refresh(access)
    return access


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(
        dataset_id: uuid.UUID,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    ensure_can_manage_dataset(dataset, current_user)
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
        current_user: User = Depends(get_current_user)
):
    """[DEV] Сбросить весь прогресс пользователя по датасету."""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    ensure_can_manage_dataset(dataset, current_user)

    # 1. Удаляем все validation-задачи, созданные из разметки этого пользователя.
    #    DB CASCADE (tasks→assignments→labels) чистит дочерние записи автоматически.
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


@router.delete("/{dataset_id}/users-data", status_code=204)
async def reset_dataset_users_data(
        dataset_id: uuid.UUID,
        db: AsyncSession = Depends(get_db),
        _: User = Depends(require_roles(["admin"]))
):
    """[DEV] Сбросить все пользовательские данные по датасету.

    Датасет возвращается в состояние «как новый»:
    - Annotation-задачи сохраняются, но их счётчики и статусы обнуляются.
    - Все validation-задачи удаляются (DB CASCADE → их ассайнменты и лейблы).
    - Все ассайнменты и лейблы по annotation-задачам удаляются.
    - Все записи доступа пользователей (UserDatasetAccess) удаляются.
    """
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")

    # 1. Удаляем все validation-задачи.
    #    DB CASCADE (tasks → assignments → labels) чистит дочерние записи автоматически.
    await db.execute(
        delete(Task)
        .where(Task.dataset_id == dataset_id)
        .where(Task.type == TaskType.VALIDATION)
    )

    # 2. Удаляем все ассайнменты по annotation-задачам.
    #    DB CASCADE (assignments → labels) чистит лейблы автоматически.
    await db.execute(
        delete(Assignment)
        .where(
            Assignment.task_id.in_(
                select(Task.id)
                .where(Task.dataset_id == dataset_id)
                .where(Task.type == TaskType.ANNOTATION)
            )
        )
    )

    # 3. Сбрасываем счётчики и статусы annotation-задач.
    await db.execute(
        update(Task)
        .where(Task.dataset_id == dataset_id)
        .where(Task.type == TaskType.ANNOTATION)
        .values(status=TaskStatus.PENDING, completed_answers=0, active_assignments=0)
    )

    # 4. Удаляем все записи доступа пользователей к датасету.
    await db.execute(
        delete(UserDatasetAccess)
        .where(UserDatasetAccess.dataset_id == dataset_id)
    )

    # 5. Пересчитываем tasks_count по факту — защита от рассинхрона счётчика.
    actual_count = (await db.execute(
        select(func.count())
        .where(Task.dataset_id == dataset_id)
        .where(Task.type == TaskType.ANNOTATION)
    )).scalar_one()
    dataset.tasks_count = actual_count

    await db.commit()


@router.patch("/{dataset_id}", response_model=DatasetResponse)
async def update_dataset(
        dataset_id: uuid.UUID,
        update_data: DatasetUpdate,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    stmt = select(Dataset).options(selectinload(Dataset.tags)).where(Dataset.id == dataset_id)
    dataset = (await db.execute(stmt)).scalar_one_or_none()

    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    ensure_can_manage_dataset(dataset, current_user)

    enabling_validation = (
        update_data.requires_validation is True and not dataset.requires_validation
    )
    decreasing_required_answers = (
        update_data.required_answers is not None and
        update_data.required_answers < dataset.required_answers
    )

    if update_data.title is not None:
        dataset.title = update_data.title
    if 'description' in update_data.model_fields_set:
        dataset.description = update_data.description
    if update_data.required_answers is not None:
        dataset.required_answers = update_data.required_answers
    if update_data.default_tasks_limit is not None:
        dataset.default_tasks_limit = update_data.default_tasks_limit
        await db.execute(
            update(UserDatasetAccess)
            .where(UserDatasetAccess.dataset_id == dataset_id)
            .values(tasks_limit=update_data.default_tasks_limit)
        )
    if update_data.status is not None:
        dataset.status = update_data.status
    if update_data.requires_validation is not None:
        dataset.requires_validation = update_data.requires_validation
    if update_data.validation_quorum is not None:
        dataset.validation_quorum = update_data.validation_quorum
    if update_data.settings is not None:
        dataset.settings = update_data.settings
    if update_data.source_type is not None:
        dataset.source_type = SourceType(update_data.source_type)
    # utility_id валидируем относительно итогового source_type
    if update_data.utility_id is not None or update_data.source_type is not None:
        dataset.utility_id = await _validate_utility(
            db, dataset.source_type,
            update_data.utility_id if update_data.utility_id is not None else dataset.utility_id,
            current_user,
        )

    if update_data.tag_ids is not None:
        tags_stmt = select(Tag).where(Tag.id.in_(update_data.tag_ids))
        tags_res = await db.execute(tags_stmt)
        dataset.tags = list(tags_res.scalars().all())

    # При снижении required_answers: задачи с completed_answers >= нового порога
    # застревают в PENDING и никогда не получают validation-задач.
    # Завершаем их и создаём validation-задачи (если валидация включена).
    if decreasing_required_answers:
        stuck_stmt = (
            select(Task)
            .where(Task.dataset_id == dataset_id)
            .where(Task.type == TaskType.ANNOTATION)
            .where(Task.status == TaskStatus.PENDING)
            .where(Task.completed_answers >= dataset.required_answers)
        )
        stuck_tasks = (await db.execute(stuck_stmt)).scalars().all()
        for ann_task in stuck_tasks:
            ann_task.status = TaskStatus.COMPLETED
            if dataset.requires_validation:
                await _ensure_validation_tasks(db, ann_task, dataset)

    # При первом включении валидации: создаём validation-задачи
    # для уже завершённых annotation-задач, у которых их ещё нет.
    if enabling_validation:
        completed_ann_stmt = (
            select(Task)
            .where(Task.dataset_id == dataset_id)
            .where(Task.type == TaskType.ANNOTATION)
            .where(Task.status == TaskStatus.COMPLETED)
        )
        completed_tasks = (await db.execute(completed_ann_stmt)).scalars().all()
        for ann_task in completed_tasks:
            await _ensure_validation_tasks(db, ann_task, dataset)

    await db.commit()

    return await _get_dataset_with_counts(db, dataset_id)

import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Task, User, Assignment, Label, Dataset, UserDatasetAccess, AssignmentStatus, TaskStatus, TaskType
from app.api.dependencies import get_current_user, require_roles
from app.api.helpers import _ensure_validation_tasks
from app.schemas.task import TaskCreate, TaskResponse, TaskBatchCreate
from app.schemas.label import LabelSubmit, LabelResponse

router = APIRouter(prefix="/tasks", tags=["Tasks"])


async def _process_validation_verdict(
    db: AsyncSession,
    validation_task: Task,
    dataset: Dataset,
) -> None:
    """Подсчитывает голоса по validation-задаче и применяет вердикт."""
    labels_stmt = (
        select(Label)
        .join(Assignment, Label.assignment_id == Assignment.id)
        .where(Assignment.task_id == validation_task.id)
        .where(Assignment.status == AssignmentStatus.DONE)
    )
    labels = (await db.execute(labels_stmt)).scalars().all()

    approve_count = sum(1 for l in labels if l.result.get('is_correct') is True)
    reject_count = len(labels) - approve_count

    meta = validation_task.task_metadata or {}
    annotation_label_id_str = meta.get('annotation_label_id')
    if not annotation_label_id_str:
        return

    annotation_label = await db.get(Label, uuid.UUID(annotation_label_id_str))
    if not annotation_label:
        return

    # При равенстве голосов считаем одобренным
    if reject_count < approve_count:
        annotation_label.is_validated = True
        return

    # Большинство отклонило — откатываем исходную разметку
    annotation_assignment = await db.get(Assignment, annotation_label.assignment_id)
    if not annotation_assignment:
        return

    stmt_task = (
        select(Task)
        .where(Task.id == annotation_assignment.task_id)
        .with_for_update()  # Ждем снятия блокировки, если кто-то другой тоже меняет счетчик
    )
    annotation_task = (await db.execute(stmt_task)).scalar_one_or_none()
    if not annotation_task:
        return

    # Возвращаем задачу в пул
    annotation_task.completed_answers = max(0, annotation_task.completed_answers - 1)
    if annotation_task.completed_answers < dataset.required_answers:
        annotation_task.status = TaskStatus.PENDING

    # Удаляем лейбл и ассайнмент (явный порядок: сначала child, потом parent)
    await db.delete(annotation_label)
    await db.delete(annotation_assignment)

    # Возвращаем слот в счётчик разметки аннотатора
    access_stmt = select(UserDatasetAccess).where(
        UserDatasetAccess.user_id == annotation_assignment.user_id,
        UserDatasetAccess.dataset_id == annotation_task.dataset_id,
    ).with_for_update()
    access = (await db.execute(access_stmt)).scalar_one_or_none()
    if access is not None:
        access.tasks_done = max(0, access.tasks_done - 1)


@router.post("/", response_model=TaskResponse)
async def create_task(
    task_in: TaskCreate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles(["admin"]))
):
    """Добавить одну задачу в датасет"""
    dataset = await db.get(Dataset, task_in.dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    new_task = Task(
        dataset_id=task_in.dataset_id,
        url=task_in.url,
        type=TaskType.ANNOTATION,
        task_metadata=task_in.task_metadata,
    )
    db.add(new_task)
    dataset.tasks_count += 1
    await db.commit()
    await db.refresh(new_task)
    return new_task


@router.post("/batch", status_code=201)
async def create_tasks_batch(
    batch_in: TaskBatchCreate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles(["admin"]))
):
    """Массовая загрузка задач в датасет"""
    dataset = await db.get(Dataset, batch_in.dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    new_tasks = [
        Task(dataset_id=batch_in.dataset_id, url=url, type=TaskType.ANNOTATION)
        for url in batch_in.urls
    ]
    db.add_all(new_tasks)
    dataset.tasks_count += len(new_tasks)
    await db.commit()
    return {"status": "success", "added": len(new_tasks)}


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles(["admin"]))
):
    """Удалить задачу"""
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    if task.type == TaskType.VALIDATION:
        raise HTTPException(status_code=400, detail="Validation-задачи управляются автоматически и не могут быть удалены напрямую.")

    # Корректируем tasks_done у всех, кто выполнил эту аннотационную задачу
    if task.type == TaskType.ANNOTATION:
        done_assignments = (await db.execute(
            select(Assignment).where(
                Assignment.task_id == task_id,
                Assignment.status == AssignmentStatus.DONE,
            )
        )).scalars().all()
        for assignment in done_assignments:
            access = (await db.execute(
                select(UserDatasetAccess).where(
                    UserDatasetAccess.user_id == assignment.user_id,
                    UserDatasetAccess.dataset_id == task.dataset_id,
                )
            )).scalar_one_or_none()
            if access:
                access.tasks_done = max(0, access.tasks_done - 1)

        dataset = await db.get(Dataset, task.dataset_id)
        if dataset:
            dataset.tasks_count = max(0, dataset.tasks_count - 1)

        # Удаляем validation-задачи
        val_tasks = (await db.execute(
            select(Task)
            .where(Task.dataset_id == task.dataset_id)
            .where(Task.type == TaskType.VALIDATION)
            .where(Task.task_metadata['annotation_task_id'].astext == str(task_id))
        )).scalars().all()
        for vt in val_tasks:
            await db.delete(vt)

    await db.delete(task)
    await db.commit()


@router.put("/{task_id}/labels", response_model=LabelResponse)
async def submit_label(
        task_id: uuid.UUID,
        label_in: LabelSubmit,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    """Сохранить или перезаписать разметку / вердикт валидации для активного ассайнмента."""
    stmt = select(Assignment).where(
        Assignment.task_id == task_id,
        Assignment.user_id == current_user.id,
        Assignment.status.in_([AssignmentStatus.IN_PROGRESS, AssignmentStatus.DONE]),
    )
    assignment = (await db.execute(stmt)).scalar_one_or_none()

    if not assignment:
        raise HTTPException(
            status_code=400,
            detail="Нет активного задания для этой задачи. Сначала получите задачу через /next."
        )

    # 1. БЛОКИРУЕМ ЗАДАЧУ (TASK) ПЕРЕД ЛЮБЫМИ ИЗМЕНЕНИЯМИ СЧЕТЧИКОВ
    # Если кто-то другой сейчас тоже сдает эту задачу, наш запрос подождет здесь
    task_stmt = select(Task).where(Task.id == task_id).with_for_update()
    task = (await db.execute(task_stmt)).scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    # Ленивая проверка истечения
    if assignment.status == AssignmentStatus.IN_PROGRESS and assignment.expires_at < datetime.utcnow():
        task.active_assignments = max(0, task.active_assignments - 1)
        await db.delete(assignment)
        await db.commit()
        raise HTTPException(status_code=410, detail="Время на выполнение задания истекло. Получите новую задачу.")

    # Повторная отправка запрещена
    label_stmt = select(Label).where(Label.assignment_id == assignment.id)
    existing_label = (await db.execute(label_stmt)).scalar_one_or_none()

    if existing_label is not None:
        raise HTTPException(status_code=409, detail="Разметка уже отправлена и не может быть изменена.")

    dataset = await db.get(Dataset, task.dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")

    # Проверка разрешённых инструментов (только для аннотационных задач)
    if task.type == TaskType.ANNOTATION:
        allowed_tools: list | None = (dataset.settings or {}).get('allowed_tools')
        if allowed_tools:
            for shape in label_in.data.get('result', []):
                tool = shape.get('shape')
                if tool and tool not in allowed_tools:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Инструмент '{tool}' не разрешён для этого датасета. Разрешены: {', '.join(str(t) for t in allowed_tools)}",
                    )

    # Первый (и единственный) сабмит
    label = Label(assignment_id=assignment.id, result=label_in.data)
    db.add(label)

    if assignment.status == AssignmentStatus.IN_PROGRESS:
        assignment.status = AssignmentStatus.DONE

        task.active_assignments = max(0, task.active_assignments - 1)
        task.completed_answers += 1

        quorum = dataset.validation_quorum if task.type == TaskType.VALIDATION else dataset.required_answers

        if task.completed_answers >= quorum:
            task.status = TaskStatus.COMPLETED

            if task.type == TaskType.VALIDATION:
                await db.flush()
                await _process_validation_verdict(db, task, dataset)

        # Засчитываем выполненную задачу в лимит (и аннотация, и валидация)
        access_stmt = select(UserDatasetAccess).where(
            UserDatasetAccess.user_id == current_user.id,
            UserDatasetAccess.dataset_id == task.dataset_id,
        ).with_for_update()

        access = (await db.execute(access_stmt)).scalar_one_or_none()
        if access is not None:
            access.tasks_done += 1

        if task.type == TaskType.ANNOTATION:
            if dataset.requires_validation and task.completed_answers >= dataset.required_answers:
                await db.flush()
                await _ensure_validation_tasks(db, task, dataset)

    await db.commit()
    await db.refresh(label)
    return label
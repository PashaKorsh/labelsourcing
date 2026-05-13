import hashlib
import hmac
import time
import uuid
from urllib.parse import quote
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
import httpx

from app.database import get_db
from app.models import Task, User, Assignment, Label, Dataset, UserDatasetAccess, AssignmentStatus, TaskStatus, DatasetSourceType
from app.api.dependencies import get_current_user, require_roles
from app.schemas.task import TaskCreate, TaskResponse, TaskBatchCreate
from app.schemas.label import LabelSubmit, LabelResponse

router = APIRouter(prefix="/tasks", tags=["Tasks"])


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
        type=task_in.type,
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
        Task(dataset_id=batch_in.dataset_id, url=url, type=batch_in.type)
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

    # Корректируем labeled_count у всех, кто выполнил эту задачу,
    # иначе они могут оказаться заблокированы из-за завышенного счётчика.
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
            access.labeled_count = max(0, access.labeled_count - 1)

    dataset = await db.get(Dataset, task.dataset_id)
    if dataset:
        dataset.tasks_count = max(0, dataset.tasks_count - 1)
    await db.delete(task)
    await db.commit()


@router.put("/{task_id}/labels", response_model=LabelResponse)
async def submit_label(
    task_id: uuid.UUID,
    label_in: LabelSubmit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Сохранить или перезаписать разметку для активного ассайнмента.
    Первый сабмит: создаёт Label, помечает Assignment как done, обновляет счётчики задачи.
    Повторный сабмит: перезаписывает результат без изменения счётчиков.
    """
    stmt = select(Assignment).where(
        Assignment.task_id == task_id,
        Assignment.user_id == current_user.id,
        Assignment.status.in_([AssignmentStatus.IN_PROGRESS, AssignmentStatus.DONE]),
    )
    result = await db.execute(stmt)
    assignment = result.scalar_one_or_none()

    if not assignment:
        raise HTTPException(
            status_code=400,
            detail="Нет активного задания для этой задачи. Сначала получите задачу через /next."
        )

    # Ленивая проверка истечения: помечаем expired и исправляем счётчик
    if assignment.status == AssignmentStatus.IN_PROGRESS and assignment.expires_at < datetime.utcnow():
        task_obj = await db.get(Task, task_id)
        if task_obj:
            task_obj.active_assignments = max(0, task_obj.active_assignments - 1)
        assignment.status = AssignmentStatus.EXPIRED
        await db.commit()
        raise HTTPException(status_code=410, detail="Время на выполнение задания истекло. Получите новую задачу.")

    # Проверяем, есть ли уже сохранённая разметка для этого ассайнмента
    label_stmt = select(Label).where(Label.assignment_id == assignment.id)
    label_result = await db.execute(label_stmt)
    existing_label = label_result.scalar_one_or_none()

    # Повторный сабмит — просто обновляем результат
    if existing_label is not None:
        existing_label.result = label_in.data
        await db.commit()
        await db.refresh(existing_label)
        return existing_label

    # Первый сабмит — создаём label и обновляем счётчики
    label = Label(assignment_id=assignment.id, result=label_in.data)
    db.add(label)

    if assignment.status == AssignmentStatus.IN_PROGRESS:
        assignment.status = AssignmentStatus.DONE

        task = await db.get(Task, task_id)
        task.active_assignments = max(0, task.active_assignments - 1)
        task.completed_answers += 1

        dataset = await db.get(Dataset, task.dataset_id)
        if task.completed_answers >= dataset.required_answers:
            task.status = TaskStatus.COMPLETED

        access_stmt = select(UserDatasetAccess).where(
            UserDatasetAccess.user_id == current_user.id,
            UserDatasetAccess.dataset_id == task.dataset_id,
        )
        access = (await db.execute(access_stmt)).scalar_one_or_none()
        if access is not None:
            access.labeled_count += 1

    await db.commit()
    await db.refresh(label)
    return label


@router.get("/{task_id}/image")
async def proxy_task_image(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Проксирует картинку с локального агента владельца датасета."""
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    stmt = (
        select(Dataset)
        .options(selectinload(Dataset.local_agent))
        .where(Dataset.id == task.dataset_id)
    )
    dataset = (await db.execute(stmt)).scalar_one_or_none()

    if dataset.source_type != DatasetSourceType.LOCAL_AGENT or not dataset.local_agent:
        raise HTTPException(status_code=400, detail="Задача не привязана к локальному агенту")

    agent = dataset.local_agent
    if not agent.is_active:
        raise HTTPException(status_code=503, detail="Агент отключён")

    timestamp = int(time.time())
    signature = hmac.new(
        key=agent.device_token.encode(),
        msg=f"{task_id}:{timestamp}".encode(),
        digestmod=hashlib.sha256,
    ).hexdigest()

    url = f"{agent.base_url}/datasets/{dataset.id}/files/{quote(task.url, safe='/')}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers={
                "X-Request-Id": str(task_id),
                "X-Timestamp": str(timestamp),
                "X-Signature": signature,
            })
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Агент недоступен")

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Агент вернул ошибку")

    return Response(
        content=resp.content,
        media_type=resp.headers.get("content-type", "image/jpeg"),
    )

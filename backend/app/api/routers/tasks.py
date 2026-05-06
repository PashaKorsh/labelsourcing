import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models import Task, User, Assignment, Label, Dataset, UserDatasetAccess, AssignmentStatus, TaskStatus
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
    new_task = Task(
        dataset_id=task_in.dataset_id,
        url=task_in.url,
        type=task_in.type,
        task_metadata=task_in.task_metadata,
    )
    db.add(new_task)
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
    new_tasks = [
        Task(dataset_id=batch_in.dataset_id, url=url, type=batch_in.type)
        for url in batch_in.urls
    ]
    db.add_all(new_tasks)
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

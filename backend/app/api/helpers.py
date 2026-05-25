from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Task, Label, Assignment, Dataset, AssignmentStatus, TaskType


async def _ensure_validation_tasks(
    db: AsyncSession,
    annotation_task: Task,
    dataset: Dataset,
) -> None:
    """Создаёт validation-задачи для всех DONE-разметок аннотационной задачи.
    Дедупликация по annotation_label_id — безопасно вызывать повторно."""
    all_labels_stmt = (
        select(Label, Assignment)
        .join(Assignment, Label.assignment_id == Assignment.id)
        .where(Assignment.task_id == annotation_task.id)
        .where(Assignment.status == AssignmentStatus.DONE)
    )
    all_rows = (await db.execute(all_labels_stmt)).all()

    for done_label, done_assignment in all_rows:
        existing = (await db.execute(
            select(Task.id)
            .where(Task.dataset_id == dataset.id)
            .where(Task.type == TaskType.VALIDATION)
            .where(Task.task_metadata['annotation_label_id'].astext == str(done_label.id))
            .limit(1)
        )).scalar_one_or_none()
        if existing:
            continue

        ann_data = done_label.result.get('result', [])
        db.add(Task(
            dataset_id=dataset.id,
            url=annotation_task.url,
            type=TaskType.VALIDATION,
            task_metadata={
                'annotation_task_id': str(annotation_task.id),
                'annotation_label_id': str(done_label.id),
                'annotator_id': str(done_assignment.user_id),
                'annotations': ann_data,
            },
        ))

"""Clean up assignment statuses and add label validation flag

Revision ID: f2e3d4c5b6a7
Revises: e1f2a3b4c5d6
Create Date: 2026-06-05
"""
from typing import Union
import sqlalchemy as sa
from alembic import op


revision: str = 'f2e3d4c5b6a7'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Добавляем флаг is_validated на лейблы (False по умолчанию)
    op.add_column('labels', sa.Column('is_validated', sa.Boolean(), server_default='false', nullable=False))

    # 2. Помечаем уже одобренные лейблы: те, для которых существует COMPLETED validation-задача.
    #    Если лейбл ещё существует и val-задача завершена — значит вердикт был «одобрено»
    #    (при отклонении лейбл удаляется в _process_validation_verdict).
    op.execute("""
        UPDATE labels
        SET is_validated = true
        WHERE id::text IN (
            SELECT metadata->>'annotation_label_id'
            FROM tasks
            WHERE type = 'validation'
            AND status = 'completed'
            AND metadata->>'annotation_label_id' IS NOT NULL
        )
    """)

    # 3. Частичный индекс для быстрого поиска непроверенных лейблов пользователя
    op.create_index(
        'ix_labels_not_validated',
        'labels',
        ['assignment_id'],
        postgresql_where=sa.text('is_validated = false'),
    )

    # 4. Удаляем индексы, включающие колонку status в assignments — нужны для ALTER TYPE
    op.drop_index('ix_assignments_user_status', table_name='assignments')
    op.drop_index('ix_assignments_live_count', table_name='assignments')

    # 5. Удаляем все устаревшие ассайнменты: expired (брошены пользователем) и rejected
    #    (теперь при реджекте/истечении ассайнмент удаляется сразу, а не помечается)
    op.execute("DELETE FROM assignments WHERE status IN ('expired', 'rejected')")

    # 6. Пересоздаём enum assignment_status без значений expired и rejected
    op.execute("ALTER TYPE assignment_status RENAME TO assignment_status_old")
    op.execute("CREATE TYPE assignment_status AS ENUM ('in_progress', 'done')")
    op.execute(
        "ALTER TABLE assignments "
        "ALTER COLUMN status TYPE assignment_status "
        "USING status::text::assignment_status"
    )
    op.execute("DROP TYPE assignment_status_old")

    # 7. Переименовываем значение датасет-статуса: completed → closed
    op.execute("ALTER TYPE dataset_status RENAME VALUE 'completed' TO 'closed'")

    # 8. Восстанавливаем индексы
    op.create_index('ix_assignments_user_status', 'assignments', ['user_id', 'status', 'task_id'])
    op.create_index('ix_assignments_live_count', 'assignments', ['task_id', 'status', 'expires_at'])


def downgrade() -> None:
    op.drop_index('ix_labels_not_validated', table_name='labels')
    op.drop_column('labels', 'is_validated')

    op.drop_index('ix_assignments_user_status', table_name='assignments')
    op.drop_index('ix_assignments_live_count', table_name='assignments')

    op.execute("ALTER TYPE assignment_status RENAME TO assignment_status_new")
    op.execute("CREATE TYPE assignment_status AS ENUM ('in_progress', 'done', 'expired', 'rejected')")
    op.execute(
        "ALTER TABLE assignments "
        "ALTER COLUMN status TYPE assignment_status "
        "USING status::text::assignment_status"
    )
    op.execute("DROP TYPE assignment_status_new")

    op.execute("ALTER TYPE dataset_status RENAME VALUE 'closed' TO 'completed'")

    op.create_index('ix_assignments_user_status', 'assignments', ['user_id', 'status', 'task_id'])
    op.create_index('ix_assignments_live_count', 'assignments', ['task_id', 'status', 'expires_at'])

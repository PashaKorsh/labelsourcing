"""Indexes for user-status subqueries in GET /datasets/

Revision ID: e1f2a3b4c5d6
Revises: a9b8c7d6e5f4
Create Date: 2026-05-31
"""
from typing import Union
from alembic import op


revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Покрывающий индекс для подзапросов статуса пользователя в GET /datasets/.
    # Все четыре подзапроса (_get_user_status) фильтруют tasks по комбинации
    # (dataset_id, type, status): без индекса — seq scan всей таблицы tasks.
    op.create_index(
        'ix_tasks_dataset_type_status',
        'tasks',
        ['dataset_id', 'type', 'status'],
    )

    # Индекс для подзапросов, стартующих с user_id в таблице assignments.
    # Используется в user_done_on_pending_ann_sq и has_user_rejected_sq:
    #   WHERE user_id = ? AND status IN ('done', 'rejected')
    # task_id включён как covering-колонка, чтобы затем джойнить tasks без heap fetch.
    op.create_index(
        'ix_assignments_user_status',
        'assignments',
        ['user_id', 'status', 'task_id'],
    )

    # Восстанавливаем индекс для _make_live_count_subquery в GET /datasets/{id}/next:
    #   WHERE task_id = ? AND status = 'in_progress' AND expires_at > now()
    # Был создан в c7d8e9f0a1b2, случайно удалён autogenerate в 68900a16ad81.
    op.create_index(
        'ix_assignments_live_count',
        'assignments',
        ['task_id', 'status', 'expires_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_assignments_live_count', table_name='assignments')
    op.drop_index('ix_assignments_user_status', table_name='assignments')
    op.drop_index('ix_tasks_dataset_type_status', table_name='tasks')

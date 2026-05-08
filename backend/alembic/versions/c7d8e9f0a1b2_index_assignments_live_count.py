"""Index on assignments for live_count_sq subquery

Revision ID: c7d8e9f0a1b2
Revises: b5c6d7e8f9a0
Create Date: 2026-05-08
"""
from typing import Union
from alembic import op


revision: str = 'c7d8e9f0a1b2'
down_revision: Union[str, None] = 'b5c6d7e8f9a0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Покрывающий индекс для live_count_sq в /next:
    #   WHERE task_id = ? AND status = 'in_progress' AND expires_at > now()
    # Позволяет PostgreSQL выполнять каждый подзапрос за O(log n) вместо seq scan.
    op.create_index(
        'ix_assignments_live_count',
        'assignments',
        ['task_id', 'status', 'expires_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_assignments_live_count', table_name='assignments')

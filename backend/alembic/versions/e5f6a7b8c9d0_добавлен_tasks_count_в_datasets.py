"""Добавлен tasks_count в datasets

Revision ID: e5f6a7b8c9d0
Revises: f1a2b3c4d5e6
Create Date: 2026-05-10
"""
from typing import Union
from alembic import op
import sqlalchemy as sa


revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('datasets', sa.Column('tasks_count', sa.Integer(), server_default='0', nullable=False))
    op.execute("""
        UPDATE datasets
        SET tasks_count = (SELECT COUNT(*) FROM tasks WHERE tasks.dataset_id = datasets.id)
    """)


def downgrade() -> None:
    op.drop_column('datasets', 'tasks_count')

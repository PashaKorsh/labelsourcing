"""Validation pipeline: task_type enum + dataset validation fields

Revision ID: c3d4e5f6a7b8
Revises: f7a8b9c0d1e2
Create Date: 2026-05-10
"""
from typing import Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'f7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE нельзя откатить транзакцией, поэтому используем IF NOT EXISTS
    op.execute("ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'validation'")

    op.add_column('datasets', sa.Column('requires_validation', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('datasets', sa.Column('validation_quorum', sa.Integer(), server_default='1', nullable=False))


def downgrade() -> None:
    op.drop_column('datasets', 'validation_quorum')
    op.drop_column('datasets', 'requires_validation')
    # Значение enum откатить нельзя без пересоздания типа — пропускаем

"""добавлен color в теги

Revision ID: a3f1c8e92d45
Revises: 196bf693a6f5
Create Date: 2026-05-03 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3f1c8e92d45'
down_revision: Union[str, Sequence[str], None] = '196bf693a6f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tags', sa.Column('color', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('tags', 'color')

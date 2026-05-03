"""добавлен annotation_labels в datasets

Revision ID: e6f4a1b92c30
Revises: c4e2d9f83b17
Create Date: 2026-05-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'e6f4a1b92c30'
down_revision: Union[str, None] = 'c4e2d9f83b17'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('datasets', sa.Column('annotation_labels', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('datasets', 'annotation_labels')

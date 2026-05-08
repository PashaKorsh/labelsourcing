"""добавлен dataset_id в labels

Revision ID: b7d2a1f04e89
Revises: a3f1c8e92d45
Create Date: 2026-05-03 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'b7d2a1f04e89'
down_revision: Union[str, Sequence[str], None] = 'a3f1c8e92d45'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('labels', sa.Column(
        'dataset_id',
        UUID(as_uuid=True),
        sa.ForeignKey('datasets.id', ondelete='CASCADE'),
        nullable=True
    ))


def downgrade() -> None:
    op.drop_column('labels', 'dataset_id')

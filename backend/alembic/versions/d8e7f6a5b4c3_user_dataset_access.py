"""user_dataset_access

Revision ID: d8e7f6a5b4c3
Revises: f3a9c2e81b47
Create Date: 2026-05-06 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'd8e7f6a5b4c3'
down_revision: Union[str, None] = 'f3a9c2e81b47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('datasets', sa.Column('default_labeling_limit', sa.Integer(), server_default='50', nullable=False))

    op.create_table(
        'user_dataset_access',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('dataset_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('labeling_limit', sa.Integer(), server_default='50', nullable=False),
        sa.Column('labeled_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('can_label', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('can_validate', sa.Boolean(), server_default='false', nullable=False),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'dataset_id'),
    )


def downgrade() -> None:
    op.drop_table('user_dataset_access')
    op.drop_column('datasets', 'default_labeling_limit')

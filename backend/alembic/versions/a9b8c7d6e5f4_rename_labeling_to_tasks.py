"""rename labeling_limit/labeled_count to tasks_limit/tasks_done

Revision ID: a9b8c7d6e5f4
Revises: 68900a16ad81
Create Date: 2026-05-26 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a9b8c7d6e5f4'
down_revision: Union[str, None] = '68900a16ad81'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('datasets', 'default_labeling_limit', new_column_name='default_tasks_limit')
    op.alter_column('user_dataset_access', 'labeling_limit', new_column_name='tasks_limit')
    op.alter_column('user_dataset_access', 'labeled_count', new_column_name='tasks_done')


def downgrade() -> None:
    op.alter_column('datasets', 'default_tasks_limit', new_column_name='default_labeling_limit')
    op.alter_column('user_dataset_access', 'tasks_limit', new_column_name='labeling_limit')
    op.alter_column('user_dataset_access', 'tasks_done', new_column_name='labeled_count')

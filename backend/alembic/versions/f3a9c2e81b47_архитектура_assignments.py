"""архитектура assignments

Revision ID: f3a9c2e81b47
Revises: e6f4a1b92c30
Create Date: 2026-05-05 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f3a9c2e81b47'
down_revision: Union[str, None] = 'e6f4a1b92c30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Новые поля датасета
    op.add_column('datasets', sa.Column('required_answers', sa.Integer(), server_default='3', nullable=False))
    op.add_column('datasets', sa.Column('status', sa.String(50), server_default='active', nullable=False))

    # Новые поля задачи
    op.add_column('tasks', sa.Column('type', sa.String(50), server_default='annotation', nullable=False))
    op.add_column('tasks', sa.Column('completed_answers', sa.Integer(), server_default='0', nullable=False))
    op.add_column('tasks', sa.Column('active_assignments', sa.Integer(), server_default='0', nullable=False))
    op.add_column('tasks', sa.Column('status', sa.String(50), server_default='pending', nullable=False))
    op.add_column('tasks', sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False))

    # Таблица ассайнментов
    op.create_table(
        'assignments',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status', sa.String(50), nullable=False),
        sa.Column('assigned_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('task_id', 'user_id', name='unique_user_task'),
    )

    # Пересоздаём таблицу labels под новую архитектуру
    op.drop_table('labels')
    op.create_table(
        'labels',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('assignment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('result', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['assignment_id'], ['assignments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('assignment_id'),
    )


def downgrade() -> None:
    op.drop_table('labels')
    op.create_table(
        'labels',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('dataset_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('status', sa.String(), server_default='pending', nullable=False),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.drop_table('assignments')

    op.drop_column('tasks', 'created_at')
    op.drop_column('tasks', 'status')
    op.drop_column('tasks', 'active_assignments')
    op.drop_column('tasks', 'completed_answers')
    op.drop_column('tasks', 'type')

    op.drop_column('datasets', 'status')
    op.drop_column('datasets', 'required_answers')

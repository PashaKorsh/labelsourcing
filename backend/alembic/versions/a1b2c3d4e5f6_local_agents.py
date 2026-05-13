"""Добавлены local_agents, pairing_codes, source_type в datasets

Revision ID: a1b2c3d4e5f6
Revises: e5f6a7b8c9d0
Create Date: 2026-05-11
"""
from typing import Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE dataset_source_type AS ENUM ('external_url', 'local_agent')")

    op.create_table(
        'local_agents',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('device_token', sa.Text(), nullable=False, unique=True),
        sa.Column('base_url', sa.Text(), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('last_seen_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    )

    op.create_table(
        'pairing_codes',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('code', sa.Text(), nullable=False, unique=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    )

    op.add_column('datasets', sa.Column(
        'source_type',
        sa.Enum('external_url', 'local_agent', name='dataset_source_type', create_type=False),
        server_default='external_url',
        nullable=False,
    ))
    op.add_column('datasets', sa.Column(
        'local_agent_id',
        UUID(as_uuid=True),
        sa.ForeignKey('local_agents.id', ondelete='SET NULL'),
        nullable=True,
    ))


def downgrade() -> None:
    op.drop_column('datasets', 'local_agent_id')
    op.drop_column('datasets', 'source_type')
    op.drop_table('pairing_codes')
    op.drop_table('local_agents')
    op.execute("DROP TYPE dataset_source_type")

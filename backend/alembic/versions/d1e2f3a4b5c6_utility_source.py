"""utilities, pairing codes, dataset source_type/utility_id

Revision ID: d1e2f3a4b5c6
Revises: a4b5c6d7e8f9
Create Date: 2026-06-11 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'a4b5c6d7e8f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'utilities',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('owner_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('token_hash', sa.Text(), nullable=False),
        sa.Column('public_base_url', sa.Text(), nullable=True),
        sa.Column('last_seen_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'utility_pairing_codes',
        sa.Column('code', sa.Text(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('code'),
    )

    op.execute("CREATE TYPE source_type AS ENUM ('url', 'utility')")
    op.add_column(
        'datasets',
        sa.Column('source_type', sa.Enum('url', 'utility', name='source_type'),
                  server_default='url', nullable=False),
    )
    op.add_column(
        'datasets',
        sa.Column('utility_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_datasets_utility_id', 'datasets', 'utilities',
        ['utility_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_datasets_utility_id', 'datasets', type_='foreignkey')
    op.drop_column('datasets', 'utility_id')
    op.drop_column('datasets', 'source_type')
    op.execute("DROP TYPE source_type")
    op.drop_table('utility_pairing_codes')
    op.drop_table('utilities')

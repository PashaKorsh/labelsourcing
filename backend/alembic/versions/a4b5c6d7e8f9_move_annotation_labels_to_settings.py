"""move annotation_labels into settings

Revision ID: a4b5c6d7e8f9
Revises: f2e3d4c5b6a7
Create Date: 2026-06-07
"""
from typing import Union
from alembic import op


revision: str = 'a4b5c6d7e8f9'
down_revision: Union[str, None] = 'f2e3d4c5b6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Copy annotation_labels column value into settings JSONB under the same key
    op.execute("""
        UPDATE datasets
        SET settings = jsonb_set(settings, '{annotation_labels}', annotation_labels)
        WHERE annotation_labels IS NOT NULL
    """)
    op.drop_column('datasets', 'annotation_labels')


def downgrade() -> None:
    import sqlalchemy as sa
    from sqlalchemy.dialects import postgresql
    op.add_column('datasets', sa.Column(
        'annotation_labels', postgresql.JSONB(astext_type=sa.Text()), nullable=True
    ))
    op.execute("""
        UPDATE datasets
        SET annotation_labels = settings->'annotation_labels'
        WHERE settings ? 'annotation_labels'
    """)

"""Enum types for assignment, task, and dataset statuses

Revision ID: b5c6d7e8f9a0
Revises: d8e7f6a5b4c3
Create Date: 2026-05-06
"""
from typing import Union
from alembic import op


revision: str = 'b5c6d7e8f9a0'
down_revision: Union[str, None] = 'd8e7f6a5b4c3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop server defaults before type conversion — they're plain text literals
    # and PostgreSQL won't accept them after the column becomes an enum type.
    op.execute("ALTER TABLE tasks ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TABLE tasks ALTER COLUMN type DROP DEFAULT")
    op.execute("ALTER TABLE datasets ALTER COLUMN status DROP DEFAULT")

    op.execute("CREATE TYPE assignment_status AS ENUM ('in_progress', 'done', 'expired', 'rejected')")
    op.execute("CREATE TYPE task_status AS ENUM ('pending', 'completed')")
    op.execute("CREATE TYPE task_type AS ENUM ('annotation')")
    op.execute("CREATE TYPE dataset_status AS ENUM ('active', 'completed')")

    op.execute("ALTER TABLE assignments ALTER COLUMN status TYPE assignment_status USING status::assignment_status")
    op.execute("ALTER TABLE tasks ALTER COLUMN status TYPE task_status USING status::task_status")
    op.execute("ALTER TABLE tasks ALTER COLUMN type TYPE task_type USING type::task_type")
    op.execute("ALTER TABLE datasets ALTER COLUMN status TYPE dataset_status USING status::dataset_status")


def downgrade() -> None:
    op.execute("ALTER TABLE assignments ALTER COLUMN status TYPE VARCHAR(50) USING status::text")
    op.execute("ALTER TABLE tasks ALTER COLUMN status TYPE VARCHAR(50) USING status::text")
    op.execute("ALTER TABLE tasks ALTER COLUMN type TYPE VARCHAR(50) USING type::text")
    op.execute("ALTER TABLE datasets ALTER COLUMN status TYPE VARCHAR(50) USING status::text")

    op.execute("ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'pending'")
    op.execute("ALTER TABLE tasks ALTER COLUMN type SET DEFAULT 'annotation'")
    op.execute("ALTER TABLE datasets ALTER COLUMN status SET DEFAULT 'active'")

    op.execute("DROP TYPE assignment_status")
    op.execute("DROP TYPE task_status")
    op.execute("DROP TYPE task_type")
    op.execute("DROP TYPE dataset_status")

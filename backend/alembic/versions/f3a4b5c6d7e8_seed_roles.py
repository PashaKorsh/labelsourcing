"""seed admin/moderator roles

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-06-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'f3a4b5c6d7e8'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for name in ("admin", "moderator"):
        op.execute(
            f"INSERT INTO roles (id, name) "
            f"SELECT gen_random_uuid(), '{name}' "
            f"WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = '{name}')"
        )


def downgrade() -> None:
    pass

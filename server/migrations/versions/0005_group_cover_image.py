"""add GroupCoverImage table for uploaded group cover photos

Revision ID: 0005
Revises: 0004
Create Date: 2026-02-20

Adds:
  - groupcoverimage table (id, image_code, uploaded_by_user_code, blob_data,
    mime_type, file_size, width, height, created_at)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TSTZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "groupcoverimage",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("image_code", sa.String, nullable=False, unique=True, index=True),
        sa.Column(
            "uploaded_by_user_code",
            sa.String,
            sa.ForeignKey("user.user_code"),
            nullable=False,
            index=True,
        ),
        sa.Column("blob_data", sa.LargeBinary, nullable=False),
        sa.Column("mime_type", sa.String, nullable=False),
        sa.Column("file_size", sa.Integer, nullable=False),
        sa.Column("width", sa.Integer, nullable=False),
        sa.Column("height", sa.Integer, nullable=False),
        sa.Column("created_at", _TSTZ, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("groupcoverimage")

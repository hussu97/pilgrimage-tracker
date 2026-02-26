"""add gcs_url column to image tables; make blob_data nullable

Revision ID: 0015
Revises: 0014
Create Date: 2026-02-26

Adds:
  - gcs_url (nullable String) to placeimage, reviewimage, groupcoverimage
  - Makes blob_data nullable on reviewimage and groupcoverimage (SQLite-compat batch)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # placeimage — add gcs_url (blob_data already nullable)
    op.add_column("placeimage", sa.Column("gcs_url", sa.String, nullable=True))

    # reviewimage — add gcs_url; make blob_data nullable via batch (SQLite compat)
    with op.batch_alter_table("reviewimage") as batch_op:
        batch_op.add_column(sa.Column("gcs_url", sa.String, nullable=True))
        batch_op.alter_column("blob_data", existing_type=sa.LargeBinary, nullable=True)

    # groupcoverimage — add gcs_url; make blob_data nullable via batch
    with op.batch_alter_table("groupcoverimage") as batch_op:
        batch_op.add_column(sa.Column("gcs_url", sa.String, nullable=True))
        batch_op.alter_column("blob_data", existing_type=sa.LargeBinary, nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("groupcoverimage") as batch_op:
        batch_op.drop_column("gcs_url")
        batch_op.alter_column("blob_data", existing_type=sa.LargeBinary, nullable=False)

    with op.batch_alter_table("reviewimage") as batch_op:
        batch_op.drop_column("gcs_url")
        batch_op.alter_column("blob_data", existing_type=sa.LargeBinary, nullable=False)

    op.drop_column("placeimage", "gcs_url")

"""groups revamp: add group_code to check_in, cover/dates to group, GroupPlaceNote table

Revision ID: 0004
Revises: 0003
Create Date: 2026-02-19

Adds:
  - checkin.group_code (nullable FK → group.group_code, indexed)
  - group.cover_image_url (nullable text)
  - group.start_date (nullable date)
  - group.end_date (nullable date)
  - group.updated_at (TIMESTAMPTZ, not null)
  - groupplacenote table (id, note_code, group_code, place_code, user_code, text, created_at)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TSTZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # Drop any leftover temp table from a previous failed batch operation
    tables = inspector.get_table_names()
    if "_alembic_tmp_checkin" in tables:
        op.drop_table("_alembic_tmp_checkin")

    # Add group_code to checkin (idempotent — may already exist from partial run)
    checkin_cols = [c["name"] for c in inspector.get_columns("checkin")]
    if "group_code" not in checkin_cols:
        op.add_column("checkin", sa.Column("group_code", sa.String(), nullable=True))

    checkin_indexes = {i["name"] for i in inspector.get_indexes("checkin")}
    if "ix_checkin_group_code" not in checkin_indexes:
        op.create_index("ix_checkin_group_code", "checkin", ["group_code"])

    # Add new fields to group using batch_alter_table so SQLite can handle
    # NOT NULL + server_default (batch mode recreates the table).
    group_cols = {c["name"] for c in inspector.get_columns("group")}
    cols_to_add = []
    if "cover_image_url" not in group_cols:
        cols_to_add.append(sa.Column("cover_image_url", sa.String(), nullable=True))
    if "start_date" not in group_cols:
        cols_to_add.append(sa.Column("start_date", sa.Date(), nullable=True))
    if "end_date" not in group_cols:
        cols_to_add.append(sa.Column("end_date", sa.Date(), nullable=True))
    if "updated_at" not in group_cols:
        cols_to_add.append(
            sa.Column(
                "updated_at",
                _TSTZ,
                nullable=False,
                server_default=sa.func.now(),
            )
        )

    if cols_to_add:
        with op.batch_alter_table("group") as batch_op:
            for col in cols_to_add:
                batch_op.add_column(col)

    # Create groupplacenote table
    if "groupplacenote" not in tables:
        op.create_table(
            "groupplacenote",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("note_code", sa.String(), nullable=False, unique=True),
            sa.Column(
                "group_code",
                sa.String(),
                sa.ForeignKey("group.group_code"),
                nullable=False,
            ),
            sa.Column(
                "place_code",
                sa.String(),
                sa.ForeignKey("place.place_code"),
                nullable=False,
            ),
            sa.Column(
                "user_code",
                sa.String(),
                sa.ForeignKey("user.user_code"),
                nullable=False,
            ),
            sa.Column("text", sa.String(), nullable=False),
            sa.Column("created_at", _TSTZ, nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_groupplacenote_group_code", "groupplacenote", ["group_code"])
        op.create_index("ix_groupplacenote_place_code", "groupplacenote", ["place_code"])
        op.create_index("ix_groupplacenote_note_code", "groupplacenote", ["note_code"])


def downgrade() -> None:
    op.drop_table("groupplacenote")

    with op.batch_alter_table("group") as batch_op:
        batch_op.drop_column("updated_at")
        batch_op.drop_column("end_date")
        batch_op.drop_column("start_date")
        batch_op.drop_column("cover_image_url")

    op.drop_index("ix_checkin_group_code", table_name="checkin")
    with op.batch_alter_table("checkin") as batch_op:
        batch_op.drop_constraint("fk_checkin_group_code", type_="foreignkey")
        batch_op.drop_column("group_code")

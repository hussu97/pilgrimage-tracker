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
    # Add group_code to checkin
    op.add_column("checkin", sa.Column("group_code", sa.String(), nullable=True))
    op.create_index("ix_checkin_group_code", "checkin", ["group_code"])
    with op.batch_alter_table("checkin") as batch_op:
        batch_op.create_foreign_key(
            "fk_checkin_group_code",
            "group",
            ["group_code"],
            ["group_code"],
        )

    # Add new fields to group
    op.add_column("group", sa.Column("cover_image_url", sa.String(), nullable=True))
    op.add_column("group", sa.Column("start_date", sa.Date(), nullable=True))
    op.add_column("group", sa.Column("end_date", sa.Date(), nullable=True))
    op.add_column(
        "group",
        sa.Column(
            "updated_at",
            _TSTZ,
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Create groupplacenote table
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

    op.drop_column("group", "updated_at")
    op.drop_column("group", "end_date")
    op.drop_column("group", "start_date")
    op.drop_column("group", "cover_image_url")

    op.drop_index("ix_checkin_group_code", table_name="checkin")
    with op.batch_alter_table("checkin") as batch_op:
        batch_op.drop_constraint("fk_checkin_group_code", type_="foreignkey")
    op.drop_column("checkin", "group_code")

"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-02-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_code", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_user_code", "user", ["user_code"], unique=True)
    op.create_index("ix_user_email", "user", ["email"], unique=True)

    op.create_table(
        "usersettings",
        sa.Column("user_code", sa.String(), nullable=False),
        sa.Column("notifications_on", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("theme", sa.String(), nullable=False, server_default="light"),
        sa.Column("units", sa.String(), nullable=False, server_default="km"),
        sa.Column("language", sa.String(), nullable=False, server_default="en"),
        sa.Column("religions", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["user_code"], ["user.user_code"]),
        sa.PrimaryKeyConstraint("user_code"),
    )

    op.create_table(
        "place",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("place_code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("religion", sa.String(), nullable=False),
        sa.Column("place_type", sa.String(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("address", sa.String(), nullable=False),
        sa.Column("opening_hours", sa.JSON(), nullable=True),
        sa.Column("utc_offset_minutes", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("website_url", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_place_place_code", "place", ["place_code"], unique=True)
    op.create_index("ix_place_name", "place", ["name"], unique=False)
    op.create_index("ix_place_religion", "place", ["religion"], unique=False)
    op.create_index("ix_place_place_type", "place", ["place_type"], unique=False)

    op.create_table(
        "placeimage",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("place_code", sa.String(), nullable=False),
        sa.Column("image_type", sa.String(), nullable=False, server_default="url"),
        sa.Column("url", sa.String(), nullable=True),
        sa.Column("blob_data", sa.LargeBinary(), nullable=True),
        sa.Column("mime_type", sa.String(), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["place_code"], ["place.place_code"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_placeimage_place_code", "placeimage", ["place_code"], unique=False)

    op.create_table(
        "review",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("review_code", sa.String(), nullable=False),
        sa.Column("user_code", sa.String(), nullable=True),
        sa.Column("place_code", sa.String(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("is_anonymous", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("photo_urls", sa.JSON(), nullable=True),
        sa.Column("source", sa.String(), nullable=False, server_default="user"),
        sa.Column("author_name", sa.String(), nullable=True),
        sa.Column("review_time", sa.Integer(), nullable=True),
        sa.Column("language", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["place_code"], ["place.place_code"]),
        sa.ForeignKeyConstraint(["user_code"], ["user.user_code"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_review_review_code", "review", ["review_code"], unique=True)
    op.create_index("ix_review_user_code", "review", ["user_code"], unique=False)
    op.create_index("ix_review_place_code", "review", ["place_code"], unique=False)

    op.create_table(
        "reviewimage",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("review_code", sa.String(), nullable=True),
        sa.Column("uploaded_by_user_code", sa.String(), nullable=False),
        sa.Column("blob_data", sa.LargeBinary(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("attached_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["review_code"], ["review.review_code"]),
        sa.ForeignKeyConstraint(["uploaded_by_user_code"], ["user.user_code"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reviewimage_review_code", "reviewimage", ["review_code"], unique=False)
    op.create_index("ix_reviewimage_uploaded_by_user_code", "reviewimage", ["uploaded_by_user_code"], unique=False)

    op.create_table(
        "checkin",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("check_in_code", sa.String(), nullable=False),
        sa.Column("user_code", sa.String(), nullable=False),
        sa.Column("place_code", sa.String(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("photo_url", sa.String(), nullable=True),
        sa.Column("checked_in_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["place_code"], ["place.place_code"]),
        sa.ForeignKeyConstraint(["user_code"], ["user.user_code"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_checkin_check_in_code", "checkin", ["check_in_code"], unique=True)
    op.create_index("ix_checkin_user_code", "checkin", ["user_code"], unique=False)
    op.create_index("ix_checkin_place_code", "checkin", ["place_code"], unique=False)

    op.create_table(
        "favorite",
        sa.Column("user_code", sa.String(), nullable=False),
        sa.Column("place_code", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["place_code"], ["place.place_code"]),
        sa.ForeignKeyConstraint(["user_code"], ["user.user_code"]),
        sa.PrimaryKeyConstraint("user_code", "place_code"),
    )

    op.create_table(
        "group",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("group_code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by_user_code", sa.String(), nullable=False),
        sa.Column("invite_code", sa.String(), nullable=False),
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("path_place_codes", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_code"], ["user.user_code"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_group_group_code", "group", ["group_code"], unique=True)
    op.create_index("ix_group_name", "group", ["name"], unique=False)
    op.create_index("ix_group_invite_code", "group", ["invite_code"], unique=True)

    op.create_table(
        "groupmember",
        sa.Column("group_code", sa.String(), nullable=False),
        sa.Column("user_code", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="member"),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["group_code"], ["group.group_code"]),
        sa.ForeignKeyConstraint(["user_code"], ["user.user_code"]),
        sa.PrimaryKeyConstraint("group_code", "user_code"),
    )

    op.create_table(
        "notification",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("notification_code", sa.String(), nullable=False),
        sa.Column("user_code", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_code"], ["user.user_code"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notification_notification_code", "notification", ["notification_code"], unique=True)
    op.create_index("ix_notification_user_code", "notification", ["user_code"], unique=False)

    op.create_table(
        "passwordreset",
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("user_code", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_code"], ["user.user_code"]),
        sa.PrimaryKeyConstraint("token"),
    )

    op.create_table(
        "refreshtoken",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("user_code", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_code"], ["user.user_code"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_refreshtoken_token", "refreshtoken", ["token"], unique=True)
    op.create_index("ix_refreshtoken_user_code", "refreshtoken", ["user_code"], unique=False)

    op.create_table(
        "placeattributedefinition",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("attribute_code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("data_type", sa.String(), nullable=False),
        sa.Column("icon", sa.String(), nullable=True),
        sa.Column("label_key", sa.String(), nullable=True),
        sa.Column("is_filterable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_specification", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("religion", sa.String(), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_placeattributedefinition_attribute_code", "placeattributedefinition", ["attribute_code"], unique=True)

    op.create_table(
        "placeattribute",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("place_code", sa.String(), nullable=False),
        sa.Column("attribute_code", sa.String(), nullable=False),
        sa.Column("value_text", sa.Text(), nullable=True),
        sa.Column("value_json", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["attribute_code"], ["placeattributedefinition.attribute_code"]),
        sa.ForeignKeyConstraint(["place_code"], ["place.place_code"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("place_code", "attribute_code"),
    )
    op.create_index("ix_placeattribute_place_code", "placeattribute", ["place_code"], unique=False)
    op.create_index("ix_placeattribute_attribute_code", "placeattribute", ["attribute_code"], unique=False)


def downgrade() -> None:
    op.drop_table("placeattribute")
    op.drop_table("placeattributedefinition")
    op.drop_table("refreshtoken")
    op.drop_table("passwordreset")
    op.drop_table("notification")
    op.drop_table("groupmember")
    op.drop_table("group")
    op.drop_table("favorite")
    op.drop_table("checkin")
    op.drop_table("reviewimage")
    op.drop_table("review")
    op.drop_table("placeimage")
    op.drop_table("place")
    op.drop_table("usersettings")
    op.drop_table("user")

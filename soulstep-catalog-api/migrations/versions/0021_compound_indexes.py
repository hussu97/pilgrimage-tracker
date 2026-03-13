"""add compound indexes for N+1 query patterns

Revision ID: 0021
Revises: 0020
Create Date: 2026-03-13

Adds compound indexes to accelerate the most common multi-column query patterns:
- checkin: user+date ordering, place+user dedup, group+place checklist
- review: place+date ordering
- favorite: place lookups
- contenttranslation: entity+lang bulk lookups
- analyticsevent: event_type+date timeline queries
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # CheckIn compound indexes
    op.create_index("ix_checkin_user_date", "checkin", ["user_code", "checked_in_at"])
    op.create_index("ix_checkin_place_user", "checkin", ["place_code", "user_code"])
    op.create_index("ix_checkin_group_place", "checkin", ["group_code", "place_code"])

    # Review compound index
    op.create_index("ix_review_place_date", "review", ["place_code", "created_at"])

    # Favorite standalone index (for "who favorited this place" queries)
    op.create_index("ix_favorite_place_code", "favorite", ["place_code"])

    # ContentTranslation compound index (entity_code + lang bulk lookups)
    op.create_index(
        "ix_contenttranslation_entity_lang",
        "contenttranslation",
        ["entity_code", "lang"],
    )

    # AnalyticsEvent compound index (event timeline queries)
    op.create_index(
        "ix_analyticsevent_type_date",
        "analytics_event",
        ["event_type", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_analyticsevent_type_date", "analytics_event")
    op.drop_index("ix_contenttranslation_entity_lang", "contenttranslation")
    op.drop_index("ix_favorite_place_code", "favorite")
    op.drop_index("ix_review_place_date", "review")
    op.drop_index("ix_checkin_group_place", "checkin")
    op.drop_index("ix_checkin_place_user", "checkin")
    op.drop_index("ix_checkin_user_date", "checkin")

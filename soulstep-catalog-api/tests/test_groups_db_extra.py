"""
DB-level tests for app/db/groups.py to cover paths missed by HTTP tests.
"""

from sqlmodel import Session

from app.db import groups as groups_db
from app.db.models import Group, User


def _create_user(db_session: Session, code: str, email: str) -> str:
    user = User(
        user_code=code,
        email=email,
        password_hash="hashed",
        display_name=f"User {code}",
    )
    db_session.add(user)
    db_session.commit()
    return code


# ── TestGroupsDbExtra ──────────────────────────────────────────────────────────


class TestGroupsDbExtra:
    def test_add_member_returns_false_for_nonexistent_group(self, db_session):
        """add_member should return False when group doesn't exist."""
        result = groups_db.add_member("grp_nonexistent", "usr_xyz", db_session, "member")
        assert result is False

    def test_add_member_returns_true_when_already_member(self, db_session):
        """add_member returns True (not duplicate) when user is already in the group."""
        _create_user(db_session, "usr_dup01", "dup01@example.com")
        group = groups_db.create_group(
            name="Dup Test",
            description="",
            created_by_user_code="usr_dup01",
            session=db_session,
        )
        # usr_dup01 is already admin member; adding again should return True
        result = groups_db.add_member(group.group_code, "usr_dup01", db_session, "member")
        assert result is True

    def test_get_members_returns_tuples(self, db_session):
        """get_members returns a list of (user_code, role, joined_at_str) tuples."""
        _create_user(db_session, "usr_mem01", "mem01@example.com")
        group = groups_db.create_group(
            name="Members Test",
            description="",
            created_by_user_code="usr_mem01",
            session=db_session,
        )
        members = groups_db.get_members(group.group_code, db_session)
        assert len(members) == 1
        user_code, role, joined_at = members[0]
        assert user_code == "usr_mem01"
        assert role == "admin"
        assert isinstance(joined_at, str)
        assert joined_at.endswith("Z")

    def test_get_leaderboard_empty_when_no_members(self, db_session):
        """get_leaderboard returns [] when group has no members."""
        from unittest.mock import MagicMock

        group = Group(
            group_code="grp_lbempty",
            name="Empty LB",
            description="",
            created_by_user_code="usr_lbowner",
            invite_code="lb_invite",
        )
        db_session.add(group)
        db_session.commit()

        mock_check_ins = MagicMock()
        result = groups_db.get_leaderboard("grp_lbempty", mock_check_ins, db_session)
        assert result == []

    def test_get_leaderboard_with_members(self, db_session):
        """get_leaderboard runs for a group with members."""
        from unittest.mock import MagicMock

        _create_user(db_session, "usr_lb01", "lb01@example.com")
        group = groups_db.create_group(
            name="LB With Members",
            description="",
            created_by_user_code="usr_lb01",
            session=db_session,
        )

        mock_check_ins = MagicMock()
        # New bulk API: count_places_visited_bulk returns a dict keyed by user_code
        mock_check_ins.count_places_visited_bulk.return_value = {"usr_lb01": 3}

        result = groups_db.get_leaderboard(group.group_code, mock_check_ins, db_session)
        assert len(result) == 1
        assert result[0]["user_code"] == "usr_lb01"
        assert result[0]["places_visited"] == 3
        assert result[0]["rank"] == 1

    def test_get_group_progress_with_path(self, db_session):
        """get_group_progress uses the path when group has path_place_codes."""
        from unittest.mock import MagicMock

        _create_user(db_session, "usr_prog01", "prog01@example.com")
        group = groups_db.create_group(
            name="Path Progress",
            description="",
            created_by_user_code="usr_prog01",
            session=db_session,
            path_place_codes=["plc_001", "plc_002", "plc_003"],
        )

        mock_check_ins = MagicMock()
        # New bulk API: get_check_ins_for_users returns a flat list of check-ins
        mock_check_ins.get_check_ins_for_users.return_value = []
        mock_places = MagicMock()

        result = groups_db.get_group_progress(
            group.group_code, mock_check_ins, mock_places, db_session
        )
        assert result["total_sites"] == 3
        assert result["sites_visited"] == 0
        assert result["next_place_code"] == "plc_001"

    def test_get_activity_with_check_ins(self, db_session):
        """get_activity returns formatted check-in entries."""
        from datetime import datetime
        from unittest.mock import MagicMock

        _create_user(db_session, "usr_act01", "act01@example.com")
        group = groups_db.create_group(
            name="Activity Test",
            description="",
            created_by_user_code="usr_act01",
            session=db_session,
        )

        mock_chk = MagicMock()
        mock_chk.user_code = "usr_act01"
        mock_chk.place_code = "plc_act001"
        mock_chk.checked_in_at = datetime(2025, 1, 1, 12, 0, 0)
        mock_chk.note = None
        mock_chk.photo_url = None
        mock_chk.group_code = group.group_code

        # New bulk API: get_check_ins_for_users returns a flat list of CheckIn objects
        mock_check_ins = MagicMock()
        mock_check_ins.get_check_ins_for_users.return_value = [mock_chk]

        mock_user_store = MagicMock()
        mock_user = MagicMock()
        mock_user.display_name = "Tester"
        # New bulk API: get_users_bulk returns a dict keyed by user_code
        mock_user_store.get_users_bulk.return_value = {"usr_act01": mock_user}

        mock_places = MagicMock()
        mock_place = MagicMock()
        mock_place.name = "Test Mosque"
        # New bulk API: get_places_by_codes returns a list of place objects
        mock_places.get_places_by_codes.return_value = [mock_place]
        mock_place.place_code = "plc_act001"

        result = groups_db.get_activity(
            group.group_code, mock_check_ins, mock_user_store, mock_places, db_session, limit=10
        )
        assert len(result) == 1
        assert result[0]["type"] == "check_in"
        assert result[0]["place_code"] == "plc_act001"
        assert result[0]["display_name"] == "Tester"

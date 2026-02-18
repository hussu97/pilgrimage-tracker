"""
Unit tests for app.db.store — user/auth DB layer.

Tests create_user, get_user_by_code/email, update_user, settings,
password reset flow, and refresh token lifecycle using the in-memory DB fixture.
"""

from datetime import datetime, timedelta

from app.db import store

# ── helpers ────────────────────────────────────────────────────────────────────


def _make_user(session, email="user@test.com", user_code="usr_test0001"):
    return store.create_user(
        user_code=user_code,
        email=email,
        password_hash="$2b$12$fakehashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        display_name="Test User",
        session=session,
    )


# ── create_user ────────────────────────────────────────────────────────────────


class TestCreateUser:
    def test_creates_user_with_correct_fields(self, db_session):
        user = _make_user(db_session)
        assert user.user_code == "usr_test0001"
        assert user.email == "user@test.com"
        assert user.display_name == "Test User"

    def test_creates_default_settings(self, db_session):
        _make_user(db_session)
        settings = store.get_user_settings("usr_test0001", db_session)
        assert settings["religions"] == []
        assert settings["theme"] == "light"
        assert settings["units"] == "km"
        assert settings["language"] == "en"
        assert settings["notifications_on"] is True

    def test_creates_user_with_religion(self, db_session):
        store.create_user(
            user_code="usr_rel0001",
            email="rel@test.com",
            password_hash="hash",
            display_name="Rel User",
            religion="islam",
            session=db_session,
        )
        settings = store.get_user_settings("usr_rel0001", db_session)
        assert settings["religions"] == ["islam"]

    def test_invalid_religion_not_stored(self, db_session):
        store.create_user(
            user_code="usr_inv0001",
            email="inv@test.com",
            password_hash="hash",
            display_name="Inv",
            religion="pastafarianism",
            session=db_session,
        )
        settings = store.get_user_settings("usr_inv0001", db_session)
        assert settings["religions"] == []


# ── get_user_by_code / get_user_by_email ──────────────────────────────────────


class TestGetUser:
    def test_get_by_code(self, db_session):
        _make_user(db_session)
        user = store.get_user_by_code("usr_test0001", db_session)
        assert user is not None
        assert user.email == "user@test.com"

    def test_get_by_code_not_found(self, db_session):
        assert store.get_user_by_code("usr_ghost", db_session) is None

    def test_get_by_email(self, db_session):
        _make_user(db_session)
        user = store.get_user_by_email("user@test.com", db_session)
        assert user is not None
        assert user.user_code == "usr_test0001"

    def test_get_by_email_case_insensitive(self, db_session):
        _make_user(db_session)
        user = store.get_user_by_email("USER@TEST.COM", db_session)
        assert user is not None

    def test_get_by_email_not_found(self, db_session):
        assert store.get_user_by_email("nobody@test.com", db_session) is None


# ── update_user ────────────────────────────────────────────────────────────────


class TestUpdateUser:
    def test_update_display_name(self, db_session):
        _make_user(db_session)
        updated = store.update_user("usr_test0001", db_session, display_name="New Name")
        assert updated.display_name == "New Name"

    def test_update_nonexistent_user(self, db_session):
        assert store.update_user("usr_nobody", db_session, display_name="X") is None

    def test_update_without_fields_is_noop(self, db_session):
        _make_user(db_session)
        updated = store.update_user("usr_test0001", db_session)
        assert updated.display_name == "Test User"


# ── user settings ──────────────────────────────────────────────────────────────


class TestUserSettings:
    def test_update_theme(self, db_session):
        _make_user(db_session)
        result = store.update_user_settings("usr_test0001", db_session, theme="dark")
        assert result["theme"] == "dark"

    def test_update_language(self, db_session):
        _make_user(db_session)
        result = store.update_user_settings("usr_test0001", db_session, language="ar")
        assert result["language"] == "ar"

    def test_update_religions_valid(self, db_session):
        _make_user(db_session)
        result = store.update_user_settings(
            "usr_test0001", db_session, religions=["islam", "hinduism"]
        )
        assert set(result["religions"]) == {"islam", "hinduism"}

    def test_update_religions_filters_invalid(self, db_session):
        _make_user(db_session)
        result = store.update_user_settings(
            "usr_test0001", db_session, religions=["islam", "jediism"]
        )
        assert result["religions"] == ["islam"]

    def test_update_notifications(self, db_session):
        _make_user(db_session)
        result = store.update_user_settings("usr_test0001", db_session, notifications_on=False)
        assert result["notifications_on"] is False

    def test_settings_missing_user_returns_empty(self, db_session):
        result = store.get_user_settings("usr_noexist", db_session)
        assert result == {"religions": []}


# ── password reset ─────────────────────────────────────────────────────────────


class TestPasswordReset:
    def test_consume_valid_token(self, db_session):
        _make_user(db_session)
        token = "validresettoken0001"
        expires = datetime.utcnow() + timedelta(hours=1)
        store.save_password_reset(token, "usr_test0001", expires, db_session)

        user_code = store.consume_password_reset(token, db_session)
        assert user_code == "usr_test0001"

    def test_token_consumed_only_once(self, db_session):
        _make_user(db_session)
        token = "onetime0000000001"
        expires = datetime.utcnow() + timedelta(hours=1)
        store.save_password_reset(token, "usr_test0001", expires, db_session)

        assert store.consume_password_reset(token, db_session) == "usr_test0001"
        assert store.consume_password_reset(token, db_session) is None

    def test_expired_token_returns_none(self, db_session):
        _make_user(db_session)
        token = "expiredtoken00001"
        expired_at = datetime.utcnow() - timedelta(hours=1)
        store.save_password_reset(token, "usr_test0001", expired_at, db_session)

        assert store.consume_password_reset(token, db_session) is None

    def test_unknown_token_returns_none(self, db_session):
        assert store.consume_password_reset("no-such-token", db_session) is None


# ── refresh tokens ─────────────────────────────────────────────────────────────


class TestRefreshTokens:
    def test_save_and_consume(self, db_session):
        _make_user(db_session)
        token = "refreshtoken0001"
        store.save_refresh_token(token, "usr_test0001", db_session)
        user_code = store.consume_refresh_token(token, db_session)
        assert user_code == "usr_test0001"

    def test_consume_revokes_token(self, db_session):
        _make_user(db_session)
        token = "refreshtoken0002"
        store.save_refresh_token(token, "usr_test0001", db_session)
        store.consume_refresh_token(token, db_session)
        # Second consume should fail — token is now revoked
        assert store.consume_refresh_token(token, db_session) is None

    def test_revoke_token(self, db_session):
        _make_user(db_session)
        token = "refreshtoken0003"
        store.save_refresh_token(token, "usr_test0001", db_session)
        store.revoke_refresh_token(token, db_session)
        assert store.consume_refresh_token(token, db_session) is None

    def test_unknown_refresh_token_returns_none(self, db_session):
        assert store.consume_refresh_token("not-a-real-token", db_session) is None


# ── update_user_password ───────────────────────────────────────────────────────


class TestUpdatePassword:
    def test_password_updated_in_db(self, db_session):
        _make_user(db_session)
        new_hash = "$2b$12$newhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
        store.update_user_password("usr_test0001", new_hash, db_session)
        user = store.get_user_by_code("usr_test0001", db_session)
        assert user.password_hash == new_hash

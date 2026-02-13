"""
In-memory store for local dev. Replace with SQLite/Postgres for production.
"""
from datetime import datetime
from typing import Literal, Optional

Religion = Literal["islam", "hinduism", "christianity"]


class UserRow:
    def __init__(
        self,
        user_code: str,
        email: str,
        password_hash: str,
        display_name: str,
        religion: Optional[Religion],
        avatar_url: Optional[str],
        created_at: str,
        updated_at: str,
    ):
        self.user_code = user_code
        self.email = email
        self.password_hash = password_hash
        self.display_name = display_name
        self.religion = religion
        self.avatar_url = avatar_url
        self.created_at = created_at
        self.updated_at = updated_at


class PasswordResetRow:
    def __init__(self, token: str, user_code: str, expires_at: str, used_at: Optional[str]):
        self.token = token
        self.user_code = user_code
        self.expires_at = expires_at
        self.used_at = used_at


users: dict[str, UserRow] = {}
users_by_email: dict[str, str] = {}
password_resets: dict[str, PasswordResetRow] = {}
user_settings: dict[str, dict] = {}  # user_code -> { notifications_on, theme, units }


def create_user(
    user_code: str,
    email: str,
    password_hash: str,
    display_name: str,
    religion: Optional[Religion] = None,
    avatar_url: Optional[str] = None,
) -> UserRow:
    now = datetime.utcnow().isoformat() + "Z"
    user = UserRow(
        user_code=user_code,
        email=email,
        password_hash=password_hash,
        display_name=display_name,
        religion=religion,
        avatar_url=avatar_url,
        created_at=now,
        updated_at=now,
    )
    users[user_code] = user
    users_by_email[email.lower()] = user_code
    return user


def get_user_by_code(user_code: str) -> Optional[UserRow]:
    return users.get(user_code)


def get_user_by_email(email: str) -> Optional[UserRow]:
    code = users_by_email.get(email.lower())
    return users.get(code) if code else None


def update_user_religion(user_code: str, religion: Optional[Religion]) -> Optional[UserRow]:
    user = users.get(user_code)
    if not user:
        return None
    user.religion = religion
    user.updated_at = datetime.utcnow().isoformat() + "Z"
    return user


def update_user(
    user_code: str,
    display_name: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> Optional[UserRow]:
    user = users.get(user_code)
    if not user:
        return None
    if display_name is not None:
        user.display_name = display_name
    if avatar_url is not None:
        user.avatar_url = avatar_url
    user.updated_at = datetime.utcnow().isoformat() + "Z"
    return user


def save_password_reset(token: str, user_code: str, expires_at: datetime) -> None:
    password_resets[token] = PasswordResetRow(
        token=token,
        user_code=user_code,
        expires_at=expires_at.isoformat(),
        used_at=None,
    )


def consume_password_reset(token: str) -> Optional[str]:
    row = password_resets.get(token)
    if not row or row.used_at:
        return None
    if datetime.fromisoformat(row.expires_at.replace("Z", "+00:00")) < datetime.utcnow():
        return None
    row.used_at = datetime.utcnow().isoformat() + "Z"
    return row.user_code


def get_user_settings(user_code: str) -> dict:
    return dict(user_settings.get(user_code, {}))


def update_user_settings(user_code: str, **kwargs) -> dict:
    s = user_settings.setdefault(user_code, {})
    if "notifications_on" in kwargs:
        s["notifications_on"] = kwargs["notifications_on"]
    if "theme" in kwargs:
        s["theme"] = kwargs["theme"]
    if "units" in kwargs:
        s["units"] = kwargs["units"]
    return dict(s)

from datetime import datetime, timedelta
from typing import List, Literal, Optional

from sqlmodel import Session, select
from app.core.config import REFRESH_EXPIRE
from app.db.models import User, UserSettings, PasswordReset, RefreshToken, Visitor, VisitorSettings

Religion = Literal["islam", "hinduism", "christianity", "all"]
VALID_RELIGIONS = ("islam", "hinduism", "christianity", "all")


def create_user(
    user_code: str,
    email: str,
    password_hash: str,
    display_name: str,
    session: Session,
    religion: Optional[Religion] = None,
) -> User:
    user = User(
        user_code=user_code,
        email=email,
        password_hash=password_hash,
        display_name=display_name,
    )
    session.add(user)

    # Create default settings
    settings = UserSettings(
        user_code=user_code,
        religions=[religion] if religion in VALID_RELIGIONS else []
    )
    session.add(settings)

    session.commit()
    session.refresh(user)
    return user


def get_user_by_code(user_code: str, session: Session) -> Optional[User]:
    return session.exec(select(User).where(User.user_code == user_code)).first()


def get_user_by_email(email: str, session: Session) -> Optional[User]:
    return session.exec(select(User).where(User.email == email.lower())).first()


def update_user_religion(user_code: str, religion: Optional[Religion], session: Session) -> Optional[User]:
    settings = session.exec(select(UserSettings).where(UserSettings.user_code == user_code)).first()
    if not settings:
        # If settings don't exist for some reason, create them
        settings = UserSettings(user_code=user_code)
        session.add(settings)

    if religion in VALID_RELIGIONS:
        settings.religions = [religion]
    else:
        settings.religions = []

    session.add(settings)

    user = session.exec(select(User).where(User.user_code == user_code)).first()
    if user:
        user.updated_at = datetime.utcnow()
        session.add(user)

    session.commit()
    if user:
        session.refresh(user)
    return user


def update_user(
    user_code: str,
    session: Session,
    display_name: Optional[str] = None,
) -> Optional[User]:
    user = session.exec(select(User).where(User.user_code == user_code)).first()
    if not user:
        return None
    if display_name is not None:
        user.display_name = display_name
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def save_password_reset(token: str, user_code: str, expires_at: datetime, session: Session) -> None:
    reset = PasswordReset(
        token=token,
        user_code=user_code,
        expires_at=expires_at
    )
    session.add(reset)
    session.commit()


def consume_password_reset(token: str, session: Session) -> Optional[str]:
    reset = session.exec(select(PasswordReset).where(PasswordReset.token == token)).first()
    if not reset or reset.used_at:
        return None
    if reset.expires_at < datetime.utcnow():
        return None
    reset.used_at = datetime.utcnow()
    session.add(reset)
    session.commit()
    return reset.user_code


def get_user_settings(user_code: str, session: Session) -> dict:
    settings = session.exec(select(UserSettings).where(UserSettings.user_code == user_code)).first()
    if not settings:
        return {"religions": []}
    return {
        "notifications_on": settings.notifications_on,
        "theme": settings.theme,
        "units": settings.units,
        "language": settings.language,
        "religions": settings.religions
    }


def update_user_settings(user_code: str, session: Session, **kwargs) -> dict:
    settings = session.exec(select(UserSettings).where(UserSettings.user_code == user_code)).first()
    if not settings:
        settings = UserSettings(user_code=user_code)
        session.add(settings)

    if "notifications_on" in kwargs:
        settings.notifications_on = kwargs["notifications_on"]
    if "theme" in kwargs:
        settings.theme = kwargs["theme"]
    if "units" in kwargs:
        settings.units = kwargs["units"]
    if "language" in kwargs:
        settings.language = kwargs["language"]
    if "religions" in kwargs:
        raw = kwargs["religions"]
        if raw is not None:
            if "all" in raw:
                settings.religions = ["all"]
            else:
                settings.religions = [r for r in raw if r in VALID_RELIGIONS]
        else:
            settings.religions = []

    session.add(settings)
    session.commit()
    return get_user_settings(user_code, session)


def update_user_password(user_code: str, password_hash: str, session: Session) -> None:
    """Update user password hash."""
    user = session.exec(select(User).where(User.user_code == user_code)).first()
    if user:
        user.password_hash = password_hash
        user.updated_at = datetime.utcnow()
        session.add(user)
        session.commit()


# ─── Refresh token helpers ─────────────────────────────────────────────────────

def save_refresh_token(token: str, user_code: str, session: Session) -> None:
    """Persist a new refresh token for the given user."""
    row = RefreshToken(
        token=token,
        user_code=user_code,
        expires_at=datetime.utcnow() + timedelta(minutes=REFRESH_EXPIRE),
    )
    session.add(row)
    session.commit()


def consume_refresh_token(token: str, session: Session) -> Optional[str]:
    """Validate and revoke a refresh token. Returns user_code on success, None on failure."""
    row = session.exec(
        select(RefreshToken).where(RefreshToken.token == token)
    ).first()
    if not row or row.revoked_at is not None:
        return None
    if row.expires_at < datetime.utcnow():
        return None
    # Revoke (rotate) the old token
    row.revoked_at = datetime.utcnow()
    session.add(row)
    session.commit()
    return row.user_code


def revoke_refresh_token(token: str, session: Session) -> None:
    """Revoke a specific refresh token (used on logout)."""
    row = session.exec(
        select(RefreshToken).where(RefreshToken.token == token)
    ).first()
    if row and row.revoked_at is None:
        row.revoked_at = datetime.utcnow()
        session.add(row)
        session.commit()


# ─── Visitor helpers ───────────────────────────────────────────────────────────

def create_visitor(visitor_code: str, session: Session) -> Visitor:
    """Insert a Visitor row + default VisitorSettings row."""
    visitor = Visitor(visitor_code=visitor_code)
    session.add(visitor)
    settings = VisitorSettings(visitor_code=visitor_code)
    session.add(settings)
    session.commit()
    session.refresh(visitor)
    return visitor


def get_visitor(visitor_code: str, session: Session) -> Optional[Visitor]:
    return session.exec(select(Visitor).where(Visitor.visitor_code == visitor_code)).first()


def get_visitor_settings(visitor_code: str, session: Session) -> dict:
    settings = session.exec(
        select(VisitorSettings).where(VisitorSettings.visitor_code == visitor_code)
    ).first()
    if not settings:
        return {"theme": "system", "units": "km", "language": "en", "religions": []}
    return {
        "theme": settings.theme,
        "units": settings.units,
        "language": settings.language,
        "religions": settings.religions,
    }


def update_visitor_settings(visitor_code: str, session: Session, **kwargs) -> dict:
    settings = session.exec(
        select(VisitorSettings).where(VisitorSettings.visitor_code == visitor_code)
    ).first()
    if not settings:
        settings = VisitorSettings(visitor_code=visitor_code)
        session.add(settings)

    if "theme" in kwargs and kwargs["theme"] is not None:
        settings.theme = kwargs["theme"]
    if "units" in kwargs and kwargs["units"] is not None:
        settings.units = kwargs["units"]
    if "language" in kwargs and kwargs["language"] is not None:
        settings.language = kwargs["language"]
    if "religions" in kwargs and kwargs["religions"] is not None:
        raw = kwargs["religions"]
        if "all" in raw:
            settings.religions = ["all"]
        else:
            settings.religions = [r for r in raw if r in VALID_RELIGIONS]

    session.add(settings)
    session.commit()
    return get_visitor_settings(visitor_code, session)


def touch_visitor(visitor_code: str, session: Session) -> None:
    """Update last_seen_at for the visitor."""
    visitor = session.exec(select(Visitor).where(Visitor.visitor_code == visitor_code)).first()
    if visitor:
        visitor.last_seen_at = datetime.utcnow()
        session.add(visitor)
        session.commit()


def merge_visitor_into_user(visitor_code: str, user_code: str, session: Session) -> None:
    """Copy visitor settings into UserSettings where user fields are still at defaults, then delete visitor."""
    visitor_s = session.exec(
        select(VisitorSettings).where(VisitorSettings.visitor_code == visitor_code)
    ).first()
    if not visitor_s:
        return

    user_s = session.exec(select(UserSettings).where(UserSettings.user_code == user_code)).first()
    if not user_s:
        return

    # Merge only where user settings are still at defaults
    if visitor_s.theme not in ("system", "light") and user_s.theme in ("system", "light"):
        user_s.theme = visitor_s.theme
    elif visitor_s.theme in ("dark",) and user_s.theme == "light":
        user_s.theme = visitor_s.theme

    if visitor_s.language != "en" and user_s.language == "en":
        user_s.language = visitor_s.language

    if visitor_s.units != "km" and user_s.units == "km":
        user_s.units = visitor_s.units

    if visitor_s.religions and not user_s.religions:
        if "all" in visitor_s.religions:
            user_s.religions = ["all"]
        else:
            user_s.religions = [r for r in visitor_s.religions if r in VALID_RELIGIONS]

    session.add(user_s)

    # Delete visitor settings then visitor
    session.delete(visitor_s)
    session.commit()

    visitor = session.exec(select(Visitor).where(Visitor.visitor_code == visitor_code)).first()
    if visitor:
        session.delete(visitor)
        session.commit()

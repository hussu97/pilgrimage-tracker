from datetime import datetime
from typing import List, Literal, Optional

from sqlmodel import Session, select
from app.db.models import User, UserSettings, PasswordReset
from app.db.session import engine

Religion = Literal["islam", "hinduism", "christianity"]
VALID_RELIGIONS = ("islam", "hinduism", "christianity")


def create_user(
    user_code: str,
    email: str,
    password_hash: str,
    display_name: str,
    religion: Optional[Religion] = None,
    avatar_url: Optional[str] = None,
) -> User:
    with Session(engine) as session:
        user = User(
            user_code=user_code,
            email=email,
            password_hash=password_hash,
            display_name=display_name,
            avatar_url=avatar_url,
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


def get_user_by_code(user_code: str) -> Optional[User]:
    with Session(engine) as session:
        return session.exec(select(User).where(User.user_code == user_code)).first()


def get_user_by_email(email: str) -> Optional[User]:
    with Session(engine) as session:
        return session.exec(select(User).where(User.email == email.lower())).first()


def update_user_religion(user_code: str, religion: Optional[Religion]) -> Optional[User]:
    with Session(engine) as session:
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
    display_name: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> Optional[User]:
    with Session(engine) as session:
        user = session.exec(select(User).where(User.user_code == user_code)).first()
        if not user:
            return None
        if display_name is not None:
            user.display_name = display_name
        if avatar_url is not None:
            user.avatar_url = avatar_url
        user.updated_at = datetime.utcnow()
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


def save_password_reset(token: str, user_code: str, expires_at: datetime) -> None:
    with Session(engine) as session:
        reset = PasswordReset(
            token=token,
            user_code=user_code,
            expires_at=expires_at
        )
        session.add(reset)
        session.commit()


def consume_password_reset(token: str) -> Optional[str]:
    with Session(engine) as session:
        reset = session.exec(select(PasswordReset).where(PasswordReset.token == token)).first()
        if not reset or reset.used_at:
            return None
        if reset.expires_at < datetime.utcnow():
            return None
        reset.used_at = datetime.utcnow()
        session.add(reset)
        session.commit()
        return reset.user_code


def get_user_settings(user_code: str) -> dict:
    with Session(engine) as session:
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


def update_user_settings(user_code: str, **kwargs) -> dict:
    with Session(engine) as session:
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
                validated = [r for r in raw if r in VALID_RELIGIONS]
                settings.religions = validated
            else:
                settings.religions = []
        
        session.add(settings)
        session.commit()
        return get_user_settings(user_code)

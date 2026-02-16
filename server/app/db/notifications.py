import secrets
from datetime import datetime
from typing import Any, Dict, List

from sqlmodel import Session, select, func, and_
from app.db.models import Notification


def _generate_code() -> str:
    return "notif_" + secrets.token_hex(8)


def create_notification(user_code: str, type: str, payload: Dict[str, Any], session: Session) -> Notification:
    code = _generate_code()
    notif = Notification(
        notification_code=code,
        user_code=user_code,
        type=type,
        payload=payload
    )
    session.add(notif)
    session.commit()
    session.refresh(notif)
    return notif


def get_notifications_for_user(user_code: str, session: Session, limit: int = 20, offset: int = 0) -> List[Notification]:
    statement = select(Notification).where(Notification.user_code == user_code).order_by(Notification.created_at.desc()).offset(offset).limit(limit)
    return session.exec(statement).all()


def mark_read(notification_code: str, user_code: str, session: Session) -> bool:
    statement = select(Notification).where(and_(Notification.notification_code == notification_code, Notification.user_code == user_code))
    notif = session.exec(statement).first()
    if not notif:
        return False
    notif.read_at = datetime.utcnow()
    session.add(notif)
    session.commit()
    return True


def count_unread(user_code: str, session: Session) -> int:
    statement = select(func.count(Notification.id)).where(and_(Notification.user_code == user_code, Notification.read_at is None))
    return session.exec(statement).one()

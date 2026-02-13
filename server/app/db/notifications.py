"""
In-memory notifications store.
"""
import secrets
from datetime import datetime
from typing import Any, Dict, List, Optional

notifications_by_code: dict = {}
notifications_by_user: dict = {}  # user_code -> list of notification_code (newest first)


class NotificationRow:
    def __init__(self, notification_code: str, user_code: str, type: str, payload: Dict[str, Any], read_at: Optional[str], created_at: str):
        self.notification_code = notification_code
        self.user_code = user_code
        self.type = type
        self.payload = payload
        self.read_at = read_at
        self.created_at = created_at


def _generate_code() -> str:
    return "notif_" + secrets.token_hex(8)


def create_notification(user_code: str, type: str, payload: Dict[str, Any]) -> NotificationRow:
    code = _generate_code()
    now = datetime.utcnow().isoformat() + "Z"
    row = NotificationRow(notification_code=code, user_code=user_code, type=type, payload=payload, read_at=None, created_at=now)
    notifications_by_code[code] = row
    if user_code not in notifications_by_user:
        notifications_by_user[user_code] = []
    notifications_by_user[user_code].append(code)
    return row


def get_notifications_for_user(user_code: str, limit: int = 20, offset: int = 0) -> List[NotificationRow]:
    codes = notifications_by_user.get(user_code, [])
    rows = []
    for c in codes:
        if c in notifications_by_code:
            rows.append(notifications_by_code[c])
    rows.sort(key=lambda r: r.created_at, reverse=True)
    return rows[offset : offset + limit]


def mark_read(notification_code: str, user_code: str) -> bool:
    row = notifications_by_code.get(notification_code)
    if not row or row.user_code != user_code:
        return False
    row.read_at = datetime.utcnow().isoformat() + "Z"
    return True


def count_unread(user_code: str) -> int:
    codes = notifications_by_user.get(user_code, [])
    return sum(1 for c in codes if c in notifications_by_code and notifications_by_code[c].read_at is None)

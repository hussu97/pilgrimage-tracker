from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user
from app.db import notifications as notifications_db

router = APIRouter()


@router.get("")
def list_notifications(
    user: Annotated[Any, Depends(get_current_user)],
    limit: int = Query(20),
    offset: int = Query(0),
):
    rows = notifications_db.get_notifications_for_user(user.user_code, limit=limit, offset=offset)
    return {
        "notifications": [
            {
                "notification_code": r.notification_code,
                "type": r.type,
                "payload": r.payload,
                "read_at": r.read_at,
                "created_at": r.created_at,
            }
            for r in rows
        ],
        "unread_count": notifications_db.count_unread(user.user_code),
    }


@router.patch("/{notification_code}/read")
def mark_notification_read(notification_code: str, user: Annotated[Any, Depends(get_current_user)]):
    ok = notifications_db.mark_read(notification_code, user.user_code)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}

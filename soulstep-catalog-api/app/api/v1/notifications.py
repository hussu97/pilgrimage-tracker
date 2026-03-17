from fastapi import APIRouter, HTTPException, Query

from app.api.deps import UserDep
from app.api.pagination import offset_for, paginate_query
from app.db import notifications as notifications_db
from app.db.session import SessionDep

router = APIRouter()


@router.get("")
def list_notifications(
    user: UserDep,
    session: SessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    offset = offset_for(page, page_size)
    rows = notifications_db.get_notifications_for_user(
        user.user_code, session, limit=page_size, offset=offset
    )
    total = notifications_db.count_notifications_for_user(user.user_code, session)
    return paginate_query(
        total=total,
        page=page,
        page_size=page_size,
        items=[
            {
                "notification_code": r.notification_code,
                "type": r.type,
                "payload": r.payload,
                "read_at": r.read_at,
                "created_at": r.created_at,
            }
            for r in rows
        ],
        unread_count=notifications_db.count_unread(user.user_code, session),
    )


@router.patch("/{notification_code}/read")
def mark_notification_read(notification_code: str, user: UserDep, session: SessionDep):
    ok = notifications_db.mark_read(notification_code, user.user_code, session)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}

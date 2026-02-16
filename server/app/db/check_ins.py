import secrets
from datetime import datetime
from typing import Dict, List, Optional

from sqlmodel import Session, select, func, and_, extract
from app.db.models import CheckIn


def _generate_code() -> str:
    return "chk_" + secrets.token_hex(8)


def create_check_in(user_code: str, place_code: str, session: Session, note: Optional[str] = None, photo_url: Optional[str] = None) -> CheckIn:
    code = _generate_code()
    check_in = CheckIn(
        check_in_code=code,
        user_code=user_code,
        place_code=place_code,
        note=note,
        photo_url=photo_url
    )
    session.add(check_in)
    session.commit()
    session.refresh(check_in)
    return check_in


def get_check_ins_by_user(user_code: str, session: Session) -> List[CheckIn]:
    statement = select(CheckIn).where(CheckIn.user_code == user_code).order_by(CheckIn.checked_in_at.desc())
    return session.exec(statement).all()


def has_checked_in(user_code: str, place_code: str, session: Session) -> bool:
    statement = select(CheckIn).where(and_(CheckIn.user_code == user_code, CheckIn.place_code == place_code))
    return session.exec(statement).first() is not None


def count_places_visited(user_code: str, session: Session) -> int:
    statement = select(func.count(func.distinct(CheckIn.place_code))).where(CheckIn.user_code == user_code)
    return session.exec(statement).one()


def count_check_ins_this_year(user_code: str, session: Session) -> int:
    year = datetime.utcnow().year
    statement = select(func.count(CheckIn.id)).where(
        and_(
            CheckIn.user_code == user_code,
            extract('year', CheckIn.checked_in_at) == year
        )
    )
    return session.exec(statement).one()


def count_check_ins_for_place(place_code: str, session: Session) -> int:
    """Count check-ins for a place. Requires session parameter."""
    statement = select(func.count(CheckIn.id)).where(CheckIn.place_code == place_code)
    return session.exec(statement).one()


def count_check_ins_bulk(place_codes: List[str], session: Session) -> Dict[str, int]:
    """Bulk count check-ins for multiple places."""
    if not place_codes:
        return {}

    statement = (
        select(CheckIn.place_code, func.count(CheckIn.id).label('count'))
        .where(CheckIn.place_code.in_(place_codes))
        .group_by(CheckIn.place_code)
    )

    results = session.exec(statement).all()
    return {r.place_code: r.count for r in results}


def get_check_ins_this_month(user_code: str, session: Session) -> List[CheckIn]:
    now = datetime.utcnow()
    statement = select(CheckIn).where(
        and_(
            CheckIn.user_code == user_code,
            extract('month', CheckIn.checked_in_at) == now.month,
            extract('year', CheckIn.checked_in_at) == now.year
        )
    )
    return session.exec(statement).all()


def get_check_ins_on_this_day(user_code: str, session: Session) -> List[CheckIn]:
    now = datetime.utcnow()
    statement = select(CheckIn).where(
        and_(
            CheckIn.user_code == user_code,
            extract('month', CheckIn.checked_in_at) == now.month,
            extract('day', CheckIn.checked_in_at) == now.day,
            extract('year', CheckIn.checked_in_at) != now.year
        )
    )
    return session.exec(statement).all()

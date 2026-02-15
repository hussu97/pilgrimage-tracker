import secrets
from datetime import datetime
from typing import List, Optional

from sqlmodel import Session, select, func, and_, extract
from app.db.models import CheckIn
from app.db.session import engine


def _generate_code() -> str:
    return "chk_" + secrets.token_hex(8)


def create_check_in(user_code: str, place_code: str, note: Optional[str] = None, photo_url: Optional[str] = None) -> CheckIn:
    with Session(engine) as session:
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


def get_check_ins_by_user(user_code: str) -> List[CheckIn]:
    with Session(engine) as session:
        statement = select(CheckIn).where(CheckIn.user_code == user_code).order_by(CheckIn.checked_in_at.desc())
        return session.exec(statement).all()


def has_checked_in(user_code: str, place_code: str) -> bool:
    with Session(engine) as session:
        statement = select(CheckIn).where(and_(CheckIn.user_code == user_code, CheckIn.place_code == place_code))
        return session.exec(statement).first() is not None


def count_places_visited(user_code: str) -> int:
    with Session(engine) as session:
        statement = select(func.count(func.distinct(CheckIn.place_code))).where(CheckIn.user_code == user_code)
        return session.exec(statement).one()


def count_check_ins_this_year(user_code: str) -> int:
    with Session(engine) as session:
        year = datetime.utcnow().year
        statement = select(func.count(CheckIn.id)).where(
            and_(
                CheckIn.user_code == user_code,
                extract('year', CheckIn.checked_in_at) == year
            )
        )
        return session.exec(statement).one()


def count_check_ins_for_place(place_code: str) -> int:
    with Session(engine) as session:
        statement = select(func.count(CheckIn.id)).where(CheckIn.place_code == place_code)
        return session.exec(statement).one()


def get_check_ins_this_month(user_code: str) -> List[CheckIn]:
    with Session(engine) as session:
        now = datetime.utcnow()
        statement = select(CheckIn).where(
            and_(
                CheckIn.user_code == user_code,
                extract('month', CheckIn.checked_in_at) == now.month,
                extract('year', CheckIn.checked_in_at) == now.year
            )
        )
        return session.exec(statement).all()


def get_check_ins_on_this_day(user_code: str) -> List[CheckIn]:
    with Session(engine) as session:
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

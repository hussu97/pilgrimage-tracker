import secrets
from datetime import UTC, datetime

from sqlmodel import Session, and_, extract, func, select

from app.db.models import CheckIn


def _generate_code() -> str:
    return "chk_" + secrets.token_hex(8)


def create_check_in(
    user_code: str,
    place_code: str,
    session: Session,
    note: str | None = None,
    photo_url: str | None = None,
    group_code: str | None = None,
) -> CheckIn:
    code = _generate_code()
    check_in = CheckIn(
        check_in_code=code,
        user_code=user_code,
        place_code=place_code,
        note=note,
        photo_url=photo_url,
        group_code=group_code,
    )
    session.add(check_in)
    session.commit()
    session.refresh(check_in)
    return check_in


def get_check_ins_by_user(user_code: str, session: Session) -> list[CheckIn]:
    statement = (
        select(CheckIn).where(CheckIn.user_code == user_code).order_by(CheckIn.checked_in_at.desc())
    )
    return session.exec(statement).all()


def has_checked_in(user_code: str, place_code: str, session: Session) -> bool:
    statement = select(CheckIn).where(
        and_(CheckIn.user_code == user_code, CheckIn.place_code == place_code)
    )
    return session.exec(statement).first() is not None


def count_places_visited(user_code: str, session: Session) -> int:
    statement = select(func.count(func.distinct(CheckIn.place_code))).where(
        CheckIn.user_code == user_code
    )
    return session.exec(statement).one()


def count_places_visited_bulk(user_codes: list[str], session: Session) -> dict[str, int]:
    """Bulk count distinct places visited per user."""
    if not user_codes:
        return {}
    statement = (
        select(CheckIn.user_code, func.count(func.distinct(CheckIn.place_code)).label("cnt"))
        .where(CheckIn.user_code.in_(user_codes))
        .group_by(CheckIn.user_code)
    )
    results = session.exec(statement).all()
    return {r.user_code: r.cnt for r in results}


def count_check_ins_this_year(user_code: str, session: Session) -> int:
    year = datetime.now(UTC).year
    statement = select(func.count(CheckIn.id)).where(
        and_(CheckIn.user_code == user_code, extract("year", CheckIn.checked_in_at) == year)
    )
    return session.exec(statement).one()


def count_check_ins_for_place(place_code: str, session: Session) -> int:
    """Count check-ins for a place. Requires session parameter."""
    statement = select(func.count(CheckIn.id)).where(CheckIn.place_code == place_code)
    return session.exec(statement).one()


def get_check_ins_for_users(user_codes: list[str], session: Session) -> list[CheckIn]:
    """Batch-fetch all check-ins for multiple users in a single query."""
    if not user_codes:
        return []
    statement = (
        select(CheckIn)
        .where(CheckIn.user_code.in_(user_codes))
        .order_by(CheckIn.checked_in_at.desc())
    )
    return session.exec(statement).all()


def count_check_ins_bulk(place_codes: list[str], session: Session) -> dict[str, int]:
    """Bulk count check-ins for multiple places."""
    if not place_codes:
        return {}

    statement = (
        select(CheckIn.place_code, func.count(CheckIn.id).label("count"))
        .where(CheckIn.place_code.in_(place_codes))
        .group_by(CheckIn.place_code)
    )

    results = session.exec(statement).all()
    return {r.place_code: r.count for r in results}


def get_check_ins_this_month(user_code: str, session: Session) -> list[CheckIn]:
    now = datetime.now(UTC)
    statement = select(CheckIn).where(
        and_(
            CheckIn.user_code == user_code,
            extract("month", CheckIn.checked_in_at) == now.month,
            extract("year", CheckIn.checked_in_at) == now.year,
        )
    )
    return session.exec(statement).all()


def get_check_ins_for_users_at_places(
    user_codes: list[str], place_codes: list[str], session: Session
) -> list[CheckIn]:
    """Batch-fetch check-ins for multiple users filtered to specific place codes."""
    if not user_codes or not place_codes:
        return []
    statement = (
        select(CheckIn)
        .where(
            and_(
                CheckIn.user_code.in_(user_codes),
                CheckIn.place_code.in_(place_codes),
            )
        )
        .order_by(CheckIn.checked_in_at.desc())
    )
    return session.exec(statement).all()


def get_check_ins_on_this_day(user_code: str, session: Session) -> list[CheckIn]:
    now = datetime.now(UTC)
    statement = select(CheckIn).where(
        and_(
            CheckIn.user_code == user_code,
            extract("month", CheckIn.checked_in_at) == now.month,
            extract("day", CheckIn.checked_in_at) == now.day,
            extract("year", CheckIn.checked_in_at) != now.year,
        )
    )
    return session.exec(statement).all()

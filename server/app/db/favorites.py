from sqlmodel import Session, select, and_
from app.db.models import Favorite


def add_favorite(user_code: str, place_code: str, session: Session) -> None:
    # Check if already exists
    statement = select(Favorite).where(and_(Favorite.user_code == user_code, Favorite.place_code == place_code))
    if session.exec(statement).first():
        return

    fav = Favorite(user_code=user_code, place_code=place_code)
    session.add(fav)
    session.commit()


def remove_favorite(user_code: str, place_code: str, session: Session) -> None:
    statement = select(Favorite).where(and_(Favorite.user_code == user_code, Favorite.place_code == place_code))
    fav = session.exec(statement).first()
    if fav:
        session.delete(fav)
        session.commit()


def is_favorite(user_code: str, place_code: str, session: Session) -> bool:
    statement = select(Favorite).where(and_(Favorite.user_code == user_code, Favorite.place_code == place_code))
    return session.exec(statement).first() is not None


def get_favorite_place_codes(user_code: str, session: Session) -> list:
    statement = select(Favorite.place_code).where(Favorite.user_code == user_code)
    return session.exec(statement).all()

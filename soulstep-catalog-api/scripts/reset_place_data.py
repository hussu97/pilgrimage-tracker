"""
Delete all place data from the catalog database (fresh start).

This removes Place records and all their dependent records:
  PlaceImage, PlaceSEO, Review, ReviewImage, PlaceAttribute,
  CheckIn, Favorite, GroupPlaceNote, ContentTranslation (entity_type='place'),
  AICrawlerLog (with place_code set).

Usage (from soulstep-catalog-api/ with .venv active):
  python scripts/reset_place_data.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session, select

from app.db.models import (
    AICrawlerLog,
    CheckIn,
    ContentTranslation,
    Favorite,
    GroupPlaceNote,
    Place,
    PlaceAttribute,
    PlaceImage,
    PlaceSEO,
    Review,
    ReviewImage,
)
from app.db.session import engine


def _delete_place_records(session: Session, place_code: str) -> None:
    review_codes = session.exec(
        select(Review.review_code).where(Review.place_code == place_code)
    ).all()
    for rc in review_codes:
        for ri in session.exec(select(ReviewImage).where(ReviewImage.review_code == rc)).all():
            session.delete(ri)
    for r in session.exec(select(Review).where(Review.place_code == place_code)).all():
        session.delete(r)
    for img in session.exec(select(PlaceImage).where(PlaceImage.place_code == place_code)).all():
        session.delete(img)
    seo = session.exec(select(PlaceSEO).where(PlaceSEO.place_code == place_code)).first()
    if seo:
        session.delete(seo)
    for attr in session.exec(
        select(PlaceAttribute).where(PlaceAttribute.place_code == place_code)
    ).all():
        session.delete(attr)
    for ci in session.exec(select(CheckIn).where(CheckIn.place_code == place_code)).all():
        session.delete(ci)
    for fav in session.exec(select(Favorite).where(Favorite.place_code == place_code)).all():
        session.delete(fav)
    for note in session.exec(
        select(GroupPlaceNote).where(GroupPlaceNote.place_code == place_code)
    ).all():
        session.delete(note)
    for ct in session.exec(
        select(ContentTranslation).where(
            ContentTranslation.entity_type == "place",
            ContentTranslation.entity_code == place_code,
        )
    ).all():
        session.delete(ct)
    for log in session.exec(
        select(AICrawlerLog).where(AICrawlerLog.place_code == place_code)
    ).all():
        session.delete(log)
    place = session.exec(select(Place).where(Place.place_code == place_code)).first()
    if place:
        session.delete(place)


def main() -> None:
    with Session(engine) as session:
        place_codes = list(session.exec(select(Place.place_code)).all())
        count = len(place_codes)
        if count == 0:
            print("No places found — nothing to delete.")
            return

        print(f"Deleting {count} places and all related records...")
        for i, pc in enumerate(place_codes, 1):
            _delete_place_records(session, pc)
            if i % 100 == 0:
                print(f"  {i}/{count}...")
        session.commit()
        print(f"Done. Deleted {count} places.")


if __name__ == "__main__":
    main()

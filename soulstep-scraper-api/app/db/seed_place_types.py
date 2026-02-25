"""Seed place type mappings for scraping."""

from sqlmodel import Session, select

from app.db.models import PlaceTypeMapping
from app.logger import get_logger

logger = get_logger(__name__)

# Place type mappings: religion -> Google Maps types -> our internal type names
# Note: Using Places API (New) supported types only:
# https://developers.google.com/maps/documentation/places/web-service/place-types
# Supported places of worship: buddhist_temple, church, hindu_temple, mosque, shinto_shrine, synagogue
PLACE_TYPE_MAPPINGS = [
    # Islam
    {
        "religion": "islam",
        "source_type": "gmaps",
        "gmaps_type": "mosque",
        "our_place_type": "mosque",
        "is_active": True,
        "display_order": 1,
    },
    # Christianity
    # Note: "cathedral" and "chapel" are not supported by new Places API - use "church" for all Christian places
    {
        "religion": "christianity",
        "source_type": "gmaps",
        "gmaps_type": "church",
        "our_place_type": "church",
        "is_active": True,
        "display_order": 1,
    },
    # Hinduism
    {
        "religion": "hinduism",
        "source_type": "gmaps",
        "gmaps_type": "hindu_temple",
        "our_place_type": "temple",
        "is_active": True,
        "display_order": 1,
    },
]


def seed_place_type_mappings(session: Session):
    """Seed place type mappings if not already present."""
    # Check if already seeded
    existing = session.exec(select(PlaceTypeMapping)).first()
    if existing:
        logger.debug("Place type mappings already seeded.")
        return

    logger.info("Seeding %d place type mappings...", len(PLACE_TYPE_MAPPINGS))
    for mapping_data in PLACE_TYPE_MAPPINGS:
        mapping = PlaceTypeMapping(**mapping_data)
        session.add(mapping)

    session.commit()
    logger.info("Place type mappings seeded successfully.")


if __name__ == "__main__":
    from app.db.session import engine

    with Session(engine) as session:
        seed_place_type_mappings(session)

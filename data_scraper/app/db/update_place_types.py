"""Update place type mappings to remove unsupported types from new Places API."""
from sqlmodel import Session, select
from app.db.models import PlaceTypeMapping
from app.db.session import get_session


def update_place_type_mappings(session: Session = None):
    """
    Update place type mappings to deactivate unsupported types.

    The new Places API doesn't support 'cathedral' and 'chapel' as separate types.
    This script deactivates them and ensures only valid types are active.
    """
    if session is None:
        session = next(get_session())

    # Deactivate unsupported types
    unsupported_types = ["cathedral", "chapel"]

    for gmaps_type in unsupported_types:
        mapping = session.exec(
            select(PlaceTypeMapping)
            .where(PlaceTypeMapping.gmaps_type == gmaps_type)
            .where(PlaceTypeMapping.source_type == "gmaps")
        ).first()

        if mapping:
            mapping.is_active = False
            session.add(mapping)
            print(f"Deactivated unsupported type: {gmaps_type}")

    # Ensure valid types are active
    valid_types = {
        "mosque": {"religion": "islam", "our_place_type": "mosque", "display_order": 1},
        "church": {"religion": "christianity", "our_place_type": "church", "display_order": 1},
        "hindu_temple": {"religion": "hinduism", "our_place_type": "temple", "display_order": 1},
    }

    for gmaps_type, config in valid_types.items():
        mapping = session.exec(
            select(PlaceTypeMapping)
            .where(PlaceTypeMapping.gmaps_type == gmaps_type)
            .where(PlaceTypeMapping.source_type == "gmaps")
        ).first()

        if mapping:
            # Update existing mapping
            mapping.is_active = True
            mapping.religion = config["religion"]
            mapping.our_place_type = config["our_place_type"]
            mapping.display_order = config["display_order"]
            session.add(mapping)
            print(f"Updated type: {gmaps_type}")
        else:
            # Create new mapping
            new_mapping = PlaceTypeMapping(
                religion=config["religion"],
                source_type="gmaps",
                gmaps_type=gmaps_type,
                our_place_type=config["our_place_type"],
                is_active=True,
                display_order=config["display_order"]
            )
            session.add(new_mapping)
            print(f"Created type: {gmaps_type}")

    session.commit()
    print("\nPlace type mappings updated successfully.")
    print("Active types: mosque, church, hindu_temple")
    print("Deactivated types: cathedral, chapel")


if __name__ == "__main__":
    from app.db.session import engine
    from sqlmodel import Session

    print("Updating place type mappings for new Places API compatibility...\n")
    with Session(engine) as session:
        update_place_type_mappings(session)

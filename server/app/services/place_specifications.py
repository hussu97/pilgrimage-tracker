"""Service for building place specification information based on attributes."""

from sqlmodel import Session

from app.db import place_attributes as attr_db

# Attribute codes that must never appear as standalone specs.
# google_maps_url is not relevant to users as a detail card.
_EXCLUDED_SPEC_CODES: frozenset[str] = frozenset(
    {"google_maps_url", "phone_national", "phone_international"}
)


def build_specifications(place, session: Session, attrs: dict | None = None) -> list:
    """
    Build specification list for a place based on its religion and attributes.

    Returns a list of specification objects with icon, label, and value.
    Specifications are dynamically generated from the place's attribute definitions
    (attributes where is_specification=True).

    Special handling:
    - phone_national / phone_international: merged into a single "phone" spec.
      International number is preferred; national is the fallback.
    - google_maps_url: excluded (not a user-facing spec card).

    For boolean attributes, only True values are shown as "Available" or "Separate".
    For other types, the value is displayed as a string.

    Requires session parameter.
    """
    religion = getattr(place, "religion", "")
    place_code = getattr(place, "place_code", None)
    specs = []

    # Dynamic attribute-based specs (primary source)
    if place_code:
        if attrs is None:
            attrs = attr_db.get_attributes_dict(place_code, session)

        spec_defs = attr_db.get_attribute_definitions(
            religion=religion, spec_only=True, session=session
        )

        for defn in spec_defs:
            if defn.attribute_code in _EXCLUDED_SPEC_CODES:
                continue

            val = attrs.get(defn.attribute_code)
            if val is None:
                continue
            if isinstance(val, bool):
                if not val:
                    continue
                display = (
                    "Available" if defn.attribute_code not in ("has_womens_area",) else "Separate"
                )
            else:
                display = str(val)
            if display:
                specs.append(
                    {
                        "icon": defn.icon or "info",
                        "label": defn.label_key or defn.name,
                        "value": display,
                    }
                )

        # Merge phone numbers: prefer international, fallback to national.
        phone_val = attrs.get("phone_international") or attrs.get("phone_national")
        if phone_val:
            specs.insert(
                0,
                {
                    "icon": "phone",
                    "label": "placeDetail.phone",
                    "value": str(phone_val),
                },
            )

    return specs

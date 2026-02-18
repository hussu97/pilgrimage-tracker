"""Service for building place specification information based on attributes."""

from sqlmodel import Session

from app.db import place_attributes as attr_db


def build_specifications(place, session: Session, attrs: dict | None = None) -> list:
    """
    Build specification list for a place based on its religion and attributes.

    Returns a list of specification objects with icon, label, and value.
    Specifications are dynamically generated from the place's attribute definitions
    (attributes where is_specification=True).

    For boolean attributes, only True values are shown as "Available" or "Separate".
    For other types, the value is displayed as a string.

    Requires session parameter.
    """
    religion = getattr(place, "religion", "")
    place_code = getattr(place, "place_code", None)
    specs = []

    # Dynamic attribute-based specs (primary source)
    if place_code:
        # Fetch attributes if not provided
        if attrs is None:
            spec_defs = attr_db.get_attribute_definitions(
                religion=religion, spec_only=True, session=session
            )
            attrs = attr_db.get_attributes_dict(place_code, session)
        else:
            # Attributes provided, but we still need spec_defs
            spec_defs = attr_db.get_attribute_definitions(
                religion=religion, spec_only=True, session=session
            )
        for defn in spec_defs:
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

    return specs

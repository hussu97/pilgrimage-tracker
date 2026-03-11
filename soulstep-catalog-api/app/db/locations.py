"""Location resolution: get-or-create Country, State, City by name."""

from __future__ import annotations

import re

from sqlmodel import Session, select

from app.db.models import City, Country, State


def _make_code(prefix: str, name: str) -> str:
    """Generate a deterministic opaque code from a name."""
    slug = re.sub(r"[^a-z0-9]", "_", name.lower().strip())
    slug = re.sub(r"_+", "_", slug).strip("_")[:40]
    return f"{prefix}_{slug}"


def get_or_create_country(name: str, session: Session) -> Country:
    """Look up country by name (case-insensitive). Create with generated code if not found."""
    name_stripped = name.strip()
    existing = session.exec(select(Country).where(Country.name.ilike(name_stripped))).first()
    if existing:
        return existing
    code = _make_code("ctr", name_stripped)
    # Ensure code uniqueness (rare collision: append suffix)
    suffix = 0
    base_code = code
    while session.exec(select(Country).where(Country.country_code == code)).first():
        suffix += 1
        code = f"{base_code}_{suffix}"
    country = Country(
        country_code=code,
        name=name_stripped,
        translations={"en": name_stripped},
    )
    session.add(country)
    session.flush()
    return country


def get_or_create_state(name: str, country_code: str, session: Session) -> State:
    """Look up state by (name, country_code) case-insensitively. Create if not found."""
    name_stripped = name.strip()
    existing = session.exec(
        select(State).where(
            State.name.ilike(name_stripped),
            State.country_code == country_code,
        )
    ).first()
    if existing:
        return existing
    code = _make_code("sta", name_stripped)
    suffix = 0
    base_code = code
    while session.exec(select(State).where(State.state_code == code)).first():
        suffix += 1
        code = f"{base_code}_{suffix}"
    state = State(
        state_code=code,
        name=name_stripped,
        country_code=country_code,
        translations={"en": name_stripped},
    )
    session.add(state)
    session.flush()
    return state


def get_or_create_city(
    name: str, country_code: str, state_code: str | None, session: Session
) -> City:
    """Look up city by (name, country_code) case-insensitively. Create if not found."""
    name_stripped = name.strip()
    existing = session.exec(
        select(City).where(
            City.name.ilike(name_stripped),
            City.country_code == country_code,
        )
    ).first()
    if existing:
        return existing
    code = _make_code("cty", name_stripped)
    suffix = 0
    base_code = code
    while session.exec(select(City).where(City.city_code == code)).first():
        suffix += 1
        code = f"{base_code}_{suffix}"
    city = City(
        city_code=code,
        name=name_stripped,
        country_code=country_code,
        state_code=state_code,
        translations={"en": name_stripped},
    )
    session.add(city)
    session.flush()
    return city


def resolve_location_codes(
    city: str | None,
    state: str | None,
    country: str | None,
    session: Session,
) -> tuple[str | None, str | None, str | None]:
    """Resolve location strings → (city_code, state_code, country_code).

    Returns (None, None, None) when no strings are provided.
    Partial resolution: country alone works; state requires country; city requires country.
    """
    if not country and not city and not state:
        return None, None, None

    country_code: str | None = None
    state_code: str | None = None
    city_code: str | None = None

    if country:
        country_obj = get_or_create_country(country, session)
        country_code = country_obj.country_code

    if state and country_code:
        state_obj = get_or_create_state(state, country_code, session)
        state_code = state_obj.state_code

    if city and country_code:
        city_obj = get_or_create_city(city, country_code, state_code, session)
        city_code = city_obj.city_code

    return city_code, state_code, country_code

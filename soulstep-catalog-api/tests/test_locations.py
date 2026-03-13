"""Tests for app/db/locations.py: get_or_create_country/state/city, resolve_location_codes."""

from app.db.locations import (
    get_or_create_city,
    get_or_create_city_alias,
    get_or_create_country,
    get_or_create_state,
    resolve_location_codes,
)


class TestGetOrCreateCountry:
    def test_creates_new_country(self, db_session):
        country = get_or_create_country("India", db_session)
        db_session.commit()
        assert country.country_code == "ctr_india"
        assert country.name == "India"

    def test_idempotent_same_name(self, db_session):
        c1 = get_or_create_country("India", db_session)
        db_session.commit()
        c2 = get_or_create_country("India", db_session)
        db_session.commit()
        assert c1.country_code == c2.country_code

    def test_idempotent_case_insensitive(self, db_session):
        c1 = get_or_create_country("India", db_session)
        db_session.commit()
        c2 = get_or_create_country("india", db_session)
        db_session.commit()
        assert c1.country_code == c2.country_code

    def test_different_countries_get_different_codes(self, db_session):
        c1 = get_or_create_country("India", db_session)
        c2 = get_or_create_country("Saudi Arabia", db_session)
        db_session.commit()
        assert c1.country_code != c2.country_code


class TestGetOrCreateState:
    def test_creates_state_scoped_by_country(self, db_session):
        country = get_or_create_country("United Arab Emirates", db_session)
        db_session.commit()
        state = get_or_create_state("Dubai Emirate", country.country_code, db_session)
        db_session.commit()
        assert state.state_code == "sta_dubai_emirate"
        assert state.country_code == country.country_code

    def test_idempotent_same_name_same_country(self, db_session):
        country = get_or_create_country("United Arab Emirates", db_session)
        db_session.commit()
        s1 = get_or_create_state("Dubai Emirate", country.country_code, db_session)
        db_session.commit()
        s2 = get_or_create_state("Dubai Emirate", country.country_code, db_session)
        db_session.commit()
        assert s1.state_code == s2.state_code

    def test_same_state_name_different_country_gets_different_rows(self, db_session):
        c1 = get_or_create_country("India", db_session)
        c2 = get_or_create_country("Pakistan", db_session)
        db_session.commit()
        s1 = get_or_create_state("Punjab", c1.country_code, db_session)
        db_session.commit()
        s2 = get_or_create_state("Punjab", c2.country_code, db_session)
        db_session.commit()
        assert s1.state_code != s2.state_code
        assert s1.country_code == c1.country_code
        assert s2.country_code == c2.country_code


class TestGetOrCreateCity:
    def test_creates_city_scoped_by_country(self, db_session):
        country = get_or_create_country("United Arab Emirates", db_session)
        db_session.commit()
        state = get_or_create_state("Dubai Emirate", country.country_code, db_session)
        db_session.commit()
        city = get_or_create_city("Dubai", country.country_code, state.state_code, db_session)
        db_session.commit()
        assert city.city_code == "cty_dubai"
        assert city.country_code == country.country_code
        assert city.state_code == state.state_code

    def test_idempotent_same_name_same_country(self, db_session):
        country = get_or_create_country("United Arab Emirates", db_session)
        db_session.commit()
        c1 = get_or_create_city("Dubai", country.country_code, None, db_session)
        db_session.commit()
        c2 = get_or_create_city("Dubai", country.country_code, None, db_session)
        db_session.commit()
        assert c1.city_code == c2.city_code

    def test_same_city_name_different_country_different_rows(self, db_session):
        c1 = get_or_create_country("India", db_session)
        c2 = get_or_create_country("Pakistan", db_session)
        db_session.commit()
        city1 = get_or_create_city("Lahore", c1.country_code, None, db_session)
        db_session.commit()
        city2 = get_or_create_city("Lahore", c2.country_code, None, db_session)
        db_session.commit()
        assert city1.city_code != city2.city_code


class TestResolveLocationCodes:
    def test_full_resolution(self, db_session):
        city_code, state_code, country_code = resolve_location_codes(
            "Dubai", "Dubai Emirate", "United Arab Emirates", db_session
        )
        db_session.commit()
        assert country_code == "ctr_united_arab_emirates"
        assert state_code == "sta_dubai_emirate"
        assert city_code == "cty_dubai"

    def test_city_and_country_only(self, db_session):
        city_code, state_code, country_code = resolve_location_codes(
            "Mecca", None, "Saudi Arabia", db_session
        )
        db_session.commit()
        assert country_code is not None
        assert state_code is None
        assert city_code is not None

    def test_country_only(self, db_session):
        city_code, state_code, country_code = resolve_location_codes(
            None, None, "Turkey", db_session
        )
        db_session.commit()
        assert country_code is not None
        assert state_code is None
        assert city_code is None

    def test_all_none(self, db_session):
        city_code, state_code, country_code = resolve_location_codes(None, None, None, db_session)
        assert city_code is None
        assert state_code is None
        assert country_code is None

    def test_idempotent_full(self, db_session):
        """Same strings → same codes on repeated calls."""
        r1 = resolve_location_codes("Dubai", "Dubai Emirate", "United Arab Emirates", db_session)
        db_session.commit()
        r2 = resolve_location_codes("Dubai", "Dubai Emirate", "United Arab Emirates", db_session)
        db_session.commit()
        assert r1 == r2

    def test_city_without_country_skipped(self, db_session):
        """City string without country string → city_code is None (can't scope without country)."""
        city_code, state_code, country_code = resolve_location_codes(
            "Dubai", None, None, db_session
        )
        assert city_code is None
        assert state_code is None
        assert country_code is None


class TestCityAliases:
    """Tests for the CityAlias lookup in resolve_location_codes."""

    def test_alias_resolves_to_canonical_city(self, db_session):
        """An alias name resolves to the canonical city_code."""

        country = get_or_create_country("United Arab Emirates", db_session)
        db_session.commit()
        city = get_or_create_city("Dubai", country.country_code, None, db_session)
        db_session.commit()

        get_or_create_city_alias("دبي", city.city_code, country.country_code, db_session)
        db_session.commit()

        city_code, _, _ = resolve_location_codes("دبي", None, "United Arab Emirates", db_session)
        assert city_code == city.city_code

    def test_alias_without_country_scoping(self, db_session):
        """A global alias (country_code=None) resolves for any country."""
        country = get_or_create_country("Saudi Arabia", db_session)
        db_session.commit()
        city = get_or_create_city("Mecca", country.country_code, None, db_session)
        db_session.commit()

        get_or_create_city_alias("Makkah", city.city_code, None, db_session)
        db_session.commit()

        city_code, _, _ = resolve_location_codes("Makkah", None, "Saudi Arabia", db_session)
        assert city_code == city.city_code

    def test_unknown_city_still_creates(self, db_session):
        """A name with no alias still creates a new city row normally."""
        get_or_create_country("United Arab Emirates", db_session)
        db_session.commit()

        city_code, state_code, country_code = resolve_location_codes(
            "Sharjah", None, "United Arab Emirates", db_session
        )
        db_session.commit()
        assert city_code == "cty_sharjah"

    def test_alias_idempotent(self, db_session):
        """get_or_create_city_alias called twice returns the same row."""
        country = get_or_create_country("India", db_session)
        db_session.commit()
        city = get_or_create_city("Mumbai", country.country_code, None, db_session)
        db_session.commit()

        a1 = get_or_create_city_alias("Bombay", city.city_code, None, db_session)
        db_session.commit()
        a2 = get_or_create_city_alias("Bombay", city.city_code, None, db_session)
        db_session.commit()
        assert a1.id == a2.id

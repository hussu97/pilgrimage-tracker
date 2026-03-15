"""Tests for P5.1 cities endpoint: /api/v1/cities."""

from tests.conftest import SAMPLE_PLACE

PLACES_URL = "/api/v1/places"
CITIES_URL = "/api/v1/cities"


_API_KEY_HEADERS = {"X-API-Key": "test-api-key"}


def _create_place(client, place_code, city, religion="islam", **overrides):
    data = {
        **SAMPLE_PLACE,
        "place_code": place_code,
        "city": city,
        "religion": religion,
        **overrides,
    }
    return client.post(PLACES_URL, json=data, headers=_API_KEY_HEADERS)


class TestCitiesList:
    """GET /api/v1/cities"""

    def test_empty_cities(self, client):
        resp = client.get(CITIES_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert "cities" in data
        assert data["cities"] == []

    def test_cities_with_places(self, client):
        _create_place(client, "plc_city001", "Dubai")
        _create_place(client, "plc_city002", "Dubai", "christianity")
        _create_place(client, "plc_city003", "London")
        resp = client.get(CITIES_URL)
        assert resp.status_code == 200
        cities = resp.json()["cities"]
        city_names = [c["city"] for c in cities]
        assert "Dubai" in city_names
        assert "London" in city_names

    def test_cities_sorted_by_count_desc(self, client):
        _create_place(client, "plc_sort001", "Dubai")
        _create_place(client, "plc_sort002", "Dubai")
        _create_place(client, "plc_sort003", "London")
        resp = client.get(CITIES_URL)
        cities = resp.json()["cities"]
        counts = [c["count"] for c in cities]
        assert counts == sorted(counts, reverse=True)

    def test_city_has_slug(self, client):
        _create_place(client, "plc_slug001", "New York")
        resp = client.get(CITIES_URL)
        cities = resp.json()["cities"]
        ny = next((c for c in cities if c["city"] == "New York"), None)
        assert ny is not None
        assert ny["city_slug"] == "new-york"

    def test_city_count(self, client):
        _create_place(client, "plc_cnt001", "Dubai")
        _create_place(client, "plc_cnt002", "Dubai")
        resp = client.get(CITIES_URL)
        cities = resp.json()["cities"]
        dubai = next((c for c in cities if c["city"] == "Dubai"), None)
        assert dubai is not None
        assert dubai["count"] == 2

    def test_places_without_city_excluded(self, client):
        """Places with no city should not appear in city list."""
        data = {**SAMPLE_PLACE, "place_code": "plc_nocity", "city": None}
        client.post(PLACES_URL, json=data)
        resp = client.get(CITIES_URL)
        cities = resp.json()["cities"]
        # No city entry should be None
        assert all(c["city"] is not None for c in cities)


class TestCityPlaces:
    """GET /api/v1/cities/{city_slug}"""

    def test_places_in_city(self, client):
        _create_place(client, "plc_dubai001", "Dubai")
        _create_place(client, "plc_dubai002", "Dubai")
        _create_place(client, "plc_london001", "London")
        resp = client.get(f"{CITIES_URL}/dubai")
        assert resp.status_code == 200
        data = resp.json()
        assert "city" in data
        assert "places" in data
        assert len(data["places"]) == 2

    def test_city_not_found_returns_404(self, client):
        resp = client.get(f"{CITIES_URL}/nonexistent-city-xyz")
        assert resp.status_code == 404

    def test_place_has_required_fields(self, client):
        _create_place(client, "plc_fields001", "Dubai")
        resp = client.get(f"{CITIES_URL}/dubai")
        places = resp.json()["places"]
        assert len(places) == 1
        place = places[0]
        assert "place_code" in place
        assert "name" in place
        assert "religion" in place
        assert "address" in place

    def test_city_slug_case_insensitive(self, client):
        _create_place(client, "plc_case001", "Dubai")
        resp = client.get(f"{CITIES_URL}/DUBAI")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["places"]) >= 1


class TestCityReligionPlaces:
    """GET /api/v1/cities/{city_slug}/{religion}"""

    def test_filter_by_religion(self, client):
        _create_place(client, "plc_rel001", "Dubai", "islam")
        _create_place(client, "plc_rel002", "Dubai", "christianity")
        _create_place(client, "plc_rel003", "Dubai", "hinduism")
        resp = client.get(f"{CITIES_URL}/dubai/islam")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["places"]) == 1
        assert data["places"][0]["religion"] == "islam"

    def test_filter_returns_empty_for_missing_religion(self, client):
        _create_place(client, "plc_missing001", "Dubai", "islam")
        resp = client.get(f"{CITIES_URL}/dubai/buddhism")
        assert resp.status_code == 200
        assert resp.json()["places"] == []

    def test_city_and_religion_in_response(self, client):
        _create_place(client, "plc_resp001", "London", "christianity")
        resp = client.get(f"{CITIES_URL}/london/christianity")
        data = resp.json()
        assert "city" in data
        assert "religion" in data
        assert data["religion"] == "christianity"


# ── city popularity metrics ────────────────────────────────────────────────────


class TestCityMetrics:
    """GET /api/v1/cities?include_metrics=true"""

    def _register_and_token(self, client, email="citymetrics@example.com"):
        resp = client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": "Pass1234!", "display_name": "MetricsUser"},
        )
        assert resp.status_code == 200
        return resp.json()["token"]

    def test_metrics_fields_present_when_requested(self, client):
        """include_metrics=true adds checkins_30d and popularity_label to each city."""
        _create_place(client, "plc_met001", "Dubai")
        resp = client.get(CITIES_URL, params={"include_metrics": "true"})
        assert resp.status_code == 200
        cities = resp.json()["cities"]
        assert len(cities) >= 1
        city = next((c for c in cities if c["city"] == "Dubai"), None)
        assert city is not None
        assert "checkins_30d" in city
        assert "popularity_label" in city

    def test_metrics_fields_absent_without_flag(self, client):
        """Without include_metrics=true, fields are not present."""
        _create_place(client, "plc_met002", "London")
        resp = client.get(CITIES_URL)
        assert resp.status_code == 200
        cities = resp.json()["cities"]
        if cities:
            assert "checkins_30d" not in cities[0]
            assert "popularity_label" not in cities[0]

    def test_metrics_checkins_zero_when_no_checkins(self, client):
        """checkins_30d is 0 for a city with no check-ins."""
        _create_place(client, "plc_met003", "Tokyo")
        resp = client.get(CITIES_URL, params={"include_metrics": "true"})
        cities = resp.json()["cities"]
        tokyo = next((c for c in cities if c["city"] == "Tokyo"), None)
        assert tokyo is not None
        assert tokyo["checkins_30d"] == 0
        assert tokyo["popularity_label"] is None

    def test_metrics_checkins_counted_for_city(self, client, db_session):
        """Places with recent check-ins are counted per city."""
        from datetime import UTC, datetime, timedelta

        from app.db.models import CheckIn, Place

        # Create place in DB directly (so we can also create check-ins directly)
        place = Place(
            place_code="plc_met_ci01",
            name="Checkin Mosque",
            religion="islam",
            place_type="mosque",
            lat=25.0,
            lng=55.0,
            address="Test St",
            city="Riyadh",
        )
        db_session.add(place)
        db_session.commit()

        # Add 10 check-ins within last 30 days
        for i in range(10):
            ci = CheckIn(
                check_in_code=f"ci_met_{i:04d}",
                user_code="usr_test_metrics",
                place_code="plc_met_ci01",
                checked_in_at=datetime.now(UTC) - timedelta(days=i),
            )
            db_session.add(ci)
        db_session.commit()

        resp = client.get(CITIES_URL, params={"include_metrics": "true"})
        cities = resp.json()["cities"]
        riyadh = next((c for c in cities if c["city"] == "Riyadh"), None)
        assert riyadh is not None
        assert riyadh["checkins_30d"] == 10
        # 10 > 5 so label should be "Growing"
        assert riyadh["popularity_label"] == "Growing"

    def test_metrics_popularity_label_trending(self, client, db_session):
        """Cities with >50 check-ins get 'Trending' label."""
        from datetime import UTC, datetime

        from app.db.models import CheckIn, Place

        place = Place(
            place_code="plc_trending01",
            name="Trending Mosque",
            religion="islam",
            place_type="mosque",
            lat=24.0,
            lng=54.0,
            address="Test",
            city="Mecca",
        )
        db_session.add(place)
        db_session.commit()

        for i in range(55):
            ci = CheckIn(
                check_in_code=f"ci_trend_{i:04d}",
                user_code="usr_trend_test",
                place_code="plc_trending01",
                checked_in_at=datetime.now(UTC),
            )
            db_session.add(ci)
        db_session.commit()

        resp = client.get(CITIES_URL, params={"include_metrics": "true"})
        cities = resp.json()["cities"]
        mecca = next((c for c in cities if c["city"] == "Mecca"), None)
        assert mecca is not None
        assert mecca["checkins_30d"] == 55
        assert mecca["popularity_label"] == "Trending"


class TestCitiesDeduplication:
    """Tests that verify GROUP BY city_code deduplication works."""

    def test_dedup_by_city_code(self, client, db_session):
        """Two places with different city strings but same city_code appear as one entry."""
        from app.db.models import City, Country, Place

        # Create country and canonical city
        country = Country(country_code="ctr_uae_dedup", name="UAE Dedup", translations={})
        db_session.add(country)
        db_session.flush()
        city = City(
            city_code="cty_dubai_dedup",
            name="Dubai",
            country_code="ctr_uae_dedup",
            translations={},
        )
        db_session.add(city)
        db_session.flush()

        # Place 1: English name, has city_code
        p1 = Place(
            place_code="plc_dedup001",
            name="Mosque A",
            religion="islam",
            place_type="mosque",
            lat=25.0,
            lng=55.0,
            address="Test",
            city="Dubai",
            city_code="cty_dubai_dedup",
            country_code="ctr_uae_dedup",
        )
        # Place 2: Arabic name, same city_code
        p2 = Place(
            place_code="plc_dedup002",
            name="Mosque B",
            religion="islam",
            place_type="mosque",
            lat=25.1,
            lng=55.1,
            address="Test",
            city="دبي",
            city_code="cty_dubai_dedup",
            country_code="ctr_uae_dedup",
        )
        db_session.add(p1)
        db_session.add(p2)
        db_session.commit()

        resp = client.get(CITIES_URL)
        assert resp.status_code == 200
        cities = resp.json()["cities"]
        dubai_entries = [c for c in cities if c["city_code"] == "cty_dubai_dedup"]
        assert len(dubai_entries) == 1, "Two places with same city_code should merge into one"
        assert dubai_entries[0]["count"] == 2

    def test_places_no_city_code_still_appear(self, client, db_session):
        """Places with city_code=None but a city string still appear in the list."""
        from app.db.models import Place

        p = Place(
            place_code="plc_nocode001",
            name="Old Mosque",
            religion="islam",
            place_type="mosque",
            lat=30.0,
            lng=31.0,
            address="Cairo",
            city="Cairo",
            city_code=None,
        )
        db_session.add(p)
        db_session.commit()

        resp = client.get(CITIES_URL)
        assert resp.status_code == 200
        cities = resp.json()["cities"]
        cairo = next((c for c in cities if c["city"] == "Cairo"), None)
        assert cairo is not None

    def test_dedup_city_slug_route_uses_city_code(self, client, db_session):
        """The /{city_slug} route returns all places matched by city_code."""
        from app.db.models import City, Country, Place

        country = Country(country_code="ctr_uae_slug", name="UAE Slug", translations={})
        db_session.add(country)
        db_session.flush()
        city = City(
            city_code="cty_dubai_slug",
            name="Dubai",
            country_code="ctr_uae_slug",
            translations={},
        )
        db_session.add(city)
        db_session.flush()

        for i, city_str in enumerate(["Dubai", "دبي", "Deira"]):
            p = Place(
                place_code=f"plc_slug_dedup{i:03d}",
                name=f"Place {i}",
                religion="islam",
                place_type="mosque",
                lat=25.0 + i,
                lng=55.0,
                address="Test",
                city=city_str,
                city_code="cty_dubai_slug",
                country_code="ctr_uae_slug",
            )
            db_session.add(p)
        db_session.commit()

        resp = client.get(f"{CITIES_URL}/dubai")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3


class TestCityLangTranslations:
    """Tests for ?lang= query parameter on city endpoints."""

    def test_city_places_lang_overlays_translations(self, client, db_session):
        """GET /cities/{slug}?lang=ar overlays Arabic translations on place names."""
        from datetime import UTC, datetime

        from app.db.models import ContentTranslation, Place

        place = Place(
            place_code="plc_lang_city001",
            name="Historic Mosque",
            religion="islam",
            place_type="mosque",
            lat=25.0,
            lng=55.0,
            address="Main Street",
            city="Dubai",
        )
        db_session.add(place)
        db_session.commit()

        now = datetime.now(UTC)
        db_session.add(
            ContentTranslation(
                entity_type="place",
                entity_code="plc_lang_city001",
                field="name",
                lang="ar",
                translated_text="مكان مقدس",
                source="test",
                created_at=now,
                updated_at=now,
            )
        )
        db_session.commit()

        resp = client.get(f"{CITIES_URL}/dubai?lang=ar")
        assert resp.status_code == 200
        data = resp.json()
        our_place = next((p for p in data["places"] if p["place_code"] == "plc_lang_city001"), None)
        assert our_place is not None
        assert our_place["name"] == "مكان مقدس"

    def test_city_places_lang_en_no_overlay(self, client, db_session):
        """GET /cities/{slug}?lang=en returns original English names."""
        from app.db.models import Place

        place = Place(
            place_code="plc_lang_city_en001",
            name="English Mosque",
            religion="islam",
            place_type="mosque",
            lat=25.0,
            lng=55.0,
            address="English Street",
            city="London",
        )
        db_session.add(place)
        db_session.commit()

        resp = client.get(f"{CITIES_URL}/london?lang=en")
        assert resp.status_code == 200
        data = resp.json()
        our_place = next(
            (p for p in data["places"] if p["place_code"] == "plc_lang_city_en001"), None
        )
        assert our_place is not None
        assert our_place["name"] == "English Mosque"

    def test_city_religion_places_lang_overlays_translations(self, client, db_session):
        """GET /cities/{slug}/{religion}?lang=ar overlays translations."""
        from datetime import UTC, datetime

        from app.db.models import ContentTranslation, Place

        place = Place(
            place_code="plc_lang_rel001",
            name="Sacred Temple",
            religion="hinduism",
            place_type="temple",
            lat=28.6,
            lng=77.2,
            address="Temple Road",
            city="Delhi",
        )
        db_session.add(place)
        db_session.commit()

        now = datetime.now(UTC)
        db_session.add(
            ContentTranslation(
                entity_type="place",
                entity_code="plc_lang_rel001",
                field="name",
                lang="ar",
                translated_text="معبد مقدس",
                source="test",
                created_at=now,
                updated_at=now,
            )
        )
        db_session.commit()

        resp = client.get(f"{CITIES_URL}/delhi/hinduism?lang=ar")
        assert resp.status_code == 200
        data = resp.json()
        our_place = next((p for p in data["places"] if p["place_code"] == "plc_lang_rel001"), None)
        assert our_place is not None
        assert our_place["name"] == "معبد مقدس"

    def test_city_places_no_lang_returns_english(self, client, db_session):
        """Without lang param, place names are returned in English."""
        from app.db.models import Place

        place = Place(
            place_code="plc_nolang001",
            name="Original Name",
            religion="islam",
            place_type="mosque",
            lat=25.0,
            lng=55.0,
            address="Some Street",
            city="Abu Dhabi",
        )
        db_session.add(place)
        db_session.commit()

        resp = client.get(f"{CITIES_URL}/abu-dhabi")
        assert resp.status_code == 200
        data = resp.json()
        our_place = next((p for p in data["places"] if p["place_code"] == "plc_nolang001"), None)
        assert our_place is not None
        assert our_place["name"] == "Original Name"


class TestCityImages:
    """GET /api/v1/cities?include_images=true"""

    def test_images_via_city_code(self, client, db_session):
        """Cities matched by city_code (not city string) must still return top_images."""
        from app.db.models import City, Country, Place, PlaceImage

        country = Country(country_code="ctr_img_test", name="India", translations={})
        db_session.add(country)
        db_session.flush()
        city = City(
            city_code="cty_hyd_img",
            name="Hyderabad",
            country_code="ctr_img_test",
            translations={},
        )
        db_session.add(city)
        db_session.flush()

        # Place linked via city_code (city string intentionally differs / blank)
        p = Place(
            place_code="plc_hyd_img01",
            name="Mecca Masjid",
            religion="islam",
            place_type="mosque",
            lat=17.36,
            lng=78.47,
            address="Hyderabad",
            city=None,  # no city string — only city_code
            city_code="cty_hyd_img",
            country_code="ctr_img_test",
        )
        db_session.add(p)
        db_session.flush()
        img = PlaceImage(
            place_code="plc_hyd_img01",
            image_type="url",
            url="https://example.com/mecca_masjid.jpg",
        )
        db_session.add(img)
        db_session.commit()

        resp = client.get(CITIES_URL, params={"include_images": "true"})
        assert resp.status_code == 200
        cities = resp.json()["cities"]
        hyd = next((c for c in cities if c.get("city_code") == "cty_hyd_img"), None)
        assert hyd is not None, "Hyderabad city should appear"
        assert "top_images" in hyd
        assert len(hyd["top_images"]) == 1
        assert hyd["top_images"][0] == "https://example.com/mecca_masjid.jpg"

    def test_images_ordered_by_popularity(self, client, db_session):
        """The collage images come from the highest-rated place, not insertion order."""
        from app.db.models import City, Country, Place, PlaceImage, Review

        country = Country(country_code="ctr_pop_test", name="Testland", translations={})
        db_session.add(country)
        db_session.flush()
        city = City(
            city_code="cty_pop_test",
            name="Popville",
            country_code="ctr_pop_test",
            translations={},
        )
        db_session.add(city)
        db_session.flush()

        # Place 1: low-rated, inserted first
        p_low = Place(
            place_code="plc_pop_low",
            name="Low Rated Mosque",
            religion="islam",
            place_type="mosque",
            lat=1.0,
            lng=1.0,
            address="Test",
            city="Popville",
            city_code="cty_pop_test",
            country_code="ctr_pop_test",
        )
        # Place 2: high-rated, inserted second
        p_high = Place(
            place_code="plc_pop_high",
            name="High Rated Mosque",
            religion="islam",
            place_type="mosque",
            lat=1.1,
            lng=1.1,
            address="Test",
            city="Popville",
            city_code="cty_pop_test",
            country_code="ctr_pop_test",
        )
        db_session.add(p_low)
        db_session.add(p_high)
        db_session.flush()

        db_session.add(
            PlaceImage(
                place_code="plc_pop_low", image_type="url", url="https://example.com/low.jpg"
            )
        )
        db_session.add(
            PlaceImage(
                place_code="plc_pop_high", image_type="url", url="https://example.com/high.jpg"
            )
        )

        # Give p_high a 5-star review, p_low a 1-star review
        db_session.add(
            Review(review_code="rv_pop_high", place_code="plc_pop_high", rating=5, text="Great")
        )
        db_session.add(
            Review(review_code="rv_pop_low", place_code="plc_pop_low", rating=1, text="Bad")
        )
        db_session.commit()

        resp = client.get(CITIES_URL, params={"include_images": "true"})
        assert resp.status_code == 200
        cities = resp.json()["cities"]
        popville = next((c for c in cities if c.get("city_code") == "cty_pop_test"), None)
        assert popville is not None
        assert len(popville["top_images"]) >= 1
        # The first image must be from the high-rated place
        assert popville["top_images"][0] == "https://example.com/high.jpg"

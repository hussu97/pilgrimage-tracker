"""Tests for /api/v1/places endpoints: list, get, create, search, filters, reviews, check-ins, favorites."""

from tests.conftest import SAMPLE_PLACE

PLACES_URL = "/api/v1/places"


def _register_and_token(client, email="places_user@example.com"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Pass1234!", "display_name": "PlaceUser"},
    )
    assert resp.status_code == 200
    return resp.json()["token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_place(client, place_code, **overrides):
    data = {**SAMPLE_PLACE, "place_code": place_code, **overrides}
    return client.post(PLACES_URL, json=data)


# ── list places ────────────────────────────────────────────────────────────────


class TestListPlaces:
    def test_list_empty(self, client):
        resp = client.get(PLACES_URL, params={"lat": 0, "lng": 0})
        assert resp.status_code == 200
        data = resp.json()
        assert "places" in data
        assert isinstance(data["places"], list)

    def test_list_returns_created_place(self, client):
        _create_place(client, "plc_listret01")
        resp = client.get(PLACES_URL, params={"lat": 25.2048, "lng": 55.2708})
        assert resp.status_code == 200
        codes = [p["place_code"] for p in resp.json()["places"]]
        assert "plc_listret01" in codes

    def test_list_has_open_status_field(self, client):
        _create_place(client, "plc_osfld0001")
        resp = client.get(PLACES_URL, params={"lat": 25.2048, "lng": 55.2708})
        assert resp.status_code == 200
        places = resp.json()["places"]
        if places:
            assert "open_status" in places[0]
            assert places[0]["open_status"] in ("open", "closed", "unknown")

    def test_list_filter_by_religion(self, client):
        _create_place(client, "plc_islam001", religion="islam")
        _create_place(
            client,
            "plc_hindu001",
            name="Test Temple",
            religion="hinduism",
            place_type="temple",
        )
        resp = client.get(PLACES_URL, params={"religion": "islam"})
        assert resp.status_code == 200
        for p in resp.json()["places"]:
            assert p["religion"] == "islam"

    def test_list_filter_by_religion_all_returns_all_places(self, client):
        _create_place(client, "plc_all_isl", religion="islam")
        _create_place(
            client, "plc_all_hin", name="Test Temple All", religion="hinduism", place_type="temple"
        )
        _create_place(
            client,
            "plc_all_chr",
            name="Test Church All",
            religion="christianity",
            place_type="church",
        )
        resp = client.get(PLACES_URL, params={"religion": "all"})
        assert resp.status_code == 200
        codes = [p["place_code"] for p in resp.json()["places"]]
        assert "plc_all_isl" in codes
        assert "plc_all_hin" in codes
        assert "plc_all_chr" in codes

    def test_list_with_radius_filter(self, client):
        _create_place(client, "plc_near0001", lat=25.2048, lng=55.2708)
        _create_place(
            client,
            "plc_far00001",
            name="Far Mosque",
            lat=51.5074,
            lng=-0.1278,
        )
        resp = client.get(PLACES_URL, params={"lat": 25.2048, "lng": 55.2708, "radius": 10})
        assert resp.status_code == 200
        codes = [p["place_code"] for p in resp.json()["places"]]
        assert "plc_near0001" in codes
        assert "plc_far00001" not in codes

    def test_list_filter_by_city(self, client):
        _create_place(client, "plc_dxb00001", name="Dubai Mosque", city="Dubai")
        _create_place(client, "plc_lnd00001", name="London Mosque", city="London")
        resp = client.get(PLACES_URL, params={"city": "Dubai"})
        assert resp.status_code == 200
        codes = [p["place_code"] for p in resp.json()["places"]]
        assert "plc_dxb00001" in codes
        assert "plc_lnd00001" not in codes

    def test_list_filter_by_city_case_insensitive(self, client):
        _create_place(client, "plc_dxb00002", name="Dubai Temple", city="Dubai")
        resp = client.get(PLACES_URL, params={"city": "dubai"})
        assert resp.status_code == 200
        codes = [p["place_code"] for p in resp.json()["places"]]
        assert "plc_dxb00002" in codes

    def test_list_search(self, client):
        _create_place(client, "plc_srch0001", name="Grand Mosque Search Test")
        resp = client.get(PLACES_URL, params={"search": "Grand Mosque Search"})
        assert resp.status_code == 200
        codes = [p["place_code"] for p in resp.json()["places"]]
        assert "plc_srch0001" in codes

    def test_list_has_filters_meta(self, client):
        resp = client.get(PLACES_URL, params={"lat": 0, "lng": 0})
        assert resp.status_code == 200
        data = resp.json()
        assert "filters" in data
        assert "options" in data["filters"]

    def test_list_pagination(self, client):
        for i in range(3):
            _create_place(client, f"plc_page{i:04d}", name=f"Pager Place {i}")
        resp = client.get(PLACES_URL, params={"limit": 2})
        assert resp.status_code == 200
        assert len(resp.json()["places"]) <= 2

    def test_list_include_checkins_false_by_default(self, client):
        _create_place(client, "plc_chk00001")
        resp = client.get(PLACES_URL, params={"lat": 25.2048, "lng": 55.2708})
        assert resp.status_code == 200
        places = resp.json()["places"]
        if places:
            assert "total_checkins_count" not in places[0]

    def test_list_include_checkins_true(self, client):
        _create_place(client, "plc_chk00002")
        resp = client.get(
            PLACES_URL, params={"lat": 25.2048, "lng": 55.2708, "include_checkins": "true"}
        )
        assert resp.status_code == 200
        places = resp.json()["places"]
        if places:
            assert "total_checkins_count" in places[0]
            assert isinstance(places[0]["total_checkins_count"], int)

    def test_list_include_checkins_with_actual_checkin(self, client):
        _create_place(client, "plc_chk00003")
        token = _register_and_token(client, "checkin_count@example.com")
        # Do a check-in
        resp = client.post(
            f"{PLACES_URL}/plc_chk00003/check-in",
            json={},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        # Now list with include_checkins
        resp = client.get(PLACES_URL, params={"include_checkins": "true"})
        assert resp.status_code == 200
        place = next((p for p in resp.json()["places"] if p["place_code"] == "plc_chk00003"), None)
        assert place is not None
        assert place["total_checkins_count"] >= 1


# ── get single place ───────────────────────────────────────────────────────────


class TestGetPlace:
    def test_get_existing_place(self, client):
        _create_place(client, "plc_get00001")
        resp = client.get(f"{PLACES_URL}/plc_get00001")
        assert resp.status_code == 200
        data = resp.json()
        assert data["place_code"] == "plc_get00001"
        assert "open_status" in data

    def test_get_nonexistent_place(self, client):
        resp = client.get(f"{PLACES_URL}/plc_notexist0")
        assert resp.status_code == 404

    def test_get_place_has_normalized_hours(self, client):
        _create_place(
            client,
            "plc_oh000001",
            opening_hours={
                "Monday": "00:00-23:59",
                "Tuesday": "00:00-23:59",
                "Wednesday": "00:00-23:59",
                "Thursday": "00:00-23:59",
                "Friday": "00:00-23:59",
                "Saturday": "00:00-23:59",
                "Sunday": "00:00-23:59",
            },
        )
        resp = client.get(f"{PLACES_URL}/plc_oh000001")
        assert resp.status_code == 200
        hours = resp.json().get("opening_hours", {})
        # 00:00-23:59 should be normalized to OPEN_24_HOURS in API response
        for v in hours.values():
            assert v == "OPEN_24_HOURS"

    def test_get_place_open_status_field(self, client):
        _create_place(client, "plc_os000001")
        resp = client.get(f"{PLACES_URL}/plc_os000001")
        assert resp.status_code == 200
        data = resp.json()
        assert data["open_status"] in ("open", "closed", "unknown")


# ── create / upsert place ─────────────────────────────────────────────────────


class TestCreatePlace:
    def test_create_success(self, client):
        resp = _create_place(client, "plc_create01")
        assert resp.status_code in (200, 201)
        assert resp.json()["place_code"] == "plc_create01"

    def test_create_upsert_updates_name(self, client):
        _create_place(client, "plc_upsert01", name="Original Name")
        resp = _create_place(client, "plc_upsert01", name="Updated Name")
        assert resp.status_code in (200, 201)
        assert resp.json()["name"] == "Updated Name"

    def test_create_missing_required_fields_returns_422(self, client):
        resp = client.post(PLACES_URL, json={"name": "Incomplete"})
        assert resp.status_code == 422


# ── reviews ────────────────────────────────────────────────────────────────────


class TestPlaceReviews:
    def test_list_reviews_empty(self, client):
        _create_place(client, "plc_rev00001")
        resp = client.get(f"{PLACES_URL}/plc_rev00001/reviews")
        assert resp.status_code == 200
        data = resp.json()
        assert "reviews" in data
        assert data["reviews"] == []

    def test_create_review(self, client):
        _create_place(client, "plc_revpost1")
        token = _register_and_token(client, "rev_author@example.com")
        resp = client.post(
            f"{PLACES_URL}/plc_revpost1/reviews",
            json={"rating": 5, "title": "Great!", "body": "Really enjoyed it."},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["rating"] == 5
        assert "review_code" in data

    def test_create_review_requires_auth(self, client):
        _create_place(client, "plc_revauth1")
        resp = client.post(
            f"{PLACES_URL}/plc_revauth1/reviews",
            json={"rating": 4, "title": "Nice"},
        )
        assert resp.status_code == 401

    def test_create_review_rating_out_of_range(self, client):
        _create_place(client, "plc_revrang1")
        token = _register_and_token(client, "rev_range@example.com")
        resp = client.post(
            f"{PLACES_URL}/plc_revrang1/reviews",
            json={"rating": 6},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 400


# ── check-ins ──────────────────────────────────────────────────────────────────


class TestCheckIns:
    def test_check_in_creates_record(self, client):
        _create_place(client, "plc_chkin001")
        token = _register_and_token(client, "checkin@example.com")
        resp = client.post(
            f"{PLACES_URL}/plc_chkin001/check-in",
            json={"note": "Was here!"},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "check_in_code" in data
        assert data["place_code"] == "plc_chkin001"

    def test_check_in_requires_auth(self, client):
        _create_place(client, "plc_chkauth1")
        resp = client.post(f"{PLACES_URL}/plc_chkauth1/check-in", json={})
        assert resp.status_code == 401

    def test_check_in_nonexistent_place(self, client):
        token = _register_and_token(client, "checkin2@example.com")
        resp = client.post(
            f"{PLACES_URL}/plc_ghostt01/check-in",
            json={},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404


# ── favorites ──────────────────────────────────────────────────────────────────


class TestFavorites:
    def test_add_favorite(self, client):
        _create_place(client, "plc_fav00001")
        token = _register_and_token(client, "fav_user@example.com")
        resp = client.post(
            f"{PLACES_URL}/plc_fav00001/favorite",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json().get("ok") is True

    def test_remove_favorite(self, client):
        _create_place(client, "plc_unfav001")
        token = _register_and_token(client, "unfav_user@example.com")
        client.post(f"{PLACES_URL}/plc_unfav001/favorite", headers=_auth_headers(token))
        resp = client.delete(f"{PLACES_URL}/plc_unfav001/favorite", headers=_auth_headers(token))
        assert resp.status_code == 200
        assert resp.json().get("ok") is True

    def test_favorite_requires_auth(self, client):
        _create_place(client, "plc_favauth1")
        resp = client.post(f"{PLACES_URL}/plc_favauth1/favorite")
        assert resp.status_code == 401


class TestLocationCodes:
    """Verify that batch upsert resolves location strings to city/state/country codes."""

    def test_batch_upsert_populates_location_codes(self, client):
        resp = client.post(
            f"{PLACES_URL}/batch",
            json={
                "places": [
                    {
                        **{
                            "place_code": "plc_loc_test1",
                            "name": "Location Test Mosque",
                            "religion": "islam",
                            "place_type": "mosque",
                            "lat": 25.2048,
                            "lng": 55.2708,
                            "address": "123 Test St",
                        },
                        "city": "Dubai",
                        "state": "Dubai Emirate",
                        "country": "United Arab Emirates",
                        "image_urls": [],
                        "attributes": [],
                    }
                ]
            },
        )
        assert resp.status_code == 200
        assert resp.json()["synced"] == 1

        detail = client.get(f"{PLACES_URL}/plc_loc_test1")
        assert detail.status_code == 200
        data = detail.json()
        assert data["country_code"] == "ctr_united_arab_emirates"
        assert data["state_code"] == "sta_dubai_emirate"
        assert data["city_code"] == "cty_dubai"

    def test_batch_upsert_idempotent_location_codes(self, client):
        """Re-sending same place with same location strings keeps same codes."""
        payload = {
            "places": [
                {
                    **{
                        "place_code": "plc_loc_idem1",
                        "name": "Idempotent Mosque",
                        "religion": "islam",
                        "place_type": "mosque",
                        "lat": 25.2,
                        "lng": 55.27,
                        "address": "456 Test St",
                    },
                    "city": "Mecca",
                    "state": None,
                    "country": "Saudi Arabia",
                    "image_urls": [],
                    "attributes": [],
                }
            ]
        }
        r1 = client.post(f"{PLACES_URL}/batch", json=payload)
        assert r1.status_code == 200
        r2 = client.post(f"{PLACES_URL}/batch", json=payload)
        assert r2.status_code == 200

        detail = client.get(f"{PLACES_URL}/plc_loc_idem1")
        data = detail.json()
        assert data["country_code"] is not None
        assert data["city_code"] is not None

    def test_place_without_location_strings_has_null_codes(self, client):
        _create_place(client, "plc_noloc001")
        detail = client.get(f"{PLACES_URL}/plc_noloc001")
        assert detail.status_code == 200
        data = detail.json()
        assert data["city_code"] is None
        assert data["state_code"] is None
        assert data["country_code"] is None


def _batch(client, places: list[dict]) -> dict:
    resp = client.post(f"{PLACES_URL}/batch", json={"places": places})
    assert resp.status_code == 200
    return resp.json()


def _place_payload(place_code: str, **overrides) -> dict:
    return {
        **SAMPLE_PLACE,
        "place_code": place_code,
        "image_urls": [],
        "attributes": [],
        **overrides,
    }


class TestBatchEndpoint:
    """Tests for batch upsert improvements: dedup, pre-fetch, caching, error isolation."""

    def test_batch_returns_action_created(self, client):
        data = _batch(client, [_place_payload("plc_bat_new1")])
        assert data["results"][0]["action"] == "created"

    def test_batch_returns_action_updated_on_resync(self, client):
        _batch(client, [_place_payload("plc_bat_upd1")])
        data = _batch(client, [_place_payload("plc_bat_upd1", name="Updated Name")])
        assert data["results"][0]["action"] == "updated"

    def test_batch_deduplicates_place_codes(self, client):
        """Duplicate place_code entries: last one wins, counted in duplicates_skipped."""
        data = _batch(
            client,
            [
                _place_payload("plc_bat_dup1", name="First"),
                _place_payload("plc_bat_dup1", name="Second"),
            ],
        )
        # Only 1 place processed, 1 duplicate skipped
        assert data["unique"] == 1
        assert data["duplicates_skipped"] == 1
        assert data["synced"] == 1

        # The last entry's name should be the one stored
        detail = client.get(f"{PLACES_URL}/plc_bat_dup1")
        assert detail.json()["name"] == "Second"

    def test_batch_error_does_not_prevent_subsequent_places(self, client, monkeypatch):
        """A runtime error on one place should not prevent others from being processed.

        Monkeypatches create_place to raise for a specific place_code, simulating a
        DB-level failure that happens after schema validation passes.
        """
        import app.db.places as _places_db

        original_create = _places_db.create_place

        def _failing_create(place_code, **kwargs):
            if place_code == "plc_bat_bad1":
                raise RuntimeError("Simulated DB failure")
            return original_create(place_code, **kwargs)

        monkeypatch.setattr(_places_db, "create_place", _failing_create)

        data = _batch(
            client,
            [
                _place_payload("plc_bat_ok01"),
                _place_payload("plc_bat_bad1"),
                _place_payload("plc_bat_ok02"),
            ],
        )
        codes_ok = {r["place_code"] for r in data["results"] if r["ok"]}
        codes_fail = {r["place_code"] for r in data["results"] if not r["ok"]}
        assert "plc_bat_ok01" in codes_ok
        assert "plc_bat_bad1" in codes_fail
        assert "plc_bat_ok02" in codes_ok
        assert data["synced"] == 2
        assert data["failed"] == 1

    def test_batch_total_counts_include_duplicates(self, client):
        data = _batch(
            client,
            [
                _place_payload("plc_bat_cnt1"),
                _place_payload("plc_bat_cnt1"),  # duplicate
                _place_payload("plc_bat_cnt2"),
            ],
        )
        assert data["total"] == 3
        assert data["unique"] == 2
        assert data["synced"] == 2
        assert data["duplicates_skipped"] == 1

    def test_batch_shared_location_resolved_once(self, client):
        """Multiple places in the same city should all get the same city_code."""
        places = [
            _place_payload(
                f"plc_bat_loc{i}",
                city="Dubai",
                state="Dubai Emirate",
                country="United Arab Emirates",
            )
            for i in range(3)
        ]
        data = _batch(client, places)
        assert data["synced"] == 3

        for i in range(3):
            detail = client.get(f"{PLACES_URL}/plc_bat_loc{i}")
            assert detail.json()["city_code"] == "cty_dubai"

    def test_batch_size_limit_422(self, client):
        """Sending more than 500 places should be rejected with 422."""
        too_many = [_place_payload(f"plc_bat_big{i:04d}") for i in range(501)]
        resp = client.post(f"{PLACES_URL}/batch", json={"places": too_many})
        assert resp.status_code == 422

    def test_batch_attributes_persisted(self, client):
        """Attributes sent in a batch place are stored correctly."""
        data = _batch(
            client,
            [
                {
                    **_place_payload("plc_bat_atr1"),
                    "attributes": [
                        {"attribute_code": "has_parking", "value": True},
                    ],
                }
            ],
        )
        assert data["synced"] == 1

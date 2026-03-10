"""Tests for admin places endpoints — CRUD /api/v1/admin/places/..."""

from app.db.models import Place, PlaceImage

# ── Helpers ────────────────────────────────────────────────────────────────────


def _register(client, email="user@example.com", password="Testpass123!", display_name="Tester"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _make_admin(db_session, user_code: str) -> None:
    from sqlmodel import select

    from app.db.models import User

    user = db_session.exec(select(User).where(User.user_code == user_code)).first()
    user.is_admin = True
    db_session.add(user)
    db_session.commit()


def _admin_headers(client, db_session, email="admin@example.com"):
    data = _register(client, email=email)
    token = data["token"]
    user_code = data["user"]["user_code"]
    _make_admin(db_session, user_code)
    return {"Authorization": f"Bearer {token}"}


def _make_place(
    db_session, code="plc_ap00001", name="Test Place", religion="islam", place_type="mosque"
):
    place = Place(
        place_code=code,
        name=name,
        religion=religion,
        place_type=place_type,
        lat=25.0,
        lng=55.0,
        address="Test St",
        source="manual",
    )
    db_session.add(place)
    db_session.commit()
    return place


_CREATE_BODY = {
    "name": "New Mosque",
    "religion": "islam",
    "place_type": "mosque",
    "lat": 24.0,
    "lng": 46.0,
    "address": "Riyadh, Saudi Arabia",
}


# ── Tests: List places ─────────────────────────────────────────────────────────


class TestListPlaces:
    def test_requires_auth(self, client):
        resp = client.get("/api/v1/admin/places")
        assert resp.status_code == 401

    def test_requires_admin(self, client):
        data = _register(client, email="nonadmin@ap.com")
        token = data["token"]
        resp = client.get("/api/v1/admin/places", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_admin_can_list_places(self, client, db_session):
        headers = _admin_headers(client, db_session)
        _make_place(db_session, "plc_ap00002")
        resp = client.get("/api/v1/admin/places", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["total"] >= 1

    def test_search_filter(self, client, db_session):
        headers = _admin_headers(client, db_session)
        _make_place(db_session, "plc_ap00003", name="Unique Shrine")
        resp = client.get("/api/v1/admin/places?search=Unique+Shrine", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert any(p["name"] == "Unique Shrine" for p in data["items"])

    def test_religion_filter(self, client, db_session):
        headers = _admin_headers(client, db_session)
        _make_place(db_session, "plc_ap00004", religion="hinduism")
        resp = client.get("/api/v1/admin/places?religion=hinduism", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert all(p["religion"] == "hinduism" for p in data["items"])

    def test_place_type_filter(self, client, db_session):
        headers = _admin_headers(client, db_session)
        _make_place(db_session, "plc_ap00005", place_type="temple")
        resp = client.get("/api/v1/admin/places?place_type=temple", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert all(p["place_type"] == "temple" for p in data["items"])

    def test_pagination(self, client, db_session):
        headers = _admin_headers(client, db_session)
        _make_place(db_session, "plc_ap00006")
        _make_place(db_session, "plc_ap00007")
        resp = client.get("/api/v1/admin/places?page=1&page_size=1", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) <= 1

    def test_city_country_filter_matches_address(self, client, db_session):
        headers = _admin_headers(client, db_session)
        place = Place(
            place_code="plc_dubai001",
            name="Grand Mosque",
            religion="islam",
            place_type="mosque",
            lat=25.2,
            lng=55.3,
            address="Sheikh Zayed Rd, Dubai, UAE",
            source="manual",
        )
        db_session.add(place)
        db_session.commit()
        resp = client.get("/api/v1/admin/places?city_country=Dubai", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert any(p["place_code"] == "plc_dubai001" for p in data["items"])

    def test_city_country_filter_case_insensitive(self, client, db_session):
        headers = _admin_headers(client, db_session)
        place = Place(
            place_code="plc_riyadh01",
            name="Al Masjid",
            religion="islam",
            place_type="mosque",
            lat=24.7,
            lng=46.7,
            address="King Fahd Rd, Riyadh, Saudi Arabia",
            source="manual",
        )
        db_session.add(place)
        db_session.commit()
        resp = client.get("/api/v1/admin/places?city_country=riyadh", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert any(p["place_code"] == "plc_riyadh01" for p in data["items"])


# ── Tests: Create place ────────────────────────────────────────────────────────


class TestCreatePlace:
    def test_create_place_success(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.post("/api/v1/admin/places", json=_CREATE_BODY, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "New Mosque"
        assert data["place_code"].startswith("plc_")
        assert data["review_count"] == 0
        assert data["check_in_count"] == 0

    def test_create_place_with_optional_fields(self, client, db_session):
        headers = _admin_headers(client, db_session)
        body = {
            **_CREATE_BODY,
            "description": "A beautiful mosque",
            "website_url": "https://example.com",
        }
        resp = client.post("/api/v1/admin/places", json=body, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["description"] == "A beautiful mosque"
        assert data["website_url"] == "https://example.com"

    def test_create_requires_admin(self, client):
        data = _register(client, email="nonadmin2@ap.com")
        token = data["token"]
        resp = client.post(
            "/api/v1/admin/places",
            json=_CREATE_BODY,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_create_requires_auth(self, client):
        resp = client.post("/api/v1/admin/places", json=_CREATE_BODY)
        assert resp.status_code == 401


# ── Tests: Get place ───────────────────────────────────────────────────────────


class TestGetPlace:
    def test_get_existing_place(self, client, db_session):
        headers = _admin_headers(client, db_session)
        place = _make_place(db_session, "plc_ap00010")
        resp = client.get(f"/api/v1/admin/places/{place.place_code}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["place_code"] == place.place_code
        assert data["name"] == place.name
        assert "review_count" in data
        assert "check_in_count" in data

    def test_get_nonexistent_place_404(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/places/plc_notexist", headers=headers)
        assert resp.status_code == 404

    def test_get_requires_admin(self, client, db_session):
        _make_place(db_session, "plc_ap00011")
        data = _register(client, email="nonadmin3@ap.com")
        token = data["token"]
        resp = client.get(
            "/api/v1/admin/places/plc_ap00011",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ── Tests: Patch place ─────────────────────────────────────────────────────────


class TestPatchPlace:
    def test_patch_name(self, client, db_session):
        headers = _admin_headers(client, db_session)
        place = _make_place(db_session, "plc_ap00020")
        resp = client.patch(
            f"/api/v1/admin/places/{place.place_code}",
            json={"name": "Updated Name"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    def test_patch_multiple_fields(self, client, db_session):
        headers = _admin_headers(client, db_session)
        place = _make_place(db_session, "plc_ap00021")
        resp = client.patch(
            f"/api/v1/admin/places/{place.place_code}",
            json={"description": "Nice place", "website_url": "https://nice.com"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["description"] == "Nice place"
        assert data["website_url"] == "https://nice.com"

    def test_patch_nonexistent_404(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.patch(
            "/api/v1/admin/places/plc_ghost",
            json={"name": "Ghost"},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_patch_requires_admin(self, client, db_session):
        place = _make_place(db_session, "plc_ap00022")
        data = _register(client, email="nonadmin4@ap.com")
        token = data["token"]
        resp = client.patch(
            f"/api/v1/admin/places/{place.place_code}",
            json={"name": "X"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ── Tests: Delete place ────────────────────────────────────────────────────────


class TestDeletePlace:
    def test_delete_place(self, client, db_session):
        headers = _admin_headers(client, db_session)
        place = _make_place(db_session, "plc_ap00030")
        resp = client.delete(f"/api/v1/admin/places/{place.place_code}", headers=headers)
        assert resp.status_code == 204

    def test_delete_nonexistent_404(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.delete("/api/v1/admin/places/plc_ghost2", headers=headers)
        assert resp.status_code == 404

    def test_delete_requires_admin(self, client, db_session):
        place = _make_place(db_session, "plc_ap00031")
        data = _register(client, email="nonadmin5@ap.com")
        token = data["token"]
        resp = client.delete(
            f"/api/v1/admin/places/{place.place_code}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ── Tests: Place images ────────────────────────────────────────────────────────


class TestPlaceImages:
    def test_list_images_empty(self, client, db_session):
        headers = _admin_headers(client, db_session)
        place = _make_place(db_session, "plc_ap00040")
        resp = client.get(f"/api/v1/admin/places/{place.place_code}/images", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_images_returns_images(self, client, db_session):
        headers = _admin_headers(client, db_session)
        place = _make_place(db_session, "plc_ap00041")
        img = PlaceImage(
            place_code=place.place_code,
            image_type="url",
            url="https://example.com/img.jpg",
            display_order=0,
        )
        db_session.add(img)
        db_session.commit()
        db_session.refresh(img)
        resp = client.get(f"/api/v1/admin/places/{place.place_code}/images", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["url"] == "https://example.com/img.jpg"

    def test_list_images_404_for_unknown_place(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/places/plc_notexist/images", headers=headers)
        assert resp.status_code == 404

    def test_delete_image(self, client, db_session):
        headers = _admin_headers(client, db_session)
        place = _make_place(db_session, "plc_ap00042")
        img = PlaceImage(
            place_code=place.place_code,
            image_type="url",
            url="https://example.com/del.jpg",
            display_order=0,
        )
        db_session.add(img)
        db_session.commit()
        db_session.refresh(img)
        resp = client.delete(
            f"/api/v1/admin/places/{place.place_code}/images/{img.id}",
            headers=headers,
        )
        assert resp.status_code == 204

    def test_delete_image_404_wrong_place(self, client, db_session):
        headers = _admin_headers(client, db_session)
        place = _make_place(db_session, "plc_ap00043")
        img = PlaceImage(
            place_code=place.place_code,
            image_type="url",
            url="https://example.com/img2.jpg",
            display_order=0,
        )
        db_session.add(img)
        db_session.commit()
        db_session.refresh(img)
        resp = client.delete(
            f"/api/v1/admin/places/plc_wrongplace/images/{img.id}",
            headers=headers,
        )
        assert resp.status_code == 404

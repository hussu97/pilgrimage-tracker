"""Tests for admin content-translations endpoints — CRUD /api/v1/admin/content-translations/..."""

from sqlmodel import select

from app.db.models import ContentTranslation, Place, User

# ── Helpers ────────────────────────────────────────────────────────────────────


def _register(client, email="user@example.com", password="Testpass123!", display_name="Tester"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _make_admin(db_session, user_code: str) -> None:
    user = db_session.exec(select(User).where(User.user_code == user_code)).first()
    user.is_admin = True
    db_session.add(user)
    db_session.commit()


def _admin_headers(client, db_session, email="admin@example.com"):
    data = _register(client, email=email)
    token = data["token"]
    _make_admin(db_session, data["user"]["user_code"])
    return {"Authorization": f"Bearer {token}"}


def _make_place(db_session, code="plc_ct00001"):
    from datetime import UTC, datetime

    place = Place(
        place_code=code,
        name="Test Mosque",
        religion="islam",
        place_type="mosque",
        lat=25.0,
        lng=55.0,
        address="Test St",
        created_at=datetime.now(UTC),
    )
    db_session.add(place)
    db_session.commit()
    return place


def _make_ct(db_session, entity_code="plc_ct00001", field="name", lang="ar", text="مسجد"):
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    row = ContentTranslation(
        entity_type="place",
        entity_code=entity_code,
        field=field,
        lang=lang,
        translated_text=text,
        source="manual",
        created_at=now,
        updated_at=now,
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    return row


# ── Tests: list content translations ──────────────────────────────────────────


def test_list_content_translations_requires_admin(client):
    resp = client.get("/api/v1/admin/content-translations")
    assert resp.status_code == 401


def test_list_content_translations_empty(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/content-translations", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_list_content_translations_returns_rows(client, db_session):
    place = _make_place(db_session)
    _make_ct(db_session, entity_code=place.place_code, field="name", lang="ar")
    _make_ct(db_session, entity_code=place.place_code, field="description", lang="hi", text="मस्जिद")
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/content-translations", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2


def test_list_content_translations_filter_by_lang(client, db_session):
    place = _make_place(db_session)
    _make_ct(db_session, entity_code=place.place_code, lang="ar")
    _make_ct(db_session, entity_code=place.place_code, field="description", lang="hi")
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/content-translations?lang=ar", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["lang"] == "ar"


def test_list_content_translations_enriches_place_name(client, db_session):
    place = _make_place(db_session, code="plc_ct00002")
    _make_ct(db_session, entity_code=place.place_code)
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/content-translations", headers=headers)
    assert resp.status_code == 200
    item = resp.json()["items"][0]
    assert item["place_name"] == place.name


# ── Tests: create content translation ─────────────────────────────────────────


def test_create_content_translation(client, db_session):
    headers = _admin_headers(client, db_session)
    body = {
        "entity_type": "place",
        "entity_code": "plc_new001",
        "field": "name",
        "lang": "ar",
        "translated_text": "اسم جديد",
        "source": "manual",
    }
    resp = client.post("/api/v1/admin/content-translations", json=body, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["entity_code"] == "plc_new001"
    assert data["translated_text"] == "اسم جديد"
    assert data["source"] == "manual"


def test_create_content_translation_duplicate_returns_409(client, db_session):
    place = _make_place(db_session)
    _make_ct(db_session, entity_code=place.place_code, field="name", lang="ar")
    headers = _admin_headers(client, db_session)
    body = {
        "entity_type": "place",
        "entity_code": place.place_code,
        "field": "name",
        "lang": "ar",
        "translated_text": "Duplicate",
    }
    resp = client.post("/api/v1/admin/content-translations", json=body, headers=headers)
    assert resp.status_code == 409


# ── Tests: update content translation ─────────────────────────────────────────


def test_update_content_translation(client, db_session):
    place = _make_place(db_session)
    ct = _make_ct(db_session, entity_code=place.place_code)
    headers = _admin_headers(client, db_session)

    resp = client.put(
        f"/api/v1/admin/content-translations/{ct.id}",
        json={"translated_text": "Updated Arabic Name"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["translated_text"] == "Updated Arabic Name"


def test_update_content_translation_404(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.put(
        "/api/v1/admin/content-translations/999999",
        json={"translated_text": "x"},
        headers=headers,
    )
    assert resp.status_code == 404


# ── Tests: delete content translation ─────────────────────────────────────────


def test_delete_content_translation(client, db_session):
    place = _make_place(db_session)
    ct = _make_ct(db_session, entity_code=place.place_code)
    headers = _admin_headers(client, db_session)

    resp = client.delete(f"/api/v1/admin/content-translations/{ct.id}", headers=headers)
    assert resp.status_code == 204

    remaining = db_session.exec(
        select(ContentTranslation).where(ContentTranslation.id == ct.id)
    ).first()
    assert remaining is None


def test_delete_content_translation_404(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.delete("/api/v1/admin/content-translations/999999", headers=headers)
    assert resp.status_code == 404

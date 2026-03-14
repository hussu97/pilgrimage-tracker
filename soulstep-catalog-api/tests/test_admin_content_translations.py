"""Tests for admin content-translations endpoints — CRUD /api/v1/admin/content-translations/..."""

from sqlmodel import select

from app.db.models import City, ContentTranslation, Place, User

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


# ── Tests: export-untranslated ─────────────────────────────────────────────────


def test_export_untranslated_requires_admin(client):
    resp = client.get("/api/v1/admin/content-translations/export-untranslated")
    assert resp.status_code == 401


def test_export_untranslated_returns_missing_langs(client, db_session):
    """Place with no translations should appear with all target langs missing."""
    _make_place(db_session, code="plc_exp001")
    headers = _admin_headers(client, db_session)
    resp = client.get(
        "/api/v1/admin/content-translations/export-untranslated?langs=ar,hi",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    item = next((p for p in data if p["entity_code"] == "plc_exp001"), None)
    assert item is not None
    assert set(item["missing_langs"]) == {"ar", "hi"}
    assert "name" in item["fields"]


def test_export_untranslated_excludes_already_translated(client, db_session):
    """Place with ar translations for all fields should not appear when only ar is requested."""
    place = _make_place(db_session, code="plc_exp002")
    _make_ct(db_session, entity_code=place.place_code, field="name", lang="ar", text="اسم")
    _make_ct(db_session, entity_code=place.place_code, field="address", lang="ar", text="عنوان")
    headers = _admin_headers(client, db_session)
    resp = client.get(
        "/api/v1/admin/content-translations/export-untranslated?langs=ar",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    codes = [p["entity_code"] for p in data]
    assert "plc_exp002" not in codes


def test_export_untranslated_invalid_langs(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get(
        "/api/v1/admin/content-translations/export-untranslated?langs=",
        headers=headers,
    )
    assert resp.status_code == 422


def test_export_untranslated_includes_cities(client, db_session):
    """Cities without translations should appear when entity_types includes 'city'."""
    city = City(city_code="cty_test001", name="Mecca", country_code="SA")
    db_session.add(city)
    db_session.commit()
    _make_place(db_session, code="plc_exp_city")

    headers = _admin_headers(client, db_session)
    resp = client.get(
        "/api/v1/admin/content-translations/export-untranslated?langs=ar&entity_types=place,city",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    codes = {item["entity_code"] for item in data}
    assert "cty_test001" in codes
    assert "plc_exp_city" in codes
    city_item = next(i for i in data if i["entity_code"] == "cty_test001")
    assert city_item["entity_type"] == "city"
    assert "name" in city_item["fields"]


def test_export_untranslated_entity_types_filter(client, db_session):
    """entity_types=city should exclude places."""
    city = City(city_code="cty_test002", name="Medina", country_code="SA")
    db_session.add(city)
    db_session.commit()
    _make_place(db_session, code="plc_exp_filter")

    headers = _admin_headers(client, db_session)
    resp = client.get(
        "/api/v1/admin/content-translations/export-untranslated?langs=ar&entity_types=city",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    entity_types_in_result = {item["entity_type"] for item in data}
    assert "place" not in entity_types_in_result
    assert "city" in entity_types_in_result


def test_export_untranslated_invalid_entity_types(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get(
        "/api/v1/admin/content-translations/export-untranslated?entity_types=",
        headers=headers,
    )
    assert resp.status_code == 422


# ── Tests: bulk-upsert ────────────────────────────────────────────────────────


def test_bulk_upsert_requires_admin(client):
    resp = client.post("/api/v1/admin/content-translations/bulk-upsert", json=[])
    assert resp.status_code == 401


def test_bulk_upsert_creates_new_records(client, db_session):
    headers = _admin_headers(client, db_session)
    items = [
        {
            "entity_type": "place",
            "entity_code": "plc_bulk001",
            "field": "name",
            "lang": "ar",
            "translated_text": "مسجد عربي",
            "source": "claude_ai",
        },
        {
            "entity_type": "place",
            "entity_code": "plc_bulk001",
            "field": "name",
            "lang": "hi",
            "translated_text": "हिंदी नाम",
            "source": "claude_ai",
        },
    ]
    resp = client.post(
        "/api/v1/admin/content-translations/bulk-upsert",
        json=items,
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created"] == 2
    assert data["updated"] == 0
    assert data["errors"] == []


def test_bulk_upsert_updates_existing_records(client, db_session):
    place = _make_place(db_session, code="plc_bulk002")
    _make_ct(db_session, entity_code=place.place_code, field="name", lang="ar", text="قديم")
    headers = _admin_headers(client, db_session)

    items = [
        {
            "entity_type": "place",
            "entity_code": place.place_code,
            "field": "name",
            "lang": "ar",
            "translated_text": "جديد",
            "source": "claude_ai",
        }
    ]
    resp = client.post(
        "/api/v1/admin/content-translations/bulk-upsert",
        json=items,
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created"] == 0
    assert data["updated"] == 1

    # Verify DB was updated
    from sqlmodel import select

    from app.db.models import ContentTranslation

    row = db_session.exec(
        select(ContentTranslation).where(
            ContentTranslation.entity_code == place.place_code,
            ContentTranslation.field == "name",
            ContentTranslation.lang == "ar",
        )
    ).first()
    assert row is not None
    assert row.translated_text == "جديد"
    assert row.source == "claude_ai"


def test_bulk_upsert_empty_body(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.post(
        "/api/v1/admin/content-translations/bulk-upsert",
        json=[],
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created"] == 0
    assert data["updated"] == 0

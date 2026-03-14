"""Integration tests for .txt-based bulk translation export/import.

Tests for:
  GET  /admin/content-translations/export-txt
  POST /admin/content-translations/import-txt
"""

from __future__ import annotations

from sqlmodel import select

from app.db.models import ContentTranslation, Place, User

# ── Helpers ────────────────────────────────────────────────────────────────────


def _register(client, email="admin@example.com", password="Testpass1!", display_name="Admin"):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _make_admin(db_session, user_code: str) -> None:
    user = db_session.exec(select(User).where(User.user_code == user_code)).first()
    user.is_admin = True
    db_session.add(user)
    db_session.commit()


def _admin_headers(client, db_session, email="admintxt@example.com", password="Testpass1!"):
    data = _register(client, email=email, password=password)
    _make_admin(db_session, data["user"]["user_code"])
    return {"Authorization": f"Bearer {data['token']}"}


def _non_admin_headers(client, email="usertxt@example.com", password="Testpass1!"):
    data = _register(client, email=email, password=password)
    return {"Authorization": f"Bearer {data['token']}"}


def _seed_place(
    db_session, place_code="plc_test001", name="Sacred Temple", description="A holy site"
):
    from datetime import UTC, datetime

    place = Place(
        place_code=place_code,
        name=name,
        description=description,
        address="123 Temple Road",
        religion="hindu",
        place_type="temple",
        lat=12.0,
        lng=77.0,
        source="test",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(place)
    db_session.commit()
    return place


# ── Export .txt tests ──────────────────────────────────────────────────────────


def test_export_txt_returns_plain_text(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_place(db_session)
    resp = client.get("/api/v1/admin/content-translations/export-txt", headers=headers)
    assert resp.status_code == 200
    assert "text/plain" in resp.headers["content-type"]


def test_export_txt_correct_line_format(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_place(
        db_session, place_code="plc_fmt001", name="Golden Temple", description="A sacred site"
    )
    resp = client.get(
        "/api/v1/admin/content-translations/export-txt",
        headers=headers,
        params={"entity_types": "place"},
    )
    assert resp.status_code == 200
    text = resp.text
    assert "[place:plc_fmt001:name] {{ Golden Temple }}" in text
    assert "[place:plc_fmt001:description] {{ A sacred site }}" in text


def test_export_txt_includes_comment_lines(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_place(db_session, place_code="plc_cmt001", name="Blue Mosque")
    resp = client.get(
        "/api/v1/admin/content-translations/export-txt",
        headers=headers,
        params={"entity_types": "place"},
    )
    assert resp.status_code == 200
    assert "# Blue Mosque (plc_cmt001)" in resp.text


def test_export_txt_empty_when_all_translated(client, db_session):
    from datetime import UTC, datetime

    headers = _admin_headers(client, db_session)
    _seed_place(db_session, place_code="plc_done001", name="Done Temple")
    # Seed translations for all langs
    for lang in ["ar", "hi", "te", "ml"]:
        for field in ["name", "description", "address"]:
            ct = ContentTranslation(
                entity_type="place",
                entity_code="plc_done001",
                field=field,
                lang=lang,
                translated_text=f"translated_{field}_{lang}",
                source="manual",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            db_session.add(ct)
    db_session.commit()
    resp = client.get(
        "/api/v1/admin/content-translations/export-txt",
        headers=headers,
        params={"entity_types": "place"},
    )
    assert resp.status_code == 200
    assert resp.text.strip() == ""


def test_export_txt_requires_admin(client, db_session):
    non_admin = _non_admin_headers(client)
    resp = client.get("/api/v1/admin/content-translations/export-txt", headers=non_admin)
    assert resp.status_code == 403


# ── Import .txt tests ──────────────────────────────────────────────────────────


def _make_txt(lines: list[str]) -> bytes:
    return "\n".join(lines).encode("utf-8")


def test_import_txt_creates_translations_and_job(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_place(db_session, place_code="plc_imp001", name="Test Place")
    txt = _make_txt(
        [
            "# Test Place (plc_imp001)",
            "[place:plc_imp001:name] {{ مكان اختبار }}",
            "[place:plc_imp001:description] {{ موقع مقدس }}",
        ]
    )
    resp = client.post(
        "/api/v1/admin/content-translations/import-txt",
        data={"lang": "ar"},
        files={"file": ("t.txt", txt, "text/plain")},
        headers=headers,
    )
    assert resp.status_code == 201
    job = resp.json()
    assert job["job_type"] == "import"
    assert job["status"] == "completed"
    assert job["completed_items"] == 2
    assert "ar" in job["target_langs"]

    # Verify rows actually saved
    rows = db_session.exec(
        select(ContentTranslation).where(
            ContentTranslation.entity_code == "plc_imp001",
            ContentTranslation.lang == "ar",
        )
    ).all()
    assert len(rows) == 2


def test_import_txt_does_not_override_other_languages(client, db_session):
    from datetime import UTC, datetime

    headers = _admin_headers(client, db_session)
    _seed_place(db_session, place_code="plc_iso001", name="Isolation Temple")
    # Pre-seed an Arabic translation
    existing = ContentTranslation(
        entity_type="place",
        entity_code="plc_iso001",
        field="name",
        lang="ar",
        translated_text="موجود مسبقاً",
        source="manual",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(existing)
    db_session.commit()

    # Import Hindi only
    txt = _make_txt(
        [
            "[place:plc_iso001:name] {{ अलगाव मंदिर }}",
        ]
    )
    resp = client.post(
        "/api/v1/admin/content-translations/import-txt",
        data={"lang": "hi"},
        files={"file": ("t.txt", txt, "text/plain")},
        headers=headers,
    )
    assert resp.status_code == 201

    # Arabic row must be untouched
    ar_row = db_session.exec(
        select(ContentTranslation).where(
            ContentTranslation.entity_code == "plc_iso001",
            ContentTranslation.lang == "ar",
        )
    ).first()
    assert ar_row is not None
    assert ar_row.translated_text == "موجود مسبقاً"

    # Hindi row created
    hi_row = db_session.exec(
        select(ContentTranslation).where(
            ContentTranslation.entity_code == "plc_iso001",
            ContentTranslation.lang == "hi",
        )
    ).first()
    assert hi_row is not None


def test_import_txt_empty_file_returns_422(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.post(
        "/api/v1/admin/content-translations/import-txt",
        data={"lang": "ar"},
        files={"file": ("t.txt", b"", "text/plain")},
        headers=headers,
    )
    assert resp.status_code == 422


def test_import_txt_comments_only_returns_422(client, db_session):
    headers = _admin_headers(client, db_session)
    txt = _make_txt(
        [
            "# Just a comment",
            "",
            "# Another comment",
        ]
    )
    resp = client.post(
        "/api/v1/admin/content-translations/import-txt",
        data={"lang": "ar"},
        files={"file": ("t.txt", txt, "text/plain")},
        headers=headers,
    )
    assert resp.status_code == 422


def test_import_txt_requires_admin(client, db_session):
    non_admin = _non_admin_headers(client)
    txt = _make_txt(["[place:plc_x:name] {{ Test }}"])
    resp = client.post(
        "/api/v1/admin/content-translations/import-txt",
        data={"lang": "ar"},
        files={"file": ("t.txt", txt, "text/plain")},
        headers=non_admin,
    )
    assert resp.status_code == 403

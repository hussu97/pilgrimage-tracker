"""Integration tests for .txt-based bulk translation export/import.

Tests for:
  GET  /admin/content-translations/export-txt
  POST /admin/content-translations/import-txt

Line format: [type_num:entity_id:field_num] {{ text }}
  type_num  — 1=place 2=city 3=attribute_def 4=review
  entity_id — integer primary key
  field_num — place(1=name 2=description 3=address), city/attr_def(1=name), review(1=title 2=body)
"""

from __future__ import annotations

import re

from sqlmodel import select

from app.db.models import ContentTranslation, Place, User

# ── Helpers ────────────────────────────────────────────────────────────────────

_LINE_RE = re.compile(
    r"^\[(?P<type_num>\d+):(?P<entity_id>\d+):(?P<field_num>\d+)\]\s*\{\{\s*(?P<text>.+?)\s*\}\}$"
)


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
    db_session.refresh(place)
    return place


def _make_txt(lines: list[str]) -> bytes:
    return "\n".join(lines).encode("utf-8")


# ── Export .txt tests ──────────────────────────────────────────────────────────


def test_export_txt_returns_plain_text(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_place(db_session)
    resp = client.get("/api/v1/admin/content-translations/export-txt", headers=headers)
    assert resp.status_code == 200
    assert "text/plain" in resp.headers["content-type"]


def test_export_txt_correct_numeric_format(client, db_session):
    headers = _admin_headers(client, db_session)
    place = _seed_place(
        db_session, place_code="plc_fmt001", name="Golden Temple", description="A sacred site"
    )
    resp = client.get(
        "/api/v1/admin/content-translations/export-txt",
        headers=headers,
        params={"entity_types": "place"},
    )
    assert resp.status_code == 200
    lines = [ln for ln in resp.text.splitlines() if ln.strip()]
    # All non-blank lines must match the numeric format
    for line in lines:
        assert line.startswith("#") or _LINE_RE.match(line), f"Bad line: {line!r}"
    # Verify specific lines for the seeded place
    matched = [_LINE_RE.match(ln) for ln in lines if _LINE_RE.match(ln)]
    type_entity_field = {
        (m.group("type_num"), m.group("entity_id"), m.group("field_num")) for m in matched
    }
    place_id = str(place.id)
    assert ("1", place_id, "1") in type_entity_field  # name
    assert ("1", place_id, "2") in type_entity_field  # description


def test_export_txt_no_alphabets_in_brackets(client, db_session):
    """The [N:N:N] identifier must contain only digits and colons."""
    headers = _admin_headers(client, db_session)
    _seed_place(db_session, place_code="plc_alpha01", name="Alpha Temple")
    resp = client.get(
        "/api/v1/admin/content-translations/export-txt",
        headers=headers,
        params={"entity_types": "place"},
    )
    assert resp.status_code == 200
    for line in resp.text.splitlines():
        if line.startswith("["):
            bracket_content = line[1 : line.index("]")]
            assert bracket_content.replace(
                ":", ""
            ).isdigit(), f"Non-numeric bracket content: {bracket_content!r}"


def test_export_txt_empty_when_all_translated(client, db_session):
    from datetime import UTC, datetime

    headers = _admin_headers(client, db_session)
    _seed_place(db_session, place_code="plc_done001", name="Done Temple")
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


def test_import_txt_creates_translations_and_job(client, db_session):
    headers = _admin_headers(client, db_session)
    place = _seed_place(db_session, place_code="plc_imp001", name="Test Place")
    pid = place.id
    txt = _make_txt(
        [
            f"[1:{pid}:1] {{{{ مكان اختبار }}}}",  # name
            f"[1:{pid}:2] {{{{ موقع مقدس }}}}",  # description
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
    place = _seed_place(db_session, place_code="plc_iso001", name="Isolation Temple")
    pid = place.id

    # Pre-seed Arabic
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
    txt = _make_txt([f"[1:{pid}:1] {{{{ अलगाव मंदिर }}}}"])
    resp = client.post(
        "/api/v1/admin/content-translations/import-txt",
        data={"lang": "hi"},
        files={"file": ("t.txt", txt, "text/plain")},
        headers=headers,
    )
    assert resp.status_code == 201

    ar_row = db_session.exec(
        select(ContentTranslation).where(
            ContentTranslation.entity_code == "plc_iso001",
            ContentTranslation.lang == "ar",
        )
    ).first()
    assert ar_row is not None
    assert ar_row.translated_text == "موجود مسبقاً"

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
    txt = _make_txt(["# Just a comment", "", "# Another comment"])
    resp = client.post(
        "/api/v1/admin/content-translations/import-txt",
        data={"lang": "ar"},
        files={"file": ("t.txt", txt, "text/plain")},
        headers=headers,
    )
    assert resp.status_code == 422


def test_import_txt_requires_admin(client, db_session):
    non_admin = _non_admin_headers(client)
    txt = _make_txt(["[1:1:1] {{ Test }}"])
    resp = client.post(
        "/api/v1/admin/content-translations/import-txt",
        data={"lang": "ar"},
        files={"file": ("t.txt", txt, "text/plain")},
        headers=non_admin,
    )
    assert resp.status_code == 403

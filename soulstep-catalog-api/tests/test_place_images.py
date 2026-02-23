"""
DB-level tests for app/db/place_images.py.

Uses db_session fixture directly (no HTTP client needed).
Requires a Place row to exist first (foreign key constraint).
"""

from sqlmodel import Session

from app.db import place_images as images_db
from app.db.models import Place


def _create_place(db_session: Session, place_code="plc_img001") -> str:
    place = Place(
        place_code=place_code,
        name="Test Place",
        religion="islam",
        place_type="mosque",
        lat=25.0,
        lng=55.0,
        address="Test Address",
    )
    db_session.add(place)
    db_session.commit()
    return place_code


# ── TestAddImage ───────────────────────────────────────────────────────────────


class TestAddImage:
    def test_add_image_url_persists_row(self, db_session):
        place_code = _create_place(db_session)
        img = images_db.add_image_url(place_code, "https://example.com/photo.jpg", db_session)
        assert img.id is not None
        assert img.place_code == place_code
        assert img.image_type == "url"
        assert img.url == "https://example.com/photo.jpg"

    def test_add_image_blob_persists_row(self, db_session):
        place_code = _create_place(db_session, "plc_img002")
        blob_data = b"\xff\xd8\xff\xe0test_jpeg_data"
        img = images_db.add_image_blob(place_code, blob_data, "image/jpeg", db_session)
        assert img.id is not None
        assert img.image_type == "blob"
        assert img.blob_data == blob_data
        assert img.mime_type == "image/jpeg"

    def test_add_image_url_sets_display_order(self, db_session):
        place_code = _create_place(db_session, "plc_img003")
        img = images_db.add_image_url(
            place_code, "https://example.com/a.jpg", db_session, display_order=5
        )
        assert img.display_order == 5


# ── TestGetImages ──────────────────────────────────────────────────────────────


class TestGetImages:
    def test_returns_list_of_dicts_with_url_key(self, db_session):
        place_code = _create_place(db_session, "plc_img010")
        images_db.add_image_url(place_code, "https://example.com/x.jpg", db_session)
        result = images_db.get_images(place_code, db_session)
        assert isinstance(result, list)
        assert len(result) == 1
        assert "url" in result[0]
        assert "id" in result[0]

    def test_blob_image_returns_api_url(self, db_session):
        place_code = _create_place(db_session, "plc_img011")
        img = images_db.add_image_blob(place_code, b"data", "image/jpeg", db_session)
        result = images_db.get_images(place_code, db_session)
        assert result[0]["url"].startswith("/api/v1/places/")
        assert str(img.id) in result[0]["url"]

    def test_returns_empty_for_no_images(self, db_session):
        place_code = _create_place(db_session, "plc_img012")
        result = images_db.get_images(place_code, db_session)
        assert result == []

    def test_multiple_images_returned(self, db_session):
        place_code = _create_place(db_session, "plc_img013")
        images_db.add_image_url(place_code, "https://example.com/1.jpg", db_session)
        images_db.add_image_url(place_code, "https://example.com/2.jpg", db_session)
        result = images_db.get_images(place_code, db_session)
        assert len(result) == 2


# ── TestDeleteImage ────────────────────────────────────────────────────────────


class TestDeleteImage:
    def test_set_images_removes_old_and_inserts_new(self, db_session):
        place_code = _create_place(db_session, "plc_img020")
        images_db.add_image_url(place_code, "https://example.com/old.jpg", db_session)

        # Replace with new set
        images_db.set_images_from_urls(
            place_code,
            ["https://example.com/new1.jpg", "https://example.com/new2.jpg"],
            db_session,
        )
        result = images_db.get_images(place_code, db_session)
        assert len(result) == 2
        urls = [r["url"] for r in result]
        assert "https://example.com/new1.jpg" in urls
        assert "https://example.com/old.jpg" not in urls

    def test_set_images_with_empty_list_clears_all(self, db_session):
        place_code = _create_place(db_session, "plc_img021")
        images_db.add_image_url(place_code, "https://example.com/img.jpg", db_session)
        images_db.set_images_from_urls(place_code, [], db_session)
        assert images_db.get_images(place_code, db_session) == []


# ── TestImageOrder ─────────────────────────────────────────────────────────────


class TestImageOrder:
    def test_images_returned_in_display_order(self, db_session):
        place_code = _create_place(db_session, "plc_img030")
        images_db.add_image_url(
            place_code, "https://example.com/third.jpg", db_session, display_order=2
        )
        images_db.add_image_url(
            place_code, "https://example.com/first.jpg", db_session, display_order=0
        )
        images_db.add_image_url(
            place_code, "https://example.com/second.jpg", db_session, display_order=1
        )

        result = images_db.get_images(place_code, db_session)
        urls = [r["url"] for r in result]
        assert urls[0] == "https://example.com/first.jpg"
        assert urls[1] == "https://example.com/second.jpg"
        assert urls[2] == "https://example.com/third.jpg"

    def test_get_images_bulk_returns_correct_mapping(self, db_session):
        place_code_a = _create_place(db_session, "plc_img031a")
        place_code_b = _create_place(db_session, "plc_img031b")
        images_db.add_image_url(place_code_a, "https://example.com/a.jpg", db_session)
        images_db.add_image_url(place_code_b, "https://example.com/b.jpg", db_session)

        result = images_db.get_images_bulk([place_code_a, place_code_b], db_session)
        assert place_code_a in result
        assert place_code_b in result
        assert len(result[place_code_a]) == 1

    def test_get_images_bulk_empty_input(self, db_session):
        result = images_db.get_images_bulk([], db_session)
        assert result == {}

    def test_get_image_by_id(self, db_session):
        place_code = _create_place(db_session, "plc_img032")
        img = images_db.add_image_url(place_code, "https://example.com/single.jpg", db_session)
        fetched = images_db.get_image_by_id(img.id, db_session)
        assert fetched is not None
        assert fetched.id == img.id

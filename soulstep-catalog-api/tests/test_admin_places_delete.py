"""Tests for admin place deletion endpoints: single, batch, and all."""

from sqlmodel import select

from app.db.models import (
    AICrawlerLog,
    CheckIn,
    ContentTranslation,
    Favorite,
    Place,
    PlaceImage,
    PlaceSEO,
    Review,
)

# ── Helpers ────────────────────────────────────────────────────────────────────


def _register(client, email="user@example.com", password="Testpass123!", display_name="Tester"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _make_admin(db_session, user_code: str) -> None:
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
    db_session, code="plc_del001", name="Test Place", religion="islam", place_type="mosque"
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


def _make_review(
    db_session, place_code: str, review_code: str = "rev_del001", user_code: str = "usr_del001"
):
    review = Review(
        review_code=review_code,
        user_code=user_code,
        place_code=place_code,
        rating=5,
        body="Great place",
    )
    db_session.add(review)
    db_session.commit()
    return review


def _make_place_image(db_session, place_code: str):
    img = PlaceImage(place_code=place_code, image_type="url", url="http://example.com/img.jpg")
    db_session.add(img)
    db_session.commit()
    return img


def _make_place_seo(db_session, place_code: str):
    seo = PlaceSEO(
        place_code=place_code,
        slug=f"slug-{place_code}",
        seo_title="Test SEO Title",
        meta_description="Test meta description",
    )
    db_session.add(seo)
    db_session.commit()
    return seo


def _make_check_in(db_session, place_code: str, user_code: str = "usr_del001"):
    from app.db.models import CheckIn

    ci = CheckIn(
        check_in_code=f"ci_{place_code}",
        user_code=user_code,
        place_code=place_code,
    )
    db_session.add(ci)
    db_session.commit()
    return ci


def _make_favorite(db_session, place_code: str, user_code: str = "usr_del001"):
    fav = Favorite(user_code=user_code, place_code=place_code)
    db_session.add(fav)
    db_session.commit()
    return fav


def _make_content_translation(db_session, place_code: str):
    ct = ContentTranslation(
        entity_type="place",
        entity_code=place_code,
        field="name",
        lang="ar",
        translated_text="مكان اختبار",
    )
    db_session.add(ct)
    db_session.commit()
    return ct


def _make_ai_crawler_log(db_session, place_code: str):
    log = AICrawlerLog(
        bot_name="ChatGPT",
        path=f"/share/places/{place_code}",
        place_code=place_code,
    )
    db_session.add(log)
    db_session.commit()
    return log


# ── Single delete tests ────────────────────────────────────────────────────────


class TestDeletePlaceSingle:
    def test_delete_place_returns_204(self, client, db_session):
        headers = _admin_headers(client, db_session, email="adm1@x.com")
        place = _make_place(db_session, code="plc_d001")
        resp = client.delete(f"/api/v1/admin/places/{place.place_code}", headers=headers)
        assert resp.status_code == 204

    def test_delete_place_removes_from_db(self, client, db_session):
        headers = _admin_headers(client, db_session, email="adm2@x.com")
        place = _make_place(db_session, code="plc_d002")
        client.delete(f"/api/v1/admin/places/{place.place_code}", headers=headers)
        remaining = db_session.exec(
            select(Place).where(Place.place_code == place.place_code)
        ).first()
        assert remaining is None

    def test_delete_place_cascades_to_images(self, client, db_session):
        headers = _admin_headers(client, db_session, email="adm3@x.com")
        place = _make_place(db_session, code="plc_d003")
        _make_place_image(db_session, place.place_code)
        client.delete(f"/api/v1/admin/places/{place.place_code}", headers=headers)
        remaining = db_session.exec(
            select(PlaceImage).where(PlaceImage.place_code == place.place_code)
        ).all()
        assert len(remaining) == 0

    def test_delete_place_cascades_to_seo(self, client, db_session):
        headers = _admin_headers(client, db_session, email="adm4@x.com")
        place = _make_place(db_session, code="plc_d004")
        _make_place_seo(db_session, place.place_code)
        client.delete(f"/api/v1/admin/places/{place.place_code}", headers=headers)
        remaining = db_session.exec(
            select(PlaceSEO).where(PlaceSEO.place_code == place.place_code)
        ).first()
        assert remaining is None

    def test_delete_place_cascades_to_reviews(self, client, db_session):
        headers = _admin_headers(client, db_session, email="adm5@x.com")
        place = _make_place(db_session, code="plc_d005")
        _make_review(db_session, place.place_code, review_code="rev_d005", user_code="usr_d005a")
        client.delete(f"/api/v1/admin/places/{place.place_code}", headers=headers)
        remaining = db_session.exec(
            select(Review).where(Review.place_code == place.place_code)
        ).all()
        assert len(remaining) == 0

    def test_delete_place_cascades_to_check_ins(self, client, db_session):
        headers = _admin_headers(client, db_session, email="adm6@x.com")
        place = _make_place(db_session, code="plc_d006")
        _make_check_in(db_session, place.place_code, user_code="usr_d006a")
        client.delete(f"/api/v1/admin/places/{place.place_code}", headers=headers)
        remaining = db_session.exec(
            select(CheckIn).where(CheckIn.place_code == place.place_code)
        ).all()
        assert len(remaining) == 0

    def test_delete_place_cascades_to_favorites(self, client, db_session):
        headers = _admin_headers(client, db_session, email="adm7@x.com")
        place = _make_place(db_session, code="plc_d007")
        _make_favorite(db_session, place.place_code, user_code="usr_d007a")
        client.delete(f"/api/v1/admin/places/{place.place_code}", headers=headers)
        remaining = db_session.exec(
            select(Favorite).where(Favorite.place_code == place.place_code)
        ).all()
        assert len(remaining) == 0

    def test_delete_place_cascades_to_content_translations(self, client, db_session):
        headers = _admin_headers(client, db_session, email="adm8@x.com")
        place = _make_place(db_session, code="plc_d008")
        _make_content_translation(db_session, place.place_code)
        client.delete(f"/api/v1/admin/places/{place.place_code}", headers=headers)
        remaining = db_session.exec(
            select(ContentTranslation).where(
                ContentTranslation.entity_type == "place",
                ContentTranslation.entity_code == place.place_code,
            )
        ).all()
        assert len(remaining) == 0

    def test_delete_place_cascades_to_ai_crawler_logs(self, client, db_session):
        headers = _admin_headers(client, db_session, email="adm9@x.com")
        place = _make_place(db_session, code="plc_d009")
        _make_ai_crawler_log(db_session, place.place_code)
        client.delete(f"/api/v1/admin/places/{place.place_code}", headers=headers)
        remaining = db_session.exec(
            select(AICrawlerLog).where(AICrawlerLog.place_code == place.place_code)
        ).all()
        assert len(remaining) == 0

    def test_delete_nonexistent_place_returns_404(self, client, db_session):
        headers = _admin_headers(client, db_session, email="adm10@x.com")
        resp = client.delete("/api/v1/admin/places/plc_notreal", headers=headers)
        assert resp.status_code == 404


# ── Batch delete tests ─────────────────────────────────────────────────────────


class TestBatchDeletePlaces:
    def test_batch_delete_returns_count(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admb1@x.com")
        p1 = _make_place(db_session, code="plc_b001")
        p2 = _make_place(db_session, code="plc_b002")
        resp = client.request(
            "DELETE",
            "/api/v1/admin/places/batch",
            headers=headers,
            json={"place_codes": [p1.place_code, p2.place_code]},
        )
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 2

    def test_batch_delete_removes_places_from_db(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admb2@x.com")
        p1 = _make_place(db_session, code="plc_b003")
        p2 = _make_place(db_session, code="plc_b004")
        client.request(
            "DELETE",
            "/api/v1/admin/places/batch",
            headers=headers,
            json={"place_codes": [p1.place_code, p2.place_code]},
        )
        for code in [p1.place_code, p2.place_code]:
            assert db_session.exec(select(Place).where(Place.place_code == code)).first() is None

    def test_batch_delete_skips_nonexistent_codes(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admb3@x.com")
        p = _make_place(db_session, code="plc_b005")
        resp = client.request(
            "DELETE",
            "/api/v1/admin/places/batch",
            headers=headers,
            json={"place_codes": [p.place_code, "plc_notreal"]},
        )
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 1

    def test_batch_delete_cascades_to_images(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admb4@x.com")
        p = _make_place(db_session, code="plc_b006")
        _make_place_image(db_session, p.place_code)
        client.request(
            "DELETE",
            "/api/v1/admin/places/batch",
            headers=headers,
            json={"place_codes": [p.place_code]},
        )
        remaining = db_session.exec(
            select(PlaceImage).where(PlaceImage.place_code == p.place_code)
        ).all()
        assert len(remaining) == 0


# ── Delete all tests ───────────────────────────────────────────────────────────


class TestDeleteAllPlaces:
    def test_delete_all_returns_count(self, client, db_session):
        headers = _admin_headers(client, db_session, email="adma1@x.com")
        _make_place(db_session, code="plc_a001")
        _make_place(db_session, code="plc_a002")
        resp = client.delete("/api/v1/admin/places/all", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 2

    def test_delete_all_removes_all_places(self, client, db_session):
        headers = _admin_headers(client, db_session, email="adma2@x.com")
        _make_place(db_session, code="plc_a003")
        _make_place(db_session, code="plc_a004")
        client.delete("/api/v1/admin/places/all", headers=headers)
        remaining = db_session.exec(select(Place)).all()
        assert len(remaining) == 0

    def test_delete_all_with_no_places_returns_zero(self, client, db_session):
        headers = _admin_headers(client, db_session, email="adma3@x.com")
        resp = client.delete("/api/v1/admin/places/all", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 0

    def test_delete_all_cascades_related_records(self, client, db_session):
        headers = _admin_headers(client, db_session, email="adma4@x.com")
        p = _make_place(db_session, code="plc_a005")
        _make_place_image(db_session, p.place_code)
        _make_place_seo(db_session, p.place_code)
        _make_content_translation(db_session, p.place_code)
        client.delete("/api/v1/admin/places/all", headers=headers)
        assert db_session.exec(select(PlaceImage)).first() is None
        assert db_session.exec(select(PlaceSEO)).first() is None
        assert (
            db_session.exec(
                select(ContentTranslation).where(ContentTranslation.entity_type == "place")
            ).first()
            is None
        )

    def test_delete_all_requires_admin(self, client, db_session):
        data = _register(client, email="nonadm@x.com")
        headers = {"Authorization": f"Bearer {data['token']}"}
        resp = client.delete("/api/v1/admin/places/all", headers=headers)
        assert resp.status_code == 403

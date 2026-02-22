"""Tests for admin reviews endpoints — CRUD /api/v1/admin/reviews/..."""

import secrets

from app.db.models import Place, Review

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


def _admin_headers(client, db_session, email="admin@ar.com"):
    data = _register(client, email=email)
    token = data["token"]
    user_code = data["user"]["user_code"]
    _make_admin(db_session, user_code)
    return {"Authorization": f"Bearer {token}"}


def _make_place(db_session, code="plc_ar00001"):
    place = Place(
        place_code=code,
        name="Test Place",
        religion="islam",
        place_type="mosque",
        lat=0.0,
        lng=0.0,
        address="Addr",
    )
    db_session.add(place)
    db_session.commit()
    return place


def _make_review(db_session, user_code, place_code, code=None, rating=4, is_flagged=False):
    code = code or ("rev_" + secrets.token_hex(4))
    review = Review(
        review_code=code,
        user_code=user_code,
        place_code=place_code,
        rating=rating,
        title="Good place",
        body="Nice experience",
        source="user",
        is_flagged=is_flagged,
    )
    db_session.add(review)
    db_session.commit()
    return review


# ── Tests: List reviews ────────────────────────────────────────────────────────


class TestListReviews:
    def test_requires_auth(self, client):
        resp = client.get("/api/v1/admin/reviews")
        assert resp.status_code == 401

    def test_requires_admin(self, client):
        data = _register(client, email="nonadmin@ar.com")
        token = data["token"]
        resp = client.get("/api/v1/admin/reviews", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_admin_can_list_reviews(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/reviews", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    def test_list_returns_created_reviews(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="reviewer@ar.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_ar00010")
        _make_review(db_session, user_code, place.place_code, "rev_ar00010")
        resp = client.get("/api/v1/admin/reviews", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        codes = [r["review_code"] for r in data["items"]]
        assert "rev_ar00010" in codes

    def test_filter_by_is_flagged(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="flagger@ar.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_ar00011")
        _make_review(db_session, user_code, place.place_code, "rev_ar00011a", is_flagged=True)
        _make_review(db_session, user_code, place.place_code, "rev_ar00011b", is_flagged=False)
        resp = client.get("/api/v1/admin/reviews?is_flagged=true", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert all(r["is_flagged"] is True for r in data["items"])

    def test_filter_by_place_code(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="placerev@ar.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_ar00012")
        _make_review(db_session, user_code, place.place_code, "rev_ar00012")
        resp = client.get(f"/api/v1/admin/reviews?place_code={place.place_code}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert all(r["place_code"] == place.place_code for r in data["items"])

    def test_filter_by_min_rating(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="ratingrev@ar.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_ar00013")
        _make_review(db_session, user_code, place.place_code, "rev_ar00013a", rating=5)
        _make_review(db_session, user_code, place.place_code, "rev_ar00013b", rating=2)
        resp = client.get("/api/v1/admin/reviews?min_rating=4", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert all(r["rating"] >= 4 for r in data["items"])

    def test_filter_by_max_rating(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="ratingrev2@ar.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_ar00014")
        _make_review(db_session, user_code, place.place_code, "rev_ar00014a", rating=5)
        _make_review(db_session, user_code, place.place_code, "rev_ar00014b", rating=2)
        resp = client.get("/api/v1/admin/reviews?max_rating=3", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert all(r["rating"] <= 3 for r in data["items"])

    def test_filter_by_user_code(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="userrev@ar.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_ar00015")
        _make_review(db_session, user_code, place.place_code, "rev_ar00015")
        resp = client.get(f"/api/v1/admin/reviews?user_code={user_code}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert all(r["user_code"] == user_code for r in data["items"])


# ── Tests: Get review ──────────────────────────────────────────────────────────


class TestGetReview:
    def test_get_existing_review(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="getrev@ar.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_ar00020")
        review = _make_review(db_session, user_code, place.place_code, "rev_ar00020")
        resp = client.get(f"/api/v1/admin/reviews/{review.review_code}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["review_code"] == review.review_code
        assert data["place_name"] == "Test Place"
        assert "body" in data
        assert "is_anonymous" in data

    def test_get_nonexistent_review_404(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/reviews/rev_notexist", headers=headers)
        assert resp.status_code == 404

    def test_requires_admin(self, client):
        data = _register(client, email="nonadmin2@ar.com")
        token = data["token"]
        resp = client.get(
            "/api/v1/admin/reviews/rev_any", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 403


# ── Tests: Patch review ────────────────────────────────────────────────────────


class TestPatchReview:
    def test_flag_review(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="flagme@ar.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_ar00030")
        review = _make_review(db_session, user_code, place.place_code, "rev_ar00030")
        resp = client.patch(
            f"/api/v1/admin/reviews/{review.review_code}",
            json={"is_flagged": True},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["is_flagged"] is True

    def test_unflag_review(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="unflagme@ar.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_ar00031")
        review = _make_review(
            db_session, user_code, place.place_code, "rev_ar00031", is_flagged=True
        )
        resp = client.patch(
            f"/api/v1/admin/reviews/{review.review_code}",
            json={"is_flagged": False},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["is_flagged"] is False

    def test_edit_title(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="edittitle@ar.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_ar00032")
        review = _make_review(db_session, user_code, place.place_code, "rev_ar00032")
        resp = client.patch(
            f"/api/v1/admin/reviews/{review.review_code}",
            json={"title": "Updated Title"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Title"

    def test_edit_body(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="editbody@ar.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_ar00033")
        review = _make_review(db_session, user_code, place.place_code, "rev_ar00033")
        resp = client.patch(
            f"/api/v1/admin/reviews/{review.review_code}",
            json={"body": "Updated body text"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["body"] == "Updated body text"

    def test_patch_nonexistent_404(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.patch(
            "/api/v1/admin/reviews/rev_ghost",
            json={"is_flagged": True},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_patch_requires_admin(self, client):
        data = _register(client, email="nonadmin3@ar.com")
        token = data["token"]
        resp = client.patch(
            "/api/v1/admin/reviews/rev_any",
            json={"is_flagged": True},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ── Tests: Delete review ───────────────────────────────────────────────────────


class TestDeleteReview:
    def test_delete_review(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="delrev@ar.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_ar00040")
        review = _make_review(db_session, user_code, place.place_code, "rev_ar00040")
        resp = client.delete(f"/api/v1/admin/reviews/{review.review_code}", headers=headers)
        assert resp.status_code == 204

    def test_delete_nonexistent_404(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.delete("/api/v1/admin/reviews/rev_ghost", headers=headers)
        assert resp.status_code == 404

    def test_delete_requires_admin(self, client):
        data = _register(client, email="nonadmin4@ar.com")
        token = data["token"]
        resp = client.delete(
            "/api/v1/admin/reviews/rev_any",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

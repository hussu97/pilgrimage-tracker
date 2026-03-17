"""
Extended tests for review management:
PATCH /reviews/{code}, DELETE /reviews/{code} (from app.api.v1.reviews).
"""

REGISTER_URL = "/api/v1/auth/register"
PLACES_URL = "/api/v1/places"
REVIEWS_URL = "/api/v1/reviews"

_UID = 0


def _uid():
    global _UID
    _UID += 1
    return _UID


def _register(client, suffix: str = ""):
    uid = _uid()
    resp = client.post(
        REGISTER_URL,
        json={"email": f"rev{uid}{suffix}@ex.com", "password": "Pass1234!", "display_name": "Rev"},
    )
    assert resp.status_code == 200
    return resp.json()["token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


_API_KEY_HEADERS = {"X-API-Key": "test-api-key"}


def _create_place(client, code: str):
    resp = client.post(
        PLACES_URL,
        json={
            "place_code": code,
            "name": "Rev Place",
            "religion": "islam",
            "place_type": "mosque",
            "lat": 0.0,
            "lng": 0.0,
            "address": "Addr",
        },
        headers=_API_KEY_HEADERS,
    )
    assert resp.status_code in (200, 201)


def _create_review(client, token, place_code, rating=5, title="Great", body="Excellent"):
    resp = client.post(
        f"{PLACES_URL}/{place_code}/reviews",
        json={"rating": rating, "title": title, "body": body},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ── PATCH /reviews/{code} ──────────────────────────────────────────────────────


class TestUpdateReview:
    def test_update_rating(self, client):
        token = _register(client)
        _create_place(client, "plc_ur0001")
        review = _create_review(client, token, "plc_ur0001", rating=3)
        code = review["review_code"]

        resp = client.patch(f"{REVIEWS_URL}/{code}", json={"rating": 5}, headers=_auth(token))
        assert resp.status_code == 200
        assert resp.json()["rating"] == 5

    def test_update_title(self, client):
        token = _register(client)
        _create_place(client, "plc_ur0002")
        review = _create_review(client, token, "plc_ur0002")
        code = review["review_code"]

        resp = client.patch(
            f"{REVIEWS_URL}/{code}", json={"title": "Updated Title"}, headers=_auth(token)
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Title"

    def test_update_body(self, client):
        token = _register(client)
        _create_place(client, "plc_ur0003")
        review = _create_review(client, token, "plc_ur0003")
        code = review["review_code"]

        resp = client.patch(
            f"{REVIEWS_URL}/{code}", json={"body": "New body text"}, headers=_auth(token)
        )
        assert resp.status_code == 200
        assert resp.json()["body"] == "New body text"

    def test_cannot_update_other_users_review(self, client):
        author_token = _register(client)
        other_token = _register(client)
        _create_place(client, "plc_ur0004")
        review = _create_review(client, author_token, "plc_ur0004")
        code = review["review_code"]

        resp = client.patch(f"{REVIEWS_URL}/{code}", json={"rating": 1}, headers=_auth(other_token))
        assert resp.status_code == 403

    def test_update_nonexistent_review(self, client):
        token = _register(client)
        resp = client.patch(f"{REVIEWS_URL}/rev_notreal", json={"rating": 3}, headers=_auth(token))
        assert resp.status_code == 404

    def test_update_rating_out_of_range(self, client):
        token = _register(client)
        _create_place(client, "plc_ur0005")
        review = _create_review(client, token, "plc_ur0005")
        code = review["review_code"]

        resp = client.patch(f"{REVIEWS_URL}/{code}", json={"rating": 6}, headers=_auth(token))
        assert resp.status_code == 400

    def test_update_requires_auth(self, client):
        resp = client.patch(f"{REVIEWS_URL}/rev_any", json={"rating": 3})
        assert resp.status_code == 401


# ── DELETE /reviews/{code} ─────────────────────────────────────────────────────


class TestDeleteReview:
    def test_delete_own_review(self, client):
        token = _register(client)
        _create_place(client, "plc_dr0001")
        review = _create_review(client, token, "plc_dr0001")
        code = review["review_code"]

        resp = client.delete(f"{REVIEWS_URL}/{code}", headers=_auth(token))
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_deleted_review_not_in_list(self, client):
        token = _register(client)
        _create_place(client, "plc_dr0002")
        review = _create_review(client, token, "plc_dr0002")
        code = review["review_code"]

        client.delete(f"{REVIEWS_URL}/{code}", headers=_auth(token))

        resp = client.get(f"{PLACES_URL}/plc_dr0002/reviews")
        review_codes = [r["review_code"] for r in resp.json()["items"]]
        assert code not in review_codes

    def test_cannot_delete_other_users_review(self, client):
        author_token = _register(client)
        other_token = _register(client)
        _create_place(client, "plc_dr0003")
        review = _create_review(client, author_token, "plc_dr0003")
        code = review["review_code"]

        resp = client.delete(f"{REVIEWS_URL}/{code}", headers=_auth(other_token))
        assert resp.status_code == 403

    def test_delete_nonexistent_review(self, client):
        token = _register(client)
        resp = client.delete(f"{REVIEWS_URL}/rev_notreal", headers=_auth(token))
        assert resp.status_code == 404

    def test_delete_requires_auth(self, client):
        resp = client.delete(f"{REVIEWS_URL}/rev_any")
        assert resp.status_code == 401


# ── Reviews list and aggregate rating ─────────────────────────────────────────


class TestReviewsListAndRating:
    def test_reviews_list_includes_rating(self, client):
        token = _register(client)
        _create_place(client, "plc_rl0001")
        _create_review(client, token, "plc_rl0001", rating=4)

        resp = client.get(f"{PLACES_URL}/plc_rl0001/reviews")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 1
        assert "average_rating" in data
        assert data["average_rating"] == 4.0

    def test_multiple_reviews_average(self, client):
        t1 = _register(client)
        t2 = _register(client)
        _create_place(client, "plc_rl0002")
        _create_review(client, t1, "plc_rl0002", rating=4)
        _create_review(client, t2, "plc_rl0002", rating=2)

        resp = client.get(f"{PLACES_URL}/plc_rl0002/reviews")
        data = resp.json()
        assert data["average_rating"] == 3.0
        assert data["total"] == 2

    def test_anonymous_review_hides_user_code(self, client):
        token = _register(client)
        _create_place(client, "plc_rl0003")
        resp = client.post(
            f"{PLACES_URL}/plc_rl0003/reviews",
            json={"rating": 5, "is_anonymous": True},
            headers=_auth(token),
        )
        assert resp.status_code == 200

        list_resp = client.get(f"{PLACES_URL}/plc_rl0003/reviews")
        review = list_resp.json()["items"][0]
        assert review["is_anonymous"] is True
        assert review["user_code"] is None
        assert review["display_name"] == "Anonymous"

"""Tests for /api/v1/users endpoints: GET/PATCH /me, settings, check-ins, stats, favorites."""

REGISTER_URL = "/api/v1/auth/register"
PLACES_URL = "/api/v1/places"
USERS_URL = "/api/v1/users"

_UID = 0


def _uid():
    global _UID
    _UID += 1
    return _UID


def _register(client, suffix: str = ""):
    uid = _uid()
    email = f"user{uid}{suffix}@example.com"
    resp = client.post(
        REGISTER_URL,
        json={"email": email, "password": "Pass1234!", "display_name": f"User {uid}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return data["token"], data["user"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_place(client, code: str, **kwargs):
    body = {
        "place_code": code,
        "name": kwargs.get("name", "Test Place"),
        "religion": kwargs.get("religion", "islam"),
        "place_type": kwargs.get("place_type", "mosque"),
        "lat": kwargs.get("lat", 25.2048),
        "lng": kwargs.get("lng", 55.2708),
        "address": "123 Test St",
    }
    resp = client.post(PLACES_URL, json=body)
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


# ── GET /users/me ──────────────────────────────────────────────────────────────

class TestGetMe:
    def test_returns_user_profile(self, client):
        token, user = _register(client)
        resp = client.get(f"{USERS_URL}/me", headers=_auth(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["user_code"] == user["user_code"]
        assert data["email"] == user["email"]

    def test_requires_auth(self, client):
        resp = client.get(f"{USERS_URL}/me")
        assert resp.status_code == 401

    def test_response_has_religions_field(self, client):
        token, _ = _register(client)
        resp = client.get(f"{USERS_URL}/me", headers=_auth(token))
        assert "religions" in resp.json()


# ── PATCH /users/me ────────────────────────────────────────────────────────────

class TestUpdateMe:
    def test_update_display_name(self, client):
        token, _ = _register(client)
        resp = client.patch(
            f"{USERS_URL}/me",
            json={"display_name": "Updated Name"},
            headers=_auth(token),
        )
        assert resp.status_code == 200
        assert resp.json()["display_name"] == "Updated Name"

    def test_requires_auth(self, client):
        resp = client.patch(f"{USERS_URL}/me", json={"display_name": "X"})
        assert resp.status_code == 401


# ── GET /users/me/settings ────────────────────────────────────────────────────

class TestGetSettings:
    def test_returns_default_settings(self, client):
        token, _ = _register(client)
        resp = client.get(f"{USERS_URL}/me/settings", headers=_auth(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["theme"] == "light"
        assert data["units"] == "km"
        assert data["language"] == "en"
        assert data["notifications_on"] is True

    def test_requires_auth(self, client):
        resp = client.get(f"{USERS_URL}/me/settings")
        assert resp.status_code == 401


# ── PATCH /users/me/settings ──────────────────────────────────────────────────

class TestUpdateSettings:
    def test_update_theme(self, client):
        token, _ = _register(client)
        resp = client.patch(
            f"{USERS_URL}/me/settings",
            json={"theme": "dark"},
            headers=_auth(token),
        )
        assert resp.status_code == 200
        assert resp.json()["theme"] == "dark"

    def test_update_language(self, client):
        token, _ = _register(client)
        resp = client.patch(
            f"{USERS_URL}/me/settings",
            json={"language": "ar"},
            headers=_auth(token),
        )
        assert resp.status_code == 200
        assert resp.json()["language"] == "ar"

    def test_update_religions(self, client):
        token, _ = _register(client)
        resp = client.patch(
            f"{USERS_URL}/me/settings",
            json={"religions": ["islam"]},
            headers=_auth(token),
        )
        assert resp.status_code == 200
        assert "islam" in resp.json()["religions"]

    def test_update_notifications(self, client):
        token, _ = _register(client)
        resp = client.patch(
            f"{USERS_URL}/me/settings",
            json={"notifications_on": False},
            headers=_auth(token),
        )
        assert resp.status_code == 200
        assert resp.json()["notifications_on"] is False

    def test_update_units(self, client):
        token, _ = _register(client)
        resp = client.patch(
            f"{USERS_URL}/me/settings",
            json={"units": "miles"},
            headers=_auth(token),
        )
        assert resp.status_code == 200
        assert resp.json()["units"] == "miles"

    def test_requires_auth(self, client):
        resp = client.patch(f"{USERS_URL}/me/settings", json={"theme": "dark"})
        assert resp.status_code == 401


# ── GET /users/me/stats ────────────────────────────────────────────────────────

class TestGetStats:
    def test_returns_stats_structure(self, client):
        token, _ = _register(client)
        resp = client.get(f"{USERS_URL}/me/stats", headers=_auth(token))
        assert resp.status_code == 200
        data = resp.json()
        assert "placesVisited" in data
        assert "checkInsThisYear" in data
        assert "visits" in data
        assert "reviews" in data

    def test_starts_at_zero(self, client):
        token, _ = _register(client)
        resp = client.get(f"{USERS_URL}/me/stats", headers=_auth(token))
        data = resp.json()
        assert data["placesVisited"] == 0
        assert data["visits"] == 0
        assert data["reviews"] == 0

    def test_stats_increment_after_check_in(self, client):
        token, _ = _register(client)
        _create_place(client, "plc_ust00001")
        client.post(
            f"{PLACES_URL}/plc_ust00001/check-in",
            json={},
            headers=_auth(token),
        )
        resp = client.get(f"{USERS_URL}/me/stats", headers=_auth(token))
        assert resp.json()["visits"] == 1
        assert resp.json()["placesVisited"] == 1

    def test_requires_auth(self, client):
        resp = client.get(f"{USERS_URL}/me/stats")
        assert resp.status_code == 401


# ── GET /users/me/check-ins ────────────────────────────────────────────────────

class TestGetCheckIns:
    def test_empty_initially(self, client):
        token, _ = _register(client)
        resp = client.get(f"{USERS_URL}/me/check-ins", headers=_auth(token))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_check_in_appears(self, client):
        token, _ = _register(client)
        _create_place(client, "plc_uck00001")
        client.post(f"{PLACES_URL}/plc_uck00001/check-in", json={}, headers=_auth(token))
        resp = client.get(f"{USERS_URL}/me/check-ins", headers=_auth(token))
        assert len(resp.json()) == 1
        assert resp.json()[0]["place_code"] == "plc_uck00001"

    def test_this_month_returns_list(self, client):
        token, _ = _register(client)
        resp = client.get(f"{USERS_URL}/me/check-ins/this-month", headers=_auth(token))
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_on_this_day_returns_list(self, client):
        token, _ = _register(client)
        resp = client.get(f"{USERS_URL}/me/check-ins/on-this-day", headers=_auth(token))
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_requires_auth(self, client):
        resp = client.get(f"{USERS_URL}/me/check-ins")
        assert resp.status_code == 401


# ── GET /users/me/favorites ────────────────────────────────────────────────────

class TestGetFavorites:
    def test_empty_initially(self, client):
        token, _ = _register(client)
        resp = client.get(f"{USERS_URL}/me/favorites", headers=_auth(token))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_favorited_place_appears(self, client):
        token, _ = _register(client)
        _create_place(client, "plc_ufav0001")
        client.post(f"{PLACES_URL}/plc_ufav0001/favorite", headers=_auth(token))
        resp = client.get(f"{USERS_URL}/me/favorites", headers=_auth(token))
        codes = [p["place_code"] for p in resp.json()]
        assert "plc_ufav0001" in codes

    def test_unfavorited_place_removed(self, client):
        token, _ = _register(client)
        _create_place(client, "plc_ufav0002")
        client.post(f"{PLACES_URL}/plc_ufav0002/favorite", headers=_auth(token))
        client.delete(f"{PLACES_URL}/plc_ufav0002/favorite", headers=_auth(token))
        resp = client.get(f"{USERS_URL}/me/favorites", headers=_auth(token))
        codes = [p["place_code"] for p in resp.json()]
        assert "plc_ufav0002" not in codes

    def test_requires_auth(self, client):
        resp = client.get(f"{USERS_URL}/me/favorites")
        assert resp.status_code == 401

"""Tests for the admin city-aliases CRUD endpoints."""

from sqlmodel import Session

from app.db.locations import get_or_create_city, get_or_create_country


def _make_city(client, db_session: Session):
    """Helper: create a country + city and return the city_code."""
    country = get_or_create_country("United Arab Emirates", db_session)
    db_session.commit()
    city = get_or_create_city("Dubai", country.country_code, None, db_session)
    db_session.commit()
    return city.city_code


class TestListAliases:
    def test_empty_list(self, client):
        resp = client.get("/api/v1/admin/city-aliases")
        assert resp.status_code == 200
        assert resp.json()["aliases"] == []


class TestCreateAlias:
    def test_creates_alias_successfully(self, client, db_session):
        city_code = _make_city(client, db_session)

        resp = client.post(
            "/api/v1/admin/city-aliases",
            json={"alias_name": "دبي", "canonical_city_code": city_code, "country_code": None},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["alias_name"] == "دبي"
        assert data["canonical_city_code"] == city_code

    def test_create_alias_unknown_city_returns_404(self, client):
        resp = client.post(
            "/api/v1/admin/city-aliases",
            json={
                "alias_name": "SomeAlias",
                "canonical_city_code": "cty_nonexistent",
                "country_code": None,
            },
        )
        assert resp.status_code == 404

    def test_create_alias_idempotent(self, client, db_session):
        """Posting the same alias twice should return 200 both times (idempotent upsert)."""
        city_code = _make_city(client, db_session)

        resp1 = client.post(
            "/api/v1/admin/city-aliases",
            json={"alias_name": "Deira", "canonical_city_code": city_code, "country_code": None},
        )
        assert resp1.status_code == 200

        resp2 = client.post(
            "/api/v1/admin/city-aliases",
            json={"alias_name": "Deira", "canonical_city_code": city_code, "country_code": None},
        )
        assert resp2.status_code == 200
        assert resp1.json()["id"] == resp2.json()["id"]

    def test_list_returns_created_alias(self, client, db_session):
        city_code = _make_city(client, db_session)

        client.post(
            "/api/v1/admin/city-aliases",
            json={"alias_name": "Bombay", "canonical_city_code": city_code, "country_code": None},
        )

        resp = client.get("/api/v1/admin/city-aliases")
        assert resp.status_code == 200
        aliases = resp.json()["aliases"]
        assert any(a["alias_name"] == "Bombay" for a in aliases)


class TestDeleteAlias:
    def test_delete_alias(self, client, db_session):
        city_code = _make_city(client, db_session)

        create_resp = client.post(
            "/api/v1/admin/city-aliases",
            json={"alias_name": "OldName", "canonical_city_code": city_code, "country_code": None},
        )
        alias_id = create_resp.json()["id"]

        del_resp = client.delete(f"/api/v1/admin/city-aliases/{alias_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["ok"] is True

        # Verify it's gone
        list_resp = client.get("/api/v1/admin/city-aliases")
        aliases = list_resp.json()["aliases"]
        assert not any(a["id"] == alias_id for a in aliases)

    def test_delete_nonexistent_alias_returns_404(self, client):
        resp = client.delete("/api/v1/admin/city-aliases/99999")
        assert resp.status_code == 404

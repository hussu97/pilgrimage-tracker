"""
Tests for Phase 1 Journey UX pivot endpoints.

Covers:
  GET  /api/v1/groups/featured
  POST /api/v1/groups/{code}/optimize-route
  GET  /api/v1/places/recommended
"""

from app.db.models import Group, Place

# ── helpers ────────────────────────────────────────────────────────────────────


def _register_and_login(client, email="u1@test.com", password="Testpass1!", name="User"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": name},
    )
    assert resp.status_code == 200, resp.text
    d = resp.json()
    return d["token"], d["user"]["user_code"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _make_place(db_session, code: str, name: str, lat: float = 25.0, lng: float = 55.0):
    p = Place(
        place_code=code,
        name=name,
        religion="islam",
        place_type="mosque",
        lat=lat,
        lng=lng,
        address="Test St",
    )
    db_session.add(p)
    db_session.commit()
    return p


def _create_group(client, token, name="Journey", path_place_codes=None):
    resp = client.post(
        "/api/v1/groups",
        json={"name": name, "description": "", "path_place_codes": path_place_codes or []},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ── GET /groups/featured ───────────────────────────────────────────────────────


class TestFeaturedGroups:
    def test_featured_empty_when_none_marked(self, client):
        """Returns empty list when no group has is_featured=True."""
        token, _ = _register_and_login(client)
        _create_group(client, token, "Journey A")
        resp = client.get("/api/v1/groups/featured")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_featured_returns_only_featured_groups(self, client, db_session):
        """Returns only groups flagged is_featured=True."""
        token, _ = _register_and_login(client, email="feat@test.com")
        g_data = _create_group(client, token, "Featured Journey")
        group_code = g_data["group_code"]

        # Mark as featured directly in DB
        group = db_session.get(
            Group,
            db_session.exec(
                __import__("sqlmodel").select(Group).where(Group.group_code == group_code)
            )
            .first()
            .id,
        )
        group.is_featured = True
        db_session.add(group)
        db_session.commit()

        resp = client.get("/api/v1/groups/featured")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["group_code"] == group_code
        assert data[0]["name"] == "Featured Journey"

    def test_featured_no_auth_required(self, client):
        """Endpoint is public — no Authorization header needed."""
        resp = client.get("/api/v1/groups/featured")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_featured_response_schema(self, client, db_session):
        """Featured journey response includes expected fields."""
        token, _ = _register_and_login(client, email="schema@test.com")
        g_data = _create_group(client, token, "Schema Test Journey")
        group_code = g_data["group_code"]

        group = db_session.exec(
            __import__("sqlmodel").select(Group).where(Group.group_code == group_code)
        ).first()
        group.is_featured = True
        db_session.add(group)
        db_session.commit()

        resp = client.get("/api/v1/groups/featured")
        assert resp.status_code == 200
        item = resp.json()[0]
        for field in ("group_code", "name", "total_sites", "member_count"):
            assert field in item, f"Missing field: {field}"


# ── POST /groups/{code}/optimize-route ────────────────────────────────────────


class TestOptimizeRoute:
    def test_optimize_route_reorders_places(self, client, db_session):
        """Nearest-neighbour should reorder a 3-place itinerary."""
        token, _ = _register_and_login(client, email="opt@test.com")
        # Three places: start far east, then go west, then middle
        # Optimal order by lat: A(25,55) → C(25,56) → B(25,57)
        _make_place(db_session, "plc_optA", "Place A", lat=25.0, lng=55.0)
        _make_place(db_session, "plc_optB", "Place B", lat=25.0, lng=57.0)
        _make_place(db_session, "plc_optC", "Place C", lat=25.0, lng=56.0)

        # Create group with B as start (should then pick C, then B)
        g = _create_group(
            client, token, "Optimize Test", path_place_codes=["plc_optA", "plc_optB", "plc_optC"]
        )
        group_code = g["group_code"]

        resp = client.post(
            f"/api/v1/groups/{group_code}/optimize-route",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "path_place_codes" in data
        assert "changed" in data
        # Starting from A(55), nearest is C(56), then B(57)
        assert data["path_place_codes"] == ["plc_optA", "plc_optC", "plc_optB"]
        assert data["changed"] is True

    def test_optimize_route_no_change_for_already_optimal(self, client, db_session):
        """Returns changed=False when order is already optimal."""
        token, _ = _register_and_login(client, email="opt2@test.com")
        _make_place(db_session, "plc_o2A", "Opt2 A", lat=25.0, lng=55.0)
        _make_place(db_session, "plc_o2B", "Opt2 B", lat=25.0, lng=55.1)
        _make_place(db_session, "plc_o2C", "Opt2 C", lat=25.0, lng=55.2)

        g = _create_group(
            client, token, "Already Optimal", path_place_codes=["plc_o2A", "plc_o2B", "plc_o2C"]
        )
        resp = client.post(
            f"/api/v1/groups/{g['group_code']}/optimize-route",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["changed"] is False

    def test_optimize_route_requires_auth(self, client, db_session):
        """Unauthenticated request returns 401 or 403."""
        token, _ = _register_and_login(client, email="opt3@test.com")
        _make_place(db_session, "plc_o3A", "Opt3 A", lat=25.0, lng=55.0)
        _make_place(db_session, "plc_o3B", "Opt3 B", lat=25.0, lng=56.0)
        _make_place(db_session, "plc_o3C", "Opt3 C", lat=25.0, lng=57.0)
        g = _create_group(
            client, token, "Auth Test", path_place_codes=["plc_o3A", "plc_o3B", "plc_o3C"]
        )
        resp = client.post(f"/api/v1/groups/{g['group_code']}/optimize-route")
        assert resp.status_code in (401, 403)

    def test_optimize_route_short_path_unchanged(self, client, db_session):
        """Groups with fewer than 3 places are returned unchanged."""
        token, _ = _register_and_login(client, email="opt4@test.com")
        _make_place(db_session, "plc_o4A", "Opt4 A", lat=25.0, lng=55.0)
        _make_place(db_session, "plc_o4B", "Opt4 B", lat=26.0, lng=56.0)
        g = _create_group(client, token, "Short Path", path_place_codes=["plc_o4A", "plc_o4B"])
        resp = client.post(
            f"/api/v1/groups/{g['group_code']}/optimize-route",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["changed"] is False

    def test_optimize_route_group_not_found(self, client):
        """Returns 404 for unknown group code."""
        token, _ = _register_and_login(client, email="opt5@test.com")
        resp = client.post(
            "/api/v1/groups/grp_notexist/optimize-route",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404


# ── GET /places/recommended ───────────────────────────────────────────────────


class TestRecommendedPlaces:
    def test_recommended_returns_list(self, client):
        """Returns an empty list or place list — no auth required."""
        resp = client.get("/api/v1/places/recommended")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_recommended_with_location(self, client, db_session):
        """With lat/lng, returns places sorted by distance."""
        _make_place(db_session, "plc_rec1", "Rec Close", lat=25.0, lng=55.0)
        _make_place(db_session, "plc_rec2", "Rec Far", lat=30.0, lng=60.0)

        resp = client.get("/api/v1/places/recommended?lat=25.0&lng=55.0&limit=10")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        # Verify response schema
        if data:
            item = data[0]
            for field in ("place_code", "name", "religion", "lat", "lng"):
                assert field in item

    def test_recommended_with_religion_filter(self, client, db_session):
        """Religion filter restricts results."""
        _make_place(db_session, "plc_isl1", "Islam Place", lat=25.0, lng=55.0)
        p2 = Place(
            place_code="plc_hin1",
            name="Hindu Place",
            religion="hinduism",
            place_type="temple",
            lat=25.1,
            lng=55.1,
            address="Test",
        )
        db_session.add(p2)
        db_session.commit()

        resp = client.get("/api/v1/places/recommended?religions=islam")
        assert resp.status_code == 200
        data = resp.json()
        religions_in_response = {r["religion"] for r in data}
        assert "hinduism" not in religions_in_response

    def test_recommended_distance_in_response(self, client, db_session):
        """distance_km field is populated when lat/lng provided."""
        _make_place(db_session, "plc_dist1", "Distance Test", lat=25.0, lng=55.0)
        resp = client.get("/api/v1/places/recommended?lat=25.0&lng=55.0")
        assert resp.status_code == 200
        data = resp.json()
        if data:
            assert data[0]["distance_km"] is not None
            assert isinstance(data[0]["distance_km"], float)

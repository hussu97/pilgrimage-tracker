"""Tests for admin stats endpoints — GET /api/v1/admin/stats/..."""

from datetime import UTC, datetime

from sqlmodel import select

from app.db.models import CheckIn, Group, GroupMember, Place, Review, User

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


def _create_place(db_session, place_code="plc_001", name="Test Mosque", religion="islam") -> Place:
    place = Place(
        place_code=place_code,
        name=name,
        religion=religion,
        place_type="mosque",
        lat=25.0,
        lng=55.0,
        address="Test Address",
        created_at=datetime.now(UTC),
    )
    db_session.add(place)
    db_session.commit()
    return place


def _create_check_in(db_session, user_code: str, place_code: str, code="ci_001") -> CheckIn:
    ci = CheckIn(
        check_in_code=code,
        user_code=user_code,
        place_code=place_code,
        checked_in_at=datetime.now(UTC),
    )
    db_session.add(ci)
    db_session.commit()
    return ci


def _create_review(
    db_session, user_code: str, place_code: str, rating: int = 4, code="rv_001"
) -> Review:
    review = Review(
        review_code=code,
        user_code=user_code,
        place_code=place_code,
        rating=rating,
        is_flagged=False,
        source="user",
        created_at=datetime.now(UTC),
    )
    db_session.add(review)
    db_session.commit()
    return review


def _create_group(db_session, user_code: str, code="grp_001", name="Test Group") -> Group:
    group = Group(
        group_code=code,
        name=name,
        created_by_user_code=user_code,
        invite_code=f"inv_{code}",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(group)
    db_session.commit()
    return group


def _create_group_member(db_session, group_code: str, user_code: str, role="member") -> GroupMember:
    gm = GroupMember(
        group_code=group_code,
        user_code=user_code,
        role=role,
        joined_at=datetime.now(UTC),
    )
    db_session.add(gm)
    db_session.commit()
    return gm


# ── Tests: overview ────────────────────────────────────────────────────────────


def test_overview_requires_admin(client):
    resp = client.get("/api/v1/admin/stats/overview")
    assert resp.status_code == 401


def test_overview_returns_all_fields(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/stats/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    for field in (
        "total_users",
        "total_places",
        "total_reviews",
        "total_check_ins",
        "total_groups",
        "active_users_30d",
    ):
        assert field in data
    assert data["total_users"] >= 1  # admin user exists


def test_overview_counts_new_user(client, db_session):
    headers = _admin_headers(client, db_session)
    baseline = client.get("/api/v1/admin/stats/overview", headers=headers).json()["total_users"]
    _register(client, email="extra@example.com")
    resp = client.get("/api/v1/admin/stats/overview", headers=headers)
    assert resp.json()["total_users"] == baseline + 1


def test_overview_counts_place(client, db_session):
    headers = _admin_headers(client, db_session)
    baseline = client.get("/api/v1/admin/stats/overview", headers=headers).json()["total_places"]
    _create_place(db_session, place_code="plc_ov1", name="Stat Mosque")
    resp = client.get("/api/v1/admin/stats/overview", headers=headers)
    assert resp.json()["total_places"] == baseline + 1


def test_overview_active_users_30d(client, db_session):
    headers = _admin_headers(client, db_session, email="admin_act30@example.com")
    reg = _register(client, email="active_usr@example.com")
    user_code = reg["user"]["user_code"]
    place = _create_place(db_session, place_code="plc_act30", name="Active Mosque")
    _create_check_in(db_session, user_code, place.place_code, code="ci_act30")

    resp = client.get("/api/v1/admin/stats/overview", headers=headers)
    assert resp.json()["active_users_30d"] >= 1


# ── Tests: user-growth ────────────────────────────────────────────────────────


def test_user_growth_requires_admin(client):
    resp = client.get("/api/v1/admin/stats/user-growth")
    assert resp.status_code == 401


def test_user_growth_day_returns_30_periods(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/stats/user-growth?interval=day", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 30
    for item in data:
        assert "period" in item
        assert "count" in item
        assert item["count"] >= 0


def test_user_growth_week_returns_12_periods(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/stats/user-growth?interval=week", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 12


def test_user_growth_month_returns_12_periods(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/stats/user-growth?interval=month", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 12


def test_user_growth_invalid_interval(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/stats/user-growth?interval=invalid", headers=headers)
    assert resp.status_code == 422


def test_user_growth_default_interval_is_day(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/stats/user-growth", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 30


# ── Tests: popular-places ─────────────────────────────────────────────────────


def test_popular_places_requires_admin(client):
    resp = client.get("/api/v1/admin/stats/popular-places")
    assert resp.status_code == 401


def test_popular_places_returns_list(client, db_session):
    headers = _admin_headers(client, db_session)
    _create_place(db_session, place_code="plc_pop1", name="Popular Mosque")
    resp = client.get("/api/v1/admin/stats/popular-places", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if data:
        for field in ("place_code", "name", "religion", "check_in_count", "review_count"):
            assert field in data[0]


def test_popular_places_empty_when_no_places(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/stats/popular-places", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_popular_places_sorted_by_check_in_count(client, db_session):
    headers = _admin_headers(client, db_session, email="admin_pop@example.com")
    reg = _register(client, email="user_pop@example.com")
    user_code = reg["user"]["user_code"]
    p1 = _create_place(db_session, place_code="plc_pop_a", name="Place A")
    p2 = _create_place(db_session, place_code="plc_pop_b", name="Place B")
    # 2 check-ins at p2, 1 at p1
    _create_check_in(db_session, user_code, p2.place_code, code="ci_pop1")
    _create_check_in(db_session, user_code, p2.place_code, code="ci_pop2")
    _create_check_in(db_session, user_code, p1.place_code, code="ci_pop3")

    resp = client.get("/api/v1/admin/stats/popular-places", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    by_code = {item["place_code"]: item for item in data}
    assert by_code["plc_pop_b"]["check_in_count"] == 2
    assert by_code["plc_pop_a"]["check_in_count"] == 1
    # p2 should rank higher
    codes = [item["place_code"] for item in data]
    assert codes.index("plc_pop_b") < codes.index("plc_pop_a")


def test_popular_places_avg_rating(client, db_session):
    headers = _admin_headers(client, db_session, email="admin_avgr@example.com")
    reg = _register(client, email="user_avgr@example.com")
    user_code = reg["user"]["user_code"]
    place = _create_place(db_session, place_code="plc_avgr1", name="Rated Mosque")
    _create_review(db_session, user_code, place.place_code, rating=4, code="rv_avgr1")
    _create_review(db_session, user_code, place.place_code, rating=2, code="rv_avgr2")

    resp = client.get("/api/v1/admin/stats/popular-places", headers=headers)
    data = resp.json()
    by_code = {item["place_code"]: item for item in data}
    assert by_code["plc_avgr1"]["avg_rating"] == 3.0


# ── Tests: religion-breakdown ─────────────────────────────────────────────────


def test_religion_breakdown_requires_admin(client):
    resp = client.get("/api/v1/admin/stats/religion-breakdown")
    assert resp.status_code == 401


def test_religion_breakdown_empty_when_no_places(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/stats/religion-breakdown", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_religion_breakdown_groups_by_religion(client, db_session):
    headers = _admin_headers(client, db_session, email="admin_rel@example.com")
    _create_place(db_session, place_code="plc_rel1", name="Mosque 1", religion="islam")
    _create_place(db_session, place_code="plc_rel2", name="Temple 1", religion="hinduism")
    _create_place(db_session, place_code="plc_rel3", name="Mosque 2", religion="islam")

    resp = client.get("/api/v1/admin/stats/religion-breakdown", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    by_religion = {item["religion"]: item for item in data}
    assert by_religion["islam"]["place_count"] == 2
    assert by_religion["hinduism"]["place_count"] == 1
    for item in data:
        assert "check_in_count" in item


def test_religion_breakdown_counts_check_ins(client, db_session):
    headers = _admin_headers(client, db_session, email="admin_relci@example.com")
    reg = _register(client, email="user_relci@example.com")
    user_code = reg["user"]["user_code"]
    place = _create_place(db_session, place_code="plc_relci1", name="CI Mosque", religion="islam")
    _create_check_in(db_session, user_code, place.place_code, code="ci_relci1")

    resp = client.get("/api/v1/admin/stats/religion-breakdown", headers=headers)
    data = resp.json()
    by_religion = {item["religion"]: item for item in data}
    assert by_religion["islam"]["check_in_count"] == 1


# ── Tests: recent-activity ────────────────────────────────────────────────────


def test_recent_activity_requires_admin(client):
    resp = client.get("/api/v1/admin/stats/recent-activity")
    assert resp.status_code == 401


def test_recent_activity_returns_list(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/stats/recent-activity", headers=headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_recent_activity_includes_check_ins(client, db_session):
    headers = _admin_headers(client, db_session, email="admin_ract@example.com")
    reg = _register(client, email="user_ract@example.com")
    user_code = reg["user"]["user_code"]
    place = _create_place(db_session, place_code="plc_ract1", name="Activity Mosque")
    _create_check_in(db_session, user_code, place.place_code, code="ci_ract1")

    resp = client.get("/api/v1/admin/stats/recent-activity", headers=headers)
    data = resp.json()
    types = [item["type"] for item in data]
    assert "check_in" in types

    ci_items = [item for item in data if item["type"] == "check_in"]
    assert any(item["place_name"] == "Activity Mosque" for item in ci_items)


def test_recent_activity_includes_reviews(client, db_session):
    headers = _admin_headers(client, db_session, email="admin_rrv@example.com")
    reg = _register(client, email="user_rrv@example.com")
    user_code = reg["user"]["user_code"]
    place = _create_place(db_session, place_code="plc_rrv1", name="Review Mosque")
    _create_review(db_session, user_code, place.place_code, code="rv_ract1")

    resp = client.get("/api/v1/admin/stats/recent-activity", headers=headers)
    data = resp.json()
    assert "review" in [item["type"] for item in data]


def test_recent_activity_includes_group_joins(client, db_session):
    headers = _admin_headers(client, db_session, email="admin_rgj@example.com")
    reg = _register(client, email="user_rgj@example.com")
    user_code = reg["user"]["user_code"]
    group = _create_group(db_session, user_code, code="grp_rgj1", name="Test Group")
    _create_group_member(db_session, group.group_code, user_code)

    resp = client.get("/api/v1/admin/stats/recent-activity", headers=headers)
    data = resp.json()
    gj_items = [item for item in data if item["type"] == "group_join"]
    assert any(item["group_name"] == "Test Group" for item in gj_items)


def test_recent_activity_max_50_items(client, db_session):
    headers = _admin_headers(client, db_session, email="admin_max@example.com")
    resp = client.get("/api/v1/admin/stats/recent-activity", headers=headers)
    assert len(resp.json()) <= 50


# ── Tests: review-stats ───────────────────────────────────────────────────────


def test_review_stats_requires_admin(client):
    resp = client.get("/api/v1/admin/stats/review-stats")
    assert resp.status_code == 401


def test_review_stats_returns_all_fields(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/stats/review-stats", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "rating_histogram" in data
    assert "flagged_count" in data
    assert "avg_rating" in data
    assert "total_reviews" in data


def test_review_stats_histogram_has_all_ratings(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/stats/review-stats", headers=headers)
    hist = resp.json()["rating_histogram"]
    for r in ("1", "2", "3", "4", "5"):
        assert r in hist


def test_review_stats_no_reviews(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/stats/review-stats", headers=headers)
    data = resp.json()
    assert data["total_reviews"] == 0
    assert data["avg_rating"] is None
    assert data["flagged_count"] == 0


def test_review_stats_counts_flagged(client, db_session):
    headers = _admin_headers(client, db_session, email="admin_flag@example.com")
    reg = _register(client, email="user_flag@example.com")
    user_code = reg["user"]["user_code"]
    place = _create_place(db_session, place_code="plc_flag1", name="Flagged Mosque")
    flagged = Review(
        review_code="rv_flag1",
        user_code=user_code,
        place_code=place.place_code,
        rating=1,
        is_flagged=True,
        source="user",
        created_at=datetime.now(UTC),
    )
    db_session.add(flagged)
    db_session.commit()

    resp = client.get("/api/v1/admin/stats/review-stats", headers=headers)
    data = resp.json()
    assert data["flagged_count"] >= 1
    assert data["rating_histogram"]["1"] >= 1


def test_review_stats_avg_rating(client, db_session):
    headers = _admin_headers(client, db_session, email="admin_avgstat@example.com")
    reg = _register(client, email="user_avgstat@example.com")
    user_code = reg["user"]["user_code"]
    place = _create_place(db_session, place_code="plc_avgstat1", name="Avg Mosque")
    _create_review(db_session, user_code, place.place_code, rating=4, code="rv_avgstat1")
    _create_review(db_session, user_code, place.place_code, rating=2, code="rv_avgstat2")

    resp = client.get("/api/v1/admin/stats/review-stats", headers=headers)
    data = resp.json()
    assert data["avg_rating"] == 3.0
    assert data["total_reviews"] == 2

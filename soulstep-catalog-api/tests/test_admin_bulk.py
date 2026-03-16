"""Tests for admin bulk operation endpoints — POST /api/v1/admin/bulk/..."""

from datetime import UTC, datetime

from sqlmodel import select

from app.db.models import CheckIn, Group, Place, Review, User

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


def _admin_headers(client, db_session, email="admin@example.com", password="Testpass1!"):
    data = _register(client, email=email, password=password)
    _make_admin(db_session, data["user"]["user_code"])
    token = data["token"]
    return {"Authorization": f"Bearer {token}"}


def _register_user(client, email, password="Testpass1!"):
    data = _register(client, email=email, password=password, display_name="User")
    return data["user"]["user_code"]


def _create_place(db_session, place_code="plc_bulk001") -> Place:
    place = Place(
        place_code=place_code,
        name="Bulk Mosque",
        religion="islam",
        place_type="mosque",
        lat=25.0,
        lng=55.0,
        address="Test Address",
        created_at=datetime.now(UTC),
    )
    db_session.add(place)
    db_session.commit()
    return place


def _create_review(db_session, user_code: str, place_code: str, review_code: str) -> Review:
    review = Review(
        review_code=review_code,
        user_code=user_code,
        place_code=place_code,
        rating=4,
        is_flagged=False,
        source="user",
        created_at=datetime.now(UTC),
    )
    db_session.add(review)
    db_session.commit()
    return review


def _create_check_in(db_session, user_code: str, place_code: str, code: str) -> CheckIn:
    ci = CheckIn(
        check_in_code=code,
        user_code=user_code,
        place_code=place_code,
        checked_in_at=datetime.now(UTC),
    )
    db_session.add(ci)
    db_session.commit()
    return ci


def _create_group(db_session, user_code: str, group_code: str) -> Group:
    group = Group(
        group_code=group_code,
        name="Bulk Group",
        created_by_user_code=user_code,
        invite_code=f"inv_{group_code}",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(group)
    db_session.commit()
    return group


# ── Bulk deactivate users ──────────────────────────────────────────────────────


class TestBulkDeactivateUsers:
    def test_requires_admin(self, client, db_session):
        user_code = _register_user(client, email="nonadmin_bdu@example.com")
        data = _register(client, email="user_bdu_caller@example.com")
        token = data["token"]
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post(
            "/api/v1/admin/bulk/users/deactivate",
            json={"user_codes": [user_code]},
            headers=headers,
        )
        assert resp.status_code == 403

    def test_requires_auth(self, client):
        resp = client.post(
            "/api/v1/admin/bulk/users/deactivate",
            json={"user_codes": ["usr_fake"]},
        )
        assert resp.status_code == 401

    def test_deactivates_users(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bdu@example.com")
        uc1 = _register_user(client, email="target_bdu1@example.com")
        uc2 = _register_user(client, email="target_bdu2@example.com")

        resp = client.post(
            "/api/v1/admin/bulk/users/deactivate",
            json={"user_codes": [uc1, uc2]},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 2

        u1 = db_session.exec(select(User).where(User.user_code == uc1)).first()
        u2 = db_session.exec(select(User).where(User.user_code == uc2)).first()
        assert u1.is_active is False
        assert u2.is_active is False

    def test_empty_list_returns_zero(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bdu_empty@example.com")
        resp = client.post(
            "/api/v1/admin/bulk/users/deactivate",
            json={"user_codes": []},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 0

    def test_unknown_codes_return_zero(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bdu_unk@example.com")
        resp = client.post(
            "/api/v1/admin/bulk/users/deactivate",
            json={"user_codes": ["usr_nonexistent1", "usr_nonexistent2"]},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 0


# ── Bulk activate users ───────────────────────────────────────────────────────


class TestBulkActivateUsers:
    def test_requires_admin(self, client, db_session):
        user_code = _register_user(client, email="nonadmin_bau@example.com")
        data = _register(client, email="user_bau_caller@example.com")
        token = data["token"]
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post(
            "/api/v1/admin/bulk/users/activate",
            json={"user_codes": [user_code]},
            headers=headers,
        )
        assert resp.status_code == 403

    def test_activates_previously_deactivated_users(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bau@example.com")
        uc = _register_user(client, email="target_bau@example.com")

        # Deactivate first
        client.post(
            "/api/v1/admin/bulk/users/deactivate",
            json={"user_codes": [uc]},
            headers=headers,
        )
        user = db_session.exec(select(User).where(User.user_code == uc)).first()
        assert user.is_active is False

        # Now activate
        resp = client.post(
            "/api/v1/admin/bulk/users/activate",
            json={"user_codes": [uc]},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 1

        db_session.refresh(user)
        assert user.is_active is True

    def test_empty_list_returns_zero(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bau_empty@example.com")
        resp = client.post(
            "/api/v1/admin/bulk/users/activate",
            json={"user_codes": []},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 0

    def test_affected_count_matches_found_users(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bau_count@example.com")
        uc1 = _register_user(client, email="target_bau_c1@example.com")
        uc2 = _register_user(client, email="target_bau_c2@example.com")

        resp = client.post(
            "/api/v1/admin/bulk/users/activate",
            json={"user_codes": [uc1, uc2, "usr_nonexistent"]},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 2


# ── Bulk flag reviews ─────────────────────────────────────────────────────────


class TestBulkFlagReviews:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_bfr_caller@example.com")
        token = data["token"]
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post(
            "/api/v1/admin/bulk/reviews/flag",
            json={"review_codes": ["rev_fake"]},
            headers=headers,
        )
        assert resp.status_code == 403

    def test_flags_reviews(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bfr@example.com")
        uc = _register_user(client, email="user_bfr@example.com")
        place = _create_place(db_session, place_code="plc_bfr001")
        r1 = _create_review(db_session, uc, place.place_code, "rev_bfr001")
        r2 = _create_review(db_session, uc, place.place_code, "rev_bfr002")

        resp = client.post(
            "/api/v1/admin/bulk/reviews/flag",
            json={"review_codes": [r1.review_code, r2.review_code]},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 2

        db_session.refresh(r1)
        db_session.refresh(r2)
        assert r1.is_flagged is True
        assert r2.is_flagged is True

    def test_empty_list_returns_zero(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bfr_empty@example.com")
        resp = client.post(
            "/api/v1/admin/bulk/reviews/flag",
            json={"review_codes": []},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 0


# ── Bulk unflag reviews ───────────────────────────────────────────────────────


class TestBulkUnflagReviews:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_bur_caller@example.com")
        token = data["token"]
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post(
            "/api/v1/admin/bulk/reviews/unflag",
            json={"review_codes": ["rev_fake"]},
            headers=headers,
        )
        assert resp.status_code == 403

    def test_unflags_previously_flagged_reviews(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bur@example.com")
        uc = _register_user(client, email="user_bur@example.com")
        place = _create_place(db_session, place_code="plc_bur001")
        review = _create_review(db_session, uc, place.place_code, "rev_bur001")

        # Flag first
        client.post(
            "/api/v1/admin/bulk/reviews/flag",
            json={"review_codes": [review.review_code]},
            headers=headers,
        )
        db_session.refresh(review)
        assert review.is_flagged is True

        # Now unflag
        resp = client.post(
            "/api/v1/admin/bulk/reviews/unflag",
            json={"review_codes": [review.review_code]},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 1

        db_session.refresh(review)
        assert review.is_flagged is False

    def test_empty_list_returns_zero(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bur_empty@example.com")
        resp = client.post(
            "/api/v1/admin/bulk/reviews/unflag",
            json={"review_codes": []},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 0


# ── Bulk delete reviews ───────────────────────────────────────────────────────


class TestBulkDeleteReviews:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_bdr_caller@example.com")
        token = data["token"]
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post(
            "/api/v1/admin/bulk/reviews/delete",
            json={"review_codes": ["rev_fake"]},
            headers=headers,
        )
        assert resp.status_code == 403

    def test_deletes_reviews(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bdr@example.com")
        uc = _register_user(client, email="user_bdr@example.com")
        place = _create_place(db_session, place_code="plc_bdr001")
        r1 = _create_review(db_session, uc, place.place_code, "rev_bdr001")
        r2 = _create_review(db_session, uc, place.place_code, "rev_bdr002")

        resp = client.post(
            "/api/v1/admin/bulk/reviews/delete",
            json={"review_codes": [r1.review_code, r2.review_code]},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 2

        # Bulk delete is now a soft-delete: rows remain but with deleted_at set
        db_session.expire_all()
        soft_deleted = db_session.exec(
            select(Review).where(
                Review.review_code.in_(["rev_bdr001", "rev_bdr002"])  # type: ignore[attr-defined]
            )
        ).all()
        assert len(soft_deleted) == 2
        assert all(r.deleted_at is not None for r in soft_deleted)

    def test_empty_list_returns_zero(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bdr_empty@example.com")
        resp = client.post(
            "/api/v1/admin/bulk/reviews/delete",
            json={"review_codes": []},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 0

    def test_partial_match_affected_count(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bdr_partial@example.com")
        uc = _register_user(client, email="user_bdr_p@example.com")
        place = _create_place(db_session, place_code="plc_bdr_p001")
        r = _create_review(db_session, uc, place.place_code, "rev_bdr_p001")

        resp = client.post(
            "/api/v1/admin/bulk/reviews/delete",
            json={"review_codes": [r.review_code, "rev_nonexistent"]},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 1


# ── Bulk delete check-ins ─────────────────────────────────────────────────────


class TestBulkDeleteCheckIns:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_bdci_caller@example.com")
        token = data["token"]
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post(
            "/api/v1/admin/bulk/check-ins/delete",
            json={"check_in_codes": ["cin_fake"]},
            headers=headers,
        )
        assert resp.status_code == 403

    def test_deletes_check_ins(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bdci@example.com")
        uc = _register_user(client, email="user_bdci@example.com")
        place = _create_place(db_session, place_code="plc_bdci001")
        ci1 = _create_check_in(db_session, uc, place.place_code, "cin_bdci001")
        ci2 = _create_check_in(db_session, uc, place.place_code, "cin_bdci002")

        resp = client.post(
            "/api/v1/admin/bulk/check-ins/delete",
            json={"check_in_codes": [ci1.check_in_code, ci2.check_in_code]},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 2

        # Bulk delete is now a soft-delete: rows remain but with deleted_at set
        db_session.expire_all()
        soft_deleted = db_session.exec(
            select(CheckIn).where(
                CheckIn.check_in_code.in_(["cin_bdci001", "cin_bdci002"])  # type: ignore[attr-defined]
            )
        ).all()
        assert len(soft_deleted) == 2
        assert all(ci.deleted_at is not None for ci in soft_deleted)

    def test_empty_list_returns_zero(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bdci_empty@example.com")
        resp = client.post(
            "/api/v1/admin/bulk/check-ins/delete",
            json={"check_in_codes": []},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 0


# ── Bulk delete places ────────────────────────────────────────────────────────


class TestBulkDeletePlaces:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_bdp_caller@example.com")
        token = data["token"]
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post(
            "/api/v1/admin/bulk/places/delete",
            json={"place_codes": ["plc_fake"]},
            headers=headers,
        )
        assert resp.status_code == 403

    def test_deletes_places(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bdp@example.com")
        p1 = _create_place(db_session, place_code="plc_bdp001")
        p2 = _create_place(db_session, place_code="plc_bdp002")

        resp = client.post(
            "/api/v1/admin/bulk/places/delete",
            json={"place_codes": [p1.place_code, p2.place_code]},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 2

        remaining = db_session.exec(
            select(Place).where(
                Place.place_code.in_(["plc_bdp001", "plc_bdp002"])  # type: ignore[attr-defined]
            )
        ).all()
        assert len(remaining) == 0

    def test_empty_list_returns_zero(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bdp_empty@example.com")
        resp = client.post(
            "/api/v1/admin/bulk/places/delete",
            json={"place_codes": []},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 0

    def test_single_place_delete(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bdp_single@example.com")
        place = _create_place(db_session, place_code="plc_bdp_s001")

        resp = client.post(
            "/api/v1/admin/bulk/places/delete",
            json={"place_codes": [place.place_code]},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 1
        assert (
            db_session.exec(select(Place).where(Place.place_code == "plc_bdp_s001")).first() is None
        )


# ── Bulk delete groups ────────────────────────────────────────────────────────


class TestBulkDeleteGroups:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_bdg_caller@example.com")
        token = data["token"]
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post(
            "/api/v1/admin/bulk/groups/delete",
            json={"group_codes": ["grp_fake"]},
            headers=headers,
        )
        assert resp.status_code == 403

    def test_deletes_groups(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bdg@example.com")
        uc = _register_user(client, email="user_bdg@example.com")
        g1 = _create_group(db_session, uc, "grp_bdg001")
        g2 = _create_group(db_session, uc, "grp_bdg002")

        resp = client.post(
            "/api/v1/admin/bulk/groups/delete",
            json={"group_codes": [g1.group_code, g2.group_code]},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 2

        remaining = db_session.exec(
            select(Group).where(
                Group.group_code.in_(["grp_bdg001", "grp_bdg002"])  # type: ignore[attr-defined]
            )
        ).all()
        assert len(remaining) == 0

    def test_empty_list_returns_zero(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bdg_empty@example.com")
        resp = client.post(
            "/api/v1/admin/bulk/groups/delete",
            json={"group_codes": []},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 0

    def test_unknown_codes_return_zero(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_bdg_unk@example.com")
        resp = client.post(
            "/api/v1/admin/bulk/groups/delete",
            json={"group_codes": ["grp_nonexistent1", "grp_nonexistent2"]},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 0

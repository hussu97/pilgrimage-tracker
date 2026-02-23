"""Tests for admin place-attributes endpoints — /api/v1/admin/place-attributes/..."""

from sqlmodel import select

from app.db.models import Place, PlaceAttribute, PlaceAttributeDefinition, User

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


def _make_place(db_session, code="plc_pa00001"):
    from datetime import UTC, datetime

    place = Place(
        place_code=code,
        name="Test Mosque",
        religion="islam",
        place_type="mosque",
        lat=25.0,
        lng=55.0,
        address="Test St",
        created_at=datetime.now(UTC),
    )
    db_session.add(place)
    db_session.commit()
    return place


def _make_attr_def(db_session, code="has_parking", name="Has Parking"):
    defn = PlaceAttributeDefinition(
        attribute_code=code,
        name=name,
        data_type="boolean",
        is_filterable=True,
        display_order=0,
    )
    db_session.add(defn)
    db_session.commit()
    return defn


def _make_attr(db_session, place_code: str, attribute_code: str, value_text: str = "true"):
    attr = PlaceAttribute(
        place_code=place_code,
        attribute_code=attribute_code,
        value_text=value_text,
    )
    db_session.add(attr)
    db_session.commit()
    db_session.refresh(attr)
    return attr


# ── Tests: list attribute definitions ─────────────────────────────────────────


def test_list_place_attributes_requires_admin(client):
    resp = client.get("/api/v1/admin/place-attributes")
    assert resp.status_code == 401


def test_list_place_attributes_empty(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/place-attributes", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_place_attributes_returns_definitions_with_usage_count(client, db_session):
    place = _make_place(db_session)
    _make_attr_def(db_session, code="has_wudu", name="Has Wudu Area")
    _make_attr(db_session, place.place_code, "has_wudu", "true")
    headers = _admin_headers(client, db_session)

    resp = client.get("/api/v1/admin/place-attributes", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    item = data[0]
    assert item["attribute_code"] == "has_wudu"
    assert item["name"] == "Has Wudu Area"
    assert item["usage_count"] == 1


def test_list_place_attributes_usage_count_zero(client, db_session):
    _make_attr_def(db_session, code="unused_attr", name="Unused")
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/place-attributes", headers=headers)
    assert resp.status_code == 200
    items = {i["attribute_code"]: i for i in resp.json()}
    assert items["unused_attr"]["usage_count"] == 0


# ── Tests: list place attributes by place ─────────────────────────────────────


def test_list_attributes_for_place_404(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/place-attributes/plc_nonexistent", headers=headers)
    assert resp.status_code == 404


def test_list_attributes_for_place_empty(client, db_session):
    place = _make_place(db_session)
    headers = _admin_headers(client, db_session)
    resp = client.get(f"/api/v1/admin/place-attributes/{place.place_code}", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_attributes_for_place_returns_items(client, db_session):
    place = _make_place(db_session)
    _make_attr_def(db_session, code="has_lift", name="Has Lift")
    _make_attr(db_session, place.place_code, "has_lift", "true")
    headers = _admin_headers(client, db_session)

    resp = client.get(f"/api/v1/admin/place-attributes/{place.place_code}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["attribute_code"] == "has_lift"
    assert data[0]["value_text"] == "true"
    assert data[0]["attribute_name"] == "Has Lift"


# ── Tests: bulk update place attributes ───────────────────────────────────────


def test_bulk_update_attributes_creates_new(client, db_session):
    place = _make_place(db_session)
    _make_attr_def(db_session, code="has_ac", name="Has AC")
    headers = _admin_headers(client, db_session)

    body = {"attributes": [{"attribute_code": "has_ac", "value_text": "true"}]}
    resp = client.put(
        f"/api/v1/admin/place-attributes/{place.place_code}",
        json=body,
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["attribute_code"] == "has_ac"
    assert data[0]["value_text"] == "true"


def test_bulk_update_attributes_updates_existing(client, db_session):
    place = _make_place(db_session)
    _make_attr_def(db_session, code="capacity", name="Capacity")
    _make_attr(db_session, place.place_code, "capacity", "100")
    headers = _admin_headers(client, db_session)

    body = {"attributes": [{"attribute_code": "capacity", "value_text": "500"}]}
    resp = client.put(
        f"/api/v1/admin/place-attributes/{place.place_code}",
        json=body,
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()[0]["value_text"] == "500"

    # Verify DB — still only one row
    rows = db_session.exec(
        select(PlaceAttribute).where(
            PlaceAttribute.place_code == place.place_code,
            PlaceAttribute.attribute_code == "capacity",
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].value_text == "500"


def test_bulk_update_attributes_404_for_unknown_place(client, db_session):
    headers = _admin_headers(client, db_session)
    body = {"attributes": [{"attribute_code": "has_ac", "value_text": "true"}]}
    resp = client.put(
        "/api/v1/admin/place-attributes/plc_nonexistent",
        json=body,
        headers=headers,
    )
    assert resp.status_code == 404

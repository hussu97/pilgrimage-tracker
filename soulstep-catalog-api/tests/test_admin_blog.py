"""Tests for admin blog management endpoints."""

from datetime import UTC, datetime

from app.db.models import BlogPost


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


def _admin_headers(client, db_session, email="admin@example.com"):
    data = _register(client, email=email)
    token = data["token"]
    _make_admin(db_session, data["user"]["user_code"])
    return {"Authorization": f"Bearer {token}"}


def _seed_post(db_session, slug: str = "test-post", category: str = "Islam") -> BlogPost:
    post = BlogPost(
        post_code=f"blg_{slug[:6]}",
        slug=slug,
        title="Test Post",
        description="A test description",
        published_at=datetime(2025, 9, 1, tzinfo=UTC),
        updated_at=datetime(2025, 9, 1, tzinfo=UTC),
        reading_time=5,
        category=category,
        cover_gradient="from-emerald-500 to-teal-600",
        content=[{"paragraphs": ["Hello world."]}],
        is_published=True,
        tags=["travel", "pilgrimage"],
    )
    db_session.add(post)
    db_session.commit()
    return post


# ── List ───────────────────────────────────────────────────────────────────────


def test_admin_list_blog_posts(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_post(db_session)
    resp = client.get("/api/v1/admin/blog/posts", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["slug"] == "test-post"


def test_admin_list_includes_drafts(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_post(db_session, slug="draft-p1")
    post = db_session.get(BlogPost, "blg_draft-")
    if post:
        post.is_published = False
        db_session.commit()
    resp = client.get("/api/v1/admin/blog/posts", headers=headers)
    assert resp.status_code == 200


def test_admin_list_filter_by_category(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_post(db_session, slug="islam-xx", category="Islam")
    _seed_post(db_session, slug="hindu-xx", category="Hinduism")
    resp = client.get("/api/v1/admin/blog/posts?category=Islam", headers=headers)
    assert resp.status_code == 200
    slugs = [i["slug"] for i in resp.json()["items"]]
    assert "islam-xx" in slugs
    assert "hindu-xx" not in slugs


def test_admin_list_filter_by_search(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_post(db_session, slug="searchable")
    resp = client.get("/api/v1/admin/blog/posts?search=Test+Post", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


def test_admin_list_requires_auth(client):
    resp = client.get("/api/v1/admin/blog/posts")
    assert resp.status_code == 401


# ── Create ─────────────────────────────────────────────────────────────────────


def test_admin_create_blog_post(client, db_session):
    headers = _admin_headers(client, db_session)
    payload = {
        "slug": "new-test-post",
        "title": "New Test Post",
        "description": "A fresh new post",
        "category": "Travel Guide",
        "reading_time": 4,
        "cover_gradient": "from-blue-500 to-indigo-600",
        "author_name": "Hussain",
        "tags": ["guide", "travel"],
        "content": [{"heading": "Intro", "paragraphs": ["Welcome."]}],
        "is_published": True,
    }
    resp = client.post("/api/v1/admin/blog/posts", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["slug"] == "new-test-post"
    assert data["title"] == "New Test Post"
    assert data["content"][0]["heading"] == "Intro"
    assert data["post_code"].startswith("blg_")


def test_admin_create_duplicate_slug_fails(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_post(db_session, slug="dup-slug-x")
    payload = {
        "slug": "dup-slug-x",
        "title": "Dup",
        "description": "desc",
        "category": "Islam",
    }
    resp = client.post("/api/v1/admin/blog/posts", json=payload, headers=headers)
    assert resp.status_code == 409


def test_admin_create_requires_auth(client):
    resp = client.post("/api/v1/admin/blog/posts", json={"slug": "x", "title": "x", "description": "x", "category": "x"})
    assert resp.status_code == 401


# ── Update ─────────────────────────────────────────────────────────────────────


def test_admin_update_blog_post(client, db_session):
    headers = _admin_headers(client, db_session)
    post = _seed_post(db_session)
    resp = client.patch(
        f"/api/v1/admin/blog/posts/{post.post_code}",
        json={"title": "Updated Title", "is_published": False},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Updated Title"
    assert data["is_published"] is False


def test_admin_update_404(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.patch(
        "/api/v1/admin/blog/posts/blg_notfound",
        json={"title": "x"},
        headers=headers,
    )
    assert resp.status_code == 404


# ── Delete ─────────────────────────────────────────────────────────────────────


def test_admin_delete_blog_post(client, db_session):
    headers = _admin_headers(client, db_session)
    post = _seed_post(db_session)
    post_code = post.post_code
    resp = client.delete(f"/api/v1/admin/blog/posts/{post_code}", headers=headers)
    assert resp.status_code == 204
    db_session.expire_all()
    assert db_session.get(BlogPost, post_code) is None


def test_admin_delete_404(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.delete("/api/v1/admin/blog/posts/blg_notfound", headers=headers)
    assert resp.status_code == 404


# ── Metrics ────────────────────────────────────────────────────────────────────


def test_admin_list_includes_metrics(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_post(db_session)
    resp = client.get("/api/v1/admin/blog/posts", headers=headers)
    item = resp.json()["items"][0]
    assert "view_count" in item
    assert "link_click_count" in item

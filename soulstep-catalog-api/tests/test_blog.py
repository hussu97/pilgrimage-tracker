"""Tests for public blog endpoints."""

from datetime import UTC, datetime

from app.db.models import BlogPost

# ── Fixtures ───────────────────────────────────────────────────────────────────


def _seed_post(
    db_session, slug: str, category: str = "Islam", is_published: bool = True,
    tags: list | None = None,
) -> BlogPost:
    post = BlogPost(
        post_code=f"blg_{slug[:8].replace('-', '')[:6]}",
        slug=slug,
        title=f"Title for {slug}",
        description=f"Description for {slug}",
        published_at=datetime(2025, 9, 15, 9, 0, 0, tzinfo=UTC),
        updated_at=datetime(2025, 9, 15, 9, 0, 0, tzinfo=UTC),
        reading_time=7,
        category=category,
        cover_gradient="from-emerald-600 to-teal-800",
        content=[
            {"paragraphs": ["First paragraph.", "Second paragraph."]},
            {"heading": "A Section", "paragraphs": ["Section paragraph."]},
        ],
        is_published=is_published,
        tags=tags or [],
    )
    db_session.add(post)
    db_session.commit()
    return post


# ── List endpoint ──────────────────────────────────────────────────────────────


def test_list_blog_posts_empty(client):
    resp = client.get("/api/v1/blog/posts")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_blog_posts_returns_published(client, db_session):
    _seed_post(db_session, "mosques-dubai")
    resp = client.get("/api/v1/blog/posts")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["slug"] == "mosques-dubai"


def test_list_blog_posts_excludes_unpublished(client, db_session):
    _seed_post(db_session, "published-post", is_published=True)
    _seed_post(db_session, "draft-post-z", is_published=False)
    resp = client.get("/api/v1/blog/posts")
    assert resp.status_code == 200
    slugs = [p["slug"] for p in resp.json()]
    assert "published-post" in slugs
    assert "draft-post-z" not in slugs


def test_list_blog_posts_no_content_field(client, db_session):
    _seed_post(db_session, "mosques-dubai")
    resp = client.get("/api/v1/blog/posts")
    data = resp.json()
    assert "content" not in data[0]


def test_list_blog_posts_ordered_newest_first(client, db_session):
    older = BlogPost(
        post_code="blg_older",
        slug="older-post",
        title="Older",
        description="Older desc",
        published_at=datetime(2025, 8, 1, tzinfo=UTC),
        updated_at=datetime(2025, 8, 1, tzinfo=UTC),
        reading_time=5,
        category="Islam",
        cover_gradient="from-blue-500 to-blue-900",
        content=[],
        is_published=True,
    )
    newer = BlogPost(
        post_code="blg_newer",
        slug="newer-post",
        title="Newer",
        description="Newer desc",
        published_at=datetime(2025, 10, 1, tzinfo=UTC),
        updated_at=datetime(2025, 10, 1, tzinfo=UTC),
        reading_time=5,
        category="Islam",
        cover_gradient="from-blue-500 to-blue-900",
        content=[],
        is_published=True,
    )
    db_session.add(older)
    db_session.add(newer)
    db_session.commit()
    resp = client.get("/api/v1/blog/posts")
    slugs = [p["slug"] for p in resp.json()]
    assert slugs.index("newer-post") < slugs.index("older-post")


def test_list_blog_posts_has_required_fields(client, db_session):
    _seed_post(db_session, "mosques-dubai")
    resp = client.get("/api/v1/blog/posts")
    post = resp.json()[0]
    for field in (
        "post_code", "slug", "title", "description",
        "published_at", "reading_time", "category", "cover_gradient",
    ):
        assert field in post, f"Missing field: {field}"


def test_list_blog_posts_filter_by_category(client, db_session):
    _seed_post(db_session, "islam-post", category="Islam")
    _seed_post(db_session, "hinduism-p", category="Hinduism")
    resp = client.get("/api/v1/blog/posts?category=Islam")
    assert resp.status_code == 200
    slugs = [p["slug"] for p in resp.json()]
    assert "islam-post" in slugs
    assert "hinduism-p" not in slugs


def test_list_blog_posts_filter_by_search(client, db_session):
    _seed_post(db_session, "mosques-d")
    _seed_post(db_session, "temples-hi")
    resp = client.get("/api/v1/blog/posts?search=mosques")
    assert resp.status_code == 200
    slugs = [p["slug"] for p in resp.json()]
    assert "mosques-d" in slugs
    assert "temples-hi" not in slugs


def test_list_blog_posts_filter_by_tag(client, db_session):
    _seed_post(db_session, "tagged-pos", tags=["pilgrimage", "umrah"])
    _seed_post(db_session, "other-posx", tags=["travel"])
    resp = client.get("/api/v1/blog/posts?tag=umrah")
    assert resp.status_code == 200
    slugs = [p["slug"] for p in resp.json()]
    assert "tagged-pos" in slugs
    assert "other-posx" not in slugs


# ── Detail endpoint ────────────────────────────────────────────────────────────


def test_get_blog_post_returns_content(client, db_session):
    _seed_post(db_session, "mosques-dubai")
    resp = client.get("/api/v1/blog/posts/mosques-dubai")
    assert resp.status_code == 200
    data = resp.json()
    assert data["slug"] == "mosques-dubai"
    assert "content" in data
    assert isinstance(data["content"], list)
    assert len(data["content"]) > 0


def test_get_blog_post_404_unknown_slug(client):
    resp = client.get("/api/v1/blog/posts/does-not-exist")
    assert resp.status_code == 404


def test_get_blog_post_404_unpublished(client, db_session):
    _seed_post(db_session, "draft-postx", is_published=False)
    resp = client.get("/api/v1/blog/posts/draft-postx")
    assert resp.status_code == 404


# ── View / link-click tracking ────────────────────────────────────────────────


def test_track_view_increments_counter(client, db_session):
    post = _seed_post(db_session, "track-view1")
    assert post.view_count == 0
    resp = client.post("/api/v1/blog/posts/track-view1/view")
    assert resp.status_code == 204
    db_session.refresh(post)
    assert post.view_count == 1


def test_track_view_multiple_times(client, db_session):
    post = _seed_post(db_session, "track-view2")
    for _ in range(3):
        client.post("/api/v1/blog/posts/track-view2/view")
    db_session.refresh(post)
    assert post.view_count == 3


def test_track_view_no_error_on_missing_slug(client):
    resp = client.post("/api/v1/blog/posts/nonexistent-slug/view")
    assert resp.status_code == 204  # silently ignored


def test_track_link_click_increments_counter(client, db_session):
    post = _seed_post(db_session, "click-track")
    resp = client.post("/api/v1/blog/posts/click-track/link-click")
    assert resp.status_code == 204
    db_session.refresh(post)
    assert post.link_click_count == 1

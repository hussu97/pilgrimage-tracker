"""Tests for public blog endpoints: GET /api/v1/blog/posts and /api/v1/blog/posts/{slug}."""

from datetime import UTC, datetime

from app.db.models import BlogPost

# ── Fixtures ───────────────────────────────────────────────────────────────────


def _seed_post(
    db_session, slug: str, category: str = "Islam", is_published: bool = True
) -> BlogPost:
    post = BlogPost(
        post_code=f"blg_{slug[:6]}",
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
    _seed_post(db_session, "draft-post", is_published=False)
    resp = client.get("/api/v1/blog/posts")
    assert resp.status_code == 200
    slugs = [p["slug"] for p in resp.json()]
    assert "published-post" in slugs
    assert "draft-post" not in slugs


def test_list_blog_posts_no_content_field(client, db_session):
    _seed_post(db_session, "mosques-dubai")
    resp = client.get("/api/v1/blog/posts")
    data = resp.json()
    # content should not be present in the list view
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
        "post_code",
        "slug",
        "title",
        "description",
        "published_at",
        "reading_time",
        "category",
        "cover_gradient",
    ):
        assert field in post, f"Missing field: {field}"


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


def test_get_blog_post_content_structure(client, db_session):
    _seed_post(db_session, "mosques-dubai")
    resp = client.get("/api/v1/blog/posts/mosques-dubai")
    sections = resp.json()["content"]
    for section in sections:
        assert "paragraphs" in section
        assert isinstance(section["paragraphs"], list)


def test_get_blog_post_404_unknown_slug(client):
    resp = client.get("/api/v1/blog/posts/does-not-exist")
    assert resp.status_code == 404


def test_get_blog_post_404_unpublished(client, db_session):
    _seed_post(db_session, "draft-post", is_published=False)
    resp = client.get("/api/v1/blog/posts/draft-post")
    assert resp.status_code == 404


def test_get_blog_post_multiple_categories(client, db_session):
    _seed_post(db_session, "islam-post", category="Islam")
    _seed_post(db_session, "hinduism-post", category="Hinduism")
    resp_islam = client.get("/api/v1/blog/posts/islam-post")
    resp_hinduism = client.get("/api/v1/blog/posts/hinduism-post")
    assert resp_islam.json()["category"] == "Islam"
    assert resp_hinduism.json()["category"] == "Hinduism"

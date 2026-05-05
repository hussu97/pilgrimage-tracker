"""Blog post endpoints.

Routes:
    GET  /api/v1/blog/posts                 List published posts (summary, filterable)
    GET  /api/v1/blog/posts/{slug}          Full post detail including content
    POST /api/v1/blog/posts/{slug}/view     Increment view counter
    POST /api/v1/blog/posts/{slug}/link-click  Increment link-click counter
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import col, select

from app.db.models import BlogPost
from app.db.session import SessionDep

router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _word_count(content: list) -> int:
    return sum(
        len(para.split()) for s in (content or []) for para in s.get("paragraphs", [])
    )


def _summary(p: BlogPost) -> dict:
    return {
        "post_code": p.post_code,
        "slug": p.slug,
        "title": p.title,
        "description": p.description,
        "published_at": p.published_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
        "reading_time": p.reading_time,
        "category": p.category,
        "cover_gradient": p.cover_gradient,
        "author_name": p.author_name,
        "tags": p.tags or [],
        "cover_image_url": p.cover_image_url,
        "word_count": _word_count(p.content),
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/blog/posts", response_model=list[dict])
def list_blog_posts(
    session: SessionDep,
    search: str | None = None,
    category: str | None = None,
    tag: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[dict]:
    """Return published posts ordered newest first (content excluded).

    Supports optional server-side search, category, and tag filters.
    """
    stmt = (
        select(BlogPost)
        .where(BlogPost.is_published == True)  # noqa: E712
        .order_by(BlogPost.published_at.desc())
    )
    if search:
        term = f"%{search.lower()}%"
        stmt = stmt.where(
            col(BlogPost.title).ilike(term)
            | col(BlogPost.description).ilike(term)
        )
    if category:
        stmt = stmt.where(BlogPost.category == category)

    posts = session.exec(stmt.limit(limit)).all()

    # Tag filtering happens in-memory (tags is a JSON array)
    if tag:
        tag_lower = tag.lower()
        posts = [p for p in posts if any(t.lower() == tag_lower for t in (p.tags or []))]

    return [_summary(p) for p in posts]


@router.get("/blog/posts/{slug}", response_model=dict)
def get_blog_post(slug: str, session: SessionDep) -> dict:
    """Return a single published post by slug including full content."""
    post = session.exec(
        select(BlogPost).where(BlogPost.slug == slug, BlogPost.is_published == True)  # noqa: E712
    ).first()
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    return {
        **_summary(post),
        "faq_json": post.faq_json,
        "content": post.content,
    }


@router.post("/blog/posts/{slug}/view", status_code=204)
def track_view(slug: str, session: SessionDep) -> None:
    """Increment the view counter for a published blog post."""
    post = session.exec(
        select(BlogPost).where(BlogPost.slug == slug, BlogPost.is_published == True)  # noqa: E712
    ).first()
    if post:
        post.view_count = (post.view_count or 0) + 1
        session.add(post)
        session.commit()


@router.post("/blog/posts/{slug}/link-click", status_code=204)
def track_link_click(slug: str, session: SessionDep) -> None:
    """Increment the link-click counter for a published blog post."""
    post = session.exec(
        select(BlogPost).where(BlogPost.slug == slug, BlogPost.is_published == True)  # noqa: E712
    ).first()
    if post:
        post.link_click_count = (post.link_click_count or 0) + 1
        session.add(post)
        session.commit()

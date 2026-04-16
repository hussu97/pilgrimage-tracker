"""Blog post endpoints.

Routes:
    GET /api/v1/blog/posts          List all published posts (summary — no content)
    GET /api/v1/blog/posts/{slug}   Full post detail including content
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.db.models import BlogPost
from app.db.session import SessionDep

router = APIRouter()


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/blog/posts", response_model=list[dict])
def list_blog_posts(session: SessionDep) -> list[dict]:
    """Return all published posts ordered newest first (content excluded)."""
    posts = session.exec(
        select(BlogPost)
        .where(BlogPost.is_published == True)  # noqa: E712
        .order_by(BlogPost.published_at.desc())
    ).all()
    return [
        {
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
            "word_count": sum(
                len(para.split()) for s in (p.content or []) for para in s.get("paragraphs", [])
            ),
        }
        for p in posts
    ]


@router.get("/blog/posts/{slug}", response_model=dict)
def get_blog_post(slug: str, session: SessionDep) -> dict:
    """Return a single published post by slug including full content."""
    post = session.exec(
        select(BlogPost).where(BlogPost.slug == slug, BlogPost.is_published == True)  # noqa: E712
    ).first()
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    return {
        "post_code": post.post_code,
        "slug": post.slug,
        "title": post.title,
        "description": post.description,
        "published_at": post.published_at.isoformat(),
        "updated_at": post.updated_at.isoformat(),
        "reading_time": post.reading_time,
        "category": post.category,
        "cover_gradient": post.cover_gradient,
        "author_name": post.author_name,
        "tags": post.tags or [],
        "cover_image_url": post.cover_image_url,
        "word_count": sum(
            len(para.split()) for s in (post.content or []) for para in s.get("paragraphs", [])
        ),
        "faq_json": post.faq_json,
        "content": post.content,
    }

"""Admin — Blog post management endpoints.

Routes:
    GET    /admin/blog/posts              List all posts (paginated, filterable)
    GET    /admin/blog/posts/{post_code}  Get single post with full content
    POST   /admin/blog/posts             Create new post
    PATCH  /admin/blog/posts/{post_code} Update post
    DELETE /admin/blog/posts/{post_code} Delete post
    POST   /admin/blog/link-preview      Fetch OG metadata for a URL
"""

from __future__ import annotations

import re
import secrets
from datetime import UTC, datetime
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import col, func, select

from app.api.deps import AdminDep
from app.db.models import BlogPost
from app.db.session import SessionDep

router = APIRouter()

# ── Helpers ────────────────────────────────────────────────────────────────────

_OG_RE = re.compile(
    r'<meta[^>]+property=["\']og:(\w+)["\'][^>]+content=["\']([^"\']*)["\']',
    re.IGNORECASE,
)
_META_NAME_RE = re.compile(
    r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']',
    re.IGNORECASE,
)
_TITLE_RE = re.compile(r"<title[^>]*>([^<]+)</title>", re.IGNORECASE)


def _post_code() -> str:
    return "blg_" + secrets.token_hex(6)


def _word_count(content: list[Any]) -> int:
    return sum(
        len(para.split())
        for s in content
        for para in s.get("paragraphs", [])
    )


def _serialize(post: BlogPost) -> dict:
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
        "cover_image_url": post.cover_image_url,
        "author_name": post.author_name,
        "tags": post.tags or [],
        "is_published": post.is_published,
        "word_count": _word_count(post.content or []),
        "view_count": post.view_count,
        "link_click_count": post.link_click_count,
    }


def _serialize_full(post: BlogPost) -> dict:
    d = _serialize(post)
    d["content"] = post.content or []
    d["faq_json"] = post.faq_json
    return d


# ── Schemas ────────────────────────────────────────────────────────────────────


class ArticleSection(BaseModel):
    heading: str | None = None
    paragraphs: list[str] = []


class FAQItem(BaseModel):
    question: str
    answer: str


class CreateBlogPostBody(BaseModel):
    slug: str
    title: str
    description: str
    category: str
    reading_time: int = 5
    cover_gradient: str = "from-emerald-500 to-teal-600"
    cover_image_url: str | None = None
    author_name: str | None = None
    tags: list[str] = []
    content: list[ArticleSection] = []
    faq_json: list[FAQItem] | None = None
    is_published: bool = True
    published_at: datetime | None = None


class PatchBlogPostBody(BaseModel):
    slug: str | None = None
    title: str | None = None
    description: str | None = None
    category: str | None = None
    reading_time: int | None = None
    cover_gradient: str | None = None
    cover_image_url: str | None = None
    author_name: str | None = None
    tags: list[str] | None = None
    content: list[ArticleSection] | None = None
    faq_json: list[FAQItem] | None = None
    is_published: bool | None = None


class LinkPreviewBody(BaseModel):
    url: str


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("/blog/posts")
def list_blog_posts(
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
    search: str | None = None,
    category: str | None = None,
    is_published: bool | None = None,
) -> dict:
    """Return paginated blog posts (all statuses, including drafts)."""
    stmt = select(BlogPost)
    if search:
        term = f"%{search.lower()}%"
        stmt = stmt.where(
            col(BlogPost.title).ilike(term)
            | col(BlogPost.description).ilike(term)
            | col(BlogPost.author_name).ilike(term)
        )
    if category:
        stmt = stmt.where(BlogPost.category == category)
    if is_published is not None:
        stmt = stmt.where(BlogPost.is_published == is_published)

    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    posts = session.exec(
        stmt.order_by(BlogPost.published_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return {
        "items": [_serialize(p) for p in posts],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/blog/posts/{post_code}")
def get_blog_post(post_code: str, admin: AdminDep, session: SessionDep) -> dict:
    post = session.get(BlogPost, post_code)
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    return _serialize_full(post)


@router.post("/blog/posts", status_code=201)
def create_blog_post(body: CreateBlogPostBody, admin: AdminDep, session: SessionDep) -> dict:
    existing = session.exec(select(BlogPost).where(BlogPost.slug == body.slug)).first()
    if existing:
        raise HTTPException(status_code=409, detail="A post with this slug already exists")

    now = datetime.now(UTC)
    post = BlogPost(
        post_code=_post_code(),
        slug=body.slug,
        title=body.title,
        description=body.description,
        category=body.category,
        reading_time=body.reading_time,
        cover_gradient=body.cover_gradient,
        cover_image_url=body.cover_image_url,
        author_name=body.author_name,
        tags=body.tags,
        content=[s.model_dump() for s in body.content],
        faq_json=[f.model_dump() for f in body.faq_json] if body.faq_json else None,
        is_published=body.is_published,
        published_at=body.published_at or now,
        updated_at=now,
    )
    session.add(post)
    session.commit()
    session.refresh(post)
    return _serialize_full(post)


@router.patch("/blog/posts/{post_code}")
def update_blog_post(
    post_code: str, body: PatchBlogPostBody, admin: AdminDep, session: SessionDep
) -> dict:
    post = session.get(BlogPost, post_code)
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")

    if body.slug is not None and body.slug != post.slug:
        conflict = session.exec(
            select(BlogPost).where(BlogPost.slug == body.slug)
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="A post with this slug already exists")
        post.slug = body.slug

    if body.title is not None:
        post.title = body.title
    if body.description is not None:
        post.description = body.description
    if body.category is not None:
        post.category = body.category
    if body.reading_time is not None:
        post.reading_time = body.reading_time
    if body.cover_gradient is not None:
        post.cover_gradient = body.cover_gradient
    if body.cover_image_url is not None:
        post.cover_image_url = body.cover_image_url
    if body.author_name is not None:
        post.author_name = body.author_name
    if body.tags is not None:
        post.tags = body.tags
    if body.content is not None:
        post.content = [s.model_dump() for s in body.content]
    if body.faq_json is not None:
        post.faq_json = [f.model_dump() for f in body.faq_json]
    if body.is_published is not None:
        post.is_published = body.is_published

    post.updated_at = datetime.now(UTC)
    session.add(post)
    session.commit()
    session.refresh(post)
    return _serialize_full(post)


@router.delete("/blog/posts/{post_code}", status_code=204)
def delete_blog_post(post_code: str, admin: AdminDep, session: SessionDep) -> None:
    post = session.get(BlogPost, post_code)
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    session.delete(post)
    session.commit()


@router.post("/blog/link-preview")
async def fetch_link_preview(body: LinkPreviewBody, admin: AdminDep) -> dict:
    """Fetch Open Graph / basic HTML metadata for a given URL."""
    url = body.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="URL must start with http:// or https://")

    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=8.0,
            headers={"User-Agent": "SoulStep-LinkPreview/1.0"},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text
    except Exception:
        raise HTTPException(status_code=422, detail="Could not fetch the URL")

    og: dict[str, str] = {}
    for m in _OG_RE.finditer(html):
        og[m.group(1)] = m.group(2)

    title = og.get("title") or (_TITLE_RE.search(html) or ["", ""])[1]
    description = og.get("description") or (
        (m2 := _META_NAME_RE.search(html)) and m2.group(1) or ""
    )
    image = og.get("image", "")
    site_name = og.get("site_name", "")

    return {
        "url": url,
        "title": title[:200] if title else "",
        "description": description[:500] if description else "",
        "image": image[:500] if image else "",
        "site_name": site_name[:100] if site_name else "",
    }

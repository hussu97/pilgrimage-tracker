"""Social sharing and pre-rendering endpoint.

Returns fully-rendered HTML pages with Open Graph meta tags, JSON-LD
structured data, canonical URLs, and crawlable content for search-engine
crawlers and AI bots.  Human browsers are redirected to the SPA via JS.

Crawler detection: if the User-Agent matches a known bot pattern, a richer
HTML page with visible text content is returned (no JS redirect).
"""

from __future__ import annotations

import logging
import os
import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlmodel import select

from app.db import place_images
from app.db import places as places_db
from app.db import reviews as reviews_db
from app.db.models import PlaceSEO
from app.db.session import SessionDep
from app.services.meta_tags import build_place_meta_tags
from app.services.structured_data import (
    build_breadcrumb_jsonld,
    build_faq_jsonld,
    build_place_jsonld,
    render_jsonld_script_tags,
)

logger = logging.getLogger(__name__)
router = APIRouter()

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

# ── Crawler detection ──────────────────────────────────────────────────────────

_BOT_UA_RE = re.compile(
    r"(Googlebot|bingbot|Baiduspider|YandexBot|DuckDuckBot|Slurp|facebot|"
    r"facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|TelegramBot|"
    r"Discordbot|Slackbot|ChatGPT-User|Claude-Web|PerplexityBot|"
    r"GPTBot|CCBot|anthropic-ai|cohere-ai|ia_archiver|"
    r"Applebot|PetalBot|SemrushBot|AhrefsBot|MJ12bot|"
    r"python-requests|curl|wget|httpx|Scrapy)",
    re.IGNORECASE,
)


def _is_crawler(request: Request) -> bool:
    ua = request.headers.get("user-agent", "")
    return bool(_BOT_UA_RE.search(ua))


# ── HTML helpers ───────────────────────────────────────────────────────────────


def _escape_html(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#x27;")
    )


def _build_faq_html(faqs: list[dict]) -> str:
    """Render FAQs as a visible HTML section for crawlers."""
    if not faqs:
        return ""
    items = "\n".join(
        f"    <div class='faq-item'>"
        f"<h3>{_escape_html(faq['question'])}</h3>"
        f"<p>{_escape_html(faq['answer'])}</p>"
        f"</div>"
        for faq in faqs
    )
    return f"""
  <section class="faqs">
    <h2>Frequently Asked Questions</h2>
{items}
  </section>"""


# ── Place pre-render endpoint ──────────────────────────────────────────────────


@router.get("/places/{place_code}", response_class=HTMLResponse, tags=["share"])
def share_place(place_code: str, session: SessionDep, request: Request):
    """Return a pre-rendered HTML page with full SEO metadata for a place.

    - Crawlers: receive a rich HTML page with visible content, JSON-LD,
      canonical URL, OG tags, hreflang, and FAQs.
    - Human browsers: receive OG tags + JS redirect to the SPA.
    """
    place = places_db.get_place_by_code(place_code, session)
    if place is None:
        raise HTTPException(status_code=404, detail="Place not found")

    # Fetch supporting data
    images = place_images.get_images(place_code, session)
    first_image_url = images[0]["url"] if images else ""
    rating_data = reviews_db.get_aggregate_rating(place_code, session)

    # Fetch SEO record if available
    seo = session.exec(select(PlaceSEO).where(PlaceSEO.place_code == place_code)).first()

    # Fetch a few review samples for Schema.org Review markup
    review_samples: list[dict] = []
    try:
        raw_reviews = reviews_db.get_reviews_by_place(place_code, session, limit=3)
        review_samples = [
            {
                "author_name": r.author_name or r.review_code,
                "rating": r.rating,
                "body": r.body,
            }
            for r in raw_reviews
        ]
    except Exception:
        pass

    # Build meta tags string
    meta_tags_html = build_place_meta_tags(
        place=place,
        seo=seo,
        image_url=first_image_url,
        lang="en",
    )

    # Build JSON-LD schemas
    slug = seo.slug if seo else None
    place_url = (
        f"{FRONTEND_URL}/places/{place_code}/{slug}"
        if slug
        else f"{FRONTEND_URL}/places/{place_code}"
    )

    schemas = [
        build_place_jsonld(
            place=place,
            seo=seo,
            rating_data=rating_data,
            review_samples=review_samples,
            image_url=first_image_url,
        ),
        build_breadcrumb_jsonld(
            place_name=place.name,
            place_url=place_url,
            religion=place.religion,
        ),
    ]
    if seo and seo.faq_json:
        faq_schema = build_faq_jsonld(seo.faq_json)
        if faq_schema:
            schemas.append(faq_schema)

    jsonld_html = render_jsonld_script_tags(schemas)

    is_crawler = _is_crawler(request)

    # ── Rating / description for display ────────────────────────────────────
    rating_str = ""
    if rating_data:
        avg = rating_data.get("average", 0)
        count = rating_data.get("count", 0)
        rating_str = f"⭐ {avg:.1f} · {count} review{'s' if count != 1 else ''}"

    description_display = ""
    if seo and seo.rich_description:
        description_display = seo.rich_description
    elif place.description:
        description_display = place.description

    name_escaped = _escape_html(place.name)
    address_escaped = _escape_html(place.address or "")
    place_url_escaped = _escape_html(place_url)
    img_tag = (
        f'<img src="{_escape_html(first_image_url)}" alt="{name_escaped}" '
        f'width="800" height="450" loading="lazy" />'
        if first_image_url
        else ""
    )

    # Render FAQs section (only for crawlers)
    faq_html = ""
    if is_crawler and seo and seo.faq_json:
        faq_html = _build_faq_html(seo.faq_json)

    # JS redirect only for human browsers
    redirect_script = (
        "" if is_crawler else f'<script>window.location.replace("{place_url}");</script>'
    )
    fallback_link = f'<a href="{place_url_escaped}">View {name_escaped} on SoulStep</a>'

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
{meta_tags_html}
{jsonld_html}
</head>
<body>
  {redirect_script}
  <main>
    <h1>{name_escaped}</h1>
    {f'<p><strong>Address:</strong> {address_escaped}</p>' if address_escaped else ''}
    {f'<p><strong>Rating:</strong> {_escape_html(rating_str)}</p>' if rating_str else ''}
    {img_tag}
    {f'<p>{_escape_html(description_display)}</p>' if description_display else ''}
    {faq_html}
    <p>{fallback_link}</p>
  </main>
</body>
</html>"""

    return HTMLResponse(content=html, status_code=200)

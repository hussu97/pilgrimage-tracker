"""Social sharing and pre-rendering endpoint.

Returns fully-rendered HTML pages with Open Graph meta tags, JSON-LD
structured data, canonical URLs, and crawlable content for search-engine
crawlers and AI bots.  Human browsers are redirected to the SPA via JS.

Crawler detection: if the User-Agent matches a known bot pattern, a richer
HTML page with visible text content is returned (no JS redirect).
"""

from __future__ import annotations

import json
import logging
import os
import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlmodel import select

from app.db import place_images
from app.db import places as places_db
from app.db import reviews as reviews_db
from app.db.models import Place, PlaceSEO
from app.db.places import _haversine_km
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


def _get_lang(request: Request) -> str:
    """Read Accept-Language header; return 'en', 'ar', or 'hi'."""
    accept = request.headers.get("accept-language", "en")
    for part in accept.split(","):
        tag = part.split(";")[0].strip().lower()
        if tag.startswith("ar"):
            return "ar"
        if tag.startswith("hi"):
            return "hi"
    return "en"


# ── Religion metadata ──────────────────────────────────────────────────────────

_RELIGION_PAGE_META: dict[str, dict[str, str]] = {
    "islam": {
        "title": "Mosques near you – Find Islamic Worship Places | SoulStep",
        "description": "Discover mosques and Islamic worship places worldwide. Browse reviews, opening hours, and prayer times on SoulStep.",
        "h1": "Mosques & Islamic Worship Places",
    },
    "christianity": {
        "title": "Churches near you – Find Christian Worship Places | SoulStep",
        "description": "Discover churches and Christian worship places worldwide. Browse reviews, opening hours, and service times on SoulStep.",
        "h1": "Churches & Christian Worship Places",
    },
    "hinduism": {
        "title": "Temples near you – Find Hindu Worship Places | SoulStep",
        "description": "Discover temples and Hindu worship places worldwide. Browse reviews, opening hours, and deity schedules on SoulStep.",
        "h1": "Temples & Hindu Worship Places",
    },
    "buddhism": {
        "title": "Buddhist Temples & Monasteries | SoulStep",
        "description": "Discover Buddhist temples and monasteries worldwide. Browse reviews and opening hours on SoulStep.",
        "h1": "Buddhist Temples & Monasteries",
    },
    "sikhism": {
        "title": "Gurdwaras near you – Find Sikh Worship Places | SoulStep",
        "description": "Discover gurdwaras and Sikh worship places worldwide. Browse reviews and opening hours on SoulStep.",
        "h1": "Gurdwaras & Sikh Worship Places",
    },
    "judaism": {
        "title": "Synagogues near you – Find Jewish Worship Places | SoulStep",
        "description": "Discover synagogues and Jewish worship places worldwide. Browse reviews and opening hours on SoulStep.",
        "h1": "Synagogues & Jewish Worship Places",
    },
    "bahai": {
        "title": "Bahá'í Houses of Worship | SoulStep",
        "description": "Discover Bahá'í Houses of Worship worldwide. Browse reviews and opening hours on SoulStep.",
        "h1": "Bahá'í Houses of Worship",
    },
    "zoroastrianism": {
        "title": "Zoroastrian Fire Temples | SoulStep",
        "description": "Discover Zoroastrian fire temples worldwide. Browse reviews and opening hours on SoulStep.",
        "h1": "Zoroastrian Fire Temples",
    },
}

# Keyword → religion slug mapping
_KEYWORD_TO_RELIGION: dict[str, str] = {
    "mosque": "islam",
    "masjid": "islam",
    "church": "christianity",
    "cathedral": "christianity",
    "chapel": "christianity",
    "temple": "hinduism",
    "mandir": "hinduism",
    "gurdwara": "sikhism",
    "synagogue": "judaism",
    "monastery": "buddhism",
    "pagoda": "buddhism",
    "fire_temple": "zoroastrianism",
}

# Religion fallback OG images (served from frontend static)
_RELIGION_OG_IMAGES: dict[str, str] = {
    "islam": f"{FRONTEND_URL}/static/religion-islam.jpg",
    "christianity": f"{FRONTEND_URL}/static/religion-christianity.jpg",
    "hinduism": f"{FRONTEND_URL}/static/religion-hinduism.jpg",
    "buddhism": f"{FRONTEND_URL}/static/religion-buddhism.jpg",
    "sikhism": f"{FRONTEND_URL}/static/religion-sikhism.jpg",
    "judaism": f"{FRONTEND_URL}/static/religion-judaism.jpg",
    "bahai": f"{FRONTEND_URL}/static/religion-bahai.jpg",
    "zoroastrianism": f"{FRONTEND_URL}/static/religion-zoroastrianism.jpg",
}


def _resolve_religion(keyword: str) -> str | None:
    """Map a keyword or religion slug to a canonical religion slug."""
    kw = keyword.lower().strip()
    if kw in _RELIGION_PAGE_META:
        return kw
    return _KEYWORD_TO_RELIGION.get(kw)


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


# ── Related place helpers ──────────────────────────────────────────────────────


def _get_nearby_places(place: Place, session, limit: int = 5) -> list[Place]:
    """Return up to `limit` places within 10 km, excluding `place` itself."""
    all_places = session.exec(select(Place).where(Place.place_code != place.place_code)).all()
    nearby = []
    for p in all_places:
        dist = _haversine_km(place.lat, place.lng, p.lat, p.lng)
        if dist <= 10.0:
            nearby.append((dist, p))
    nearby.sort(key=lambda x: x[0])
    return [p for _, p in nearby[:limit]]


def _get_similar_places(place: Place, session, limit: int = 5) -> list[Place]:
    """Return up to `limit` places with the same religion, excluding `place`."""
    return session.exec(
        select(Place)
        .where(Place.religion == place.religion, Place.place_code != place.place_code)
        .limit(limit)
    ).all()


def _place_link(p: Place, seo_map: dict) -> str:
    seo = seo_map.get(p.place_code)
    slug = seo.slug if seo else None
    if slug:
        return f"{FRONTEND_URL}/places/{p.place_code}/{slug}"
    return f"{FRONTEND_URL}/places/{p.place_code}"


def _build_related_html(nearby: list[Place], similar: list[Place], seo_map: dict) -> str:
    if not nearby and not similar:
        return ""
    parts: list[str] = []
    if nearby:
        links = "\n".join(
            f'    <li><a href="{_escape_html(_place_link(p, seo_map))}">'
            f"{_escape_html(p.name)}</a></li>"
            for p in nearby
        )
        parts.append(
            f"""  <section class="nearby-places">
    <h2>Nearby Sacred Sites</h2>
    <ul>
{links}
    </ul>
  </section>"""
        )
    if similar:
        links = "\n".join(
            f'    <li><a href="{_escape_html(_place_link(p, seo_map))}">'
            f"{_escape_html(p.name)}</a></li>"
            for p in similar
        )
        parts.append(
            f"""  <section class="similar-places">
    <h2>Similar Places</h2>
    <ul>
{links}
    </ul>
  </section>"""
        )
    return "\n".join(parts)


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

    # Determine language from Accept-Language header
    lang = _get_lang(request)

    # Fetch supporting data
    images = place_images.get_images(place_code, session)
    first_image_url = images[0]["url"] if images else ""
    rating_data = reviews_db.get_aggregate_rating(place_code, session)

    # Use religion-based fallback OG image if no place image available
    og_image = first_image_url or _RELIGION_OG_IMAGES.get(place.religion, "")

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
        image_url=og_image,
        lang=lang,
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
            image_url=og_image,
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

    # Related / nearby sections (crawlers only)
    related_html = ""
    if is_crawler:
        all_seo_rows = session.exec(select(PlaceSEO)).all()
        seo_map = {s.place_code: s for s in all_seo_rows}
        nearby = _get_nearby_places(place, session)
        similar = _get_similar_places(place, session)
        related_html = _build_related_html(nearby, similar, seo_map)

    # JS redirect only for human browsers
    redirect_script = (
        "" if is_crawler else f'<script>window.location.replace("{place_url}");</script>'
    )
    fallback_link = f'<a href="{place_url_escaped}">View {name_escaped} on SoulStep</a>'

    # Determine lang/dir attributes
    dir_attr = ' dir="rtl"' if lang == "ar" else ""

    html = f"""<!DOCTYPE html>
<html lang="{lang}"{dir_attr}>
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
    {related_html}
    <p>{fallback_link}</p>
  </main>
</body>
</html>"""

    return HTMLResponse(content=html, status_code=200)


# ── Religion category page endpoint ───────────────────────────────────────────


@router.get("/religion/{religion}", response_class=HTMLResponse, tags=["share"])
def share_religion_category(religion: str, session: SessionDep, request: Request):
    """Pre-rendered landing page for a religion category."""
    canonical_religion = _resolve_religion(religion)
    if not canonical_religion:
        raise HTTPException(status_code=404, detail="Religion not found")

    meta = _RELIGION_PAGE_META[canonical_religion]
    lang = _get_lang(request)
    dir_attr = ' dir="rtl"' if lang == "ar" else ""

    # Fetch top 20 places for this religion
    top_places = session.exec(
        select(Place).where(Place.religion == canonical_religion).limit(20)
    ).all()

    # Build SEO slug map
    place_codes = [p.place_code for p in top_places]
    seo_rows = (
        session.exec(select(PlaceSEO).where(PlaceSEO.place_code.in_(place_codes))).all()
        if place_codes
        else []
    )
    seo_map = {s.place_code: s for s in seo_rows}

    # Build ItemList JSON-LD
    list_items = []
    for i, p in enumerate(top_places, 1):
        seo = seo_map.get(p.place_code)
        slug = seo.slug if seo else None
        url = (
            f"{FRONTEND_URL}/places/{p.place_code}/{slug}"
            if slug
            else f"{FRONTEND_URL}/places/{p.place_code}"
        )
        list_items.append({"@type": "ListItem", "position": i, "url": url, "name": p.name})

    item_list_schema = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": meta["h1"],
        "description": meta["description"],
        "numberOfItems": len(list_items),
        "itemListElement": list_items,
    }

    canonical_url = f"{FRONTEND_URL}/share/religion/{canonical_religion}"
    jsonld_html = f'<script type="application/ld+json">\n{json.dumps(item_list_schema, ensure_ascii=False, indent=2)}\n</script>'

    # Build place list HTML
    place_items_html = "\n".join(
        f'  <li><a href="{_escape_html(_place_link(p, seo_map))}">{_escape_html(p.name)}</a>'
        f"{' – ' + _escape_html(p.address) if p.address else ''}</li>"
        for p in top_places
    )

    title_e = _escape_html(meta["title"])
    h1_e = _escape_html(meta["h1"])
    desc_e = _escape_html(meta["description"])
    canonical_e = _escape_html(canonical_url)

    html = f"""<!DOCTYPE html>
<html lang="{lang}"{dir_attr}>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title_e}</title>
  <meta name="description" content="{desc_e}" />
  <link rel="canonical" href="{canonical_e}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="SoulStep" />
  <meta property="og:title" content="{title_e}" />
  <meta property="og:description" content="{desc_e}" />
  <meta property="og:url" content="{canonical_e}" />
{jsonld_html}
</head>
<body>
  <main>
    <h1>{h1_e}</h1>
    <p>{desc_e}</p>
    <ul>
{place_items_html}
    </ul>
    <p><a href="{_escape_html(FRONTEND_URL)}">Back to SoulStep</a></p>
  </main>
</body>
</html>"""

    return HTMLResponse(content=html, status_code=200)


# ── Multi-language place page endpoint ────────────────────────────────────────


@router.get("/{lang}/places/{place_code}", response_class=HTMLResponse, tags=["share"])
def share_place_lang(lang: str, place_code: str, session: SessionDep, request: Request):
    """Language-specific pre-rendered place page (for hreflang)."""
    if lang not in ("en", "ar", "hi"):
        raise HTTPException(status_code=404, detail="Language not supported")

    place = places_db.get_place_by_code(place_code, session)
    if place is None:
        raise HTTPException(status_code=404, detail="Place not found")

    images = place_images.get_images(place_code, session)
    first_image_url = images[0]["url"] if images else ""
    og_image = first_image_url or _RELIGION_OG_IMAGES.get(place.religion, "")
    rating_data = reviews_db.get_aggregate_rating(place_code, session)

    seo = session.exec(select(PlaceSEO).where(PlaceSEO.place_code == place_code)).first()

    review_samples: list[dict] = []
    try:
        raw_reviews = reviews_db.get_reviews_by_place(place_code, session, limit=3)
        review_samples = [
            {"author_name": r.author_name or r.review_code, "rating": r.rating, "body": r.body}
            for r in raw_reviews
        ]
    except Exception:
        pass

    meta_tags_html = build_place_meta_tags(place=place, seo=seo, image_url=og_image, lang=lang)

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
            image_url=og_image,
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

    description_display = (seo.rich_description if seo else None) or place.description or ""
    name_escaped = _escape_html(place.name)
    address_escaped = _escape_html(place.address or "")
    place_url_escaped = _escape_html(place_url)
    img_tag = (
        f'<img src="{_escape_html(first_image_url)}" alt="{name_escaped}" '
        f'width="800" height="450" loading="lazy" />'
        if first_image_url
        else ""
    )
    dir_attr = ' dir="rtl"' if lang == "ar" else ""
    fallback_link = f'<a href="{place_url_escaped}">View {name_escaped} on SoulStep</a>'

    html = f"""<!DOCTYPE html>
<html lang="{lang}"{dir_attr}>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
{meta_tags_html}
{jsonld_html}
</head>
<body>
  <main>
    <h1>{name_escaped}</h1>
    {f'<p><strong>Address:</strong> {address_escaped}</p>' if address_escaped else ''}
    {img_tag}
    {f'<p>{_escape_html(description_display)}</p>' if description_display else ''}
    <p>{fallback_link}</p>
  </main>
</body>
</html>"""

    return HTMLResponse(content=html, status_code=200)

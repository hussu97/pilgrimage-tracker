"""Dynamic XML sitemap endpoint.

Generates a sitemap index plus bounded child sitemap files.
Multi-language URLs with hreflang and lastmod dates are included.
Image sitemap extension (Google image namespace) is included per place.

Routes registered in main.py:
    GET /sitemap.xml
    GET /sitemaps/static.xml
    GET /sitemaps/places-{page}.xml
"""

from __future__ import annotations

import logging
import math
import re
from datetime import UTC, datetime
from xml.etree import ElementTree as ET

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from sqlalchemy import func
from sqlmodel import select

from app.core.config import FRONTEND_URL
from app.db.models import BlogPost, Place, PlaceImage, PlaceSEO
from app.db.session import SessionDep

_RELIGIONS = [
    "islam",
    "christianity",
    "hinduism",
    "buddhism",
    "sikhism",
    "judaism",
    "bahai",
    "zoroastrianism",
]


def _city_to_slug(city: str) -> str:
    import unicodedata

    # Normalise Unicode (handles accented letters, Arabic, etc.) → ASCII fallback
    city = unicodedata.normalize("NFKD", city).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", city.lower()).strip("-")


# ── City-slug quality filter ──────────────────────────────────────────────────

# Minimum number of places a city must have to earn an /explore/{city} page.
# Prevents crawl-budget waste on single-place "cities" like "Unnamed Road".
_CITY_MIN_PLACES: int = 2

# Slugs that contain a digit are almost always street addresses or postal codes
# (e.g. "268-269-tottenham-ct-rd", "88hv-5v2-rugaylat-rd", "cityz27").
_CITY_SLUG_HAS_DIGIT = re.compile(r"\d")

# Known garbage values produced by Google Maps when locality is NULL / N/A
_CITY_SLUG_BLOCKLIST: frozenset[str] = frozenset(
    {
        "unnamed-road",
        "na",
        "n-a",
        "unknown",
        "floor-of-mercato",
        "rtc-cross-road",
        "cityz27",
    }
)


def _is_real_city_slug(slug: str) -> bool:
    """Return True only when *slug* represents a genuine city or town name.

    Rejects:
    - Slugs containing digits  (street numbers, postal codes, building IDs)
    - Slugs longer than 40 chars  (address fragments such as
      "saheel-business-tower-near-al-mullah-plaza")
    - Known blocklisted garbage values
    """
    if not slug or len(slug) > 40:
        return False
    if _CITY_SLUG_HAS_DIGIT.search(slug):
        return False
    return slug not in _CITY_SLUG_BLOCKLIST


logger = logging.getLogger(__name__)
router = APIRouter()

_PLACE_SITEMAP_CHUNK_SIZE = 5_000
_SUPPORTED_LANGS = ("en", "ar", "hi", "te", "ml")

# Sitemap XML namespaces
_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
_NS_XHTML = "http://www.w3.org/1999/xhtml"
_NS_IMAGE = "http://www.google.com/schemas/sitemap-image/1.1"


def _register_ns() -> None:
    ET.register_namespace("", _NS)
    ET.register_namespace("xhtml", _NS_XHTML)
    ET.register_namespace("image", _NS_IMAGE)


def _fmt_date(dt: datetime | None) -> str:
    if dt is None:
        return datetime.now(UTC).strftime("%Y-%m-%d")
    return dt.strftime("%Y-%m-%d")


def _place_url(place_code: str, slug: str | None) -> str:
    if slug:
        return f"{FRONTEND_URL}/places/{place_code}/{slug}"
    return f"{FRONTEND_URL}/places/{place_code}"


def _lang_place_url(lang: str, place_code: str, slug: str | None) -> str:
    # The /{lang}/places/{place_code} route does not accept a slug segment,
    # so always use the code-only form for hreflang alternates.
    return f"{FRONTEND_URL}/share/{lang}/places/{place_code}"


def _build_sitemap_xml(
    places: list[Place],
    seo_map: dict[str, PlaceSEO],
    images_map: dict[str, list[PlaceImage]],
    cities: list[tuple[str, set[str]]],
    blog_posts: list[BlogPost],
    *,
    include_static: bool = True,
) -> bytes:
    """Build a standard sitemap XML document."""
    _register_ns()

    urlset = ET.Element(f"{{{_NS}}}urlset")

    if include_static:
        # Homepage
        _add_url(urlset, FRONTEND_URL, priority="1.0", changefreq="daily")

        # Legal/trust pages
        _add_url(urlset, f"{FRONTEND_URL}/about", priority="0.6", changefreq="monthly")
        _add_url(urlset, f"{FRONTEND_URL}/privacy", priority="0.5", changefreq="monthly")
        _add_url(urlset, f"{FRONTEND_URL}/terms", priority="0.5", changefreq="monthly")
        _add_url(urlset, f"{FRONTEND_URL}/contact", priority="0.5", changefreq="monthly")
        _add_url(urlset, f"{FRONTEND_URL}/developers", priority="0.6", changefreq="monthly")

        # Blog index + individual articles (from database)
        _add_url(urlset, f"{FRONTEND_URL}/blog", priority="0.7", changefreq="weekly")
        for post in blog_posts:
            _add_url(
                urlset,
                f"{FRONTEND_URL}/blog/{post.slug}",
                lastmod=_fmt_date(post.updated_at),
                priority="0.7",
                changefreq="monthly",
            )

        # Explore index
        _add_url(urlset, f"{FRONTEND_URL}/explore", priority="0.8", changefreq="weekly")

        # City pages
        for city_slug, religions in cities:
            _add_url(
                urlset,
                f"{FRONTEND_URL}/explore/{city_slug}",
                priority="0.7",
                changefreq="weekly",
            )
            for religion in religions:
                _add_url(
                    urlset,
                    f"{FRONTEND_URL}/explore/{city_slug}/{religion}",
                    priority="0.6",
                    changefreq="weekly",
                )

    # Place pages
    for place in places:
        seo = seo_map.get(place.place_code)
        slug = seo.slug if seo else None
        loc = _place_url(place.place_code, slug)
        lastmod_dt = seo.updated_at if seo else place.created_at
        url_el = _add_url(
            urlset,
            loc,
            lastmod=_fmt_date(lastmod_dt),
            priority="0.8",
            changefreq="weekly",
        )
        # hreflang alternates — point to language-specific URLs
        for lang in _SUPPORTED_LANGS:
            alt_url = _lang_place_url(lang, place.place_code, slug)
            xhtml_link = ET.SubElement(url_el, f"{{{_NS_XHTML}}}link")
            xhtml_link.set("rel", "alternate")
            xhtml_link.set("hreflang", lang)
            xhtml_link.set("href", alt_url)
        xhtml_default = ET.SubElement(url_el, f"{{{_NS_XHTML}}}link")
        xhtml_default.set("rel", "alternate")
        xhtml_default.set("hreflang", "x-default")
        xhtml_default.set("href", loc)

        # Image sitemap entries (URL-type images only)
        place_imgs = images_map.get(place.place_code, [])
        for img in place_imgs:
            if img.url:
                img_el = ET.SubElement(url_el, f"{{{_NS_IMAGE}}}image")
                ET.SubElement(img_el, f"{{{_NS_IMAGE}}}loc").text = img.url
                ET.SubElement(img_el, f"{{{_NS_IMAGE}}}title").text = place.name
                caption = (
                    img.alt_text or f"{place.name} – {place.place_type} in {place.address or ''}"
                )
                ET.SubElement(img_el, f"{{{_NS_IMAGE}}}caption").text = caption

    ET.indent(urlset, space="  ")
    xml_str = ET.tostring(urlset, encoding="unicode", xml_declaration=False)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n' + xml_str).encode("utf-8")


def _build_sitemap_index_xml(entries: list[tuple[str, str]]) -> bytes:
    """Build a sitemap index whose entries are already absolute URLs."""
    _register_ns()
    sitemapindex = ET.Element(f"{{{_NS}}}sitemapindex")
    for loc, lastmod in entries:
        sitemap_el = ET.SubElement(sitemapindex, f"{{{_NS}}}sitemap")
        ET.SubElement(sitemap_el, f"{{{_NS}}}loc").text = loc
        ET.SubElement(sitemap_el, f"{{{_NS}}}lastmod").text = lastmod
    ET.indent(sitemapindex, space="  ")
    xml_str = ET.tostring(sitemapindex, encoding="unicode", xml_declaration=False)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n' + xml_str).encode("utf-8")


def _add_url(
    parent: ET.Element,
    loc: str,
    lastmod: str | None = None,
    priority: str = "0.5",
    changefreq: str = "monthly",
) -> ET.Element:
    url_el = ET.SubElement(parent, f"{{{_NS}}}url")
    ET.SubElement(url_el, f"{{{_NS}}}loc").text = loc
    if lastmod:
        ET.SubElement(url_el, f"{{{_NS}}}lastmod").text = lastmod
    ET.SubElement(url_el, f"{{{_NS}}}changefreq").text = changefreq
    ET.SubElement(url_el, f"{{{_NS}}}priority").text = priority
    return url_el


def _xml_response(
    content: bytes, *, count: int | None = None, parts: int | None = None
) -> Response:
    headers = {"Cache-Control": "public, max-age=3600"}
    if count is not None:
        headers["X-Sitemap-Count"] = str(count)
    if parts is not None:
        headers["X-Sitemap-Parts"] = str(parts)
    return Response(
        content=content,
        media_type="application/xml; charset=utf-8",
        headers=headers,
    )


def _place_count(session: SessionDep) -> int:
    return int(session.exec(select(func.count(Place.place_code))).one() or 0)


def _place_sitemap_page_count(place_count: int) -> int:
    return max(1, math.ceil(place_count / _PLACE_SITEMAP_CHUNK_SIZE))


def _load_static_sitemap_inputs(
    session: SessionDep,
) -> tuple[list[tuple[str, set[str]]], list[BlogPost]]:
    places = session.exec(select(Place.city, Place.religion)).all()

    # Build city → set-of-religions map for city pages.
    # Only include cities that pass the real-city filter AND have enough places
    # to make the explore page worthwhile.
    city_religions: dict[str, set[str]] = {}
    city_place_counts: dict[str, int] = {}
    for city, religion in places:
        if not city or not city.strip():
            continue
        slug = _city_to_slug(city)
        if not slug or not _is_real_city_slug(slug):
            continue
        city_religions.setdefault(slug, set())
        city_place_counts[slug] = city_place_counts.get(slug, 0) + 1
        if religion:
            city_religions[slug].add(religion)

    cities = [
        (slug, religions)
        for slug, religions in city_religions.items()
        if city_place_counts.get(slug, 0) >= _CITY_MIN_PLACES
    ]

    # Fetch published blog posts ordered by publication date (oldest first for sitemap)
    blog_posts = session.exec(
        select(BlogPost)
        .where(BlogPost.is_published == True)  # noqa: E712
        .order_by(BlogPost.published_at.asc())
    ).all()
    return cities, blog_posts


def _load_place_page(session: SessionDep, page: int) -> list[Place]:
    offset = (page - 1) * _PLACE_SITEMAP_CHUNK_SIZE
    return session.exec(
        select(Place).order_by(Place.place_code).offset(offset).limit(_PLACE_SITEMAP_CHUNK_SIZE)
    ).all()


def _load_place_assets(
    session: SessionDep, place_codes: list[str]
) -> tuple[dict[str, PlaceSEO], dict[str, list[PlaceImage]]]:
    if not place_codes:
        return {}, {}

    seo_rows = session.exec(select(PlaceSEO).where(PlaceSEO.place_code.in_(place_codes))).all()
    seo_map: dict[str, PlaceSEO] = {s.place_code: s for s in seo_rows}

    images_map: dict[str, list[PlaceImage]] = {}
    all_imgs = session.exec(
        select(PlaceImage).where(
            PlaceImage.place_code.in_(place_codes),
            PlaceImage.url.is_not(None),
        )
    ).all()
    for img in all_imgs:
        images_map.setdefault(img.place_code, []).append(img)
    return seo_map, images_map


@router.get(
    "/sitemap.xml",
    response_class=Response,
    tags=["seo"],
    include_in_schema=False,
)
def sitemap_xml(session: SessionDep) -> Response:
    """Return a sitemap index for static URLs plus chunked place sitemaps."""
    count = _place_count(session)
    page_count = _place_sitemap_page_count(count)
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    entries = [(f"{FRONTEND_URL}/sitemaps/static.xml", today)]
    entries.extend(
        (f"{FRONTEND_URL}/sitemaps/places-{page}.xml", today) for page in range(1, page_count + 1)
    )
    xml_bytes = _build_sitemap_index_xml(entries)

    logger.info(
        "Served sitemap index with %d place URLs across %d place sitemap parts",
        count,
        page_count,
    )
    return _xml_response(xml_bytes, count=count, parts=page_count + 1)


@router.get(
    "/sitemaps/static.xml",
    response_class=Response,
    tags=["seo"],
    include_in_schema=False,
)
def static_sitemap_xml(session: SessionDep) -> Response:
    """Return static, city, and blog URLs in a bounded sitemap file."""
    cities, blog_posts = _load_static_sitemap_inputs(session)
    xml_bytes = _build_sitemap_xml(
        [],
        {},
        {},
        cities,
        blog_posts,
        include_static=True,
    )
    logger.info("Served static sitemap with %d city groups", len(cities))
    return _xml_response(xml_bytes)


@router.get(
    "/sitemaps/places-{page}.xml",
    response_class=Response,
    tags=["seo"],
    include_in_schema=False,
)
def place_sitemap_xml(page: int, session: SessionDep) -> Response:
    """Return one bounded page of place URLs and image sitemap entries."""
    count = _place_count(session)
    page_count = _place_sitemap_page_count(count)
    if page < 1 or page > page_count:
        raise HTTPException(status_code=404, detail="Sitemap page not found")

    places = _load_place_page(session, page)
    place_codes = [p.place_code for p in places]
    seo_map, images_map = _load_place_assets(session, place_codes)
    xml_bytes = _build_sitemap_xml(
        places,
        seo_map,
        images_map,
        [],
        [],
        include_static=False,
    )
    logger.info("Served place sitemap page %d/%d with %d places", page, page_count, len(places))
    return _xml_response(xml_bytes, count=len(places), parts=page_count)

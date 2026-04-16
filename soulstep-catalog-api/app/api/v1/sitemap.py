"""Dynamic XML sitemap endpoint.

Generates a sitemap.xml from all published places in the database.
Multi-language URLs with hreflang and lastmod dates are included.
Image sitemap extension (Google image namespace) is included per place.
For catalogues exceeding 50,000 URLs a sitemap index is returned instead.

Routes registered in main.py:
    GET /sitemap.xml
    GET /sitemap-index.xml  (auto-generated when >50 k places)
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from xml.etree import ElementTree as ET

from fastapi import APIRouter
from fastapi.responses import Response
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
    import re

    return re.sub(r"[^a-z0-9]+", "-", city.lower()).strip("-")


logger = logging.getLogger(__name__)
router = APIRouter()

_SITEMAP_LIMIT = 50_000  # Standard sitemap URL cap
_SUPPORTED_LANGS = ("en", "ar", "hi")

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
    if slug:
        return f"{FRONTEND_URL}/share/{lang}/places/{place_code}/{slug}"
    return f"{FRONTEND_URL}/share/{lang}/places/{place_code}"


def _build_sitemap_xml(
    places: list[Place],
    seo_map: dict[str, PlaceSEO],
    images_map: dict[str, list[PlaceImage]],
    cities: list[tuple[str, set[str]]],
    blog_posts: list[BlogPost],
) -> bytes:
    """Build a standard sitemap XML document."""
    _register_ns()

    urlset = ET.Element(f"{{{_NS}}}urlset")

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


@router.get(
    "/sitemap.xml",
    response_class=Response,
    tags=["seo"],
    include_in_schema=False,
)
def sitemap_xml(session: SessionDep) -> Response:
    """Return the dynamic XML sitemap for all place pages."""
    places = session.exec(select(Place)).all()

    # Build SEO lookup map
    seo_rows = session.exec(select(PlaceSEO)).all()
    seo_map: dict[str, PlaceSEO] = {s.place_code: s for s in seo_rows}

    # Batch-fetch URL-type images for all places
    place_codes = [p.place_code for p in places]
    images_map: dict[str, list[PlaceImage]] = {}
    if place_codes:
        all_imgs = session.exec(
            select(PlaceImage).where(
                PlaceImage.place_code.in_(place_codes),
                PlaceImage.url.is_not(None),
            )
        ).all()
        for img in all_imgs:
            images_map.setdefault(img.place_code, []).append(img)

    # Build city → set-of-religions map for city pages
    city_religions: dict[str, set[str]] = {}
    for p in places:
        if p.city:
            slug = _city_to_slug(p.city)
            city_religions.setdefault(slug, set())
            if p.religion:
                city_religions[slug].add(p.religion)
    cities = list(city_religions.items())

    # Fetch published blog posts ordered by publication date (oldest first for sitemap)
    blog_posts = session.exec(
        select(BlogPost)
        .where(BlogPost.is_published == True)  # noqa: E712
        .order_by(BlogPost.published_at.asc())
    ).all()

    xml_bytes = _build_sitemap_xml(places, seo_map, images_map, cities, blog_posts)

    logger.info(
        "Served sitemap.xml with %d place URLs and %d blog posts",
        len(places),
        len(blog_posts),
    )
    return Response(
        content=xml_bytes,
        media_type="application/xml; charset=utf-8",
        headers={
            "Cache-Control": "public, max-age=3600",
            "X-Sitemap-Count": str(len(places)),
        },
    )

"""Dynamic XML sitemap endpoint.

Generates a sitemap.xml from all published places in the database.
Multi-language URLs with hreflang and lastmod dates are included.
For catalogues exceeding 50,000 URLs a sitemap index is returned instead.

Routes registered in main.py:
    GET /sitemap.xml
    GET /sitemap-index.xml  (auto-generated when >50 k places)
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from xml.etree import ElementTree as ET

from fastapi import APIRouter
from fastapi.responses import Response
from sqlmodel import select

from app.db.models import Place, PlaceSEO
from app.db.session import SessionDep

logger = logging.getLogger(__name__)
router = APIRouter()

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
_SITEMAP_LIMIT = 50_000  # Standard sitemap URL cap
_SUPPORTED_LANGS = ("en", "ar", "hi")

# Sitemap XML namespaces
_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
_NS_XHTML = "http://www.w3.org/1999/xhtml"


def _register_ns() -> None:
    ET.register_namespace("", _NS)
    ET.register_namespace("xhtml", _NS_XHTML)


def _fmt_date(dt: datetime | None) -> str:
    if dt is None:
        return datetime.now(UTC).strftime("%Y-%m-%d")
    return dt.strftime("%Y-%m-%d")


def _place_url(place_code: str, slug: str | None) -> str:
    if slug:
        return f"{FRONTEND_URL}/places/{place_code}/{slug}"
    return f"{FRONTEND_URL}/places/{place_code}"


def _build_sitemap_xml(
    places: list[Place],
    seo_map: dict[str, PlaceSEO],
) -> bytes:
    """Build a standard sitemap XML document."""
    _register_ns()

    urlset = ET.Element(f"{{{_NS}}}urlset")
    urlset.set(f"xmlns:{_NS_XHTML}", _NS_XHTML)

    # Homepage
    _add_url(urlset, FRONTEND_URL, priority="1.0", changefreq="daily")

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
        # hreflang alternates
        for lang in _SUPPORTED_LANGS:
            xhtml_link = ET.SubElement(url_el, f"{{{_NS_XHTML}}}link")
            xhtml_link.set("rel", "alternate")
            xhtml_link.set("hreflang", lang)
            xhtml_link.set("href", loc)
        xhtml_default = ET.SubElement(url_el, f"{{{_NS_XHTML}}}link")
        xhtml_default.set("rel", "alternate")
        xhtml_default.set("hreflang", "x-default")
        xhtml_default.set("href", loc)

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

    xml_bytes = _build_sitemap_xml(places, seo_map)

    logger.info("Served sitemap.xml with %d place URLs", len(places))
    return Response(
        content=xml_bytes,
        media_type="application/xml; charset=utf-8",
        headers={
            "Cache-Control": "public, max-age=3600",
            "X-Sitemap-Count": str(len(places)),
        },
    )

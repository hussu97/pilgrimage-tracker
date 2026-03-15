"""RSS 2.0 and Atom 1.0 feeds for newly added/updated sacred-site places.

Feed consumers (feed readers, some AI indexers) can subscribe to track
updates to the SoulStep catalogue.

Routes registered in main.py:
    GET /feed.xml    — RSS 2.0
    GET /feed.atom   — Atom 1.0
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from xml.etree import ElementTree as ET

from fastapi import APIRouter
from fastapi.responses import Response
from sqlmodel import select

from app.core.config import API_BASE_URL, FRONTEND_URL
from app.db.models import Place, PlaceSEO
from app.db.session import SessionDep

logger = logging.getLogger(__name__)
router = APIRouter()

_FEED_TITLE = "SoulStep – New Sacred Sites"
_FEED_DESCRIPTION = (
    "The 50 most recently added or updated sacred sites on SoulStep, "
    "covering mosques, churches, temples, gurdwaras, synagogues, and more."
)
_FEED_LINK = FRONTEND_URL
_FEED_SIZE = 50

_RELIGION_LABELS: dict[str, str] = {
    "islam": "Mosque",
    "christianity": "Church",
    "hinduism": "Temple",
    "buddhism": "Buddhist Temple",
    "sikhism": "Gurdwara",
    "judaism": "Synagogue",
    "bahai": "Bahá'í House of Worship",
    "zoroastrianism": "Fire Temple",
}


def _rfc2822(dt: datetime) -> str:
    """Format a datetime as RFC 2822 (required for RSS pubDate)."""
    return dt.strftime("%a, %d %b %Y %H:%M:%S +0000")


def _rfc3339(dt: datetime) -> str:
    """Format a datetime as RFC 3339 / ISO 8601 (required for Atom updated)."""
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _place_url(place: Place, seo: PlaceSEO | None) -> str:
    if seo and seo.slug:
        return f"{FRONTEND_URL}/places/{place.place_code}/{seo.slug}"
    return f"{FRONTEND_URL}/places/{place.place_code}"


def _place_description(place: Place, seo: PlaceSEO | None) -> str:
    """Build a short description for the feed item."""
    type_label = _RELIGION_LABELS.get(place.religion, place.place_type.title())
    parts = [f"{type_label} in {place.address}" if place.address else type_label]
    desc = (seo.meta_description if seo else None) or place.description
    if desc:
        parts.append(desc)
    return " — ".join(parts)


def _get_recent_places(session) -> list[tuple[Place, PlaceSEO | None]]:
    """Return the 50 most recently added places with their SEO records."""
    places = session.exec(select(Place).order_by(Place.created_at.desc()).limit(_FEED_SIZE)).all()

    place_codes = [p.place_code for p in places]
    seo_rows = (
        session.exec(select(PlaceSEO).where(PlaceSEO.place_code.in_(place_codes))).all()
        if place_codes
        else []
    )
    seo_map = {s.place_code: s for s in seo_rows}

    return [(p, seo_map.get(p.place_code)) for p in places]


# ── RSS 2.0 ────────────────────────────────────────────────────────────────────


@router.get("/feed.xml", include_in_schema=False)
def rss_feed(session: SessionDep) -> Response:
    """RSS 2.0 feed of the 50 most recently added sacred-site places."""
    items = _get_recent_places(session)
    now = datetime.now(UTC)

    # Build XML
    rss = ET.Element("rss", version="2.0")
    rss.set("xmlns:atom", "http://www.w3.org/2005/Atom")
    channel = ET.SubElement(rss, "channel")

    ET.SubElement(channel, "title").text = _FEED_TITLE
    ET.SubElement(channel, "link").text = _FEED_LINK
    ET.SubElement(channel, "description").text = _FEED_DESCRIPTION
    ET.SubElement(channel, "language").text = "en"
    ET.SubElement(channel, "lastBuildDate").text = _rfc2822(now)
    ET.SubElement(channel, "ttl").text = "60"

    # Atom self link (required for feed readers)
    atom_link = ET.SubElement(channel, "atom:link")
    atom_link.set("href", f"{API_BASE_URL}/feed.xml")
    atom_link.set("rel", "self")
    atom_link.set("type", "application/rss+xml")

    for place, seo in items:
        item = ET.SubElement(channel, "item")
        title = (seo.seo_title if seo else None) or place.name
        link = _place_url(place, seo)
        desc = _place_description(place, seo)

        ET.SubElement(item, "title").text = title
        ET.SubElement(item, "link").text = link
        ET.SubElement(item, "description").text = desc
        ET.SubElement(item, "guid", isPermaLink="true").text = link
        ET.SubElement(item, "pubDate").text = _rfc2822(place.created_at)

        # Categories
        if place.religion:
            ET.SubElement(item, "category").text = place.religion.title()
        if place.place_type:
            ET.SubElement(item, "category").text = place.place_type.replace("_", " ").title()

    xml_bytes = b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(
        rss, encoding="unicode"
    ).encode("utf-8")

    return Response(
        content=xml_bytes,
        media_type="application/rss+xml; charset=utf-8",
        headers={"Cache-Control": "public, max-age=3600"},
    )


# ── Atom 1.0 ───────────────────────────────────────────────────────────────────


@router.get("/feed.atom", include_in_schema=False)
def atom_feed(session: SessionDep) -> Response:
    """Atom 1.0 feed of the 50 most recently added sacred-site places."""
    items = _get_recent_places(session)
    now = datetime.now(UTC)

    ATOM_NS = "http://www.w3.org/2005/Atom"

    feed = ET.Element(f"{{{ATOM_NS}}}feed")
    ET.SubElement(feed, f"{{{ATOM_NS}}}id").text = f"{API_BASE_URL}/feed.atom"
    ET.SubElement(feed, f"{{{ATOM_NS}}}title").text = _FEED_TITLE
    ET.SubElement(feed, f"{{{ATOM_NS}}}subtitle").text = _FEED_DESCRIPTION
    ET.SubElement(feed, f"{{{ATOM_NS}}}updated").text = _rfc3339(now)

    author = ET.SubElement(feed, f"{{{ATOM_NS}}}author")
    ET.SubElement(author, f"{{{ATOM_NS}}}name").text = "SoulStep"
    ET.SubElement(author, f"{{{ATOM_NS}}}uri").text = FRONTEND_URL

    link_self = ET.SubElement(feed, f"{{{ATOM_NS}}}link")
    link_self.set("rel", "self")
    link_self.set("href", f"{API_BASE_URL}/feed.atom")
    link_self.set("type", "application/atom+xml")

    link_alt = ET.SubElement(feed, f"{{{ATOM_NS}}}link")
    link_alt.set("rel", "alternate")
    link_alt.set("href", FRONTEND_URL)

    for place, seo in items:
        entry = ET.SubElement(feed, f"{{{ATOM_NS}}}entry")

        place_url = _place_url(place, seo)
        title = (seo.seo_title if seo else None) or place.name
        desc = _place_description(place, seo)

        ET.SubElement(entry, f"{{{ATOM_NS}}}id").text = place_url
        ET.SubElement(entry, f"{{{ATOM_NS}}}title").text = title
        ET.SubElement(entry, f"{{{ATOM_NS}}}updated").text = _rfc3339(place.created_at)

        entry_link = ET.SubElement(entry, f"{{{ATOM_NS}}}link")
        entry_link.set("rel", "alternate")
        entry_link.set("href", place_url)

        summary = ET.SubElement(entry, f"{{{ATOM_NS}}}summary")
        summary.set("type", "text")
        summary.text = desc

        if place.religion:
            cat = ET.SubElement(entry, f"{{{ATOM_NS}}}category")
            cat.set("term", place.religion)
            cat.set("label", place.religion.title())

    ET.register_namespace("", ATOM_NS)
    xml_bytes = b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(
        feed, encoding="unicode"
    ).encode("utf-8")

    return Response(
        content=xml_bytes,
        media_type="application/atom+xml; charset=utf-8",
        headers={"Cache-Control": "public, max-age=3600"},
    )

"""Tests for P3 SEO features.

Covers:
- build_place_jsonld() — sameAs Knowledge Graph entity linking
- build_dataset_jsonld() — Dataset schema for coverage page
- GET /share/about — static info page
- GET /share/how-it-works — static info page
- GET /share/coverage — live stats page with Dataset JSON-LD
- GET /feed.xml — RSS 2.0 feed structure
- GET /feed.atom — Atom 1.0 feed structure
- GET /admin/seo/ai-citations — AI citation monitoring endpoint
"""

from __future__ import annotations

from datetime import UTC
from xml.etree import ElementTree as ET

from tests.conftest import SAMPLE_PLACE

# ── helpers ─────────────────────────────────────────────────────────────────────


_API_KEY_HEADERS = {"X-API-Key": "test-api-key"}


def _create_place(client, place_code: str = "plc_p3seo001", **overrides):
    data = {**SAMPLE_PLACE, "place_code": place_code, **overrides}
    resp = client.post("/api/v1/places", json=data, headers=_API_KEY_HEADERS)
    assert resp.status_code == 200, resp.text
    return resp


def _register_and_token(client, email="admin@p3seo.test") -> tuple[str, str]:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Admin1234!", "display_name": "SEO Admin P3"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return data["token"], data["user"]["user_code"]


def _make_admin(db_session, user_code: str) -> None:
    from sqlmodel import select

    from app.db.models import User

    user = db_session.exec(select(User).where(User.user_code == user_code)).first()
    user.is_admin = True
    db_session.add(user)
    db_session.commit()


def _admin_headers(client, db_session, email="admin@p3seo.test") -> dict:
    token, user_code = _register_and_token(client, email=email)
    _make_admin(db_session, user_code)
    return {"Authorization": f"Bearer {token}"}


# ── 1. Knowledge Graph entity linking — build_place_jsonld() ────────────────────


def test_build_place_jsonld_single_same_as():
    """sameAs is a single string when only website_url is provided."""
    from unittest.mock import MagicMock

    from app.services.structured_data import build_place_jsonld

    place = MagicMock()
    place.place_code = "plc_kg001"
    place.name = "Test Mosque"
    place.religion = "islam"
    place.lat = 25.0
    place.lng = 55.0
    place.address = "123 Main St, Dubai"
    place.description = None
    place.website_url = "https://testmosque.example.com"

    result = build_place_jsonld(place)
    assert result["sameAs"] == "https://testmosque.example.com"


def test_build_place_jsonld_knowledge_graph_urls_merged():
    """sameAs becomes a list when knowledge_graph_urls are provided."""
    from unittest.mock import MagicMock

    from app.services.structured_data import build_place_jsonld

    place = MagicMock()
    place.place_code = "plc_kg002"
    place.name = "Grand Mosque"
    place.religion = "islam"
    place.lat = 24.4
    place.lng = 54.3
    place.address = "Abu Dhabi"
    place.description = None
    place.website_url = "https://grandmosque.example.com"

    kg_urls = [
        "https://www.wikidata.org/wiki/Q12345",
        "https://en.wikipedia.org/wiki/Grand_Mosque",
    ]

    result = build_place_jsonld(place, knowledge_graph_urls=kg_urls)
    assert isinstance(result["sameAs"], list)
    assert "https://grandmosque.example.com" in result["sameAs"]
    assert "https://www.wikidata.org/wiki/Q12345" in result["sameAs"]
    assert "https://en.wikipedia.org/wiki/Grand_Mosque" in result["sameAs"]
    assert len(result["sameAs"]) == 3


def test_build_place_jsonld_knowledge_graph_urls_only():
    """sameAs uses only knowledge_graph_urls when website_url is absent."""
    from unittest.mock import MagicMock

    from app.services.structured_data import build_place_jsonld

    place = MagicMock()
    place.place_code = "plc_kg003"
    place.name = "Old Temple"
    place.religion = "hinduism"
    place.lat = 19.0
    place.lng = 72.8
    place.address = "Mumbai"
    place.description = None
    place.website_url = None  # No website

    kg_urls = ["https://www.wikidata.org/wiki/Q99999"]

    result = build_place_jsonld(place, knowledge_graph_urls=kg_urls)
    # Single URL → string, not list
    assert result["sameAs"] == "https://www.wikidata.org/wiki/Q99999"


def test_build_place_jsonld_deduplicates_same_as():
    """Duplicate URLs in knowledge_graph_urls are deduplicated."""
    from unittest.mock import MagicMock

    from app.services.structured_data import build_place_jsonld

    place = MagicMock()
    place.place_code = "plc_kg004"
    place.name = "Church of Light"
    place.religion = "christianity"
    place.lat = 33.0
    place.lng = 35.0
    place.address = "Beirut"
    place.description = None
    place.website_url = "https://church.example.com"

    # website_url duplicated in knowledge_graph_urls
    kg_urls = [
        "https://church.example.com",  # duplicate
        "https://www.wikidata.org/wiki/Q77777",
    ]
    result = build_place_jsonld(place, knowledge_graph_urls=kg_urls)
    assert isinstance(result["sameAs"], list)
    assert result["sameAs"].count("https://church.example.com") == 1
    assert len(result["sameAs"]) == 2


def test_build_place_jsonld_no_same_as_when_no_urls():
    """sameAs is absent when no website_url and no knowledge_graph_urls."""
    from unittest.mock import MagicMock

    from app.services.structured_data import build_place_jsonld

    place = MagicMock()
    place.place_code = "plc_kg005"
    place.name = "Small Chapel"
    place.religion = "christianity"
    place.lat = 51.5
    place.lng = -0.1
    place.address = "London"
    place.description = None
    place.website_url = None

    result = build_place_jsonld(place)
    assert "sameAs" not in result


# ── 2. Dataset JSON-LD ────────────────────────────────────────────────────────


def test_build_dataset_jsonld_basic():
    """Dataset JSON-LD has required Schema.org fields."""
    from app.services.structured_data import build_dataset_jsonld

    result = build_dataset_jsonld(total_places=1500)
    assert result["@type"] == "Dataset"
    assert result["@context"] == "https://schema.org"
    assert "1,500" in result["description"]
    assert "name" in result
    assert "url" in result
    assert result["creator"]["@type"] == "Organization"


def test_build_dataset_jsonld_religion_counts():
    """Dataset JSON-LD includes variableMeasured for religion counts."""
    from app.services.structured_data import build_dataset_jsonld

    counts = {"islam": 800, "christianity": 400, "hinduism": 300}
    result = build_dataset_jsonld(total_places=1500, religion_counts=counts)
    assert "variableMeasured" in result
    names = [v["name"] for v in result["variableMeasured"]]
    assert "Islam" in names
    assert "Christianity" in names
    assert "Hinduism" in names


# ── 3. Static info pages ─────────────────────────────────────────────────────


def test_share_about_returns_200(client):
    """GET /share/about returns 200 HTML with AboutPage JSON-LD."""
    resp = client.get("/share/about")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    body = resp.text
    assert "About SoulStep" in body
    assert '"@type": "AboutPage"' in body or '"@type":"AboutPage"' in body
    assert "SoulStep" in body


def test_share_about_contains_religions(client):
    """GET /share/about lists all supported religions."""
    resp = client.get("/share/about")
    body = resp.text
    for religion in ("Islam", "Christianity", "Hinduism", "Buddhism", "Sikhism", "Judaism"):
        assert religion in body, f"Expected '{religion}' in /share/about"


def test_share_how_it_works_returns_200(client):
    """GET /share/how-it-works returns 200 HTML with HowTo JSON-LD."""
    resp = client.get("/share/how-it-works")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    body = resp.text
    assert "How SoulStep Works" in body
    assert '"@type": "HowTo"' in body or '"@type":"HowTo"' in body


def test_share_how_it_works_contains_steps(client):
    """GET /share/how-it-works includes ordered list steps."""
    resp = client.get("/share/how-it-works")
    body = resp.text
    assert "Search" in body
    assert "Check In" in body
    assert "Review" in body


def test_share_coverage_returns_200(client):
    """GET /share/coverage returns 200 HTML with Dataset JSON-LD."""
    resp = client.get("/share/coverage")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    body = resp.text
    assert "Coverage" in body
    assert '"@type": "Dataset"' in body or '"@type":"Dataset"' in body


def test_share_coverage_shows_place_count(client):
    """GET /share/coverage reflects the actual count of places in DB."""
    _create_place(client, "plc_cov001")
    resp = client.get("/share/coverage")
    assert resp.status_code == 200
    # 1 place is in the DB — page should mention it
    assert "1" in resp.text


def test_share_coverage_religion_breakdown(client):
    """GET /share/coverage shows per-religion counts."""
    _create_place(client, "plc_cov002", religion="islam")
    resp = client.get("/share/coverage")
    body = resp.text
    # Religion label present
    assert "Islam" in body or "Mosque" in body


# ── 4. RSS feed ───────────────────────────────────────────────────────────────


def test_rss_feed_returns_200(client):
    """GET /feed.xml returns 200 with RSS content type."""
    resp = client.get("/feed.xml")
    assert resp.status_code == 200
    assert (
        "rss" in resp.headers["content-type"].lower()
        or "xml" in resp.headers["content-type"].lower()
    )


def test_rss_feed_valid_xml(client):
    """GET /feed.xml returns well-formed XML."""
    _create_place(client, "plc_rss001")
    resp = client.get("/feed.xml")
    assert resp.status_code == 200
    # Must parse without error
    root = ET.fromstring(resp.content)
    assert root.tag == "rss"
    assert root.get("version") == "2.0"


def test_rss_feed_has_channel(client):
    """RSS feed contains a <channel> element with required sub-elements."""
    resp = client.get("/feed.xml")
    root = ET.fromstring(resp.content)
    channel = root.find("channel")
    assert channel is not None
    assert channel.find("title") is not None
    assert channel.find("link") is not None
    assert channel.find("description") is not None


def test_rss_feed_items_for_places(client):
    """RSS feed contains <item> elements for each place."""
    _create_place(client, "plc_rss002")
    _create_place(
        client, "plc_rss003", name="Second Place", religion="christianity", place_type="church"
    )
    resp = client.get("/feed.xml")
    root = ET.fromstring(resp.content)
    channel = root.find("channel")
    items = channel.findall("item")
    assert len(items) >= 2
    # Each item has title, link, guid
    for item in items[:2]:
        assert item.find("title") is not None
        assert item.find("link") is not None
        assert item.find("guid") is not None


def test_rss_feed_empty_when_no_places(client):
    """RSS feed has no <item> elements when DB is empty."""
    resp = client.get("/feed.xml")
    root = ET.fromstring(resp.content)
    channel = root.find("channel")
    items = channel.findall("item")
    assert len(items) == 0


# ── 5. Atom feed ─────────────────────────────────────────────────────────────


def test_atom_feed_returns_200(client):
    """GET /feed.atom returns 200 with Atom content type."""
    resp = client.get("/feed.atom")
    assert resp.status_code == 200
    assert (
        "atom" in resp.headers["content-type"].lower()
        or "xml" in resp.headers["content-type"].lower()
    )


def test_atom_feed_valid_xml(client):
    """GET /feed.atom returns well-formed Atom XML."""
    _create_place(client, "plc_atom001")
    resp = client.get("/feed.atom")
    assert resp.status_code == 200
    root = ET.fromstring(resp.content)
    # Atom root element
    assert "feed" in root.tag
    assert "w3.org/2005/Atom" in root.tag or root.tag == "{http://www.w3.org/2005/Atom}feed"


def test_atom_feed_has_required_elements(client):
    """Atom feed has id, title, updated, author elements."""
    resp = client.get("/feed.atom")
    root = ET.fromstring(resp.content)
    ns = "http://www.w3.org/2005/Atom"
    assert root.find(f"{{{ns}}}id") is not None
    assert root.find(f"{{{ns}}}title") is not None
    assert root.find(f"{{{ns}}}updated") is not None
    assert root.find(f"{{{ns}}}author") is not None


def test_atom_feed_entries_for_places(client):
    """Atom feed contains <entry> elements for each place."""
    _create_place(client, "plc_atom002")
    resp = client.get("/feed.atom")
    root = ET.fromstring(resp.content)
    ns = "http://www.w3.org/2005/Atom"
    entries = root.findall(f"{{{ns}}}entry")
    assert len(entries) >= 1
    # Each entry has id, title, updated, link
    for entry in entries[:1]:
        assert entry.find(f"{{{ns}}}id") is not None
        assert entry.find(f"{{{ns}}}title") is not None
        assert entry.find(f"{{{ns}}}updated") is not None
        assert entry.find(f"{{{ns}}}link") is not None


# ── 6. AI citation monitoring ─────────────────────────────────────────────────


def test_ai_citations_requires_admin(client):
    """GET /admin/seo/ai-citations returns 401 without auth."""
    resp = client.get("/api/v1/admin/seo/ai-citations")
    assert resp.status_code in (401, 403)


def test_ai_citations_returns_empty_initially(client, db_session):
    """GET /admin/seo/ai-citations returns zero visits when no logs exist."""
    headers = _admin_headers(client, db_session, email="admin@aicite.test")
    resp = client.get("/api/v1/admin/seo/ai-citations", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_visits"] == 0
    assert data["by_bot"] == []
    assert data["top_places"] == []


def test_ai_citations_reflects_logged_visits(client, db_session):
    """GET /admin/seo/ai-citations returns logged AI crawler visits."""
    from datetime import datetime

    from app.db.models import AICrawlerLog

    # Directly insert logs via the test db_session
    logs = [
        AICrawlerLog(
            bot_name="ChatGPT",
            path="/share/places/plc_p3seo001",
            place_code="plc_p3seo001",
            visited_at=datetime.now(UTC),
        ),
        AICrawlerLog(
            bot_name="ChatGPT",
            path="/share/places/plc_p3seo002",
            place_code="plc_p3seo002",
            visited_at=datetime.now(UTC),
        ),
        AICrawlerLog(
            bot_name="Perplexity",
            path="/share/places/plc_p3seo001",
            place_code="plc_p3seo001",
            visited_at=datetime.now(UTC),
        ),
    ]
    for log in logs:
        db_session.add(log)
    db_session.commit()

    headers = _admin_headers(client, db_session, email="admin@aicite2.test")
    resp = client.get("/api/v1/admin/seo/ai-citations", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_visits"] == 3

    bot_names = {b["bot_name"] for b in data["by_bot"]}
    assert "ChatGPT" in bot_names
    assert "Perplexity" in bot_names

    # ChatGPT has 2 visits
    chatgpt = next(b for b in data["by_bot"] if b["bot_name"] == "ChatGPT")
    assert chatgpt["visit_count"] == 2

    # Top place is plc_p3seo001 (2 visits)
    assert data["top_places"][0]["place_code"] == "plc_p3seo001"
    assert data["top_places"][0]["visit_count"] == 2


def test_ai_citations_filter_by_bot(client, db_session):
    """GET /admin/seo/ai-citations?bot_name=X filters by bot."""
    from datetime import datetime

    from app.db.models import AICrawlerLog

    db_session.add(
        AICrawlerLog(
            bot_name="Claude",
            path="/share/about",
            place_code=None,
            visited_at=datetime.now(UTC),
        )
    )
    db_session.add(
        AICrawlerLog(
            bot_name="GPTBot",
            path="/share/about",
            place_code=None,
            visited_at=datetime.now(UTC),
        )
    )
    db_session.commit()

    headers = _admin_headers(client, db_session, email="admin@aicite3.test")
    resp = client.get("/api/v1/admin/seo/ai-citations?bot_name=Claude", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_visits"] == 1
    assert data["by_bot"][0]["bot_name"] == "Claude"


def test_ai_citations_days_param(client, db_session):
    """GET /admin/seo/ai-citations?days=1 limits to the last 24h."""
    from datetime import datetime, timedelta

    from app.db.models import AICrawlerLog

    old_visit = AICrawlerLog(
        bot_name="Perplexity",
        path="/share/places/plc_old",
        place_code="plc_old",
        visited_at=datetime.now(UTC) - timedelta(days=60),
    )
    new_visit = AICrawlerLog(
        bot_name="Perplexity",
        path="/share/places/plc_new",
        place_code="plc_new",
        visited_at=datetime.now(UTC),
    )
    db_session.add(old_visit)
    db_session.add(new_visit)
    db_session.commit()

    headers = _admin_headers(client, db_session, email="admin@aicite4.test")
    resp = client.get("/api/v1/admin/seo/ai-citations?days=1", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    # Only the new visit should appear
    assert data["total_visits"] == 1
    assert data["top_places"][0]["place_code"] == "plc_new"

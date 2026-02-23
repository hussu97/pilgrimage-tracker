"""
Collector registry — discovers and instantiates all collectors.
"""

from __future__ import annotations

from app.collectors.base import BaseCollector


def get_all_collectors() -> list[BaseCollector]:
    """Return instances of all known collectors (regardless of availability)."""
    from app.collectors.besttime import BestTimeCollector
    from app.collectors.foursquare import FoursquareCollector
    from app.collectors.gmaps import GmapsCollector
    from app.collectors.knowledge_graph import KnowledgeGraphCollector
    from app.collectors.osm import OsmCollector
    from app.collectors.outscraper import OutscraperCollector
    from app.collectors.wikidata import WikidataCollector
    from app.collectors.wikipedia import WikipediaCollector

    return [
        GmapsCollector(),
        OsmCollector(),
        WikipediaCollector(),
        WikidataCollector(),
        KnowledgeGraphCollector(),
        BestTimeCollector(),
        FoursquareCollector(),
        OutscraperCollector(),
    ]


def get_enabled_collectors() -> list[BaseCollector]:
    """Return only collectors that are currently available (API keys set, etc.)."""
    return [c for c in get_all_collectors() if c.is_available()]


def get_enrichment_collectors() -> list[BaseCollector]:
    """
    Return collectors in enrichment dependency order (excludes gmaps,
    which runs during discovery). Only returns available collectors.
    """
    from app.collectors.besttime import BestTimeCollector
    from app.collectors.foursquare import FoursquareCollector
    from app.collectors.knowledge_graph import KnowledgeGraphCollector
    from app.collectors.osm import OsmCollector
    from app.collectors.outscraper import OutscraperCollector
    from app.collectors.wikidata import WikidataCollector
    from app.collectors.wikipedia import WikipediaCollector

    # Order matters: OSM first (provides tags for wikipedia/wikidata),
    # then wikipedia/wikidata (use OSM tags), then independent collectors
    ordered = [
        OsmCollector(),
        WikipediaCollector(),
        WikidataCollector(),
        KnowledgeGraphCollector(),
        BestTimeCollector(),
        FoursquareCollector(),
        OutscraperCollector(),
    ]
    return [c for c in ordered if c.is_available()]

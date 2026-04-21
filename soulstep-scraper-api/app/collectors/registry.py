"""
Collector registry — discovers and instantiates all collectors.
"""

from __future__ import annotations

from app.collectors.base import BaseCollector


def get_all_collectors() -> list[BaseCollector]:
    """Return instances of all known collectors (regardless of availability)."""
    from app.collectors.besttime import BestTimeCollector
    from app.collectors.foursquare import FoursquareCollector
    from app.collectors.gmaps_browser import BrowserGmapsCollector
    from app.collectors.knowledge_graph import KnowledgeGraphCollector
    from app.collectors.osm import OsmCollector
    from app.collectors.outscraper import OutscraperCollector
    from app.collectors.wikidata import WikidataCollector
    from app.collectors.wikipedia import WikipediaCollector

    return [
        BrowserGmapsCollector(),
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


def get_enrichment_phases() -> list[list[BaseCollector]]:
    """
    Return available enrichment collectors grouped by dependency phase.

    Phase 0 — must run first (produces wikipedia/wikidata tags for downstream):
        OsmCollector

    Phase 1 — depend on Phase 0 tags, independent of each other (run in parallel):
        WikipediaCollector, WikidataCollector

    Phase 2 — fully independent (run in parallel):
        KnowledgeGraphCollector, BestTimeCollector, FoursquareCollector, OutscraperCollector

    Empty phases are omitted from the returned list.
    """
    from app.collectors.besttime import BestTimeCollector
    from app.collectors.foursquare import FoursquareCollector
    from app.collectors.knowledge_graph import KnowledgeGraphCollector
    from app.collectors.osm import OsmCollector
    from app.collectors.outscraper import OutscraperCollector
    from app.collectors.wikidata import WikidataCollector
    from app.collectors.wikipedia import WikipediaCollector

    phase0 = [c for c in [OsmCollector()] if c.is_available()]
    phase1 = [c for c in [WikipediaCollector(), WikidataCollector()] if c.is_available()]
    phase2 = [
        c
        for c in [
            KnowledgeGraphCollector(),
            BestTimeCollector(),
            FoursquareCollector(),
            OutscraperCollector(),
        ]
        if c.is_available()
    ]

    return [phase for phase in [phase0, phase1, phase2] if phase]

# Pilgrimage Data Scraper API

A FastAPI service that discovers pilgrimage sites via Google Maps, enriches them from multiple online sources, assesses data quality, and syncs the best information to the main server.

## Features

- **Google Maps Discovery**: Quadtree-based recursive search with cross-run deduplication
- **Multi-Source Enrichment**: Collectors for OSM, Wikipedia, Wikidata, Knowledge Graph, BestTime, Foursquare, Outscraper
- **Quality Assessment**: Heuristic scoring of descriptions with optional LLM tie-breaking
- **Data Merging**: Priority-based conflict resolution across all sources
- **Sync**: Push enriched data with attributes to the main Pilgrimage Tracker server

## Setup

1.  **Install Dependencies**:
    ```bash
    cd data_scraper
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    ```

2.  **Environment Variables**:
    Create a `.env` file in `data_scraper/` (copy from `.env.example`):
    ```env
    # Required
    GOOGLE_MAPS_API_KEY=your_api_key_here
    MAIN_SERVER_URL=http://localhost:3000
    SCRAPER_TIMEZONE=Asia/Dubai

    # Optional collectors (leave blank to disable)
    BESTTIME_API_KEY=
    FOURSQUARE_API_KEY=
    OUTSCRAPER_API_KEY=

    # LLM-based description assessment (leave blank for heuristic-only)
    ANTHROPIC_API_KEY=
    ```

3.  **Run Server**:
    ```bash
    uvicorn app.main:app --reload --port 8001
    ```

4.  **Run Tests**:
    ```bash
    source .venv/bin/activate
    python -m pytest tests/ -v
    ```

## Architecture

```
Discovery (gmaps quadtree)
    │
    ▼
Primary Details (gmaps Places API - enhanced field mask)
    │
    ▼
Enrichment Pipeline (collectors in dependency order)
    ├── OSM/Overpass     →  amenities, contact, wikipedia/wikidata tags, multilingual names
    ├── Wikipedia        →  descriptions (en/ar/hi), images
    ├── Wikidata         →  founding date, heritage status, socials, structured data
    ├── Knowledge Graph  →  entity descriptions, schema.org types (FREE, 100k/day)
    ├── BestTime         →  busyness forecasts (optional, paid)
    ├── Foursquare       →  tips, popularity (optional, paid)
    └── Outscraper       →  extended Google reviews (optional, paid)
    │
    ▼
Quality Assessment (heuristic + LLM hybrid)
    │
    ▼
Store final merged data → Sync to server
```

### Directory Structure

```
data_scraper/app/
  scrapers/
    base.py              # generate_code, make_request_with_backoff
    gmaps.py             # Discovery (quadtree search, dedup) + detail fetching
  collectors/
    __init__.py
    base.py              # BaseCollector ABC, CollectorResult dataclass
    gmaps.py             # GmapsCollector (detail extraction)
    osm.py               # OsmCollector (Overpass API)
    wikipedia.py         # WikipediaCollector (REST API)
    wikidata.py          # WikidataCollector (SPARQL)
    knowledge_graph.py   # KnowledgeGraphCollector (free 100k/day)
    besttime.py          # BestTimeCollector (optional/paid)
    foursquare.py        # FoursquareCollector (optional/paid)
    outscraper.py        # OutscraperCollector (optional/paid)
    registry.py          # Collector discovery + factory
  pipeline/
    __init__.py
    enrichment.py        # Orchestrator: runs collectors in order
    quality.py           # Description scoring + LLM tie-breaking
    merger.py            # Combines all collector outputs into final data
```

## Usage

### 1. Create a Data Location
**POST** `/api/v1/scraper/data-locations`
```json
{
  "name": "Dubai Mosques",
  "source_type": "gmaps",
  "city": "Dubai",
  "max_results": 10
}
```

### 2. Start a Scraper Run
**POST** `/api/v1/scraper/runs`
```json
{
  "location_code": "loc_..."
}
```
Returns a `run_code`. The scraper runs discovery, detail-fetching, and enrichment in the background.

### 3. Check Run Status
**GET** `/api/v1/scraper/runs/{run_code}`

### 4. View Data
**GET** `/api/v1/scraper/runs/{run_code}/data?search=Mosque`

### 5. View Raw Collector Data (debugging)
**GET** `/api/v1/scraper/runs/{run_code}/raw-data?collector=osm&place_code=gplc_xxx`

### 6. Re-enrich (without re-discovery)
**POST** `/api/v1/scraper/runs/{run_code}/re-enrich`

### 7. List Collectors
**GET** `/api/v1/scraper/collectors`

### 8. Sync to Main Server
**POST** `/api/v1/scraper/runs/{run_code}/sync`

### 9. Cancel a Run
**POST** `/api/v1/scraper/runs/{run_code}/cancel`

## Collectors

| Collector | Source | Cost | Extracts |
|-----------|--------|------|----------|
| **gmaps** | Google Places API (New) | ~$0.008/place | Details, photos, reviews, opening hours, accessibility, parking, payment |
| **osm** | Overpass API | Free | Amenities, contact, wikipedia/wikidata tags, multilingual names |
| **wikipedia** | Wikipedia REST API | Free | Descriptions (en/ar/hi), images |
| **wikidata** | Wikidata API | Free | Founding date, heritage status, social media, multilingual labels |
| **knowledge_graph** | Google KG Search | Free (100k/day) | Entity descriptions, schema.org types, images |
| **besttime** | BestTime API | Paid | Busyness forecasts, peak hours |
| **foursquare** | Foursquare API | Paid | User tips, popularity |
| **outscraper** | Outscraper API | Paid | Extended Google reviews (beyond the 5 limit) |

## Quality Assessment

Descriptions from all sources are scored using heuristics (0.0-1.0):
- **Source reliability** (40%): Wikipedia > editorial > knowledge graph > wikidata > generative
- **Length/detail** (30%): Longer descriptions score higher
- **Specificity** (30%): Place name mentions + relevant keywords

When the top 2 candidates are within 0.15, an LLM (Claude Haiku) can optionally break the tie or synthesize a combined description. This is only triggered for ~10-20% of places.

## Troubleshooting

### Port 8001 Already in Use
```bash
lsof -ti :8001 | xargs kill -9
```

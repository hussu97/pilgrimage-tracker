# SoulStep Scraper API

A FastAPI service that discovers sacred places via Google Maps, enriches them from multiple online sources, assesses data quality, and syncs the best information to the main server.

## Features

- **Google Maps Discovery**: Quadtree-based recursive search with cross-run deduplication
- **Multi-Source Enrichment**: Collectors for OSM, Wikipedia, Wikidata, Knowledge Graph, BestTime, Foursquare, Outscraper
- **Quality Assessment**: Heuristic scoring of descriptions with optional LLM tie-breaking
- **Data Merging**: Priority-based conflict resolution across all sources
- **Sync**: Push enriched data with attributes to the main SoulStep server

## Setup

1.  **Install Dependencies**:
    ```bash
    cd soulstep-scraper-api
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    ```

2.  **Environment Variables**:
    Create a `.env` file in `soulstep-scraper-api/` (copy from `.env.example`):
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
    GEMINI_API_KEY=
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
soulstep-scraper-api/app/
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

## Geographic Boundaries

Before creating a data location the requested scope must exist in the `GeoBoundary` table. The table is pre-seeded on first startup with all supported regions.

| `boundary_type` | `country` | `state` | Description |
|-----------------|-----------|---------|-------------|
| `country` | `null` | `null` | Entire country (e.g. UAE, India, USA) |
| `state` | parent country | `null` | State/province (e.g. California, Maharashtra) |
| `city` | parent country | parent state *(optional)* | City (e.g. Dubai, Mumbai) |

**Pre-seeded regions:**
- **Countries**: UAE, India, USA, Pakistan
- **UAE cities** (8): Dubai, Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah, Fujairah, Umm Al Quwain, Al Ain
- **USA states** (8): California, Texas, New York, Florida, Illinois, Pennsylvania, Ohio, Georgia
- **India states** (all 28): Maharashtra, Uttar Pradesh, West Bengal, Tamil Nadu, Rajasthan, Karnataka, Gujarat, Andhra Pradesh, Madhya Pradesh, Bihar, Telangana, Odisha, Kerala, Haryana, Punjab, Assam, Jharkhand, Chhattisgarh, Uttarakhand, Himachal Pradesh, Jammu and Kashmir, Goa, Tripura, Manipur, Meghalaya, Nagaland, Arunachal Pradesh, Mizoram, Sikkim
- **India cities** (50+): Mumbai, Delhi, Bangalore, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad, and more
- **Pakistan provinces** (7): Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan, Gilgit-Baltistan, Azad Kashmir, Islamabad Capital Territory
- **Pakistan cities** (top 50): Karachi, Lahore, Faisalabad, Rawalpindi, Gujranwala, Peshawar, Multan, Hyderabad, Islamabad, Quetta, and 40 more

Each boundary also stores a `radius_km` value (approximate search radius) alongside the lat/lng bounding box.

## Usage

### 1. Create a Data Location
**POST** `/api/v1/scraper/data-locations`

Scope the location to a **city**, **state**, or **country** — exactly one must be provided:

```json
{ "name": "Dubai Mosques",    "source_type": "gmaps", "city": "Dubai",      "max_results": 10 }
{ "name": "California Places","source_type": "gmaps", "state": "California","max_results": 20 }
{ "name": "India All",        "source_type": "gmaps", "country": "India",   "max_results": 50 }
```

### 2. Start a Scraper Run
**POST** `/api/v1/scraper/runs`
```json
{
  "location_code": "loc_..."
}
```
Returns a `run_code`. The scraper runs discovery, detail-fetching, and enrichment in the background.

Run status values:
- `pending` → queued, not started yet
- `running` → actively executing
- `completed` → finished successfully
- `failed` → terminated with an error (see `error_message`)
- `cancelled` → manually cancelled
- `interrupted` → process was killed mid-run (set automatically on startup); resume with `/resume`

Run `stage` values (current pipeline phase while `running` or `interrupted`):
- `"discovery"` → searching for places via Google Maps quadtree
- `"detail_fetch"` → fetching place details from Google Places API
- `"enrichment"` → running multi-source enrichment collectors

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

### 9. Resume an Interrupted or Failed Run
**POST** `/api/v1/scraper/runs/{run_code}/resume`

Resumes a run whose status is `interrupted` or `failed`. The run restarts from the stage stored in the `stage` field:
- `null` / `"discovery"` → full pipeline restart
- `"detail_fetch"` → uses persisted `discovered_resource_names`, skips to detail fetch
- `"enrichment"` → skips to enrichment (already-enriched places are skipped automatically)

Response:
```json
{
  "run_code": "run_abc123",
  "status": "interrupted",
  "resume_from_stage": "enrichment",
  "processed_items": 87,
  "total_items": 120
}
```

### 10. Cancel a Run
**POST** `/api/v1/scraper/runs/{run_code}/cancel`

Accepts runs with status `pending`, `running`, or `interrupted`.

### 11. Quality Metrics
**GET** `/api/v1/scraper/quality-metrics?run_code=<optional>`

### 12. Quality Score Breakdown (per place)
**GET** `/api/v1/scraper/runs/{run_code}/places/{place_code}/quality-breakdown`

Returns a factor-by-factor breakdown of the quality score recomputed from `raw_data` (no new DB columns required).

Response:
```json
{
  "total_score": 0.873,
  "gate": null,
  "factors": [
    { "name": "Rating & Reviews", "weight": 0.30, "raw_score": 0.94, "weighted": 0.282, "detail": "rating=4.8, reviews=5000, bayesian=0.94" },
    ...
  ]
}
```

The `gate` field is `null` when the score passes all gates, or one of `"below_image_gate"`, `"below_enrichment_gate"`, `"below_sync_gate"`.
Returns **404** if the run or place does not exist.

Aggregate quality scoring statistics. When `run_code` is omitted, metrics cover all runs.

Response includes:
- `score_distribution` — 10 buckets (0.0–0.1 … 0.9–1.0) with place counts
- `gate_breakdown` — counts per gate label (`below_image_gate`, `below_enrichment_gate`, `below_sync_gate`, `passed`)
- `near_threshold_counts` — places within ±0.05 of each gate threshold (sensitivity analysis)
- `avg_quality_score`, `median_quality_score`
- `description_source_breakdown`, `enrichment_status_breakdown`
- `per_run_summary` — per-run totals with avg score
- `overall_stats` — `total_scraped`, `total_synced`, `overall_filter_rate_pct`

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

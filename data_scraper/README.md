# Pilgrimage Data Scraper API

A FastAPI service to manage data scraping for pilgrimage sites from multiple sources.

## Features
- **Multi-Source Support**: Scrape from Google Sheets (OSM/Wikipedia) or Google Maps API
- **Data Locations**: Manage data sources with flexible configuration
- **Scraper Runs**: Trigger background scraping tasks with progress tracking
- **Data Viewer**: View scraped data via API
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
    ```
    MAIN_SERVER_URL=http://localhost:3000
    GOOGLE_MAPS_API_KEY=your_api_key_here  # Required for gmaps scraper
    ```

3.  **Run Server**:
    ```bash
    # Run on port 8001 to avoid conflict with main server (3000/8000)
    uvicorn app.main:app --reload --port 8001
    ```

## Troubleshooting

### Port 8001 Already in Use

If you get an "Address already in use" error, the port is still occupied by a previous process. Kill it with:

```bash
# Find and kill the process on port 8001
lsof -ti :8001 | xargs kill -9
```

Or find the process ID first, then kill it:

```bash
# Find the process
lsof -i :8001

# Kill it (replace PID with the actual process ID)
kill -9 PID
```

## Usage

### 1. Create a Data Location

#### Google Sheet Source (OSM/Wikipedia enrichment)
**POST** `/api/v1/scraper/data-locations`
```json
{
  "name": "UAE Places",
  "source_type": "gsheet",
  "sheet_url": "https://docs.google.com/spreadsheets/d/..."
}
```

#### Google Maps Source
**POST** `/api/v1/scraper/data-locations`
```json
{
  "name": "UAE Mosques - Google Maps",
  "source_type": "gmaps",
  "country": "UAE",
  "place_type": "mosque",
  "max_results": 5
}
```

**Supported countries**: UAE, India, USA
**Supported place types**: mosque, hindu_temple, church
**max_results**: Optional limit for testing (default: 5)

### 2. Start a Scraper Run
**POST** `/api/v1/scraper/runs`
```json
{
  "location_code": "loc_..."
}
```
Returns a `run_code`. The scraper runs in the background.

### 3. Check Run Status
**GET** `/api/v1/scraper/runs/{run_code}`

Returns status with progress tracking:
```json
{
  "run_code": "run_xxx",
  "status": "running",
  "total_items": 100,
  "processed_items": 42,
  "created_at": "..."
}
```

### 4. View Data
**GET** `/api/v1/scraper/runs/{run_code}/data?search=Mosque`

Returns scraped places with attributes:
```json
[
  {
    "place_code": "gplc_ChIJxxx",
    "name": "Grand Mosque",
    "source": "gmaps",
    "attributes": [
      {"attribute_code": "wheelchair_accessible", "value": true},
      {"attribute_code": "google_rating", "value": 4.8}
    ],
    ...
  }
]
```

### 5. Sync to Main Server
**POST** `/api/v1/scraper/runs/{run_code}/sync`

Triggers a background task to push data (including attributes and source) to the main server.
Ensure the main server is running and has the `POST /api/v1/places` endpoint.

### 6. Cancel a Run
**POST** `/api/v1/scraper/runs/{run_code}/cancel`

Aborts an active run. All data extracted up to the point of cancellation is preserved.

## Architecture

### Scrapers Package (`app/scrapers/`)

- **`base.py`**: Shared utilities (code generation, HTTP backoff)
- **`gsheet.py`**: Google Sheet scraper with OSM/Wikipedia enrichment
- **`gmaps.py`**: Google Maps grid scraper with attribute extraction

### Data Flow

1. **Create Data Location** → Stores source config (sheet_code or country/place_type)
2. **Create Run** → Background task starts appropriate scraper based on source_type
3. **Scraping** → Progress tracked via total_items/processed_items
4. **Sync** → Enriched data with attributes synced to main server

### Google Maps Scraper Features

- **Grid-based search**: Divides country into overlapping circles for complete coverage
- **Stable place codes**: Uses `gplc_{place_id}` for deduplication across runs
- **Attribute extraction**: wheelchair_accessible, google_rating, google_reviews_count
- **Opening hours**: Converts to UTC 24-hour format
- **Rate limiting**: Built-in delays and backoff for API limits

### Source Tracking

All places are tagged with their source:
- `gmaps`: From Google Maps API
- `overpass`: From OSM/Wikipedia enrichment
- `manual`: From seed data

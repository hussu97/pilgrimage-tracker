# Pilgrimage Data Scraper API

A FastAPI service to manage data scraping for pilgrimage sites.

## Features
- **Data Locations**: Manage Google Sheet URLs as data sources.
- **Scraper Runs**: Trigger background scraping tasks.
- **Data Viewer**: View scraped data via API.
- **Sync**: Push enriched data to the main Pilgrimage Tracker server.

## Setup

1.  **Install Dependencies**:
    ```bash
    cd data_scraper
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    ```

2.  **Run Server**:
    ```bash
    # Run on port 8001 to avoid conflict with main server (3000/8000)
    uvicorn app.main:app --reload --port 8001
    ```

3.  **Environment Variables**:
    Create a `.env` file in `data_scraper/` if needed.
    ```
    MAIN_SERVER_URL=http://localhost:3000
    ```

## Usage

### 1. Create a Data Location
**POST** `/api/v1/scraper/data-locations`
```json
{
  "name": "UAE Places",
  "sheet_url": "https://docs.google.com/spreadsheets/d/..."
}
```

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

### 4. View Data
**GET** `/api/v1/scraper/runs/{run_code}/data?search=Mosque`

### 5. Sync to Main Server
**POST** `/api/v1/scraper/runs/{run_code}/sync`
Triggers a background task to push data to the main server.
Ensure the main server is running and has the `POST /api/v1/places` endpoint.

### 6. Cancel a Run
**POST** `/api/v1/scraper/runs/{run_code}/cancel`
Aborts an active run. All data extracted up to the point of cancellation is preserved.

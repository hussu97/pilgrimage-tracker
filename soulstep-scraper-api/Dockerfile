FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# /data is the recommended mount point for the SQLite database in production.
# Set SCRAPER_DB_PATH=/data/scraper.db and mount a volume at /data.
RUN mkdir -p /data

EXPOSE 8001

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]

FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# /data is the recommended mount point for the SQLite database in production.
# Set SCRAPER_DB_PATH=/data/scraper.db and mount a volume at /data.
RUN mkdir -p /data

# Run as a non-root user to reduce attack surface.
RUN adduser --disabled-password --no-create-home appuser \
    && chown -R appuser /app /data
USER appuser

# Cloud Run injects PORT=8080; fall back to 8080 for local docker run too.
EXPOSE 8080

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]

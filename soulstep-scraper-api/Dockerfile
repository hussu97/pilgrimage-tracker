FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Chromium system dependencies (only used when SCRAPER_BACKEND=browser).
# These are installed unconditionally so the image works in either mode.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    libxshmfence1 \
    libatk1.0-0 \
    libcups2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Install Chromium for Playwright (browser mode only).
# The binary is ~300MB but is needed when SCRAPER_BACKEND=browser.
RUN pip install playwright && playwright install chromium --with-deps

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

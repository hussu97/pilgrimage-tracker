FROM python:3.12-slim

WORKDIR /app

# Patch OS-level vulnerabilities (e.g. CVE-2026-0861 in glibc)
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# Install dependencies first (layer-cached)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Run as a non-root user to reduce container escape risk
RUN adduser --disabled-password --no-create-home appuser \
    && chown -R appuser /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3000/health')" || exit 1

# PORT env var defaults to 3000; override with -e PORT=xxxx if needed
#
# --proxy-headers / --forwarded-allow-ips: without these, Starlette leaves
# request.client.host as the *nginx container's* docker-network IP, so
# slowapi's get_remote_address() returns the same key for every caller and all
# the @limiter.limit() decorators (main, auth, search, analytics) degrade into
# one shared global bucket instead of per-IP limits. Trusting all forwarders is
# safe here because the container is only reachable from nginx on the internal
# docker network — it is not published to the host.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3000} --workers 2 --proxy-headers --forwarded-allow-ips='*'"]

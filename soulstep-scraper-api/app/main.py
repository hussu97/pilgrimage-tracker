import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text as sa_text
from sqlmodel import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1 import api_router
from app.db.seed_geo import seed_geo_boundaries
from app.db.seed_place_types import seed_place_type_mappings
from app.db.session import engine, run_migrations
from app.logger import get_logger, mask_secret, set_trace_context, setup_logging

load_dotenv()
setup_logging()

logger = get_logger(__name__)


def _validate_startup_config() -> None:
    """
    Validate environment variables and DB connectivity at startup.

    Logs warnings for missing API keys (collectors skip gracefully when absent).
    Logs errors (does not raise) for DB connectivity issues so the /health
    endpoint stays reachable even during partial outages.
    """
    logger.info("=== SoulStep Scraper API — startup config check ===")

    # Optional API keys — collectors degrade gracefully when absent
    optional_keys: dict[str, str] = {
        "GOOGLE_MAPS_API_KEY": "Google Maps scraper + enrichment",
        "FOURSQUARE_API_KEY": "Foursquare enrichment (optional)",
        "OUTSCRAPER_API_KEY": "Outscraper extended reviews (optional)",
        "BESTTIME_API_KEY": "BestTime busyness data (optional)",
        "ANTHROPIC_API_KEY": "LLM description tie-breaking (optional)",
    }

    configured: list[str] = []
    missing: list[str] = []
    for var, description in optional_keys.items():
        value = os.environ.get(var, "")
        if value:
            configured.append(f"  [SET]  {var} = {mask_secret(value)}  ({description})")
        else:
            missing.append(f"  [MISS] {var}  ({description})")

    if configured:
        logger.info("Configured API keys:\n%s", "\n".join(configured))
    if missing:
        logger.warning(
            "Missing API keys — affected collectors will be skipped:\n%s", "\n".join(missing)
        )

    # General non-secret config
    _db_url = os.environ.get("DATABASE_URL")
    if _db_url:
        _db_display = f"{mask_secret(_db_url)} (PostgreSQL via DATABASE_URL)"
    else:
        _db_display = os.environ.get("SCRAPER_DB_PATH", "scraper.db (default SQLite)")

    other_config: dict[str, str] = {
        "MAIN_SERVER_URL": os.environ.get("MAIN_SERVER_URL", "http://127.0.0.1:3000 (default)"),
        "DATABASE": _db_display,
        "LOG_LEVEL": os.environ.get("LOG_LEVEL", "INFO (default)"),
        "LOG_FORMAT": os.environ.get("LOG_FORMAT", "text (default)"),
    }
    config_lines = [f"  {k} = {v}" for k, v in other_config.items()]
    logger.info("Runtime config:\n%s", "\n".join(config_lines))

    # Database writability check
    try:
        with Session(engine) as db_session:
            db_session.exec(sa_text("SELECT 1"))
        logger.info("Database connectivity check passed")
    except Exception as exc:
        logger.error("Database connectivity check failed: %s", exc)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    _validate_startup_config()
    # Wrap every startup DB operation so a failed migration or seed never
    # prevents the container from binding to its port.  Cloud Run's startup
    # probe only needs port 8080 to respond — keeping the app alive lets us
    # read the real error from Cloud Run logs instead of just seeing
    # "container failed to start".
    try:
        run_migrations()
    except Exception as exc:
        logger.error(
            "run_migrations() failed at startup — proceeding anyway: %s", exc, exc_info=True
        )
    try:
        with Session(engine) as session:
            seed_geo_boundaries(session)
            seed_place_type_mappings(session)
    except Exception as exc:
        logger.error("Seed functions failed at startup — proceeding anyway: %s", exc, exc_info=True)
    yield


app = FastAPI(title="SoulStep Scraper API", lifespan=lifespan)

app.include_router(api_router)


# ===== Middleware =====


@app.middleware("http")
async def _gcp_trace_middleware(request: Request, call_next):
    """Extract the X-Cloud-Trace-Context header injected by Cloud Run and store
    it in a ContextVar for the duration of this request.

    Every JSON log entry produced by _JSONFormatter then includes
    logging.googleapis.com/trace + spanId, which tells Cloud Logging to group
    the app log with the matching request log entry — so you can see the full
    stack trace directly alongside the HTTP 500 in the Cloud Logging UI.
    """
    header = request.headers.get("X-Cloud-Trace-Context", "")
    if header:
        parts = header.split("/")
        trace_id = parts[0]
        span_id, sampled = "", False
        if len(parts) > 1:
            span_parts = parts[1].split(";")
            span_id = span_parts[0]
            sampled = len(span_parts) > 1 and "o=1" in span_parts[1]
        project = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
        set_trace_context(project, trace_id, span_id, sampled)
    return await call_next(request)


# ===== Global Exception Handlers =====


def _log_http_error(
    request: Request,
    status_code: int,
    detail: str,
    exc: Exception | None = None,
    extra_fields: dict | None = None,
) -> None:
    """Emit a structured log record for an HTTP error.

    All context is placed in extra={} so _JSONFormatter promotes every field
    to a top-level JSON key in Cloud Logging — no string parsing needed.

    5xx → ERROR with exc_info (full traceback attached)
    4xx → WARNING, no traceback (intentional responses, not bugs)
    """
    fields: dict = {
        "http.method": request.method,
        "http.path": request.url.path,
        "http.status_code": status_code,
        "http.query_params": dict(request.query_params) if request.query_params else None,
        "http.user_agent": request.headers.get("user-agent"),
        "http.client_ip": request.client.host if request.client else None,
        "error.detail": detail,
    }
    if exc is not None:
        fields["error.type"] = type(exc).__name__
        fields["error.message"] = str(exc)
    if extra_fields:
        fields.update(extra_fields)

    msg = f"{request.method} {request.url.path} → {status_code}: {detail}"
    if status_code >= 500:
        logger.error(msg, exc_info=exc, extra=fields)
    else:
        logger.warning(msg, extra=fields)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # 4xx are intentional — no traceback. 5xx are unexpected — attach exc_info.
    _log_http_error(
        request,
        exc.status_code,
        str(exc.detail),
        exc=exc if exc.status_code >= 500 else None,
    )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    # Normalise to a JSON-safe list and log it as a structured field so
    # every failing field is visible in Cloud Logging without parsing the message.
    validation_errors = []
    for err in errors:
        entry: dict = {"loc": list(err["loc"]), "msg": err["msg"], "type": err["type"]}
        if "ctx" in err:
            entry["ctx"] = {
                k: v if isinstance(v, str | int | float | bool | type(None)) else str(v)
                for k, v in err["ctx"].items()
            }
        validation_errors.append(entry)

    _log_http_error(
        request,
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        f"{len(errors)} validation error(s)",
        extra_fields={"validation_errors": validation_errors},
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": validation_errors},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    _log_http_error(
        request,
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "An unexpected error occurred",
        exc=exc,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


@app.get("/health")
def health():
    from sqlalchemy import text as _text

    db_ok = False
    db_error = None
    try:
        with Session(engine) as s:
            s.exec(_text("SELECT 1"))
        db_ok = True
    except Exception as exc:
        db_error = str(exc)

    return {
        "status": "ok" if db_ok else "degraded",
        "db": "ok" if db_ok else f"error: {db_error}",
    }

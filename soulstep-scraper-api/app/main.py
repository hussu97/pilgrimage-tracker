import json
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
from app.logger import get_logger, mask_secret, setup_logging

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
    other_config: dict[str, str] = {
        "MAIN_SERVER_URL": os.environ.get("MAIN_SERVER_URL", "http://127.0.0.1:3000 (default)"),
        "SCRAPER_DB_PATH": os.environ.get("SCRAPER_DB_PATH", "scraper.db (default)"),
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
    run_migrations()
    with Session(engine) as session:
        seed_geo_boundaries(session)
        seed_place_type_mappings(session)
    yield


app = FastAPI(title="SoulStep Scraper API", lifespan=lifespan)

app.include_router(api_router)


# ===== Global Exception Handlers =====


def log_error(
    request: Request, status_code: int, error_type: str, detail: str, exc: Exception = None
):
    """Log error details using the structured logger."""
    path = f"{request.method} {request.url.path}"
    query = dict(request.query_params) if request.query_params else None
    exc_name = f"{type(exc).__name__}: {exc}" if exc else None

    if status_code >= 500:
        logger.error(
            "%s %s | %s | detail=%s | exc=%s",
            error_type,
            status_code,
            path,
            detail,
            exc_name,
            exc_info=exc is not None,
        )
    else:
        logger.warning(
            "%s %s | %s | query=%s | detail=%s | exc=%s",
            error_type,
            status_code,
            path,
            query,
            detail,
            exc_name,
        )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handle HTTP exceptions (400, 401, 403, 404, etc.)"""
    error_type = "HTTP Error"
    if exc.status_code == 400:
        error_type = "Bad Request"
    elif exc.status_code == 401:
        error_type = "Unauthorized"
    elif exc.status_code == 403:
        error_type = "Forbidden"
    elif exc.status_code == 404:
        error_type = "Not Found"
    elif exc.status_code >= 500:
        error_type = "Server Error"

    log_error(request, exc.status_code, error_type, str(exc.detail), exc)

    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle 422 validation errors with detailed logging"""
    errors = exc.errors()

    log_error(
        request,
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "Validation Error",
        f"{len(errors)} validation error(s)",
        exc,
    )

    # Log individual field errors at DEBUG level (too verbose for INFO)
    if logger.isEnabledFor(10):  # logging.DEBUG == 10
        for error in errors:
            field = " -> ".join(str(loc) for loc in error["loc"])
            logger.debug(
                "  Validation field=%s  msg=%s  type=%s", field, error["msg"], error["type"]
            )

    # Serialize errors for JSON response (convert non-serializable objects to strings)
    serializable_errors = []
    for error in errors:
        serializable_error = {
            "loc": error["loc"],
            "msg": error["msg"],
            "type": error["type"],
        }
        if "ctx" in error:
            # Convert context values to strings if they're not JSON-serializable
            ctx = {}
            for key, value in error["ctx"].items():
                try:
                    json.dumps(value)
                    ctx[key] = value
                except (TypeError, ValueError):
                    ctx[key] = str(value)
            serializable_error["ctx"] = ctx
        serializable_errors.append(serializable_error)

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": serializable_errors},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Catch-all handler for unhandled exceptions"""
    log_error(
        request,
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Internal Server Error",
        "An unexpected error occurred",
        exc,
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "error_type": type(exc).__name__,
        },
    )


@app.get("/health")
def health():
    return {"status": "ok"}

import logging
import os
import time
import traceback
from contextlib import asynccontextmanager

# Load .env before any app module is imported (session.py reads DATABASE_URL
# at import time, so this must come first).
from dotenv import load_dotenv

load_dotenv()

# Set up structured logging immediately after loading env, before other imports.
from app.core.logging_config import setup_logging  # noqa: E402

setup_logging()
logger = logging.getLogger(__name__)

from fastapi import FastAPI, Request, status  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.middleware.gzip import GZipMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from slowapi import Limiter, _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from slowapi.util import get_remote_address  # noqa: E402
from starlette.exceptions import HTTPException as StarletteHTTPException  # noqa: E402

from app.api.v1 import api_router  # noqa: E402
from app.api.v1 import share as share_router_module  # noqa: E402
from app.core import config  # noqa: E402
from app.core.client_context import (  # noqa: E402
    ClientContext,
    reset_client_context,
    set_client_context,
    version_meets_minimum,
)
from app.core.request_context import (  # noqa: E402
    generate_request_id,
    get_request_id,
    reset_request_id,
    set_request_id,
)
from app.db.seed import run_seed_system  # noqa: E402
from app.db.session import run_migrations  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Always apply pending migrations first (safe to call repeatedly; idempotent).
    run_migrations()
    # Seed reference data (languages, translations, attribute definitions).
    # Demo data (places, users, groups) is never loaded automatically — use
    # scripts/reset_db.py --with-demo-data for that.
    run_seed_system()
    yield


_OPENAPI_TAGS = [
    {
        "name": "auth",
        "description": "Authentication: register, login, refresh, logout, and password reset.",
    },
    {
        "name": "users",
        "description": "Current-user profile, settings, stats, and check-in history.",
    },
    {
        "name": "places",
        "description": (
            "Pilgrimage site discovery, search, filtering, check-ins, favorites, "
            "reviews, and image management."
        ),
    },
    {
        "name": "reviews",
        "description": "User reviews and ratings for pilgrimage sites.",
    },
    {
        "name": "groups",
        "description": "Social groups: create, join via invite link, leaderboard, and activity.",
    },
    {
        "name": "notifications",
        "description": "In-app notification listing and mark-as-read.",
    },
    {
        "name": "i18n",
        "description": "Available languages and UI translation key-value pairs.",
    },
    {
        "name": "visitors",
        "description": "Anonymous visitor session management and visitor settings.",
    },
]

app = FastAPI(
    title="Pilgrimage Tracker API",
    version="1.0.0",
    description=(
        "REST API for the Pilgrimage Tracker application. "
        "Supports discovering pilgrimage sites across religions (Islam, Christianity, Hinduism, and more), "
        "check-ins, reviews, social groups, favorites, and multi-language UI translations.\n\n"
        "## Authentication\n"
        "Most endpoints require a **Bearer token** obtained from `POST /api/v1/auth/login` or "
        "`POST /api/v1/auth/register`. Pass it as:\n"
        "```\nAuthorization: Bearer <token>\n```\n"
        "Refresh tokens are issued as `HttpOnly` cookies and rotated on every `POST /api/v1/auth/refresh` call.\n\n"
        "## Rate Limiting\n"
        "Auth endpoints are rate-limited per IP: login (5/min), register (3/min), forgot-password (2/min).\n\n"
        "## Identifiers\n"
        "All entities use opaque string codes (e.g. `usr_abc123`, `pl_xyz456`) — never numeric IDs."
    ),
    lifespan=lifespan,
    openapi_tags=_OPENAPI_TAGS,
)

# Rate limiter (in-memory, per-IP)
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# allow_origins=["*"] with allow_credentials=True is invalid per CORS spec. Use explicit origins.
_DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "").strip().split() or _DEFAULT_CORS_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Compress responses ≥ 1 KB with gzip (60-80% reduction on JSON payloads).
app.add_middleware(GZipMiddleware, minimum_size=1000)


# ===== Middleware =====
# Starlette applies middleware in reverse declaration order — last declared = outermost
# (runs first on incoming request, last on outgoing response).
#
# Execution order (outermost → innermost):
#   request_timing → api_version_header → request_id → hard_update → client_context → handler


@app.middleware("http")
async def client_context_middleware(request: Request, call_next):
    """Extract X-Content-Type / X-App-Type / X-Platform / X-App-Version headers
    and store them in a ContextVar for the lifetime of the request."""
    ctx = ClientContext(
        content_type=request.headers.get("X-Content-Type", "desktop"),
        app_type=request.headers.get("X-App-Type", "web"),
        platform=request.headers.get("X-Platform", "web"),
        app_version=request.headers.get("X-App-Version") or None,
    )
    token = set_client_context(ctx)
    try:
        response = await call_next(request)
        return response
    finally:
        reset_client_context(token)


@app.middleware("http")
async def hard_update_middleware(request: Request, call_next):
    """Block mobile clients running below MIN_APP_VERSION_HARD with HTTP 426."""
    if not config.MIN_APP_VERSION_HARD:
        return await call_next(request)

    app_type = request.headers.get("X-App-Type", "web")
    if app_type != "app":
        return await call_next(request)

    app_version = request.headers.get("X-App-Version", "")
    if not app_version:
        return await call_next(request)

    if not version_meets_minimum(app_version, config.MIN_APP_VERSION_HARD):
        platform = request.headers.get("X-Platform", "")
        store_url = config.APP_STORE_URL_IOS if platform == "ios" else config.APP_STORE_URL_ANDROID
        return JSONResponse(
            status_code=426,
            content={
                "detail": "update_required",
                "min_version": config.MIN_APP_VERSION_HARD,
                "store_url": store_url,
            },
        )

    return await call_next(request)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Generate a UUID4 request ID, store it in a ContextVar, and attach it as
    X-Request-ID to the response."""
    rid = generate_request_id()
    token = set_request_id(rid)
    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response
    finally:
        reset_request_id(token)


@app.middleware("http")
async def api_version_header_middleware(request: Request, call_next):
    """Attach X-API-Version: 1 to every response."""
    response = await call_next(request)
    response.headers["X-API-Version"] = "1"
    return response


@app.middleware("http")
async def request_timing_middleware(request: Request, call_next):
    """Log a structured access log entry for every request."""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    logger.info(
        "request_complete",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "request_id": get_request_id(),
        },
    )
    return response


app.include_router(api_router)
app.include_router(share_router_module.router, prefix="/share")

# Prometheus metrics — exposes GET /metrics (excluded from OpenAPI schema)
try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app, include_in_schema=False)
except ImportError:
    logger.warning("prometheus-fastapi-instrumentator not installed; /metrics endpoint disabled")


# ===== Global Exception Handlers =====


def log_error(
    request: Request, status_code: int, error_type: str, detail: str, exc: Exception = None
):
    """Log error details via the logging module."""
    query = dict(request.query_params) if request.query_params else None
    request_id = get_request_id()
    if status_code >= 500:
        logger.error(
            "%s (%d) — %s %s | query=%s | detail=%s | exc=%s\n%s",
            error_type,
            status_code,
            request.method,
            request.url.path,
            query,
            detail,
            f"{type(exc).__name__}: {exc}" if exc else None,
            traceback.format_exc() if exc else "",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": status_code,
            },
        )
    else:
        logger.warning(
            "%s (%d) — %s %s | query=%s | detail=%s",
            error_type,
            status_code,
            request.method,
            request.url.path,
            query,
            detail,
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": status_code,
            },
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

    # Log validation errors
    log_error(
        request,
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "Validation Error",
        f"{len(errors)} validation error(s)",
        exc,
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
                    # Test if value is JSON serializable
                    import json

                    json.dumps(value)
                    ctx[key] = value
                except (TypeError, ValueError):
                    # Not serializable - convert to string
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
    from sqlalchemy import text

    from app.db.session import engine

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"

    overall = "ok" if db_status == "ok" else "degraded"
    return {"status": overall, "db": db_status}

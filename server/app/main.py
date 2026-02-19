import logging
import os
import traceback
from contextlib import asynccontextmanager

# Load .env before any app module is imported (session.py reads DATABASE_URL
# at import time, so this must come first).
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, Request, status  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from slowapi import Limiter, _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from slowapi.util import get_remote_address  # noqa: E402
from starlette.exceptions import HTTPException as StarletteHTTPException  # noqa: E402

from app.api.v1 import api_router  # noqa: E402
from app.api.v1 import share as share_router_module  # noqa: E402
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

app.include_router(api_router)
app.include_router(share_router_module.router, prefix="/share")


# ===== Global Exception Handlers =====


def log_error(
    request: Request, status_code: int, error_type: str, detail: str, exc: Exception = None
):
    """Log error details via the logging module."""
    query = dict(request.query_params) if request.query_params else None
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
        status.HTTP_422_UNPROCESSABLE_ENTITY,
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
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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

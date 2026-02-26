import asyncio
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
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
from app.api.v1 import feed as feed_module  # noqa: E402
from app.api.v1 import seo_static as seo_static_module  # noqa: E402
from app.api.v1 import share as share_router_module  # noqa: E402
from app.api.v1 import sitemap as sitemap_module  # noqa: E402
from app.core import config  # noqa: E402
from app.core.client_context import (  # noqa: E402
    ClientContext,
    get_client_context,
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

# ── AI citation monitoring ────────────────────────────────────────────────────
# Maps User-Agent patterns to display names for known AI crawlers.
_AI_BOT_MAP: list[tuple[re.Pattern, str]] = [
    (re.compile(r"ChatGPT-User", re.IGNORECASE), "ChatGPT"),
    (re.compile(r"GPTBot", re.IGNORECASE), "GPTBot"),
    (re.compile(r"OAI-SearchBot", re.IGNORECASE), "OpenAI SearchBot"),
    (re.compile(r"Claude-Web", re.IGNORECASE), "Claude"),
    (re.compile(r"anthropic-ai", re.IGNORECASE), "Anthropic"),
    (re.compile(r"PerplexityBot", re.IGNORECASE), "Perplexity"),
    (re.compile(r"CCBot", re.IGNORECASE), "Common Crawl"),
    (re.compile(r"cohere-ai", re.IGNORECASE), "Cohere"),
    (re.compile(r"YouBot", re.IGNORECASE), "You.com"),
    (re.compile(r"Meta-ExternalAgent", re.IGNORECASE), "Meta"),
    (re.compile(r"Bytespider", re.IGNORECASE), "ByteDance"),
    (re.compile(r"Diffbot", re.IGNORECASE), "Diffbot"),
    (re.compile(r"Omgili", re.IGNORECASE), "Omgili"),
]

# Extracts place_code from /share/places/{code} or /share/{lang}/places/{code}
_SHARE_PLACE_CODE_RE = re.compile(r"/share/(?:[a-z]{2}/)?places/([^/?#]+)")

# Thread pool for fire-and-forget DB writes (1 thread is enough for logging)
_AI_LOG_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ai-log")


def _detect_ai_bot(user_agent: str) -> str | None:
    """Return display name of the matched AI bot, or None."""
    for pattern, name in _AI_BOT_MAP:
        if pattern.search(user_agent):
            return name
    return None


def _log_ai_visit_sync(bot_name: str, path: str, place_code: str | None) -> None:
    """Write an AICrawlerLog row. Runs in a background thread pool."""
    try:
        from sqlmodel import Session

        from app.db.models import AICrawlerLog
        from app.db.session import engine

        with Session(engine) as session:
            log = AICrawlerLog(bot_name=bot_name, path=path, place_code=place_code)
            session.add(log)
            session.commit()
    except Exception:
        pass  # Never let monitoring break a response


# ── Keys that contain large image data ────────────────────────────────────────
# Keys that contain large image data and must never appear in log output.
_IMAGE_LOG_KEYS: frozenset[str] = frozenset({"image_url", "image_blob"})


def _sanitize_log_data(data: dict) -> dict:
    """Strip image fields from a dict before logging to keep output concise."""
    return {k: v for k, v in data.items() if k not in _IMAGE_LOG_KEYS and "image" not in k.lower()}


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
            "Sacred site discovery, search, filtering, check-ins, favorites, "
            "reviews, and image management."
        ),
    },
    {
        "name": "reviews",
        "description": "User reviews and ratings for sacred sites.",
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
    title="SoulStep Catalog API",
    version="1.0.0",
    description=(
        "REST API for the SoulStep application. "
        "Supports discovering sacred sites across religions (Islam, Christianity, Hinduism, and more), "
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
async def ai_citation_middleware(request: Request, call_next):
    """Detect AI-assistant crawlers visiting /share/ pages and log them.

    The DB write is fire-and-forget (ThreadPoolExecutor) so it never adds
    latency to the actual response.
    """
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/share/"):
        ua = request.headers.get("user-agent", "")
        bot_name = _detect_ai_bot(ua)
        if bot_name:
            place_code: str | None = None
            m = _SHARE_PLACE_CODE_RE.search(path)
            if m:
                place_code = m.group(1)
            loop = asyncio.get_event_loop()
            loop.run_in_executor(_AI_LOG_EXECUTOR, _log_ai_visit_sync, bot_name, path, place_code)
    return response


@app.middleware("http")
async def request_timing_middleware(request: Request, call_next):
    """Log a structured access log entry for every request."""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    status_code = response.status_code

    extra: dict = {
        "method": request.method,
        "path": request.url.path,
        "status_code": status_code,
        "duration_ms": duration_ms,
        "request_id": get_request_id(),
    }
    if request.query_params:
        extra["query"] = _sanitize_log_data(dict(request.query_params))
    client = get_client_context()
    if client:
        extra["platform"] = client.platform
        extra["app_type"] = client.app_type

    if status_code >= 500:
        logger.error("request_complete", extra=extra)
    elif status_code >= 400:
        logger.warning("request_complete", extra=extra)
    else:
        logger.info("request_complete", extra=extra)

    return response


app.include_router(api_router)
app.include_router(share_router_module.router, prefix="/share")
app.include_router(sitemap_module.router)
app.include_router(seo_static_module.router)
app.include_router(feed_module.router)

# Prometheus metrics — exposes GET /metrics (excluded from OpenAPI schema)
try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app, include_in_schema=False)
except ImportError:
    logger.warning("prometheus-fastapi-instrumentator not installed; /metrics endpoint disabled")


# ===== Global Exception Handlers =====


def _log_http_error(
    request: Request,
    status_code: int,
    detail: str,
    exc: Exception | None = None,
    extra_fields: dict | None = None,
) -> None:
    """Emit a structured log record for an HTTP error.

    All context is placed in extra={} so pythonjsonlogger promotes every
    field to a top-level JSON key in Cloud Logging — no string parsing needed.

    5xx → ERROR with exc_info (full traceback attached)
    4xx → WARNING, no traceback (intentional responses, not bugs)
    """
    fields: dict = {
        "http.method": request.method,
        "http.path": request.url.path,
        "http.status_code": status_code,
        "http.query_params": (
            _sanitize_log_data(dict(request.query_params)) if request.query_params else None
        ),
        "http.user_agent": request.headers.get("user-agent"),
        "http.client_ip": request.client.host if request.client else None,
        "request_id": get_request_id(),
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

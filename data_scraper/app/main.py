import traceback
from datetime import datetime

from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlmodel import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1 import api_router
from app.db.seed_geo import seed_geo_boundaries
from app.db.seed_place_types import seed_place_type_mappings
from app.db.session import create_db_and_tables, engine

load_dotenv()

app = FastAPI(title="Pilgrimage Data Scraper API")


@app.on_event("startup")
def on_startup():
    create_db_and_tables()
    with Session(engine) as session:
        seed_geo_boundaries(session)
        seed_place_type_mappings(session)


app.include_router(api_router)


# ===== Global Exception Handlers =====


def log_error(
    request: Request, status_code: int, error_type: str, detail: str, exc: Exception = None
):
    """Log error details to console"""
    timestamp = datetime.utcnow().isoformat()
    print(f"\n{'=' * 80}")
    print(f"[{timestamp}] {error_type} - {status_code}")
    print(f"Path: {request.method} {request.url.path}")
    if request.query_params:
        print(f"Query: {dict(request.query_params)}")
    print(f"Detail: {detail}")
    if exc:
        print(f"Exception: {type(exc).__name__}: {str(exc)}")
        if status_code >= 500:
            print(f"Traceback:\n{traceback.format_exc()}")
    print(f"{'=' * 80}\n")


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

    # Print detailed validation errors
    print("Validation Errors:")
    for error in errors:
        print(f"  - Field: {' -> '.join(str(loc) for loc in error['loc'])}")
        print(f"    Error: {error['msg']}")
        print(f"    Type: {error['type']}")
        if "ctx" in error:
            print(f"    Context: {error['ctx']}")
    print()

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

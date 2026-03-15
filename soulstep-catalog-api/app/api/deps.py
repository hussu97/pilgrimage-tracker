from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import CATALOG_API_KEY
from app.core.security import decode_token
from app.db import store
from app.db.models import User
from app.db.session import SessionDep

security = HTTPBearer(auto_error=False)


def _extract_token(
    credentials: HTTPAuthorizationCredentials | None,
    request: Request,
) -> str | None:
    """Extract JWT from Authorization: Bearer header first, then access_token cookie."""
    if credentials:
        return credentials.credentials
    return request.cookies.get("access_token")


def get_current_user_code(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    request: Request,
) -> str:
    token = _extract_token(credentials, request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    user_code = decode_token(token)
    if not user_code:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return user_code


def get_current_user(
    user_code: Annotated[str, Depends(get_current_user_code)],
    session: SessionDep,
) -> User:
    user = store.get_user_by_code(user_code, session)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    request: Request,
    session: SessionDep,
) -> User | None:
    """Return current user if valid Bearer token or access_token cookie present, else None."""
    token = _extract_token(credentials, request)
    if not token:
        return None
    user_code = decode_token(token)
    if not user_code:
        return None
    return store.get_user_by_code(user_code, session)


def get_admin_user(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


# Convenience type aliases for FastAPI dependency injection
UserDep = Annotated[User, Depends(get_current_user)]
OptionalUserDep = Annotated[User | None, Depends(get_optional_user)]
AdminDep = Annotated[User, Depends(get_admin_user)]


# ── Internal service auth ──────────────────────────────────────────────────────


def validate_api_key(x_api_key: str | None = Header(None, alias="X-API-Key")) -> None:
    """Validate the X-API-Key header against CATALOG_API_KEY."""
    if not CATALOG_API_KEY or x_api_key != CATALOG_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing API key"
        )


ApiKeyDep = Annotated[None, Depends(validate_api_key)]


def get_admin_or_api_key(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)] = None,
    request: Request = None,
    session: SessionDep = None,
) -> User | None:
    """Accept either a valid X-API-Key header or a valid admin Bearer JWT.

    Returns None when authenticated via API key, or the admin User when authenticated via JWT.
    """
    if x_api_key is not None:
        if CATALOG_API_KEY and x_api_key == CATALOG_API_KEY:
            return None  # authenticated via API key; no User object
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    # JWT admin path
    token = _extract_token(credentials, request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    user_code = decode_token(token)
    if not user_code:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    user = store.get_user_by_code(user_code, session)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


AdminOrApiKeyDep = Annotated[User | None, Depends(get_admin_or_api_key)]

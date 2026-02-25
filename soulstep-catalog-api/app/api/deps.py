from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

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

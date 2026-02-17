from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_token
from app.db import store
from app.db.session import SessionDep

security = HTTPBearer(auto_error=False)


def get_current_user_code(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)],
) -> str:
    token = credentials.credentials if credentials is not None else None
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    user_code = decode_token(token)
    if not user_code:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return user_code


def get_current_user(
    user_code: Annotated[str, Depends(get_current_user_code)],
    session: SessionDep,
):
    user = store.get_user_by_code(user_code, session)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def get_optional_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)],
    session: SessionDep,
):
    """Return current user if valid Bearer token present, else None."""
    token = credentials.credentials if credentials is not None else None
    if not token:
        return None
    user_code = decode_token(token)
    if not user_code:
        return None
    return store.get_user_by_code(user_code, session)

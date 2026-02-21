import logging
import secrets
from datetime import UTC, datetime, timedelta

import resend
from fastapi import APIRouter, HTTPException, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import RESEND_API_KEY, RESEND_FROM_EMAIL, RESET_URL_BASE
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.db import store
from app.db.session import SessionDep
from app.models.schemas import (
    AuthResponse,
    ForgotPasswordBody,
    LoginBody,
    RegisterBody,
    ResetPasswordBody,
    UserResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# ─── helpers ──────────────────────────────────────────────────────────────────

_REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60  # 30 days in seconds


def _to_public_user(user, session) -> UserResponse:
    settings = store.get_user_settings(user.user_code, session)
    religions = settings.get("religions", [])
    return UserResponse(
        user_code=user.user_code,
        email=user.email,
        display_name=user.display_name,
        religions=religions,
        created_at=user.created_at.isoformat().replace("+00:00", "Z"),
        updated_at=user.updated_at.isoformat().replace("+00:00", "Z"),
    )


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=_REFRESH_COOKIE_MAX_AGE,
        path="/api/v1/auth",
    )


def _send_reset_email(to_email: str, reset_token: str) -> None:
    """Send password-reset email via Resend.com. Falls back to console in dev."""
    reset_link = f"{RESET_URL_BASE}/reset-password?token={reset_token}"

    if not RESEND_API_KEY:
        # Development fallback – never log tokens in production
        logger.debug("[DEV] Password reset link for %s: %s", to_email, reset_link)
        return

    resend.api_key = RESEND_API_KEY
    try:
        resend.Emails.send(
            {
                "from": RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": "Reset your Pilgrimage Tracker password",
                "html": (
                    "<p>You requested a password reset for your Pilgrimage Tracker account.</p>"
                    f"<p><a href='{reset_link}'>Click here to reset your password</a></p>"
                    "<p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>"
                ),
            }
        )
    except Exception as exc:
        # Log but don't surface internal details to the caller
        logger.error("Failed to send password reset email to %s: %s", to_email, exc)


# ─── routes ───────────────────────────────────────────────────────────────────


@router.post(
    "/register",
    response_model=AuthResponse,
    summary="Register a new user",
    responses={
        400: {"description": "Email already registered"},
        422: {"description": "Validation error — weak password or missing fields"},
        429: {"description": "Rate limit exceeded (3 requests/minute per IP)"},
    },
)
@limiter.limit("3/minute")
def register(request: Request, body: RegisterBody, session: SessionDep):
    """
    Create a new user account.

    - **email**: must be unique
    - **password**: minimum 8 characters with at least one uppercase letter, one lowercase letter, and one digit
    - **display_name**: optional; defaults to the email prefix
    - **visitor_code**: optional; merges anonymous visitor settings into the new account
    """
    if store.get_user_by_email(body.email, session):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_code = "usr_" + secrets.token_hex(8)
    password_hash = hash_password(body.password)
    display_name = (body.display_name or body.email.split("@")[0]).strip()
    user = store.create_user(
        user_code=user_code,
        email=body.email.strip().lower(),
        password_hash=password_hash,
        display_name=display_name,
        religion=None,
        session=session,
    )
    if body.visitor_code:
        try:
            store.merge_visitor_into_user(body.visitor_code, user_code, session)
        except Exception as exc:
            logger.warning("Visitor merge failed during register: %s", exc, exc_info=True)
    access_token = create_access_token(user_code)
    refresh = create_refresh_token(user_code)
    store.save_refresh_token(refresh, user_code, session)
    payload = AuthResponse(user=_to_public_user(user, session), token=access_token)
    resp = Response(content=payload.model_dump_json(), media_type="application/json")
    _set_refresh_cookie(resp, refresh)
    return resp


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Log in with email and password",
    responses={
        401: {"description": "Invalid credentials"},
        429: {"description": "Rate limit exceeded (5 requests/minute per IP)"},
    },
)
@limiter.limit("5/minute")
def login(request: Request, body: LoginBody, session: SessionDep):
    """
    Authenticate and receive an access token.

    Returns a short-lived **access token** (Bearer) in the JSON body and a long-lived
    **refresh token** in an HTTP-only `SameSite=Strict` cookie.
    """
    user = store.get_user_by_email(body.email, session)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if body.visitor_code:
        try:
            store.merge_visitor_into_user(body.visitor_code, user.user_code, session)
        except Exception as exc:
            logger.warning("Visitor merge failed during login: %s", exc, exc_info=True)
    access_token = create_access_token(user.user_code)
    refresh = create_refresh_token(user.user_code)
    store.save_refresh_token(refresh, user.user_code, session)
    payload = AuthResponse(user=_to_public_user(user, session), token=access_token)
    resp = Response(content=payload.model_dump_json(), media_type="application/json")
    _set_refresh_cookie(resp, refresh)
    return resp


@router.post("/refresh")
def refresh_token(request: Request, session: SessionDep):
    """Issue a new access token using the refresh token stored in an HTTP-only cookie."""
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Missing refresh token")

    user_code = store.consume_refresh_token(token, session)
    if not user_code:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    new_access = create_access_token(user_code)
    new_refresh = create_refresh_token(user_code)
    store.save_refresh_token(new_refresh, user_code, session)

    resp = Response(
        content=f'{{"token":"{new_access}"}}',
        media_type="application/json",
    )
    _set_refresh_cookie(resp, new_refresh)
    return resp


@router.post("/logout")
def logout(request: Request, session: SessionDep):
    """Revoke the refresh token and clear the cookie."""
    token = request.cookies.get("refresh_token")
    if token:
        store.revoke_refresh_token(token, session)
    resp = Response(content='{"ok":true}', media_type="application/json")
    resp.delete_cookie(key="refresh_token", path="/api/v1/auth")
    return resp


@router.post(
    "/forgot-password",
    summary="Request a password-reset email",
    responses={
        429: {"description": "Rate limit exceeded (2 requests/minute per IP)"},
    },
)
@limiter.limit("2/minute")
def forgot_password(request: Request, body: ForgotPasswordBody, session: SessionDep):
    """
    Send a password-reset link to the given email address.

    Always returns a success response — even when the email is not registered —
    to avoid leaking information about registered accounts.
    The reset link is valid for 1 hour.
    """
    user = store.get_user_by_email(body.email, session)
    if not user:
        return {"ok": True, "message": "If an account exists, you will receive a reset link."}
    token = secrets.token_hex(32)
    expires_at = datetime.now(UTC) + timedelta(hours=1)
    store.save_password_reset(token, user.user_code, expires_at, session)
    _send_reset_email(user.email, token)
    return {"ok": True, "message": "If an account exists, you will receive a reset link."}


@router.post(
    "/reset-password",
    summary="Reset password using a token from email",
    responses={
        400: {"description": "Invalid or expired token"},
        422: {"description": "Validation error — password does not meet strength requirements"},
    },
)
def reset_password(body: ResetPasswordBody, session: SessionDep):
    """
    Reset a user's password.

    Consumes the single-use token from the password-reset email.
    The new password must meet the same strength requirements as registration.
    """
    user_code = store.consume_password_reset(body.token, session)
    if not user_code:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    user = store.get_user_by_code(user_code, session)
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    store.update_user_password(user.user_code, hash_password(body.newPassword), session)
    return {"ok": True}


@router.get("/field-rules")
def field_rules():
    """Return registration field validation rules for client-side display and hint generation."""
    return {
        "fields": [
            {
                "name": "email",
                "required": True,
                "rules": [],
            },
            {
                "name": "password",
                "required": True,
                "rules": [
                    {"type": "min_length", "value": 8},
                    {"type": "require_uppercase"},
                    {"type": "require_lowercase"},
                    {"type": "require_digit"},
                ],
            },
            {
                "name": "display_name",
                "required": False,
                "rules": [],
            },
        ]
    }

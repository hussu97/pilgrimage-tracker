import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException

from app.core.security import hash_password, verify_password, create_access_token
from app.db import store
from app.models.schemas import (
    RegisterBody,
    LoginBody,
    ForgotPasswordBody,
    ResetPasswordBody,
    AuthResponse,
    UserResponse,
)

router = APIRouter()


def _to_public_user(user) -> UserResponse:
    settings = store.get_user_settings(user.user_code)
    religions = settings.get("religions", [])
    return UserResponse(
        user_code=user.user_code,
        email=user.email,
        display_name=user.display_name,
        religions=religions,
        created_at=user.created_at.isoformat() + "Z",
        updated_at=user.updated_at.isoformat() + "Z",
    )


@router.post("/register", response_model=AuthResponse)
def register(body: RegisterBody):
    if store.get_user_by_email(body.email):
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
    )
    token = create_access_token(user_code)
    return AuthResponse(user=_to_public_user(user), token=token)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginBody):
    user = store.get_user_by_email(body.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user.user_code)
    return AuthResponse(user=_to_public_user(user), token=token)


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordBody):
    user = store.get_user_by_email(body.email)
    if not user:
        return {"ok": True, "message": "If an account exists, you will receive a reset link."}
    token = secrets.token_hex(32)
    expires_at = datetime.utcnow() + timedelta(hours=1)
    store.save_password_reset(token, user.user_code, expires_at)

    # TODO: Implement email dispatch for password reset
    # Integrate with an email service (SendGrid, AWS SES, etc.) to send reset link:
    # reset_link = f"{FRONTEND_URL}/reset-password?token={token}"
    # send_email(to=user.email, subject="Password Reset", body=f"Click here: {reset_link}")
    # Do not log tokens or emails in production.

    return {"ok": True, "message": "If an account exists, you will receive a reset link."}


@router.post("/reset-password")
def reset_password(body: ResetPasswordBody):
    user_code = store.consume_password_reset(body.token)
    if not user_code:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    user = store.get_user_by_code(user_code)
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    user.password_hash = hash_password(body.newPassword)
    return {"ok": True}

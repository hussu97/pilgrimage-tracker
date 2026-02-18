import secrets

from fastapi import APIRouter, HTTPException

from app.db import store
from app.db.session import SessionDep
from app.models.schemas import VisitorResponse, VisitorSettingsBody, VisitorSettingsResponse

router = APIRouter()


@router.post("", response_model=VisitorResponse)
def create_visitor(session: SessionDep):
    """Create a new anonymous visitor identity. No auth required."""
    visitor_code = "vis_" + secrets.token_hex(8)
    visitor = store.create_visitor(visitor_code, session)
    return VisitorResponse(
        visitor_code=visitor.visitor_code,
        created_at=visitor.created_at.isoformat() + "Z",
    )


@router.get("/{visitor_code}/settings", response_model=VisitorSettingsResponse)
def get_visitor_settings(visitor_code: str, session: SessionDep):
    """Retrieve settings for an anonymous visitor. No auth required."""
    visitor = store.get_visitor(visitor_code, session)
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")
    store.touch_visitor(visitor_code, session)
    settings = store.get_visitor_settings(visitor_code, session)
    return VisitorSettingsResponse(**settings)


@router.patch("/{visitor_code}/settings", response_model=VisitorSettingsResponse)
def update_visitor_settings(visitor_code: str, body: VisitorSettingsBody, session: SessionDep):
    """Update settings for an anonymous visitor. No auth required."""
    visitor = store.get_visitor(visitor_code, session)
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")
    updated = store.update_visitor_settings(
        visitor_code,
        session,
        theme=body.theme,
        units=body.units,
        language=body.language,
        religions=body.religions,
    )
    return VisitorSettingsResponse(**updated)

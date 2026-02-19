"""Social sharing endpoint — returns HTML with Open Graph meta tags."""

import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from app.db import place_images
from app.db import places as places_db
from app.db import reviews as reviews_db
from app.db.session import SessionDep

router = APIRouter()

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")


def _escape_html(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#x27;")
    )


@router.get("/places/{place_code}", response_class=HTMLResponse, tags=["share"])
def share_place(place_code: str, session: SessionDep):
    """Return an HTML page with OG meta tags for social sharing, then redirect to the SPA."""
    place = places_db.get_place_by_code(place_code, session)
    if place is None:
        raise HTTPException(status_code=404, detail="Place not found")

    images = place_images.get_images(place_code, session)
    first_image_url = images[0]["url"] if images else ""

    rating_data = reviews_db.get_aggregate_rating(place_code, session)
    rating_str = f"⭐ {rating_data['average']:.1f} · " if rating_data else ""

    description_snippet = ""
    if place.description:
        description_snippet = place.description[:200] + (
            "…" if len(place.description) > 200 else ""
        )

    og_description = (
        f"{rating_str}{description_snippet}"
        if description_snippet
        else rating_str.removesuffix(" · ")
    )

    name = _escape_html(place.name)
    og_desc = _escape_html(og_description)
    place_url = f"{FRONTEND_URL}/places/{place_code}"
    image_url = _escape_html(first_image_url) if first_image_url else ""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>{name}</title>
  <meta property="og:title" content="{name}" />
  <meta property="og:description" content="{og_desc}" />
  <meta property="og:url" content="{_escape_html(place_url)}" />
  <meta property="og:type" content="website" />
  {"" if not image_url else f'<meta property="og:image" content="{image_url}" />'}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{name}" />
  <meta name="twitter:description" content="{og_desc}" />
  {"" if not image_url else f'<meta name="twitter:image" content="{image_url}" />'}
</head>
<body>
  <script>window.location.replace("{place_url}");</script>
  <a href="{_escape_html(place_url)}">View {name}</a>
</body>
</html>"""
    return HTMLResponse(content=html, status_code=200)

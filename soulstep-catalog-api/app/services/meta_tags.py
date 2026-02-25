"""Per-page meta tag generation.

Produces HTML meta tags (title, description, canonical, Open Graph, Twitter
Cards, hreflang) for place detail pages and the homepage.
"""

from __future__ import annotations

import html as _html
from typing import Any

from app.core.config import FRONTEND_URL as _FRONTEND_URL

_SUPPORTED_LANGS = ("en", "ar", "hi")


def build_place_meta_tags(
    place: Any,  # Place model instance
    seo: Any | None = None,  # PlaceSEO instance
    image_url: str | None = None,
    lang: str = "en",
) -> str:
    """Return an HTML string of <meta> / <link> tags for a place page."""
    # Canonical URL
    place_code = place.place_code
    slug = seo.slug if seo else None
    canonical = (
        f"{_FRONTEND_URL}/places/{place_code}/{slug}"
        if slug
        else f"{_FRONTEND_URL}/places/{place_code}"
    )

    title = (seo.seo_title if seo else None) or place.name
    description = (seo.meta_description if seo else None) or (
        place.description[:160] if place.description else f"Visit {place.name} on SoulStep."
    )
    og_image = (seo.og_image_url if seo else None) or image_url or ""

    # OG locale mapping
    og_locale_map = {"en": "en_US", "ar": "ar_AE", "hi": "hi_IN"}
    og_locale = og_locale_map.get(lang, "en_US")

    lines: list[str] = [
        f"  <title>{_html.escape(title)}</title>",
        f'  <meta name="description" content="{_html.escape(description)}" />',
        f'  <link rel="canonical" href="{_html.escape(canonical)}" />',
        # Open Graph
        '  <meta property="og:type" content="place" />',
        '  <meta property="og:site_name" content="SoulStep" />',
        f'  <meta property="og:title" content="{_html.escape(title)}" />',
        f'  <meta property="og:description" content="{_html.escape(description)}" />',
        f'  <meta property="og:url" content="{_html.escape(canonical)}" />',
        f'  <meta property="og:locale" content="{og_locale}" />',
    ]
    if og_image:
        lines += [
            f'  <meta property="og:image" content="{_html.escape(og_image)}" />',
            '  <meta property="og:image:width" content="1200" />',
            '  <meta property="og:image:height" content="630" />',
        ]
    # Twitter Cards
    lines += [
        '  <meta name="twitter:card" content="summary_large_image" />',
        f'  <meta name="twitter:title" content="{_html.escape(title)}" />',
        f'  <meta name="twitter:description" content="{_html.escape(description)}" />',
    ]
    if og_image:
        lines.append(f'  <meta name="twitter:image" content="{_html.escape(og_image)}" />')

    # hreflang alternates — each lang gets its own language-specific pre-render URL
    for alt_lang in _SUPPORTED_LANGS:
        if slug:
            alt_url = f"{_FRONTEND_URL}/share/{alt_lang}/places/{place_code}/{slug}"
        else:
            alt_url = f"{_FRONTEND_URL}/share/{alt_lang}/places/{place_code}"
        lines.append(
            f'  <link rel="alternate" hreflang="{alt_lang}" href="{_html.escape(alt_url)}" />'
        )
    lines.append(
        f'  <link rel="alternate" hreflang="x-default" href="{_html.escape(canonical)}" />'
    )

    return "\n".join(lines)

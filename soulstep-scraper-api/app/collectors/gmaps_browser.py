"""
BrowserGmapsCollector — fetches place details from Google Maps web pages.

Drop-in replacement for GmapsCollector when SCRAPER_BACKEND=browser.
Implements the same build_place_data() dict shape and fetch_details_split()
interface so all downstream pipeline stages (quality scoring, enrichment,
image download, sync) remain unchanged.
"""

from __future__ import annotations

import asyncio
import os
import random
import re
from typing import Any

from app.collectors.base import BaseCollector, CollectorResult
from app.logger import get_logger
from app.scrapers.gmaps import (
    clean_address,
    detect_religion_from_types,
    get_gmaps_type_to_our_type,
    normalize_to_24h,
)
from app.services.browser_pool import BlockedError, CircuitOpenError, get_maps_pool

logger = get_logger(__name__)

# JavaScript injected into place pages to extract all visible fields at once.
_EXTRACT_JS = r"""
() => {
    const result = {};

    // Name from h1
    const h1 = document.querySelector('h1');
    result.name = h1 ? h1.textContent.trim() : null;

    // Address button
    const addrBtn = document.querySelector('button[data-item-id="address"]');
    result.address = addrBtn ? addrBtn.textContent.trim() : null;

    // Coordinates from the current URL (Maps updates URL after load)
    const urlMatch = location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)\//);
    if (urlMatch) {
        result.lat = parseFloat(urlMatch[1]);
        result.lng = parseFloat(urlMatch[2]);
    }

    // Rating — [data-value][aria-label*="stars"] removed by Google; span[role="img"] is current
    const ratingEl =
        document.querySelector('span[role="img"][aria-label*="stars"]') ||
        document.querySelector('[data-value][aria-label*="stars"]');
    if (ratingEl) {
        const m = (ratingEl.getAttribute('aria-label') || '').match(/([\d.]+)/);
        result.rating = m ? parseFloat(m[1]) : null;
    }

    // Review count — span[aria-label*="reviews"] is the summary chip; button variant
    // matches the Reviews *tab* (empty text) so check span first, then parse aria-label.
    const revEl =
        document.querySelector('span[aria-label*="reviews"]') ||
        document.querySelector('button[aria-label*="reviews"]');
    if (revEl) {
        const t = (revEl.getAttribute('aria-label') || revEl.textContent || '').replace(/,/g, '');
        const m = t.match(/(\d+)/);
        result.review_count = m ? parseInt(m[1]) : null;
    }

    // Phone
    const phoneBtn = document.querySelector('button[data-item-id*="phone:tel:"]');
    result.phone = phoneBtn
        ? phoneBtn.getAttribute('data-item-id').replace('phone:tel:', '')
        : null;

    // Website
    const websiteLink = document.querySelector('a[data-item-id="authority"]');
    result.website = websiteLink ? websiteLink.getAttribute('href') : null;

    // Category chips
    const catBtns = document.querySelectorAll('button[jsaction*="category"]');
    result.categories = Array.from(catBtns)
        .map(b => b.textContent.trim())
        .filter(Boolean);

    // Business status — permanently closed banner
    const closedEl =
        document.querySelector('[aria-label*="Permanently closed"]') ||
        document.querySelector('.aMpTdf');
    result.business_status = closedEl ? 'PERMANENTLY_CLOSED' : 'OPERATIONAL';

    // Photo URLs — from the hero/carousel images (up to 5)
    const photoImgs = document.querySelectorAll(
        'button[data-photo-index] img, .gallery-cell img, [jsaction*="photo"] img'
    );
    result.photo_urls = Array.from(photoImgs)
        .slice(0, 5)
        .map(img => img.src || img.getAttribute('src'))
        .filter(src => src && src.startsWith('http') && !src.includes('data:'));

    // Google Maps URI (current URL without query params)
    result.google_maps_uri = location.href.split('?')[0];

    // Canonical ChIJ place ID — Google redirects strip !19s from location.href, so
    // search the full page HTML where !19s(ChIJ...) is still embedded.
    const pidMatch = document.documentElement.innerHTML.match(/!19s(ChIJ[a-zA-Z0-9_-]+)/);
    result.place_id = pidMatch ? pidMatch[1] : null;

    return result;
}
"""

_EXTRACT_ABOUT_JS = r"""
() => {
    // Extract all section headings and their checkmark items from the About tab.
    // Maps renders sections like "Accessibility", "Service options", "Amenities".
    const sections = {};
    const headers = document.querySelectorAll('.iP2t7d, .fontTitleSmall');
    headers.forEach(header => {
        const sectionName = header.textContent.trim()
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z_]/g, '');
        if (!sectionName) return;

        const container = header.closest('[class*="section"]') || header.parentElement;
        if (!container) return;

        const items = container.querySelectorAll('[aria-label]');
        const sectionItems = {};
        items.forEach(item => {
            const label = (item.getAttribute('aria-label') || item.textContent || '').trim();
            if (!label) return;
            const key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '');
            const checked =
                item.getAttribute('data-is-checked') === 'true' ||
                item.querySelector('[aria-checked="true"]') !== null ||
                item.classList.contains('positive-item');
            sectionItems[key] = checked;
        });
        if (Object.keys(sectionItems).length > 0) {
            sections[sectionName] = sectionItems;
        }
    });
    return sections;
}
"""


def _parse_address_components(address: str | None) -> tuple[str | None, str | None, str | None]:
    """Parse city/state/country from comma-delimited address string.

    Heuristic: last segment = country, second-to-last = state/region,
    third-to-last (if 4+ parts) = city.
    """
    if not address:
        return None, None, None
    parts = [p.strip() for p in address.split(",") if p.strip()]
    n = len(parts)
    if n == 0:
        return None, None, None
    country = parts[-1] if n >= 1 else None
    state = parts[-2] if n >= 3 else None
    city = parts[-3] if n >= 4 else (parts[-2] if n == 2 else None)
    return city, state, country


def _clean_image_url(url: str | None) -> str | None:
    """Normalise a Google Maps image URL to a usable CDN URL."""
    if not url or not url.startswith("http"):
        return None
    # Strip stale size params and set a reasonable resolution
    if "=s" in url or "=w" in url:
        base = url.split("=")[0]
        return f"{base}=w800-h600"
    return url


def _parse_hours_rows(rows: list[str]) -> dict[str, str]:
    """Parse flat list of hours rows into a weekly schedule dict.

    Maps returns table cells as: ["Monday", "9:00 AM – 6:00 PM", "Tuesday", ...]
    or "Monday: 9:00 AM – 6:00 PM" single-string format.
    """
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    schedule = dict.fromkeys(days, "Hours not available")

    if not rows:
        return schedule

    i = 0
    while i < len(rows):
        row = rows[i].strip().rstrip(":")

        if row in days and i + 1 < len(rows):
            schedule[row] = normalize_to_24h(rows[i + 1].strip())
            i += 2
            continue

        # "Monday: 9:00 AM – 6:00 PM" format
        for day in days:
            if rows[i].startswith(day + ":"):
                parts = rows[i].split(":", 1)
                if len(parts) == 2:
                    schedule[day] = normalize_to_24h(parts[1].strip())
                break

        i += 1

    return schedule


def _get_utc_offset(lat: float, lng: float) -> int | None:
    """Calculate UTC offset in minutes from coordinates using timezonefinder."""
    try:
        from datetime import datetime
        from zoneinfo import ZoneInfo

        from timezonefinder import TimezoneFinder

        tf = TimezoneFinder()
        tz_name = tf.timezone_at(lat=lat, lng=lng)
        if tz_name:
            offset = datetime.now(ZoneInfo(tz_name)).utcoffset()
            if offset is not None:
                return int(offset.total_seconds() / 60)
    except Exception:
        pass

    # Fall back to SCRAPER_TIMEZONE env var
    scraper_tz = os.environ.get("SCRAPER_TIMEZONE")
    if scraper_tz:
        try:
            from datetime import datetime
            from zoneinfo import ZoneInfo

            return int(datetime.now(ZoneInfo(scraper_tz)).utcoffset().total_seconds() / 60)
        except Exception:
            pass

    return None


class BrowserGmapsCollector(BaseCollector):
    """Fetches place details from Google Maps web pages using Playwright.

    Implements the same interface as GmapsCollector — fetch_details_split() and
    build_place_data() — so it can be used as a drop-in by fetch_place_details()
    in scrapers/gmaps.py without any changes to the calling code.
    """

    name = "gmaps_browser"
    requires_api_key = False
    api_key_env_var = ""

    def is_available(self) -> bool:
        return True  # No API key required

    async def collect(
        self,
        place_code: str,
        lat: float,
        lng: float,
        name: str,
        existing_data: dict[str, Any] | None = None,
    ) -> CollectorResult:
        """Fetch place data from Google Maps web page."""
        if place_code.startswith("gplc_"):
            place_id = place_code[5:]
        elif place_code.startswith("gbr_"):
            place_id = place_code[4:]
        else:
            return self._skip_result(f"Unknown place_code format: {place_code}")

        try:
            raw = await self._navigate_and_extract(place_id)
            result = self._extract_collector_result(raw, place_code)
            result.raw_response = raw
            return result
        except Exception as e:
            return self._fail_result(str(e))

    async def fetch_details_split(
        self,
        place_name: str,
        api_key: str,
        rate_limiter: Any,
        client: Any,
    ) -> dict:
        """Navigate to the Maps place page and return extracted data dict.

        Matches the signature expected by fetch_place_details() in scrapers/gmaps.py.
        The returned dict is used as 'response' in build_place_data().

        place_name format: "places/ChIJxxx" or "places/0x{hex}:0x{hex}"
        """
        place_id = place_name[7:] if place_name.startswith("places/") else place_name

        # Rate-limit browser navigations (5-8s between pages per context)
        await asyncio.sleep(random.uniform(5, 8))

        return await self._navigate_and_extract(place_id)

    async def _navigate_and_extract(self, place_id: str) -> dict:
        """Navigate to the place page and extract all data via evaluate()."""
        pool = get_maps_pool()
        session = await pool.acquire()
        recycle = False

        try:
            page = session.page

            # Build navigation URL based on ID format
            if place_id.startswith("0x") or (":" in place_id and "0x" in place_id.lower()):
                # Hex CID pair — navigate directly to the encoded URL
                nav_url = (
                    f"https://www.google.com/maps/place/?q=" f"{place_id.replace(':', '%3A')}&hl=en"
                )
            else:
                # ChIJ format — use canonical place_id URL
                nav_url = f"https://www.google.com/maps/place/?q=place_id:{place_id}&hl=en"

            await page.goto(nav_url, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(random.uniform(2, 4))

            # Check for blocks
            from app.scrapers.gmaps_browser import _check_for_block

            if await _check_for_block(page):
                logger.warning("Maps blocked during detail extraction for %s", place_id)
                pool.record_block()
                recycle = True
                raise BlockedError(f"Maps blocked for place {place_id}")

            pool.record_success()

            # Wait for the place detail panel
            try:
                await page.wait_for_selector(
                    "h1, button[data-item-id='address']",
                    timeout=15000,
                )
            except Exception:
                logger.debug("Detail panel not fully loaded for %s", place_id)

            # Main extraction
            data = await page.evaluate(_EXTRACT_JS)
            if not isinstance(data, dict):
                data = {}

            # Extract opening hours
            data["opening_hours_weekday"] = await self._extract_hours(page)

            # Extract About tab (accessibility, amenities, etc.)
            data["about_sections"] = await self._extract_about(page)

            # Extract reviews (up to 5)
            data["reviews"] = await self._extract_reviews(page)

            session.nav_count += 1

            # Capture canonical place ID from the updated URL
            current_url = page.url
            canonical_match = re.search(r"!1s(ChIJ[a-zA-Z0-9_-]+)", current_url)
            if canonical_match:
                data["canonical_place_id"] = canonical_match.group(1)

            logger.debug(
                "Browser extracted %s: name=%r lat=%.4f lng=%.4f",
                place_id,
                data.get("name"),
                data.get("lat") or 0,
                data.get("lng") or 0,
            )

            # Capture images from the browser context (avoids separate download phase)
            try:
                from app.config import settings as _cfg

                data["_image_bytes"] = await self._capture_page_images(page, _cfg.max_photos)
            except Exception:
                data["_image_bytes"] = []

            return data

        except (BlockedError, CircuitOpenError):
            raise
        except Exception as e:
            logger.warning("Browser extraction failed for %s: %s", place_id, e)
            recycle = True
            raise
        finally:
            await pool.release(session, recycle=recycle)

    async def _extract_hours(self, page) -> list[str]:
        """Click the hours section and return weekday description rows."""
        try:
            hours_btn = await page.query_selector(
                "[data-section-id='oh'] button[aria-expanded='false'], "
                "[aria-label*='Hours'] button"
            )
            if hours_btn:
                await hours_btn.click()
                await asyncio.sleep(0.5)

            rows = await page.evaluate(
                r"""
                () => {
                    const cells = document.querySelectorAll(
                        '[data-section-id="oh"] td, tr.WgFkxc td, .y0skZc td'
                    );
                    return Array.from(cells).map(c => c.textContent.trim()).filter(Boolean);
                }
                """
            )
            return rows if isinstance(rows, list) else []
        except Exception:
            return []

    async def _extract_about(self, page) -> dict:
        """Click the About tab and return all amenity sections as a dict."""
        try:
            about_tab = await page.query_selector(
                "button[aria-label='About'], [data-tab-id='About']"
            )
            if about_tab:
                await about_tab.click()
                await asyncio.sleep(1.0)

            result = await page.evaluate(_EXTRACT_ABOUT_JS)
            return result if isinstance(result, dict) else {}
        except Exception:
            return {}

    async def _extract_reviews(self, page) -> list[dict]:
        """Navigate to Reviews tab and extract up to 5 reviews."""
        try:
            reviews_tab = await page.query_selector(
                "button[aria-label*='Reviews'], [data-tab-id='Reviews']"
            )
            if reviews_tab:
                await reviews_tab.click()
                await asyncio.sleep(1.5)

            reviews = await page.evaluate(
                r"""
                () => {
                    const cards = document.querySelectorAll(
                        '[data-review-id], .jftiEf, .MyEned'
                    );
                    return Array.from(cards).slice(0, 5).map(card => {
                        const author = card.querySelector('.d4r55, .DU9Pgb, .WNxzHc');
                        const ratingEl = card.querySelector('[aria-label*="stars"]');
                        const textEl = card.querySelector('.wiI7pd, .MyEned span');
                        const timeEl = card.querySelector('.rsqaWe, .dehysf');

                        const ratingMatch = ratingEl
                            ? (ratingEl.getAttribute('aria-label') || '').match(/([\d.]+)/)
                            : null;

                        return {
                            author_name: author ? author.textContent.trim() : 'Anonymous',
                            rating: ratingMatch ? parseFloat(ratingMatch[1]) : 4,
                            text: textEl ? textEl.textContent.trim() : '',
                            time: Math.floor(Date.now() / 1000),
                            relative_time_description: timeEl ? timeEl.textContent.trim() : '',
                            language: 'en',
                        };
                    }).filter(r => r.text);
                }
                """
            )
            return reviews if isinstance(reviews, list) else []
        except Exception:
            return []

    async def _capture_page_images(self, page, max_photos: int) -> list[bytes]:
        """Capture image bytes loaded on the current page from Google photo CDN.

        Uses page.evaluate() to re-fetch the top N photo CDN URLs that the browser
        has already loaded, then returns raw bytes. Called after page has settled.
        """
        from app.config import settings as _settings

        n = max_photos or _settings.max_photos

        try:
            # Collect src attributes of images matching Google's photo CDN pattern
            raw_urls: list[str] = await page.evaluate(
                r"""(n) => {
                    const imgs = Array.from(document.querySelectorAll('img'));
                    const seen = new Set();
                    const results = [];
                    for (const img of imgs) {
                        const src = img.src || img.dataset.src || '';
                        if (
                            !seen.has(src) &&
                            src &&
                            (src.includes('lh3.googleusercontent.com') ||
                             src.includes('maps.googleapis.com/maps/api/place/photo')) &&
                            img.naturalWidth > 100 &&
                            img.naturalHeight > 100
                        ) {
                            seen.add(src);
                            results.push(src);
                            if (results.length >= n) break;
                        }
                    }
                    return results;
                }""",
                n,
            )
        except Exception:
            raw_urls = []

        if not raw_urls:
            return []

        # Re-fetch each URL from within the browser context (already authenticated/cookied)
        blobs: list[bytes] = []
        for url in raw_urls[:n]:
            try:
                b64: str | None = await page.evaluate(
                    r"""async (url) => {
                        try {
                            const resp = await fetch(url, {cache: 'force-cache'});
                            if (!resp.ok) return null;
                            const buf = await resp.arrayBuffer();
                            let binary = '';
                            const bytes = new Uint8Array(buf);
                            for (let i = 0; i < bytes.byteLength; i++) {
                                binary += String.fromCharCode(bytes[i]);
                            }
                            return btoa(binary);
                        } catch(e) { return null; }
                    }""",
                    url,
                )
                if b64:
                    import base64

                    raw = base64.b64decode(b64)
                    if len(raw) > 2048:  # > 2 KB → real photo, not icon
                        blobs.append(raw)
            except Exception:
                pass

        return blobs

    def _extract_collector_result(self, raw: dict, place_code: str) -> CollectorResult:
        """Convert raw browser data into a CollectorResult."""
        result = CollectorResult(collector_name=self.name)

        if raw.get("phone"):
            result.contact["phone_national"] = raw["phone"]
        if raw.get("website"):
            result.contact["website"] = raw["website"]
        if raw.get("google_maps_uri"):
            result.contact["google_maps_url"] = raw["google_maps_uri"]

        if raw.get("rating") is not None:
            result.attributes.append({"attribute_code": "rating", "value": raw["rating"]})
        if raw.get("review_count") is not None:
            result.attributes.append(
                {"attribute_code": "reviews_count", "value": raw["review_count"]}
            )

        # About tab amenity attributes
        for section_name, items in (raw.get("about_sections") or {}).items():
            if isinstance(items, dict):
                for item_key, value in items.items():
                    result.attributes.append(
                        {
                            "attribute_code": f"about_{section_name}_{item_key}",
                            "value": value,
                        }
                    )

        for url in raw.get("photo_urls") or []:
            cleaned = _clean_image_url(url)
            if cleaned:
                result.images.append({"url": cleaned, "source": "gmaps_browser"})

        result.reviews = raw.get("reviews") or []
        result.entity_types = raw.get("categories") or []

        return result

    def build_place_data(
        self,
        response: dict,
        place_code: str,
        api_key: str,
        session: Any,
        *,
        type_map: dict[str, str] | None = None,
        religion_type_map: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """
        Build the full place_data dict from browser-extracted data.

        Produces the same structure as GmapsCollector.build_place_data() so all
        downstream pipeline stages (quality scoring, enrichment, sync) are unchanged.

        When canonical_place_id is present in response (extracted from the URL
        after navigation), the place_code is upgraded to the gplc_ format so
        browser-discovered places share the same code space as API-discovered ones.
        """
        from app.config import settings as _settings

        # Upgrade place_code to canonical gplc_ if we captured the ChIJ ID
        canonical_id = response.get("canonical_place_id")
        if place_code.startswith("gplc_"):
            place_id = place_code[5:]
        elif place_code.startswith("gbr_"):
            place_id = place_code[4:]
        else:
            place_id = place_code

        if canonical_id:
            place_id = canonical_id
            place_code = f"gplc_{canonical_id}"

        # Determine gmaps_types from category text
        categories = response.get("categories") or []
        gmaps_types = [c.lower().replace(" ", "_") for c in categories]

        # Detect religion
        religion: str | None = None
        if religion_type_map is not None:
            for gtype in gmaps_types:
                if gtype in religion_type_map:
                    religion = religion_type_map[gtype]
                    break
        elif session is not None:
            religion = detect_religion_from_types(session, gmaps_types)

        if not religion:
            # Fallback: infer from category text keywords
            category_text = " ".join(categories).lower()
            if any(w in category_text for w in ["mosque", "masjid", "islamic"]):
                religion = "islam"
            elif any(w in category_text for w in ["church", "chapel", "cathedral"]):
                religion = "christianity"
            elif any(w in category_text for w in ["temple", "mandir", "hindu"]):
                religion = "hinduism"
            elif any(w in category_text for w in ["synagogue", "jewish"]):
                religion = "judaism"
            elif any(w in category_text for w in ["gurdwara", "sikh"]):
                religion = "sikhism"
            elif any(w in category_text for w in ["buddhist", "pagoda", "vihara"]):
                religion = "buddhism"
            else:
                religion = "unknown"

        # Determine place type name
        place_type_name = "place of worship"
        gmaps_type_map = (
            type_map
            if type_map is not None
            else (get_gmaps_type_to_our_type(session) if session else {})
        )
        for gtype in gmaps_types:
            if gtype in gmaps_type_map:
                place_type_name = gmaps_type_map[gtype]
                break

        # Address and location
        address = clean_address(response.get("address") or "")
        city, state, country = _parse_address_components(address)
        lat = response.get("lat") or 0.0
        lng = response.get("lng") or 0.0

        description = (
            f"A {place_type_name} located in {address}." if address else f"A {place_type_name}."
        )

        # Opening hours
        weekday_rows = response.get("opening_hours_weekday") or []
        opening_hours = _parse_hours_rows(weekday_rows)

        # UTC offset via timezonefinder
        utc_offset_minutes = _get_utc_offset(lat, lng)

        # Attributes
        attributes: list[dict[str, Any]] = []
        if response.get("rating") is not None:
            attributes.append({"attribute_code": "rating", "value": response["rating"]})
        if response.get("review_count") is not None:
            attributes.append(
                {"attribute_code": "reviews_count", "value": response["review_count"]}
            )
        if response.get("phone"):
            attributes.append({"attribute_code": "phone_national", "value": response["phone"]})
        if response.get("google_maps_uri"):
            attributes.append(
                {"attribute_code": "google_maps_url", "value": response["google_maps_uri"]}
            )

        for section_name, items in (response.get("about_sections") or {}).items():
            if isinstance(items, dict):
                for item_key, value in items.items():
                    attributes.append(
                        {
                            "attribute_code": f"about_{section_name}_{item_key}",
                            "value": value,
                        }
                    )

        # Image URLs (from browser photo carousel, capped by max_photos)
        raw_urls = (response.get("photo_urls") or [])[: _settings.max_photos]
        photo_urls = [u for u in (_clean_image_url(u) for u in raw_urls) if u]

        return {
            "place_code": place_code,
            "name": response.get("name") or "Unknown",
            "religion": religion,
            "place_type": place_type_name,
            "lat": lat,
            "lng": lng,
            "address": address,
            "image_urls": photo_urls,
            "image_blobs": [],
            "description": description,
            "website_url": response.get("website") or "",
            "opening_hours": opening_hours,
            "utc_offset_minutes": utc_offset_minutes,
            "attributes": attributes,
            "external_reviews": response.get("reviews") or [],
            "city": city,
            "state": state,
            "country": country,
            "source": "gmaps_browser",
            "vicinity": address,
            "business_status": response.get("business_status") or "OPERATIONAL",
            "google_place_id": place_id,
            # Quality scoring helpers (same keys as GmapsCollector.build_place_data)
            "rating": response.get("rating"),
            "user_rating_count": response.get("review_count"),
            "has_editorial": False,  # No editorial summary from browser; enrichment fills it
            "gmaps_types": gmaps_types,
        }

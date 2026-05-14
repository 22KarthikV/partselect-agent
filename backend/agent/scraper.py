"""Live scraper for PartSelect.com product pages.

Public API:
  scrape_part(ps_number)     — fetch part detail page, return normalized dict
  scrape_model_page(model)   — fetch model page, return model + compatible PS numbers

Both functions are async and never raise — they return partial data with
error="scrape_failed" on any failure so callers can degrade gracefully.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Optional

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Firecrawl integration — bypasses Cloudflare JS challenge on PartSelect.com
# ---------------------------------------------------------------------------
_FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1/scrape"


async def _fetch_via_firecrawl(url: str, wait_for_ms: int = 2000) -> Optional[BeautifulSoup]:
    """Fetch a URL via the Firecrawl REST API, which handles JS rendering.

    Returns a BeautifulSoup object on success, None on any failure.
    If FIRECRAWL_API_KEY is not set, returns None immediately so the
    caller can fall through to the plain httpx method.
    """
    api_key = os.environ.get("FIRECRAWL_API_KEY", "")
    if not api_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                _FIRECRAWL_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "url": url,
                    "formats": ["html"],
                    "waitFor": wait_for_ms,
                    "timeout": 30000,
                },
            )
        if resp.status_code != 200:
            logger.warning("Firecrawl: HTTP %d for %s", resp.status_code, url)
            return None
        payload = resp.json()
        if not payload.get("success"):
            logger.warning("Firecrawl: success=false for %s — %s", url, payload.get("error", ""))
            return None
        html = payload.get("data", {}).get("html", "")
        if not html:
            logger.warning("Firecrawl: empty HTML for %s", url)
            return None
        logger.info("Firecrawl: successfully fetched %s (%d bytes)", url, len(html))
        return BeautifulSoup(html, "lxml")
    except Exception as exc:
        logger.warning("Firecrawl fetch error for %s: %s", url, exc)
        return None


_FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v1/search"


async def _find_canonical_part_url(numeric: str) -> Optional[str]:
    """Find the full canonical PartSelect slug URL for a PS part number.

    PartSelect part pages live at:
        /PS{number}-{Brand}-{MfrNumber}-{Description}.htm
    The short /PS{number}.htm form returns a 404.

    Strategy (in order):
    1. Firecrawl search API — returns the exact indexed URL for the part.
    2. Scrape PartSelect's own search results page as fallback.
    """
    api_key = os.environ.get("FIRECRAWL_API_KEY", "")

    # --- Strategy 1: Firecrawl search API ---
    if api_key:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    _FIRECRAWL_SEARCH_URL,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={"query": f"PS{numeric} partselect.com part", "limit": 5},
                )
            if resp.status_code == 200:
                for item in resp.json().get("data", []):
                    url = item.get("url", "")
                    # Strip tracking params (e.g. ?SourceCode=18)
                    url = url.split("?")[0]
                    if "partselect.com" in url and re.search(rf"PS{numeric}[^\d]", url) and url.endswith(".htm"):
                        logger.info("Firecrawl search: found canonical URL for PS%s → %s", numeric, url)
                        return url
            else:
                logger.warning("Firecrawl search: HTTP %d for PS%s", resp.status_code, numeric)
        except Exception as exc:
            logger.warning("Firecrawl search error for PS%s: %s", numeric, exc)

    # --- Strategy 2: Scrape PartSelect's search results page ---
    search_url = f"{_BASE_URL}/search.htm?searchTerm=PS{numeric}"
    soup = await _fetch_via_firecrawl(search_url, wait_for_ms=2000)
    if soup is None:
        soup = await _fetch_page(search_url)
    if soup:
        for a in soup.select("a[href]"):
            href = a.get("href", "").split("?")[0]
            if re.search(rf"/PS{numeric}[^\d]", href) and href.endswith(".htm"):
                canonical = href if href.startswith("http") else _BASE_URL + href
                logger.info("Scraper search page: found canonical URL for PS%s → %s", numeric, canonical)
                return canonical

    logger.warning("Scraper: could not find canonical URL for PS%s", numeric)
    return None

_BASE_URL = "https://www.partselect.com"

# Rotate through real browser User-Agent strings to reduce bot detection.
_USER_AGENTS = [
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) "
        "Gecko/20100101 Firefox/125.0"
    ),
]

def _build_headers(attempt: int = 0) -> dict:
    return {
        "User-Agent": _USER_AGENTS[attempt % len(_USER_AGENTS)],
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.google.com/",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
    }

_TIMEOUT = 15.0
_RATE_LIMIT = 1.5  # seconds between requests
_MAX_RETRIES = 2

_CATEGORY_KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (("ice maker", "ice mold"), "ice-maker"),
    (("door bin", "door shelf", "shelf bin"), "door-bins"),
    (("water filter",), "water-filter"),
    (("water inlet valve", "inlet valve"), "water-system"),
    (("drain pump",), "pump"),
    (("circulation pump", "wash pump"), "pump"),
    (("spray arm",), "spray-arm"),
    (("door gasket", "door seal", "tub gasket"), "door-seal"),
    (("heating element",), "heating-element"),
    (("control board", "main board"), "control-board"),
    (("door latch", "door lock"), "door-latch"),
    (("filter assembly", "filter screen", "filter basket"), "filter"),
    (("thermostat", "defrost thermostat"), "thermostat"),
    (("evaporator fan", "condenser fan", "fan motor"), "fan"),
    (("defrost heater", "defrost timer"), "defrost"),
    (("compressor start relay", "start relay"), "compressor"),
    (("shelf", "wire shelf", "glass shelf"), "shelf"),
    (("drawer", "crisper", "humidity drawer"), "drawer"),
    (("dispenser", "water dispenser"), "dispenser"),
    (("rack", "dish rack", "upper rack", "lower rack"), "rack"),
    (("drain hose", "fill hose", "inlet hose"), "hose"),
    (("door spring", "balance link", "door cable"), "door-spring"),
    (("detergent dispenser", "soap dispenser"), "dispenser"),
    (("float switch", "overflow switch"), "switch"),
    (("vent assembly", "vent fan"), "vent"),
    (("high limit thermostat",), "thermostat"),
    (("door hinge", "hinge pin"), "hinge"),
]


def _infer_category(name: str) -> str:
    name_lower = name.lower()
    for keywords, category in _CATEGORY_KEYWORDS:
        if any(kw in name_lower for kw in keywords):
            return category
    return "general"


def _infer_appliance_type(soup: BeautifulSoup, url: str, name: str) -> str:
    combined = (url + " " + name + " " + (soup.get_text(separator=" ")[:500])).lower()
    if "dishwasher" in combined:
        return "dishwasher"
    if "refrigerator" in combined or "fridge" in combined:
        return "refrigerator"
    return "unknown"


async def _fetch_page(url: str) -> Optional[BeautifulSoup]:
    """Fetch a URL with retry + rotating headers. Returns None on all failures."""
    for attempt in range(_MAX_RETRIES + 1):
        if attempt > 0:
            await asyncio.sleep(2.0 * attempt)
        try:
            async with httpx.AsyncClient(
                headers=_build_headers(attempt),
                follow_redirects=True,
                timeout=_TIMEOUT,
            ) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return BeautifulSoup(resp.text, "lxml")
                logger.warning(
                    "Scraper attempt %d: HTTP %d for %s", attempt + 1, resp.status_code, url
                )
        except Exception as exc:
            logger.warning("Scraper attempt %d: fetch error for %s: %s", attempt + 1, url, exc)
    return None


def _safe_text(tag) -> str:
    if tag is None:
        return ""
    return tag.get_text(separator=" ", strip=True)


def _parse_part_page(soup: BeautifulSoup, ps_number: str, final_url: str) -> dict:
    # --- Name ---
    name = ""
    for sel in ["h1.title-main", "h1", "[itemprop='name']"]:
        tag = soup.select_one(sel)
        if tag:
            name = _safe_text(tag)
            break

    # --- Price ---
    price = 0.0
    for sel in ["[itemprop='price']", ".js-partPrice", ".pd__price", ".price"]:
        tag = soup.select_one(sel)
        if tag:
            raw = tag.get("content") or _safe_text(tag)
            m = re.search(r"[\d,]+\.?\d*", raw.replace(",", ""))
            if m:
                try:
                    price = float(m.group())
                    break
                except ValueError:
                    pass
    if price == 0.0:
        m = re.search(r"\$\s*([\d,]+\.?\d*)", soup.get_text())
        if m:
            try:
                price = float(m.group(1).replace(",", ""))
            except ValueError:
                pass

    # --- In stock ---
    in_stock = False
    for sel in [".js-availability", "[itemprop='availability']", ".availability"]:
        tag = soup.select_one(sel)
        if tag:
            text = _safe_text(tag).lower()
            in_stock = "in stock" in text
            break
    if not in_stock:
        page_text = soup.get_text().lower()
        in_stock = bool(re.search(r"\bin\s+stock\b", page_text))

    # --- MFR number ---
    # PartSelect pages list the manufacturer part number in a definition-list style
    # block. We look for the label then grab its adjacent value. The value must look
    # like a real part number (all-caps + digits, no spaces) — this guards against
    # accidentally capturing descriptive text like "Manufactured by Whirlpool...".
    _MFR_NUMBER_RE = re.compile(r"^[A-Z0-9][A-Z0-9\-]{2,}$")
    mfr_number = ""

    # Strategy 1: structured data selectors
    for sel in ["[itemprop='mpn']", ".pd__partNumber--mfr", ".mfr-part-number"]:
        tag = soup.select_one(sel)
        if tag:
            candidate = _safe_text(tag).strip()
            if _MFR_NUMBER_RE.match(candidate):
                mfr_number = candidate
                break

    # Strategy 2: label + sibling pattern ("Manufacturer Part Number" → next element)
    if not mfr_number:
        mfr_label_re = re.compile(r"manufacturer\s+part\s+number", re.IGNORECASE)
        for tag in soup.find_all(string=mfr_label_re):
            parent = tag.parent
            if parent:
                sibling = parent.find_next_sibling()
                if sibling:
                    candidate = _safe_text(sibling).strip()
                    if _MFR_NUMBER_RE.match(candidate):
                        mfr_number = candidate
                        break

    # Strategy 3: extract from the canonical URL slug (PS{n}-{Brand}-{MfrNum}-{Desc}.htm)
    if not mfr_number:
        m = re.search(r"/PS\d+-[^-]+-([A-Z0-9][A-Z0-9\-]+)-", final_url)
        if m:
            mfr_number = m.group(1)

    # Strategy 4: broad page-text fallback
    if not mfr_number:
        m = re.search(r"(?:Mfr|Manufacturer)\s+Part\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]+)", soup.get_text(), re.IGNORECASE)
        if m:
            mfr_number = m.group(1).strip()

    # --- Description ---
    description = ""
    for sel in ["[itemprop='description']", ".pd__description", ".product-description", ".description"]:
        tag = soup.select_one(sel)
        if tag:
            description = _safe_text(tag)
            if len(description) > 20:
                break

    # --- Install steps ---
    install_steps: list[str] = []
    for sel in ["#installation-section ol li", ".pd__installation ol li", ".install-steps li"]:
        items = soup.select(sel)
        if items:
            install_steps = [_safe_text(li) for li in items if _safe_text(li)]
            break

    # --- Image URL ---
    # PartSelect uses lazy loading; the real URL may be in data-src / data-zoom-src
    # rather than src. Try targeted selectors first, then fall back to any CDN img.
    _IMG_ATTRS = ("src", "data-src", "data-zoom-src", "data-lazy-src", "content")
    _IMG_SELS = [
        ".pd__image img",
        "[itemprop='image']",
        ".product-image img",
        "#main-image",
        ".img-main",
        ".js-ProductImages img",
        "img.pd__image",
    ]
    image_url = ""
    for sel in _IMG_SELS:
        tag = soup.select_one(sel)
        if tag:
            for attr in _IMG_ATTRS:
                val = (tag.get(attr) or "").strip()
                if val and not val.startswith("data:") and len(val) > 8:
                    image_url = val if val.startswith("http") else _BASE_URL + val
                    break
            if image_url:
                break
    # CDN sweep fallback — any img whose URL contains a known PartSelect CDN domain
    if not image_url:
        _CDN_HINTS = ("partselect", "azurefd.net", "msecnd.net")
        for img in soup.find_all("img"):
            for attr in _IMG_ATTRS:
                val = (img.get(attr) or "").strip()
                if val and any(h in val for h in _CDN_HINTS):
                    image_url = val if val.startswith("http") else _BASE_URL + val
                    break
            if image_url:
                break

    appliance_type = _infer_appliance_type(soup, final_url, name)
    category = _infer_category(name)

    return {
        "ps_number": ps_number,
        "mfr_number": mfr_number,
        "name": name or f"Part {ps_number}",
        "appliance_type": appliance_type,
        "category": category,
        "price": price,
        "in_stock": in_stock,
        "description": description,
        "install_steps": install_steps,
        "image_url": image_url,
        "partselect_url": final_url,
        "scraped": True,
    }


def _failure_response(ps_number: str) -> dict:
    numeric = ps_number.upper().removeprefix("PS")
    return {
        "ps_number": ps_number,
        "mfr_number": "",
        "name": f"Part {ps_number}",
        "appliance_type": "unknown",
        "category": "general",
        "price": 0.0,
        "in_stock": False,
        "description": "Details unavailable — please check PartSelect.com directly.",
        "install_steps": [],
        "image_url": "",
        # search.htm works and shows correct results; the short /PS{n}.htm form 404s
        "partselect_url": f"{_BASE_URL}/search.htm?searchTerm=PS{numeric}",
        "scraped": False,
        "error": "scrape_failed",
    }


async def scrape_part(ps_number: str) -> dict:
    """Scrape part details from PartSelect.com.

    Hits /PS{number}.htm which PartSelect redirects to the canonical slug URL.
    Returns a normalized part dict. Never raises — returns partial data with
    error="scrape_failed" on any failure.
    """
    # Normalize: accept both "PS11752778" and "11752778"
    numeric = ps_number.upper().removeprefix("PS")
    url = f"{_BASE_URL}/PS{numeric}.htm"

    try:
        await asyncio.sleep(_RATE_LIMIT)

        # Resolve the canonical slug URL first — PartSelect's short /PS{number}.htm
        # form reliably returns a 404 page, so go straight to search.
        canonical_url = await _find_canonical_part_url(numeric)
        final_url = canonical_url or url

        soup = await _fetch_via_firecrawl(final_url, wait_for_ms=2000)
        if soup is None:
            soup = await _fetch_page(final_url)
        if soup is None:
            return _failure_response(ps_number)

        # Cross-check: PartSelect embeds a canonical <link> on every product page.
        # If the page we fetched belongs to a different PS number (e.g. because
        # _find_canonical_part_url returned a stale/wrong URL, or PartSelect
        # silently redirected us), the canonical href will expose the mismatch
        # and we discard the result rather than caching corrupt data.
        canonical_link = soup.select_one("link[rel='canonical']")
        if canonical_link:
            page_canonical = canonical_link.get("href", "").split("?")[0]
            page_ps_match = re.search(r"/PS(\d+)[^\d]", page_canonical)
            if page_ps_match and page_ps_match.group(1) != numeric:
                logger.warning(
                    "Scraper: page canonical URL is for PS%s but requested PS%s "
                    "(canonical: %s) — discarding to prevent data corruption",
                    page_ps_match.group(1), numeric, page_canonical,
                )
                return _failure_response(ps_number)

        result = _parse_part_page(soup, ps_number, final_url)

        _bad_names = {"page not found", "not found", "error", "404"}
        if (
            result["name"] == f"Part {ps_number}"
            or result["name"].lower() in _bad_names
            or (not result["description"] and result["price"] == 0.0)
        ):
            logger.warning("Scraper: page for %s appears to be empty or error page", ps_number)
            return _failure_response(ps_number)

        logger.info("Scraper: successfully scraped %s (%s)", ps_number, result["name"])
        return result

    except Exception as exc:
        logger.error("Scraper: unexpected error for %s: %s", ps_number, exc)
        return _failure_response(ps_number)


async def search_parts_on_partselect(query: str, limit: int = 4) -> list[dict]:
    """Search PartSelect for parts matching a free-text query via Firecrawl.

    Extracts PS numbers from search result URLs, then scrapes each part page.
    Returns a list of scraped part dicts. Never raises.
    """
    api_key = os.environ.get("FIRECRAWL_API_KEY", "")
    if not api_key:
        return []

    found_ps_numbers: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _FIRECRAWL_SEARCH_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"query": f"{query} site:partselect.com", "limit": 10},
            )
        if resp.status_code == 200:
            for item in resp.json().get("data", []):
                url = item.get("url", "")
                m = re.search(r"/PS(\d{5,})", url)
                if m and "partselect.com" in url:
                    ps_num = f"PS{m.group(1)}"
                    if ps_num not in found_ps_numbers:
                        found_ps_numbers.append(ps_num)
        else:
            logger.warning("Firecrawl search: HTTP %d for query '%s'", resp.status_code, query)
    except Exception as exc:
        logger.warning("search_parts_on_partselect error for '%s': %s", query, exc)

    parts: list[dict] = []
    for ps_num in found_ps_numbers[:limit]:
        part = await scrape_part(ps_num)
        if part.get("error") != "scrape_failed":
            parts.append(part)
    return parts


# Matches a full canonical slug: /PS12345678-Brand-MfrNum-Description.htm
_CANONICAL_SLUG_RE = re.compile(r"/PS\d+-[^/?#]+-[^/?#]+-[^/?#]+\.htm", re.IGNORECASE)


def _is_canonical_url(url: str) -> bool:
    """Return True only for full PartSelect slug URLs (not short-form or search URLs)."""
    return bool(_CANONICAL_SLUG_RE.search(url))


async def resolve_part_url(part: dict) -> dict:
    """Ensure *part* has a valid canonical partselect_url.

    If the stored URL is a short-form, search-page, or empty URL, this calls
    _find_canonical_part_url to resolve the real product slug and returns a
    new dict with the corrected URL.  Never raises.
    """
    if _is_canonical_url(part.get("partselect_url", "")):
        return part

    ps_number = part.get("ps_number", "")
    if not ps_number:
        return part

    numeric = ps_number.upper().removeprefix("PS")
    try:
        canonical = await _find_canonical_part_url(numeric)
        if canonical:
            return {**part, "partselect_url": canonical}
    except Exception as exc:
        logger.warning("resolve_part_url: failed for %s: %s", ps_number, exc)

    return part


async def resolve_parts_urls(parts: list[dict]) -> list[dict]:
    """Resolve canonical URLs for a list of parts concurrently."""
    if not parts:
        return parts
    return list(await asyncio.gather(*[resolve_part_url(p) for p in parts]))


async def scrape_model_page(model_number: str) -> dict:
    """Scrape a PartSelect model page for brand, type, and compatible PS numbers.

    Returns partial data with empty compatible_ps_numbers on failure.
    """
    url = f"{_BASE_URL}/Models/{model_number}/"
    failure = {
        "model_number": model_number,
        "brand": "",
        "appliance_type": "unknown",
        "description": "",
        "compatible_ps_numbers": [],
        "error": "scrape_failed",
    }

    try:
        await asyncio.sleep(_RATE_LIMIT)
        # Try Firecrawl first; fall back to plain httpx
        soup = await _fetch_via_firecrawl(url)
        if soup is None:
            soup = await _fetch_page(url)
        if soup is None:
            return failure

        brand = ""
        brand_tag = soup.select_one(".model-brand, [itemprop='brand']")
        if brand_tag:
            brand = _safe_text(brand_tag)

        appliance_type = _infer_appliance_type(soup, url, "")

        description = ""
        desc_tag = soup.select_one(".model-description, [itemprop='description']")
        if desc_tag:
            description = _safe_text(desc_tag)

        ps_numbers: list[str] = []
        for link in soup.select("a[href*='/PS']"):
            href = link.get("href", "")
            m = re.search(r"/PS(\d+)", href)
            if m:
                ps_numbers.append(f"PS{m.group(1)}")
        ps_numbers = list(dict.fromkeys(ps_numbers))[:50]

        return {
            "model_number": model_number,
            "brand": brand,
            "appliance_type": appliance_type,
            "description": description,
            "compatible_ps_numbers": ps_numbers,
        }

    except Exception as exc:
        logger.error("Scraper: model page error for %s: %s", model_number, exc)
        return failure

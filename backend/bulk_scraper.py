"""bulk_scraper.py — Populate partselect.db with refrigerator & dishwasher parts.

Phases
------
1. Discovery  — Firecrawl search queries to harvest PS numbers from result URLs
2. Models     — Scrape popular model pages to discover more parts + compat pairs
3. Scraping   — Fetch & persist each part not already in the DB
4. Index      — Rebuild the ChromaDB vector store from the new data

Run from backend/:
    python bulk_scraper.py                  # full crawl (up to 300 new parts)
    python bulk_scraper.py --max-parts 50   # quick smoke test
    python bulk_scraper.py --dry-run        # discover only, print counts, no scraping
    python bulk_scraper.py --skip-models    # skip model-page phase
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import sys
import time
from typing import Optional

import httpx

# ── Path bootstrap ────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from agent import vector_store
from agent.scraper import (
    _FIRECRAWL_SEARCH_URL,
    scrape_model_page,
    scrape_part,
)
from data.database import (
    cache_scraped_part,
    create_tables,
    get_db_connection,
    get_model_info,
    get_part_by_number,
)

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("bulk_scraper")

# ── Target definitions ────────────────────────────────────────────────────────

# (search query, hint for logging only)
SEARCH_QUERIES: list[tuple[str, str]] = [
    # --- Refrigerator categories ---
    ("Whirlpool refrigerator ice maker assembly site:partselect.com", "fridge/ice-maker"),
    ("refrigerator water filter replacement site:partselect.com", "fridge/water-filter"),
    ("refrigerator door shelf bin site:partselect.com", "fridge/door-bins"),
    ("refrigerator defrost heater thermostat site:partselect.com", "fridge/defrost"),
    ("refrigerator evaporator fan motor site:partselect.com", "fridge/fan"),
    ("refrigerator water inlet valve site:partselect.com", "fridge/water-system"),
    ("refrigerator crisper drawer slide site:partselect.com", "fridge/drawer"),
    ("refrigerator door gasket seal site:partselect.com", "fridge/door-seal"),
    ("refrigerator control board site:partselect.com", "fridge/control-board"),
    ("Samsung LG GE refrigerator parts site:partselect.com", "fridge/multi-brand"),
    # --- Dishwasher categories ---
    ("dishwasher upper lower rack replacement site:partselect.com", "dish/rack"),
    ("dishwasher drain pump motor site:partselect.com", "dish/pump"),
    ("dishwasher spray arm replacement site:partselect.com", "dish/spray-arm"),
    ("dishwasher door latch strike site:partselect.com", "dish/door-latch"),
    ("dishwasher door gasket seal site:partselect.com", "dish/door-seal"),
    ("dishwasher heating element site:partselect.com", "dish/heating-element"),
    ("dishwasher water inlet valve site:partselect.com", "dish/water-system"),
    ("dishwasher control board site:partselect.com", "dish/control-board"),
    ("dishwasher detergent dispenser site:partselect.com", "dish/dispenser"),
    ("Bosch GE LG dishwasher parts site:partselect.com", "dish/multi-brand"),
]

# (model_number, appliance_type)
POPULAR_MODELS: list[tuple[str, str]] = [
    # Whirlpool refrigerators
    ("WRS325SDHZ01", "refrigerator"),
    ("WRF535SWHZ00", "refrigerator"),
    ("WRS571CIHZ00", "refrigerator"),
    # GE refrigerators
    ("GSS25GSHSS",   "refrigerator"),
    ("GNE29GGKWW",   "refrigerator"),
    # LG refrigerators
    ("LRMVS3006S",   "refrigerator"),
    # Samsung refrigerators
    ("RF28R7351SR",  "refrigerator"),
    # Frigidaire refrigerators
    ("FFSS2615TS0",  "refrigerator"),
    # Maytag refrigerators
    ("MFI2570FEZ00", "refrigerator"),
    # Whirlpool dishwashers
    ("WDT780SAEM1",  "dishwasher"),
    ("WDF520PADM7",  "dishwasher"),
    ("WDTA50SAHZ0",  "dishwasher"),
    # Bosch dishwashers
    ("SHPM88Z75N",   "dishwasher"),
    ("SHE3AR72UC",   "dishwasher"),
    # GE dishwashers
    ("GDT530PSMSS",  "dishwasher"),
    # LG dishwashers
    ("LDF5545ST",    "dishwasher"),
    # Frigidaire dishwashers
    ("FGID2466QF3A", "dishwasher"),
    # Maytag dishwashers
    ("MDB4949SHZ0",  "dishwasher"),
]

_FIRECRAWL_SEARCH_DELAY = 2.5   # seconds between search API calls
_PART_BATCH_SIZE       = 10     # parts to scrape before logging progress


# ── DB helpers ────────────────────────────────────────────────────────────────

def _ensure_tables() -> None:
    with get_db_connection() as conn:
        create_tables(conn)


def _part_exists(ps_number: str) -> bool:
    return get_part_by_number(ps_number) is not None


def _model_exists(model_number: str) -> bool:
    return get_model_info(model_number) is not None


def _save_model(model_data: dict) -> None:
    """Upsert a model row."""
    mn = model_data.get("model_number", "")
    if not mn:
        return
    with get_db_connection() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO models
               (model_number, brand, appliance_type, description)
               VALUES (?, ?, ?, ?)""",
            (
                mn,
                model_data.get("brand", ""),
                model_data.get("appliance_type", "unknown"),
                model_data.get("description", ""),
            ),
        )
        conn.commit()


def _save_compatibility(ps_number: str, model_number: str) -> None:
    """Insert a compatibility pair (silently ignores duplicates and FK errors)."""
    try:
        with get_db_connection() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO compatibility (ps_number, model_number) VALUES (?, ?)",
                (ps_number, model_number),
            )
            conn.commit()
    except Exception:
        pass


def _db_counts() -> dict:
    with get_db_connection() as conn:
        return {
            "parts": conn.execute("SELECT COUNT(*) FROM parts").fetchone()[0],
            "models": conn.execute("SELECT COUNT(*) FROM models").fetchone()[0],
            "compat": conn.execute("SELECT COUNT(*) FROM compatibility").fetchone()[0],
        }


# ── Phase 1: Discovery via Firecrawl search ───────────────────────────────────

async def _search_firecrawl(query: str, api_key: str, limit: int = 10) -> list[str]:
    """Run one Firecrawl search and return discovered PS numbers."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _FIRECRAWL_SEARCH_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"query": query, "limit": limit},
            )
        if resp.status_code != 200:
            logger.warning("Search HTTP %d for: %s", resp.status_code, query)
            return []
        ps_numbers: list[str] = []
        for item in resp.json().get("data", []):
            url = item.get("url", "")
            m = re.search(r"/PS(\d{5,})", url)
            if m and "partselect.com" in url:
                ps_numbers.append(f"PS{m.group(1)}")
        return list(dict.fromkeys(ps_numbers))  # dedupe, preserve order
    except Exception as exc:
        logger.warning("Search error (%s): %s", query[:60], exc)
        return []


async def discovery_phase(api_key: str) -> set[str]:
    """Run all search queries and return the union of discovered PS numbers."""
    logger.info("─── Phase 1: Discovery (%d search queries) ───", len(SEARCH_QUERIES))
    all_ps: set[str] = set()
    for i, (query, hint) in enumerate(SEARCH_QUERIES, 1):
        found = await _search_firecrawl(query, api_key, limit=10)
        all_ps.update(found)
        logger.info("  [%2d/%d] %-28s  +%d found  (total %d)",
                    i, len(SEARCH_QUERIES), hint, len(found), len(all_ps))
        if i < len(SEARCH_QUERIES):
            await asyncio.sleep(_FIRECRAWL_SEARCH_DELAY)
    logger.info("Discovery complete: %d unique PS numbers found", len(all_ps))
    return all_ps


# ── Phase 2: Model pages ──────────────────────────────────────────────────────

async def models_phase(max_compat_per_model: int = 30) -> set[str]:
    """Scrape popular model pages; save models + compat pairs; return new PS numbers."""
    logger.info("─── Phase 2: Models (%d model pages) ───", len(POPULAR_MODELS))
    extra_ps: set[str] = set()
    for i, (model_number, appliance_type) in enumerate(POPULAR_MODELS, 1):
        logger.info("  [%2d/%d] %s (%s) ...", i, len(POPULAR_MODELS), model_number, appliance_type)
        try:
            data = await scrape_model_page(model_number)
            if data.get("error") == "scrape_failed":
                logger.warning("    ✗  scrape failed")
                continue
            # Persist model row
            if not data.get("appliance_type") or data["appliance_type"] == "unknown":
                data["appliance_type"] = appliance_type
            _save_model(data)
            ps_numbers = data.get("compatible_ps_numbers", [])[:max_compat_per_model]
            extra_ps.update(ps_numbers)
            # Save compat pairs for parts already in DB
            compat_saved = 0
            for ps in ps_numbers:
                if _part_exists(ps):
                    _save_compatibility(ps, model_number)
                    compat_saved += 1
            logger.info("    ✓  %d compat PS found, %d already in DB",
                        len(ps_numbers), compat_saved)
        except Exception as exc:
            logger.warning("    ✗  error: %s", exc)
    logger.info("Models phase: %d additional PS numbers discovered", len(extra_ps))
    return extra_ps


# ── Phase 3: Scraping ─────────────────────────────────────────────────────────

async def scraping_phase(
    ps_numbers: set[str],
    max_parts: int,
    dry_run: bool,
) -> int:
    """Scrape and persist each PS number not already in the DB."""
    to_scrape = [ps for ps in sorted(ps_numbers) if not _part_exists(ps)]
    logger.info("─── Phase 3: Scraping ───")
    logger.info("  %d PS numbers discovered, %d already in DB, %d to scrape",
                len(ps_numbers), len(ps_numbers) - len(to_scrape), len(to_scrape))

    if dry_run:
        logger.info("  DRY RUN — skipping actual scraping")
        return 0

    to_scrape = to_scrape[:max_parts]
    logger.info("  Scraping %d parts (cap: %d) ...", len(to_scrape), max_parts)

    scraped_ok = 0
    scraped_fail = 0
    t0 = time.time()

    for i, ps_num in enumerate(to_scrape, 1):
        try:
            part = await scrape_part(ps_num)
            if part.get("error") == "scrape_failed":
                scraped_fail += 1
                logger.debug("  ✗ %s — scrape failed", ps_num)
            else:
                cache_scraped_part(part)
                vector_store.upsert_part(part)
                # Link to any model pages we already have
                for model_number, _ in POPULAR_MODELS:
                    if _model_exists(model_number):
                        _save_compatibility(ps_num, model_number)
                scraped_ok += 1

            if i % _PART_BATCH_SIZE == 0 or i == len(to_scrape):
                elapsed = time.time() - t0
                rate = i / elapsed if elapsed > 0 else 0
                eta = (len(to_scrape) - i) / rate if rate > 0 else 0
                logger.info(
                    "  Progress: %d/%d  ✓%d ✗%d  %.1fs elapsed  ETA ~%.0fs",
                    i, len(to_scrape), scraped_ok, scraped_fail, elapsed, eta,
                )
        except Exception as exc:
            scraped_fail += 1
            logger.warning("  ✗ %s — unexpected error: %s", ps_num, exc)

    logger.info("Scraping complete: %d succeeded, %d failed", scraped_ok, scraped_fail)
    return scraped_ok


# ── Phase 4: Vector index ─────────────────────────────────────────────────────

def rebuild_index() -> None:
    logger.info("─── Phase 4: Rebuilding vector index ───")
    try:
        vector_store.initialize_vector_store()
        logger.info("Vector store rebuilt successfully")
    except Exception as exc:
        logger.warning("Vector store rebuild failed: %s", exc)


# ── Main ──────────────────────────────────────────────────────────────────────

async def main(max_parts: int, dry_run: bool, skip_models: bool) -> None:
    api_key = os.environ.get("FIRECRAWL_API_KEY", "")
    if not api_key:
        logger.error("FIRECRAWL_API_KEY is not set — cannot run discovery phase")
        sys.exit(1)

    _ensure_tables()

    before = _db_counts()
    logger.info("Starting DB state: %s", before)

    # Phase 1: search-based discovery
    discovered_ps = await discovery_phase(api_key)

    # Phase 2: model pages
    if not skip_models:
        model_ps = await models_phase()
        discovered_ps.update(model_ps)
    else:
        logger.info("─── Phase 2: Models — SKIPPED ───")

    logger.info("Total unique PS numbers after discovery: %d", len(discovered_ps))

    # Phase 3: scrape
    scraped = await scraping_phase(discovered_ps, max_parts=max_parts, dry_run=dry_run)

    # Phase 4: rebuild vector index if anything was scraped
    if scraped > 0:
        rebuild_index()

    after = _db_counts()
    logger.info("─── Done ───")
    logger.info("  Parts:   %d → %d  (+%d)", before["parts"],  after["parts"],  after["parts"]  - before["parts"])
    logger.info("  Models:  %d → %d  (+%d)", before["models"], after["models"], after["models"] - before["models"])
    logger.info("  Compat:  %d → %d  (+%d)", before["compat"], after["compat"], after["compat"] - before["compat"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk-scrape PartSelect into partselect.db")
    parser.add_argument(
        "--max-parts", type=int, default=300,
        help="Maximum new parts to scrape in this run (default: 300)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Run discovery phases only — do not scrape or write parts",
    )
    parser.add_argument(
        "--skip-models", action="store_true",
        help="Skip the model-page phase (faster, less compat data)",
    )
    args = parser.parse_args()
    asyncio.run(main(
        max_parts=args.max_parts,
        dry_run=args.dry_run,
        skip_models=args.skip_models,
    ))
